/* ============================================================
 *  Silhouette — 画面ロジック
 *  ログインは WA検定と同じ Misskey（MiAuth）。
 *  記録はこの端末の中だけ（PostureDB）に保存します。
 * ============================================================ */
const CONFIG = window.QUIZ_CONFIG;

/* ---------- ヘルパー ---------- */
const $ = s => document.querySelector(s);
const h = (tag, attrs = {}, children = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style') e.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null || c === false) return;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return e;
};
const svgEl = (tag, attrs = {}, children = []) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, v);
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return e;
};

/* ---------- 表示する指標の定義 ----------
 *  unit … 単位、hint … 何を見ているかの一言、better … 0に近いほど良い
 *  角度の符号は「＋＝前 / 右」に統一してある。 */
const METRICS = [
  { key: 'neckForward',   group: 'angles', label: '首の前傾',       unit: '°', dec: 1, hint: '肩から耳までの線が、垂直から何度前に出ているか' },
  { key: 'shoulderShift', group: 'angles', label: '肩の前方変位',   unit: '°', dec: 1, hint: '腰から肩までの線の傾き。巻き肩・猫背の目安' },
  { key: 'pelvisShift',   group: 'angles', label: '骨盤の前方シフト', unit: '°', dec: 1, hint: 'くるぶしの垂線から、腰がどれだけ前に出ているか' },
  { key: 'kneeShift',     group: 'angles', label: '膝の前後',       unit: '%', dec: 1, hint: 'くるぶしの垂線からの膝のズレ。−は反張膝ぎみ' },
  { key: 'shoulderLevel', group: 'angles', label: '肩の左右差',     unit: '°', dec: 1, hint: '左右の肩の高さの差。＋は右肩が下がっている' },
  { key: 'pelvisLevel',   group: 'angles', label: '骨盤の左右差',   unit: '°', dec: 1, hint: '左右の骨盤の高さの差' },
  { key: 'trunkRotation', group: 'angles', label: '体幹のねじれ',   unit: '°', dec: 1, hint: '真上から見た、肩の線と骨盤の線のズレ' },
];
const RATIOS = [
  { key: 'waistHip',      group: 'ratios', label: 'くびれ率',       unit: '', dec: 3, hint: 'ウエスト ÷ ヒップ。小さいほどくびれている' },
  { key: 'shoulderWaist', group: 'ratios', label: 'Yライン',        unit: '', dec: 3, hint: '肩幅 ÷ ウエスト。大きいほど逆三角形' },
  { key: 'thighCalf',     group: 'ratios', label: '太もも／ふくらはぎ', unit: '', dec: 3, hint: '太もも幅 ÷ ふくらはぎ幅' },
];
const ALL_METRICS = METRICS.concat(RATIOS);
const JUDGE_LABEL = { good: '良好', watch: '注意', off: '要改善' };

/* ---------- 状態 ---------- */
let user = null;
let scans = [];
let view = 'home';
let viewer3d = null;        // 3Dビューア（使うときだけ作る）
let scanFlow = null;        // 撮影中の一時データ

/* ============================================================
 *  起動
 * ============================================================ */
async function boot() {
  try {
    const u = await Misskey.handleCallback();
    if (u) toast('ようこそ ' + u.name + ' さん', 'success');
  } catch (e) { toast(e.message || 'ログインに失敗しました', 'error'); }

  user = Misskey.getUser();
  renderHeader();
  if (!user) return switchView('login');
  await reload();
  switchView('home');
}

async function reload() {
  try { scans = await PostureDB.list(Misskey.handleOf(user)); }
  catch (e) { scans = []; toast('保存領域を開けませんでした', 'error'); }
}

function switchView(v) {
  // 3Dやカメラを開いたままにしない
  if (viewer3d) { viewer3d.dispose(); viewer3d = null; }
  if (v !== 'scan') { stopCamera(); scanFlow = null; }
  view = v;
  const app = $('#app');
  app.innerHTML = '';
  ({
    login:   renderLogin,
    home:    renderHome,
    scan:    renderScan,
    history: renderHistory,
    view3d:  renderView3D,
    data:    renderData,
  }[v] || renderHome)(app);
  window.scrollTo(0, 0);
  renderHeader();
}

/* ============================================================
 *  ヘッダー
 * ============================================================ */
function renderHeader() {
  const el = $('#header');
  el.innerHTML = '';
  const right = [];
  if (user) {
    if (user.avatarUrl) right.push(h('img', { class: 'avatar', src: user.avatarUrl, alt: '' }));
    right.push(h('button', { class: 'linkbtn', onclick: () => switchView('data') }, 'データ'));
  }
  el.appendChild(h('div', { class: 'header-in' }, [
    h('button', { class: 'brand', onclick: () => switchView(user ? 'home' : 'login') }, [
      h('span', { class: 'brand-mark' }, 'S'),
      h('span', { class: 'brand-text' }, 'Silhouette'),
    ]),
    h('div', { class: 'header-right' }, right),
  ]));
}

/* ============================================================
 *  ログイン（WA検定と同じ MiAuth）
 * ============================================================ */
function renderLogin(app) {
  app.appendChild(h('section', { class: 'card center' }, [
    h('h1', { class: 'ttl' }, '姿勢とシルエットの記録'),
    h('p', { class: 'lead' }, '体重ではなく、姿勢とシルエットを記録するアプリです。'),
    h('p', { class: 'note' }, '写真は保存しません。撮ったその場で解析して、数値だけを' +
      'この端末の中に残します。記録がサーバーに送られることはありません。'),
    h('button', { class: 'btn btn-primary btn-lg', onclick: () => Misskey.login() },
      'Misskeyでログイン'),
    h('p', { class: 'note small' }, CONFIG.defaultMisskeyHost + ' のアカウントでログインします。' +
      'WA検定と同じログイン方法です（読み取り権限のみ）。'),
  ]));
}

