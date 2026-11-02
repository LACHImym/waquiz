// Run with PLAYWRIGHT_MODULE pointing to an installed playwright package.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({timezoneId:'Asia/Tokyo'});
 await page.route('**/*',route=>route.fulfill({status:200,contentType:'text/html',body:'<div id="header"></div><div id="app"></div><div id="toasts"></div><div id="notice"></div>'}));
 await page.goto('http://localhost:4173');
 await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/config.js'),'utf8')});
 await page.addScriptTag({content:`window.saved = new Map();window.saveCalls=[];window.Misskey={handleOf:u=>u.handle,handleCallback:async()=>null,getUser:()=>({handle:'test',name:'Test'})};window.Store={
 init:()=>{},saveProfile:()=>{},allProfiles:async()=>({}),waoRecordAnswers:async(u,items)=>{window.waoSaved=items.length;},gradeQuiet:async()=>true,isConfigured:()=>true,myAnswerState:async()=>({}),sampleDaily:async()=>({list:window.questions,seen:[]}),
 grade:async(id,choice)=>({isCorrect:choice==='A',correctChoice:'A',explanation:'説明'}),
 recordQuizAnswers:async(items,u)=>{window.saveCalls.push(items.length);for(const a of items)window.saved.set(a.id,a);},
 recordResult:async()=>{},listComments:async()=>[],listGoods:async()=>[],myGood:async()=>null,
 totalRanking:async()=>[],countDaily:async()=>window.questions.length};window.ICONS=new Proxy({},{get:()=>()=>''});`});
 await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/app.js'),'utf8').replace(/boot\(\);\s*$/,'')});
 await page.evaluate(()=>{
  renderHeader=()=>{};creditLine=()=>h('div');reactionBar=()=>h('div');commentsBlock=()=>h('div');pointsForAnswer=()=>0;popPoints=()=>{};
  user={handle:'test',name:'Test'};window.questions=[1,2,3].map(id=>({id:String(id),body:'問題'+id,choices:['A','B','C','D']}));
 });
 await page.evaluate(async()=>{ const original=switchView; switchView=()=>{};updateFooterPool=()=>{};loginBonus=()=>{};refreshNewComments=()=>{};await boot();switchView=original; });
 await page.evaluate(()=>startQuiz('daily'));
 await page.locator('.gopt').filter({hasText:'A'}).click();
 await page.waitForFunction(()=>saved.size===1);
 assert.equal(await page.evaluate(()=>quiz._done),undefined);
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
 assert.equal(await page.evaluate(()=>quiz._done),undefined);
 assert.equal(await page.evaluate(()=>saved.size),1);
 await page.locator('.next-circle').click();
 await page.locator('.gopt').filter({hasText:'A'}).click();
 await page.waitForFunction(()=>saved.size===2);
 await page.evaluate(()=>flushAbandon());
 assert.equal(await page.evaluate(()=>saved.size),3);
 assert.equal(await page.evaluate(()=>Array.from(saved.values()).filter(x=>x.is_correct).length),2);
 await page.evaluate(()=>flushAbandon());assert.equal(await page.evaluate(()=>saved.size),3);
 await page.evaluate(()=>{currentView='wao-quiz';wao={list:questions,i:0,answers:[],correct:0};renderWaoQuiz();});
 await page.locator('.gopt').first().click();
 await page.waitForFunction(()=>window.waoSaved===1);
 await page.evaluate(()=>{currentView='home';});
 // Tournament options and submitted choice must be the identical shuffled array.
 await page.evaluate(()=>{wao={list:questions,i:0,answers:[],correct:0};renderWaoQuiz();window.picked=[];answerWao=(i,displayed,q,grid)=>picked.push({shown:grid.children[i].querySelector('.gopt-t').textContent,sent:displayed[i]});});
 await page.locator('.gopt').first().click();
 assert.equal(await page.evaluate(()=>picked[0].shown===picked[0].sent),true);
 console.log('PASS: immediate saves, idempotent retry, continuation, abandonment, tournament choice mapping (Asia/Tokyo; mocked data only)');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
