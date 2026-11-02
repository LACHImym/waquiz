const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
function setup(rows = []) {
  const calls = [], saved = new Map(); let failure = null;
  const db = {from(table) {
    const c = {table, filters: [], orders: []}; calls.push(c);
    const q = {
      select(){ return q; }, eq(k,v){c.filters.push(['eq',k,v]);return q;},
      not(k,op,v){c.filters.push(['not',k,v]);return q;},
      lte(k,v){c.filters.push(['lte',k,v]);return q;},
      order(k,opts){c.orders.push([k,opts]);return q;},
      limit(n){c.limit=n;return q;},
      then(resolve,reject){return Promise.resolve().then(()=>{
        if(failure)return {data:null,error:failure};
        let data=rows.filter(r=>c.filters.every(([op,k,v])=>op==='eq'?r[k]===v:op==='lte'?r[k]!==null && r[k]<=v:r[k]!==null));
        data.sort((a,b)=>{for(const [k,opts] of c.orders){if(a[k]!==b[k])return (a[k]>b[k]?1:-1)*(opts.ascending?1:-1);}return 0;});
        return {data:data.slice(0,c.limit??data.length),error:null};
      }).then(resolve,reject);},
      range(){return Promise.resolve({data:rows.filter(r=>c.filters.every(([op,k,v])=>op==='eq'?r[k]===v:op==='lte'?r[k]<=v:r[k]!==null)),error:null});},
      upsert(data, opts) {
        c.rows = data; c.opts = opts;
        if (failure) return Promise.resolve({error: failure});
        data.forEach(r=>{if(!saved.has(r.id))saved.set(r.id,r);});
        return Promise.resolve({error:null});
      }
    }; return q;
  }};
  const ctx = vm.createContext({CONFIG:{supabaseUrl:'https://example.invalid',supabaseAnonKey:'public'},window:{supabase:{createClient:()=>db}}, Misskey:{handleOf:u=>u.handle},console});
  vm.runInContext(fs.readFileSync(path.join(root,'js/store.js'),'utf8')+'\nStore.init();globalThis.api=Store;',ctx);
  return {api:ctx.api,calls,saved,setFailure:e=>failure=e};
}
test('daily selects newest five across dates, excluding future and ordinary questions',async()=>{
  for(const n of [0,1,3,5,8]) {
    const rows=Array.from({length:n},(_,i)=>({id:String(i),scheduled_date:i<2?'2026-11-02':'2026-11-01',created_at:'2026-10-'+String(10+i)}));
    rows.push({id:'future',scheduled_date:'2026-11-03'},{id:'ordinary',scheduled_date:null});
    const {api}=setup(rows); const out=await api.sampleDaily(5,'2026-11-02');
    assert.equal(out.list.length,Math.min(n,5)); assert.equal(new Set(out.list.map(r=>r.id)).size,out.list.length);
    assert.equal(await api.countDaily('2026-11-02'),out.list.length);
    assert.ok(out.list.every(r=>r.id!=='future' && r.id!=='ordinary'));
    if(n===8)assert.equal(out.list.map(r=>r.id).join(','),'1,0,7,6,5');
  }
});
test('daily remains the latest set on retry; today can have no questions',async()=>{
  const rows=Array.from({length:6},(_,i)=>({id:String(i),scheduled_date:'2026-11-01',created_at:'same'}));
  const {api}=setup(rows);const out=await api.sampleDaily(5,'2026-11-02',['5','4','3','2','1']);
  assert.equal(out.list.map(r=>r.id).join(','),'5,4,3,2,1');
});
test('daily query errors propagate instead of reporting an empty set',async()=>{
  const s=setup();s.setFailure(new Error('offline'));
  await assert.rejects(s.api.countDaily('2026-11-02'));
  await assert.rejects(s.api.sampleDaily(5,'2026-11-02'));
});
test('archive excludes future questions at Tokyo date boundary',async()=>{
  const {api,calls}=setup([]); await api.sampleDailyArchive(5);
  const filter=calls[0].filters.find(r=>r[0]==='lte');
  assert.equal(filter[2],new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}));
});
test('answer retry uses stable primary key, no duplicate rows',async()=>{
  const {api,saved,calls}=setup(); const u={handle:'tester',name:'Test'};
  const a={id:'answer-1',question_id:'q1',is_correct:true};
  await api.recordQuizAnswers([a],u); await api.recordQuizAnswers([a],u);
  assert.equal(saved.size,1); assert.equal(calls[0].opts.ignoreDuplicates,true);
  await assert.rejects(api.recordQuizAnswers([{question_id:'q1'}],u));
});
test('save failures propagate, same UUID can be retried',async()=>{
  const s=setup(); const a={id:'a',question_id:'q',is_correct:false},u={handle:'t'};
  s.setFailure(new Error('offline')); await assert.rejects(s.api.recordQuizAnswers([a],u));
  s.setFailure(null); await s.api.recordQuizAnswers([a],u); assert.equal(s.saved.size,1);
});