/* ============================================================
 *  ホーム
 * ============================================================ */
function renderHome(app) {
  const last = scans[scans.length - 1] || null;
  const prev = scans[scans.length - 2] || null;

  if (!last) {
    app.appendChild(h('section', { class: 'card' }, [
      h('h1', { class: 'ttl' }, 'はじめてのスキャン'),
      h('p', { class: 'lead' }, '正面と横の2カット、あわせて30秒ほどで終わります。'),
      h('ul', { class: 'tips' }, [
        h('li', {}, 'スマホを壁ぎわに立てかけ、2〜3m 離れて全身が入るようにします'),
        h('li', {}, '体の線が見える服で。ダボついた服はシルエットが正しく取れません'),
        h('li', {}, '床の同じ位置に立てるよう、足元に目印を置いておくと毎回そろいます'),
        h('li', {}, '撮った画像はこの端末から出ません。解析が終わるとすぐ破棄されます'),
      ]),
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => switchView('scan') }, 'スキャンをはじめる'),
    ]));
    return;
  }

  const sc = PostureMetrics.score(last.angles);
  const scPrev = prev ? PostureMetrics.score(prev.angles) : null;

  app.appendChild(h('section', { class: 'card' }, [
    h('div', { class: 'card-hd' }, [
      h('span', { class: 'card-eyebrow' }, '姿勢スコア'),
      h('span', { class: 'card-sub' }, fmtDate(last.at)),
    ]),
    h('div', { class: 'score' }, [
      h('span', { class: 'score-n' }, sc == null ? '—' : String(sc)),
      scPrev != null ? h('span', { class: 'score-d ' + (sc >= scPrev ? 'up' : 'down') },
        (sc >= scPrev ? '▲ +' : '▼ ') + (sc - scPrev)) : null,
    ]),
    h('p', { class: 'note small' }, '7項目のズレを重みづけして100点から引いた値です。医療的な診断ではありません。'),
  ]));

  app.appendChild(metricTable(last, prev));

  app.appendChild(h('div', { class: 'btnrow' }, [
    h('button', { class: 'btn btn-primary', onclick: () => switchView('scan') }, 'スキャンする'),
    h('button', { class: 'btn', onclick: () => switchView('view3d') }, '3Dで見る'),
    h('button', { class: 'btn', onclick: () => switchView('history') }, '変化を見る'),
  ]));

  app.appendChild(prescription(last));
}

/* 指標の一覧（前回との差つき） */
function metricTable(rec, prev) {
  const rows = ALL_METRICS.map(m => {
    const v = rec[m.group] && rec[m.group][m.key];
    if (v === undefined || v === null) return null;
    const p = prev && prev[m.group] && prev[m.group][m.key];
    const j = m.group === 'angles' ? PostureMetrics.judge(m.key, v) : null;
    const d = (typeof p === 'number') ? v - p : null;
    // 角度は0に近づいたら改善。比率は良し悪しが一方向ではないので色をつけない。
    const better = (d == null || m.group !== 'angles') ? null : Math.abs(v) < Math.abs(p);
    return h('div', { class: 'mrow' }, [
      h('div', { class: 'mrow-l' }, [
        h('span', { class: 'mrow-label' }, m.label),
        j ? h('span', { class: 'chip chip-' + j }, JUDGE_LABEL[j]) : null,
        h('span', { class: 'mrow-hint' }, m.hint),
      ]),
      h('div', { class: 'mrow-r' }, [
        h('span', { class: 'mrow-v' }, fmtNum(v, m.unit, m.dec)),
        d == null ? null : h('span', { class: 'mrow-d' + (better === null ? '' : (better ? ' up' : ' down')) },
          (d > 0 ? '+' : '') + fmtNum(d, m.unit, m.dec)),
      ]),
    ]);
  }).filter(Boolean);

  return h('section', { class: 'card' }, [
    h('div', { class: 'card-hd' }, [h('span', { class: 'card-eyebrow' }, '今回の測定値')]),
    h('div', { class: 'mlist' }, rows),
  ]);
}

/* ---------- 崩れに応じたエクササイズ ---------- */
const RX = [
  { key: 'neckForward',   over: 10,  sign: 1,  title: '顎引き（チンタック）',
    how: '背筋を伸ばして座り、顎を軽く引いて後頭部を真上に引き上げる。5秒キープ×10回。' },
  { key: 'shoulderShift', over: 9,   sign: 1,  title: '胸を開くストレッチ',
    how: '壁の角に前腕をつけ、体を前に。大胸筋が伸びる位置で30秒×左右。' },
  { key: 'pelvisShift',   over: 7,   sign: 1,  title: '腸腰筋ストレッチ',
    how: '片膝立ちで骨盤を立て、お尻を締めたまま前へ。30秒×左右。' },
  { key: 'pelvisShift',   over: 7,   sign: -1, title: 'ヒップヒンジ',
    how: '足幅は腰幅。背中をまっすぐ保ったまま股関節から折る。10回×2セット。' },
  { key: 'kneeShift',     over: 8,   sign: -1, title: '膝裏をゆるめる',
    how: '壁に手をつき、後ろ脚のかかとを床につけたままふくらはぎを伸ばす。30秒×左右。' },
  { key: 'shoulderLevel', over: 4,   sign: 0,  title: '下がっている側の肩を上げる',
    how: '低いほうの手にだけ軽い荷重を持ち、肩をすくめて下ろす。15回。' },
  { key: 'trunkRotation', over: 7,   sign: 0,  title: '胸椎の回旋モビリティ',
    how: '四つ這いで片手を後頭部に。肘を天井へ開いて胸を回す。10回×左右。' },
];

