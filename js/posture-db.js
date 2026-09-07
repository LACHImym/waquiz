/* ============================================================
 *  記録の保存（Silhouette）
 * ------------------------------------------------------------
 *  この端末の IndexedDB だけに保存します。サーバーには送りません。
 *  クイズ側の Supabase は anon キーを公開している設計なので、
 *  体の記録をそこに置くと「自分だけ閲覧」が成り立たないためです。
 *  端末を替えるとき用に、書き出し／読み込み（JSONファイル）を用意しています。
 * ============================================================ */
const PostureDB = (() => {
  const DB_NAME = 'silhouette';
  const DB_VER  = 1;
  const STORE   = 'scans';
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          os.createIndex('handle', 'handle', { unique: false });
          os.createIndex('at', 'at', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error || new Error('保存領域を開けませんでした'));
    });
    return dbp;
  }

  function tx(mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const s = t.objectStore(STORE);
      let out;
      try { out = fn(s); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror    = () => reject(t.error);
      t.onabort    = () => reject(t.error);
    }));
  }

  /* ---- 書き込み ---- */
  async function add(rec) {
    const r = await tx('readwrite', s => s.add(rec));
    return r;
  }

  async function remove(id) { return tx('readwrite', s => s.delete(id)); }

  async function clearAll(handle) {
    const rows = await list(handle);
    return tx('readwrite', s => { rows.forEach(r => s.delete(r.id)); });
  }

  /* ---- 読み出し（自分のぶんだけ） ---- */
  async function list(handle) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const idx = t.objectStore(STORE).index('handle');
      const req = idx.getAll(handle);
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => (a.at < b.at ? -1 : 1)));
      req.onerror   = () => reject(req.error);
    });
  }

  async function latest(handle) {
    const all = await list(handle);
    return all.length ? all[all.length - 1] : null;
  }

  /* ---- 数値の圧縮（Int16 に丸める） ----
   *  0.0001 単位。3D骨格はメートル単位なので 0.1mm 精度になる。 */
  const SCALE = 10000;
  function pack(nums) {
    const a = new Int16Array(nums.length);
    for (let i = 0; i < nums.length; i++) {
      a[i] = Math.max(-32768, Math.min(32767, Math.round(nums[i] * SCALE)));
    }
    return a;
  }
  function unpack(arr) {
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = arr[i] / SCALE;
    return out;
  }
  // 断面テーブル [{c,r}...] ⇄ Int16Array
  const packSlices  = sl  => pack(sl.flatMap(s => [s.c, s.r]));
  const unpackSlices = arr => {
    const v = unpack(arr), out = [];
    for (let i = 0; i < v.length; i += 2) out.push({ c: v[i], r: v[i + 1] });
    return out;
  };
  // 3D骨格 [{x,y,z}...] ⇄ Int16Array
  const packWorld   = w   => pack(w.flatMap(p => [p.x, p.y, p.z]));
  const unpackWorld = arr => {
    const v = unpack(arr), out = [];
    for (let i = 0; i < v.length; i += 3) out.push({ x: v[i], y: v[i + 1], z: v[i + 2] });
    return out;
  };

  // 1件あたりの保存バイト数（画面に出して安心してもらうため）
  function bytesOf(rec) {
    let n = 0;
    ['skeleton', 'front', 'side'].forEach(k => { if (rec[k]) n += rec[k].byteLength; });
    return n + JSON.stringify({ at: rec.at, ref: rec.ref, angles: rec.angles, ratios: rec.ratios }).length;
  }

  /* ---- 書き出し／読み込み（端末の引っ越し・バックアップ用） ---- */
  async function exportJSON(handle) {
    const rows = await list(handle);
    return JSON.stringify({
      app: 'silhouette', version: 1, handle,
      exportedAt: new Date().toISOString(),
      scans: rows.map(r => ({
        at: r.at, ref: r.ref, angles: r.angles, ratios: r.ratios,
        skeleton: r.skeleton ? Array.from(r.skeleton) : null,
        front:    r.front    ? Array.from(r.front)    : null,
        side:     r.side     ? Array.from(r.side)     : null,
      })),
    });
  }

  // 同じ時刻の記録は重複させない
  async function importJSON(text, handle) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('ファイルの中身を読めませんでした'); }
    if (!data || data.app !== 'silhouette' || !Array.isArray(data.scans)) {
      throw new Error('Silhouette の書き出しファイルではないようです');
    }
    const have = new Set((await list(handle)).map(r => r.at));
    let added = 0;
    for (const s of data.scans) {
      if (!s || !s.at || have.has(s.at)) continue;
      await add({
        handle, at: s.at, ref: s.ref || 0,
        angles: s.angles || {}, ratios: s.ratios || {},
        skeleton: s.skeleton ? Int16Array.from(s.skeleton) : null,
        front:    s.front    ? Int16Array.from(s.front)    : null,
        side:     s.side     ? Int16Array.from(s.side)     : null,
      });
      have.add(s.at);
      added++;
    }
    return added;
  }

  /* ---- 移動平均（日々のブレを吸収して表示するため） ---- */
  function movingAvg(rows, key, group, n) {
    return rows.map((_, i) => {
      const from = Math.max(0, i - n + 1);
      let sum = 0, cnt = 0;
      for (let j = from; j <= i; j++) {
        const v = rows[j][group] && rows[j][group][key];
        if (typeof v === 'number') { sum += v; cnt++; }
      }
      return cnt ? sum / cnt : null;
    });
  }

  return {
    add, list, latest, remove, clearAll,
    pack, unpack, packSlices, unpackSlices, packWorld, unpackWorld,
    bytesOf, exportJSON, importJSON, movingAvg,
  };
})();