function prescription(rec) {
  const picks = [];
  for (const r of RX) {
    const v = rec.angles[r.key];
    if (typeof v !== 'number') continue;
    if (Math.abs(v) < r.over) continue;
    if (r.sign !== 0 && Math.sign(v) !== r.sign) continue;
    picks.push(r);
    if (picks.length >= 3) break;
  }
  if (!picks.length) {
    return h('section', { class: 'card' }, [
      h('div', { class: 'card-hd' }, [h('span', { class: 'card-eyebrow' }, '今日の3分')]),
      h('p', { class: 'note' }, '大きな崩れは見つかりませんでした。今の姿勢を保てるよう、'
        + '1時間に一度は立ち上がって、肩を大きく回してください。'),
    ]);
  }
  return h('section', { class: 'card' }, [
    h('div', { class: 'card-hd' }, [
      h('span', { class: 'card-eyebrow' }, '今日の3分'),
      h('span', { class: 'card-sub' }, '今回いちばんズレていた順'),
    ]),
    h('div', { class: 'rxlist' }, picks.map(r => h('div', { class: 'rx' }, [
      h('div', { class: 'rx-t' }, r.title),
      h('div', { class: 'rx-h' }, r.how),
    ]))),
  ]);
}

/* ============================================================
 *  スキャン（正面 → 側面）
 * ============================================================ */
let camStream = null;

function stopCamera() {
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
}

function renderScan(app) {
  if (!scanFlow) scanFlow = { step: 'intro', front: null, side: null, facingMode: 'user' };
  const box = h('div', {});
  app.appendChild(box);
  paintScan(box);
}

function paintScan(box) {
  box.innerHTML = '';
  const s = scanFlow;

  if (s.step === 'intro')  return paintScanIntro(box);
  if (s.step === 'done')   return paintScanResult(box);
  paintScanCapture(box);
}

function paintScanIntro(box) {
  box.appendChild(h('section', { class: 'card' }, [
    h('h1', { class: 'ttl' }, 'スキャン'),
    h('p', { class: 'lead' }, '正面 → 横 の順に、2カット撮ります。'),
    h('ul', { class: 'tips' }, [
      h('li', {}, 'スマホを立てかけて、2〜3m 離れます'),
      h('li', {}, '足は腰幅。力を抜いて、いつもの立ち方で'),
      h('li', {}, '「横」は、右向き・左向きどちらでも構いません'),
      h('li', {}, [h('strong', {}, '撮った画像は保存されません。'), 'この端末の中で解析して、すぐ捨てます']),
    ]),
    h('div', { class: 'btnrow' }, [
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => startCapture('front') }, 'カメラを起動'),
      h('button', { class: 'btn', onclick: () => { scanFlow = null; switchView('home'); } }, 'やめる'),
    ]),
    h('p', { class: 'note small' }, '初回は解析エンジンの読み込みに10〜20秒ほどかかります（次回からは速くなります）。'),
  ]));
}

async function startCapture(step) {
  scanFlow.step = step;
  const box = $('#app').firstChild;
  paintScan(box);
  try {
    await PostureScan.load(msg => { const el = $('#scan-status'); if (el) el.textContent = msg; });
  } catch (e) {
    toast('解析エンジンを読み込めませんでした。通信環境をご確認ください', 'error');
    return;
  }
  await openCamera();
}

async function openCamera() {
  const v = $('#cam');
  if (!v) return;
  try {
    stopCamera();
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: scanFlow.facingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    v.srcObject = camStream;
    await v.play();
    const st = $('#scan-status');
    if (st) st.textContent = '';
  } catch (e) {
    const st = $('#scan-status');
    if (st) st.textContent = 'カメラを使えませんでした。ブラウザの権限をご確認ください。';
  }
}

function paintScanCapture(box) {
  const s = scanFlow;
  const isFront = s.step === 'front';
  const ghost = isFront ? lastFrontOutline() : lastSideOutline();

  const video = h('video', { id: 'cam', playsinline: '', muted: '', autoplay: '' });
  video.muted = true;

  const stage = h('div', { class: 'stage' }, [
    video,
    guideOverlay(ghost),
    h('div', { id: 'count', class: 'count' }),
  ]);

  box.appendChild(h('section', { class: 'card card-flush' }, [
    h('div', { class: 'card-hd' }, [
      h('span', { class: 'card-eyebrow' }, isFront ? '1 / 2 　正面' : '2 / 2 　横向き'),
      h('span', { class: 'card-sub' }, isFront ? 'カメラをまっすぐ見て立つ' : '真横を向いて立つ'),
    ]),
    stage,
    h('p', { id: 'scan-status', class: 'note small center' }, ''),
    h('div', { class: 'btnrow' }, [
      h('button', { class: 'btn btn-primary btn-lg', onclick: e => runCountdown(e.currentTarget) }, '5秒後に撮影'),
      h('button', { class: 'btn', onclick: () => { scanFlow.facingMode = scanFlow.facingMode === 'user' ? 'environment' : 'user'; openCamera(); } }, 'カメラ切替'),
    ]),
    h('label', { class: 'filepick' }, [
      '写真ファイルから読み込む',
      h('input', { type: 'file', accept: 'image/*', onchange: e => fromFile(e.target.files[0]) }),
    ]),
    h('p', { class: 'note small' }, ghost
      ? '前回のシルエットを薄く重ねています。これに合わせて立つと、前回と比べやすくなります。'
      : '全身が枠に収まるように、カメラとの距離を調整してください。'),
  ]));
}

/* 前回のシルエットを撮影画面に重ねる */
function lastFrontOutline() {
  const last = scans[scans.length - 1];
  return last && last.front ? PostureDB.unpackSlices(last.front) : null;
}
function lastSideOutline() {
  const last = scans[scans.length - 1];
  return last && last.side ? PostureDB.unpackSlices(last.side) : null;
}

// 断面テーブル → 輪郭のパス文字列（viewBox 0 0 100 100 の中に、高さ88%で中央配置）
function outlinePath(sl, height, cx, cy) {
  if (!sl || !sl.length) return '';
  const k = height;                       // 体の高さ1.0 → height
  const top = cy - height / 2;
  const y = i => top + (i + 0.5) / sl.length * k;
  const L = [], R = [];
  sl.forEach((v, i) => {
    if (v.r <= 0) return;
    L.push([cx + (v.c - v.r) * k, y(i)]);
    R.push([cx + (v.c + v.r) * k, y(i)]);
  });
  if (!L.length) return '';
  return smoothSvgPath(L.concat(R.reverse()));
}

// 点の列を、中点を通る2次ベジェでつないでなめらかにする
function smoothSvgPath(pts) {
  if (pts.length < 3) return '';
  const f = n => n.toFixed(2);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = 'M' + f(pts[0][0]) + ',' + f(pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const m = mid(pts[i], pts[i + 1]);
    d += 'Q' + f(pts[i][0]) + ',' + f(pts[i][1]) + ' ' + f(m[0]) + ',' + f(m[1]);
  }
  const last = pts[pts.length - 1];
  return d + 'L' + f(last[0]) + ',' + f(last[1]) + 'Z';
}

// 枠は 3:4。viewBox も同じ比にしてあるので、縦横がつぶれない。
function guideOverlay(ghost) {
  const W = 75, H = 100;
  const kids = [
    svgEl('line', { x1: W / 2, y1: 4, x2: W / 2, y2: 96, stroke: 'rgba(255,255,255,.5)', 'stroke-width': .4, 'stroke-dasharray': '2 2' }),
    svgEl('line', { x1: 8, y1: 94, x2: W - 8, y2: 94, stroke: 'rgba(255,255,255,.5)', 'stroke-width': .4, 'stroke-dasharray': '2 2' }),
  ];
  const d = outlinePath(ghost, 86, W / 2, 50);
  if (d) kids.push(svgEl('path', { d, fill: 'rgba(255,217,2,.16)', stroke: 'rgba(255,217,2,.85)', 'stroke-width': .6 }));
  return svgEl('svg', { class: 'guide', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none' }, kids);
}

/* ---- カウントダウン → 撮影 ---- */
function runCountdown(btn) {
  const el = $('#count');
  if (!el || btn.disabled) return;
  btn.disabled = true;
  let n = 5;
  el.textContent = String(n);
  const t = setInterval(() => {
    n--;
    if (n > 0) { el.textContent = String(n); return; }
    clearInterval(t);
    el.textContent = '';
    btn.disabled = false;
    captureNow();
  }, 1000);
}

// カメラの1コマを取り込んで解析する。解析が終わったら、そのコマは消す。
async function captureNow() {
  const v = $('#cam');
  if (!v || !v.videoWidth) { toast('カメラの準備ができていません', 'error'); return; }
  const w = Math.min(720, v.videoWidth);
  const h2 = Math.round(v.videoHeight * (w / v.videoWidth));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h2;
  cv.getContext('2d').drawImage(v, 0, 0, w, h2);
  await analyzeFrame(cv, w, h2);
}

async function fromFile(file) {
  if (!file) return;
  try { await PostureScan.load(msg => { const el = $('#scan-status'); if (el) el.textContent = msg; }); }
  catch { toast('解析エンジンを読み込めませんでした', 'error'); return; }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = () => rej(new Error('画像を開けませんでした'));
      i.src = url;
    });
    const w = Math.min(720, img.naturalWidth);
    const h2 = Math.round(img.naturalHeight * (w / img.naturalWidth));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h2;
    cv.getContext('2d').drawImage(img, 0, 0, w, h2);
    await analyzeFrame(cv, w, h2);
  } catch (e) {
    toast(e.message || '画像を読み込めませんでした', 'error');
  } finally {
    URL.revokeObjectURL(url);       // 画像はここで手放す
  }
}

async function analyzeFrame(cv, w, h2) {
  const st = $('#scan-status');
  if (st) st.textContent = '解析しています…';
  let res;
  try {
    res = scanFlow.step === 'front'
      ? PostureScan.analyzeFront(cv, w, h2)
      : PostureScan.analyzeSide(cv, w, h2);
  } catch (e) {
    res = { error: '解析に失敗しました。もう一度お試しください' };
  } finally {
    // ここでコマを破棄する（画像はどこにも残さない）
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    cv.width = 0; cv.height = 0;
  }

  if (res.error) {
    if (st) st.textContent = '';
    toast(res.error, 'error');
    return;
  }
  if (st) st.textContent = '';

  if (scanFlow.step === 'front') {
    scanFlow.front = res;
    toast('正面を記録しました。次は横向きです', 'success');
    scanFlow.step = 'side';
    const box = $('#app').firstChild;
    paintScan(box);
    await openCamera();
    return;
  }

  scanFlow.side = res;
  stopCamera();
  await saveScan();
}

async function saveScan() {
  const f = scanFlow.front, s = scanFlow.side;
  const rec = {
    handle: Misskey.handleOf(user),
    at: new Date().toISOString(),
    ref: f.ref || 0,
    angles: Object.assign({}, f.angles, s.angles),
    ratios: f.ratios || {},
    rows: f.rows || null,
    skeleton: f.world ? PostureDB.packWorld(f.world) : null,
    front: f.slices ? PostureDB.packSlices(f.slices) : null,
    side:  s.slices ? PostureDB.packSlices(s.slices) : null,
  };
  try {
    await PostureDB.add(rec);
  } catch (e) {
    toast('保存できませんでした', 'error');
    return;
  }
  scanFlow.saved = rec;
  scanFlow.step = 'done';
  await reload();
  const box = $('#app').firstChild;
  paintScan(box);
}

function paintScanResult(box) {
  const rec = scans[scans.length - 1];
  const prev = scans[scans.length - 2] || null;
  const sc = PostureMetrics.score(rec.angles);

  box.appendChild(h('section', { class: 'card' }, [
    h('div', { class: 'card-hd' }, [h('span', { class: 'card-eyebrow' }, 'スキャン完了')]),
    h('div', { class: 'score' }, [h('span', { class: 'score-n' }, sc == null ? '—' : String(sc))]),
    h('p', { class: 'note center' },
      '保存したのは ' + PostureDB.bytesOf(rec).toLocaleString() + ' バイトの数値だけです。画像は破棄しました。'),
  ]));
  box.appendChild(metricTable(rec, prev));
  box.appendChild(h('div', { class: 'btnrow' }, [
    h('button', { class: 'btn btn-primary', onclick: () => { scanFlow = null; switchView('view3d'); } }, '3Dで見る'),
    h('button', { class: 'btn', onclick: () => { scanFlow = null; switchView('home'); } }, 'ホームへ'),
  ]));
}

/* ============================================================
 *  3Dビュー
 * ============================================================ */
async function renderView3D(app) {
  const last = scans[scans.length - 1];
  if (!last) { app.appendChild(emptyCard('まだ記録がありません')); return; }

  const stage = h('div', { class: 'stage3d' });
  const btn = (label, fn, on) => h('button', { class: 'seg' + (on ? ' on' : ''), onclick: fn }, label);

  const views = h('div', { class: 'segrow' });
  const opts = h('div', { class: 'segrow' });

  app.appendChild(h('section', { class: 'card card-flush' }, [
    h('div', { class: 'card-hd' }, [
      h('span', { class: 'card-eyebrow' }, '3Dビュー'),
      h('span', { class: 'card-sub' }, fmtDate(last.at)),
    ]),
    stage,
    views, opts,
    h('p', { class: 'note small' }, 'ドラッグで回転、ピンチ／ホイールで拡大。'
      + '真上から見ると、肩の線と骨盤の線のねじれがわかります。'),
  ]));
  app.appendChild(h('div', { class: 'btnrow' }, [
    h('button', { class: 'btn', onclick: () => switchView('home') }, 'ホームへ'),
  ]));

  stage.appendChild(h('div', { class: 'loading' }, '3Dを準備しています…'));
  let v;
  try { v = await PostureView.create(stage); }
  catch (e) { stage.innerHTML = ''; stage.appendChild(h('div', { class: 'loading' }, '3Dを表示できませんでした')); return; }
  if (view !== 'view3d') { v.dispose(); return; }   // 準備中に画面を離れていたら捨てる
  stage.querySelectorAll('.loading').forEach(n => n.remove());
  viewer3d = v;
  v.setScan(last);

  let cur = 'iso';
  const setV = name => { cur = name; v.setView(name); paintViews(); };
  function paintViews() {
    views.innerHTML = '';
    [['正面', 'front'], ['横', 'side'], ['真上（俯瞰）', 'top'], ['斜め', 'iso']]
      .forEach(([l, k]) => views.appendChild(btn(l, () => setV(k), cur === k)));
  }
  paintViews();
  v.setView('iso');

  // ゴースト（過去の自分を重ねる）
  const olds = scans.slice(0, -1).reverse();
  let ghostIdx = -1;
  function paintOpts() {
    opts.innerHTML = '';
    opts.appendChild(btn('重ねない', () => { ghostIdx = -1; v.setGhost(null); paintOpts(); }, ghostIdx === -1));
    olds.slice(0, 3).forEach((r, i) => {
      opts.appendChild(btn(fmtDate(r.at), () => { ghostIdx = i; v.setGhost(r); paintOpts(); }, ghostIdx === i));
    });
  }
  if (olds.length) paintOpts();
}

/* ============================================================
 *  変化（グラフ・一覧・タイムラプス）
 * ============================================================ */
let trendKey = 'score';

function renderHistory(app) {
  if (!scans.length) { app.appendChild(emptyCard('まだ記録がありません')); return; }

  const chartBox = h('div', { class: 'chartbox' });
  const picker = h('div', { class: 'segrow wrapping' });

  function paint() {
    picker.innerHTML = '';
    [{ key: 'score', label: '姿勢スコア' }].concat(ALL_METRICS.map(m => ({ key: m.key, label: m.label })))
      .forEach(o => picker.appendChild(h('button', {
        class: 'seg' + (trendKey === o.key ? ' on' : ''),
        onclick: () => { trendKey = o.key; paint(); },
      }, o.label)));
    chartBox.innerHTML = '';
    chartBox.appendChild(trendChart(scans, trendKey));
  }
  paint();

  app.appendChild(h('section', { class: 'card' }, [
    h('div', { class: 'card-hd' }, [
      h('span', { class: 'card-eyebrow' }, '変化'),
      h('span', { class: 'card-sub' }, scans.length + ' 回ぶん'),
    ]),
    picker, chartBox,
    h('p', { class: 'note small' }, '太い線は4回の移動平均です。1回ごとの値（薄い点）は撮影条件で多少ぶれます。'),
  ]));

  app.appendChild(timelapseCard());

  app.appendChild(h('section', { class: 'card' }, [
    h('div', { class: 'card-hd' }, [h('span', { class: 'card-eyebrow' }, '記録の一覧')]),
    h('div', { class: 'tw' }, [h('table', { class: 'tbl' }, [
      h('thead', {}, h('tr', {}, [
        h('th', {}, '日時'), h('th', {}, 'スコア'), h('th', {}, '首の前傾'), h('th', {}, 'くびれ率'), h('th', {}, ''),
      ])),
      h('tbody', {}, scans.slice().reverse().map(r => h('tr', {}, [
        h('td', {}, fmtDateTime(r.at)),
        h('td', { class: 'num' }, String(PostureMetrics.score(r.angles) ?? '—')),
        h('td', { class: 'num' }, fmtNum(r.angles.neckForward, '°', 1)),
        h('td', { class: 'num' }, fmtNum(r.ratios && r.ratios.waistHip, '', 3)),
        h('td', {}, h('button', {
          class: 'linkbtn danger',
          onclick: async () => {
            if (!confirm('この記録を消します。よろしいですか？')) return;
            await PostureDB.remove(r.id); await reload(); switchView('history');
          },
        }, '削除')),
      ]))),
    ])]),
  ]));

  app.appendChild(h('div', { class: 'btnrow' }, [
    h('button', { class: 'btn', onclick: () => switchView('home') }, 'ホームへ'),
  ]));
}

/* ---------- 折れ線グラフ（1系列） ---------- */
function trendChart(rows, key) {
  const W = 470, H = 200, PAD = { t: 16, r: 46, b: 26, l: 38 };
  const meta = ALL_METRICS.find(m => m.key === key);
  const unit = key === 'score' ? '' : (meta ? meta.unit : '');
  const label = key === 'score' ? '姿勢スコア' : (meta ? meta.label : key);

  const raw = rows.map(r => key === 'score'
    ? PostureMetrics.score(r.angles)
    : (r[meta.group] && r[meta.group][meta.key]));
  const pts = raw.map((v, i) => ({ i, v: typeof v === 'number' ? v : null, at: rows[i].at }));
  const have = pts.filter(p => p.v !== null);
  if (have.length < 1) return h('p', { class: 'note center' }, 'この項目のデータがまだありません');

  // 移動平均（4回）
  const avg = pts.map((p, i) => {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - 3); j <= i; j++) if (pts[j].v !== null) { s += pts[j].v; c++; }
    return c ? s / c : null;
  });

  const dec = key === 'score' ? 0 : (meta ? meta.dec : 1);
  const vals = have.map(p => p.v).concat(avg.filter(v => v !== null));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.25 || (key === 'score' ? 8 : Math.pow(10, -dec) * 5);
  lo -= pad; hi += pad;
  if (key === 'score') { lo = Math.max(0, lo); hi = Math.min(100, hi); }
  if (key !== 'score' && lo > 0 && lo < pad * 2) lo = 0;   // 0が近ければ0まで見せる
  if (key !== 'score' && hi < 0 && hi > -pad * 2) hi = 0;
  const step = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  const x = i => PAD.l + (pts.length === 1 ? (W - PAD.l - PAD.r) / 2 : (W - PAD.l - PAD.r) * i / (pts.length - 1));
  const y = v => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - lo) / (hi - lo));

  const kids = [];

  // 目盛り（控えめ）
  for (let v = lo; v <= hi + 1e-9; v += step) {
    kids.push(svgEl('line', { x1: PAD.l, y1: y(v), x2: W - PAD.r, y2: y(v), class: 'grid' }));
    kids.push(svgEl('text', { x: PAD.l - 8, y: y(v) + 4, class: 'axis', 'text-anchor': 'end' },
      fmtNum(v, '', tickDec(step))));
  }
  // 0の基準線（角度系は0が理想）
  if (key !== 'score' && lo < 0 && hi > 0) {
    kids.push(svgEl('line', { x1: PAD.l, y1: y(0), x2: W - PAD.r, y2: y(0), class: 'zero' }));
    kids.push(svgEl('text', { x: W - PAD.r + 6, y: y(0) + 4, class: 'axis' }, '理想'));
  }

  // 生の値（薄い点）
  have.forEach(p => kids.push(svgEl('circle', { cx: x(p.i), cy: y(p.v), r: 2.6, class: 'dot-raw' })));

  // 移動平均（太い線）
  const line = avg.map((v, i) => v === null ? null : [x(i), y(v)]).filter(Boolean);
  if (line.length > 1) {
    kids.push(svgEl('path', {
      d: 'M' + line.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L'),
      class: 'trend',
    }));
  }
  // 最後の点だけ直接ラベルを置く
  const lastI = avg.map((v, i) => v === null ? -1 : i).filter(i => i >= 0).pop();
  if (lastI !== undefined && lastI >= 0) {
    kids.push(svgEl('circle', { cx: x(lastI), cy: y(avg[lastI]), r: 5, class: 'dot-end-ring' }));
    kids.push(svgEl('circle', { cx: x(lastI), cy: y(avg[lastI]), r: 3.4, class: 'dot-end' }));
    kids.push(svgEl('text', { x: x(lastI) + 9, y: y(avg[lastI]) + 4, class: 'endlabel' },
      fmtNum(avg[lastI], unit, dec)));
  }
  // 日付（最初と最後だけ）
  kids.push(svgEl('text', { x: PAD.l, y: H - 8, class: 'axis' }, fmtDate(rows[0].at)));
  if (rows.length > 1) {
    kids.push(svgEl('text', { x: W - PAD.r, y: H - 8, class: 'axis', 'text-anchor': 'end' },
      fmtDate(rows[rows.length - 1].at)));
  }

  const svg = svgEl('svg', {
    class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img',
    'aria-label': label + 'の推移',
  }, kids);

  // ホバー：十字線とツールチップ
  const tip = h('div', { class: 'tip' });
  const cross = svgEl('line', { class: 'cross', y1: PAD.t, y2: H - PAD.b, x1: 0, x2: 0, style: 'display:none' });
  svg.appendChild(cross);
  const wrap = h('div', { class: 'chartwrap' }, [svg, tip]);

  svg.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect();
    const px2 = (e.clientX - r.left) / r.width * W;
    let best = null;
    pts.forEach(p => {
      if (p.v === null) return;
      const d = Math.abs(x(p.i) - px2);
      if (!best || d < best.d) best = { p, d };
    });
    if (!best) return;
    cross.setAttribute('x1', x(best.p.i)); cross.setAttribute('x2', x(best.p.i));
    cross.style.display = '';
    tip.textContent = fmtDateTime(best.p.at) + '　' + label + ' ' + fmtNum(best.p.v, unit, dec);
    tip.style.display = 'block';
    tip.style.left = Math.min(88, Math.max(2, x(best.p.i) / W * 100)) + '%';
  });
  svg.addEventListener('pointerleave', () => { cross.style.display = 'none'; tip.style.display = 'none'; });

  return wrap;
}

// 目盛りの幅を 1 / 2 / 5 × 10のn乗 に丸める
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e;
}
const tickDec = step => Math.max(0, Math.min(3, -Math.floor(Math.log10(step))));

/* ---------- シルエット・タイムラプス ---------- */
function timelapseCard() {
  const withOutline = scans.filter(r => r.front);
  const cv = h('canvas', { class: 'lapse', width: 320, height: 420 });
  const card = h('section', { class: 'card' }, [
    h('div', { class: 'card-hd' }, [
      h('span', { class: 'card-eyebrow' }, 'シルエットの変化'),
      h('span', { class: 'card-sub' }, withOutline.length + ' 回ぶん'),
    ]),
    h('div', { class: 'lapse-wrap' }, cv),
    h('div', { id: 'lapse-date', class: 'note small center' }, ''),
    h('div', { class: 'btnrow' }, [
      h('button', { class: 'btn', onclick: () => playLapse(cv, withOutline) }, '再生'),
    ]),
    h('p', { class: 'note small' }, '保存してある輪郭だけをつないでいます。顔も背景も写りません。'),
  ]);
  requestAnimationFrame(() => {
    if (withOutline.length) drawOutline(cv, PostureDB.unpackSlices(withOutline[withOutline.length - 1].front), 1);
  });
  return card;
}

function drawOutline(cv, sl, alpha) {
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!sl || !sl.length) return;
  const k = cv.height * 0.86;
  const top = (cv.height - k) / 2;
  const cx = cv.width / 2;
  const L = [], R = [];
  sl.forEach((v, i) => {
    if (v.r <= 0) return;
    const y = top + (i + 0.5) / sl.length * k;
    L.push([cx + (v.c - v.r) * k, y]);
    R.push([cx + (v.c + v.r) * k, y]);
  });
  if (!L.length) return;
  const pts = L.concat(R.reverse());
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.quadraticCurveTo(pts[i][0], pts[i][1],
      (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  }
  ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  ctx.closePath();
  ctx.fillStyle = 'rgba(23,28,97,' + (0.10 * alpha).toFixed(3) + ')';
  ctx.fill();
  ctx.strokeStyle = 'rgba(23,28,97,' + (0.9 * alpha).toFixed(3) + ')';
  ctx.lineWidth = 2;
  ctx.stroke();
}

let lapseTimer = null;
function playLapse(cv, rows) {
  if (lapseTimer) { cancelAnimationFrame(lapseTimer); lapseTimer = null; }
  if (rows.length < 2) { toast('2回以上スキャンすると再生できます'); return; }
  const outs = rows.map(r => PostureDB.unpackSlices(r.front));
  const dateEl = $('#lapse-date');
  const dur = 900;                        // 1コマあたりのミリ秒
  const t0 = performance.now();
  const step = now => {
    const t = (now - t0) / dur;
    const i = Math.min(outs.length - 2, Math.floor(t));
    const f = Math.min(1, t - i);
    if (i >= outs.length - 1 || t >= outs.length - 1) {
      drawOutline(cv, outs[outs.length - 1], 1);
      if (dateEl) dateEl.textContent = fmtDate(rows[rows.length - 1].at);
      lapseTimer = null; return;
    }
    const a = outs[i], b = outs[i + 1];
    const mix = a.map((v, j) => ({
      c: v.c + (b[j].c - v.c) * f,
      r: v.r + (b[j].r - v.r) * f,
    }));
    drawOutline(cv, mix, 1);
    if (dateEl) dateEl.textContent = fmtDate(rows[i].at) + ' → ' + fmtDate(rows[i + 1].at);
    lapseTimer = requestAnimationFrame(step);
  };
  lapseTimer = requestAnimationFrame(step);
}

/* ============================================================
 *  データ（書き出し・読み込み・削除）
 * ============================================================ */
function renderData(app) {
  const total = scans.reduce((s, r) => s + PostureDB.bytesOf(r), 0);

  app.appendChild(h('section', { class: 'card' }, [
    h('div', { class: 'card-hd' }, [h('span', { class: 'card-eyebrow' }, 'この端末に入っている記録')]),
    h('div', { class: 'mlist' }, [
      h('div', { class: 'mrow' }, [
        h('div', { class: 'mrow-l' }, h('span', { class: 'mrow-label' }, 'スキャン回数')),
        h('div', { class: 'mrow-r' }, h('span', { class: 'mrow-v' }, String(scans.length))),
      ]),
      h('div', { class: 'mrow' }, [
        h('div', { class: 'mrow-l' }, h('span', { class: 'mrow-label' }, '合計サイズ')),
        h('div', { class: 'mrow-r' }, h('span', { class: 'mrow-v' }, total.toLocaleString() + ' B')),
      ]),
      h('div', { class: 'mrow' }, [
        h('div', { class: 'mrow-l' }, [
          h('span', { class: 'mrow-label' }, 'アカウント'),
          h('span', { class: 'mrow-hint' }, 'このアカウントの記録だけが表示されます'),
        ]),
        h('div', { class: 'mrow-r' }, h('span', { class: 'mrow-v small' }, Misskey.handleOf(user))),
      ]),
    ]),
  ]));

  app.appendChild(h('section', { class: 'card' }, [
    h('div', { class: 'card-hd' }, [h('span', { class: 'card-eyebrow' }, '保存場所について')]),
    h('p', { class: 'note' }, '記録はこの端末（ブラウザ）の中だけに保存しています。'
      + 'サーバーには送っていないので、他の人はもちろん、別の端末からも見えません。'),
    h('p', { class: 'note' }, '端末を替えるときや、念のためのバックアップには、下のボタンで'
      + 'ファイルに書き出してください。ブラウザの履歴消去で「サイトデータ」を消すと記録も消えます。'),
    h('div', { class: 'btnrow' }, [
      h('button', { class: 'btn btn-primary', onclick: doExport }, '書き出す（JSON）'),
      h('label', { class: 'btn' }, ['読み込む', h('input', {
        type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: doImport,
      })]),
    ]),
  ]));

  app.appendChild(h('section', { class: 'card' }, [
    h('div', { class: 'card-hd' }, [h('span', { class: 'card-eyebrow' }, 'その他')]),
    h('div', { class: 'btnrow' }, [
      h('button', { class: 'btn', onclick: () => { Misskey.logout(); user = null; scans = []; switchView('login'); } }, 'ログアウト'),
      h('button', {
        class: 'btn btn-danger',
        onclick: async () => {
          if (!confirm('この端末に保存されている記録を、すべて消します。よろしいですか？')) return;
          await PostureDB.clearAll(Misskey.handleOf(user));
          await reload(); toast('すべて削除しました', 'success'); switchView('data');
        },
      }, 'すべての記録を削除'),
    ]),
  ]));

  app.appendChild(h('div', { class: 'btnrow' }, [
    h('button', { class: 'btn', onclick: () => switchView('home') }, 'ホームへ'),
  ]));
}

async function doExport() {
  const json = await PostureDB.exportJSON(Misskey.handleOf(user));
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: 'silhouette-' + todayYMD() + '.json' });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('書き出しました', 'success');
}

async function doImport(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const n = await PostureDB.importJSON(await file.text(), Misskey.handleOf(user));
    await reload();
    toast(n ? n + ' 件を読み込みました' : '新しい記録はありませんでした', 'success');
    switchView('data');
  } catch (err) {
    toast(err.message || '読み込めませんでした', 'error');
  } finally {
    e.target.value = '';
  }
}

/* ============================================================
 *  小物
 * ============================================================ */
function emptyCard(msg) {
  return h('section', { class: 'card center' }, [
    h('p', { class: 'lead' }, msg),
    h('button', { class: 'btn btn-primary', onclick: () => switchView('scan') }, 'スキャンする'),
  ]);
}

function fmtNum(v, unit, dec) {
  if (typeof v !== 'number' || !isFinite(v)) return '—';
  return v.toFixed(dec === undefined ? 1 : dec) + (unit || '');
}
function fmtDate(iso) {
  const d = new Date(iso);
  return (d.getMonth() + 1) + '/' + d.getDate();
}
function fmtDateTime(iso) {
  const d = new Date(iso);
  return (d.getMonth() + 1) + '/' + d.getDate() + ' '
    + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function todayYMD() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function toast(msg, kind) {
  const box = $('#toasts');
  const t = h('div', { class: 'toast' + (kind ? ' toast-' + kind : '') }, msg);
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3200);
}

window.addEventListener('pagehide', stopCamera);
boot();
