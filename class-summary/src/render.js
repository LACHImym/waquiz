/**
 * 授業感想・ワークまとめ：HTML 描画（Google Apps Script / Node 共通）
 *
 * ページは 3 種類。
 *   index   … 科目の概要と、全回の「授業概要」「授業感想」へのリンク一覧（授業から 1 週間後に開く）
 *   round   … 1 回分の感想・ワークのまとめ
 *   overall … 全回を通した傾向
 * links: { index, overall, round: function(no){} }
 * opts:  { today: Date, delayDays: 7 }
 *
 * 見た目は「Nest」デザインハンドオフのニューモーフィズム（soft UI）に合わせています。
 * スマホ（390px）を基準に組み、広い画面では 2 列になります。
 * WordPress に貼っても崩れないよう、スタイルは .cs-root 配下に閉じています。
 */

var __cs = (typeof module !== 'undefined') ? require('./analyze.js') : null;
if (__cs) { var csParseDate = __cs.csParseDate, csDateOnly = __cs.csDateOnly, csOpenDate = __cs.csOpenDate; }

function csEsc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function csFmtDate(d) {
  d = csParseDate(d);
  if (!d) return '';
  return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
}

function csFmtMD(d) {
  d = csParseDate(d);
  if (!d) return '';
  return (d.getMonth() + 1) + '/' + d.getDate();
}

function csPct(a, b) { return b ? Math.round(a * 100 / b) : 0; }

function csBars(rows, total, opts) {
  opts = opts || {};
  if (!rows.length) return '<p class="cs-empty">集計できる回答がありません</p>';
  var max = rows.reduce(function (m, r) { return Math.max(m, r.count); }, 1);
  var html = '<ul class="cs-bars">';
  rows.forEach(function (r) {
    var w = Math.max(4, Math.round(r.count * 100 / max));
    html += '<li><span class="cs-bar-label">' + csEsc(r.label) + '</span>' +
      '<span class="cs-bar-track"><span class="cs-bar-fill" style="width:' + w + '%"></span></span>' +
      '<span class="cs-bar-num">' + r.count + (opts.pct && total ? '<small>' + csPct(r.count, total) + '%</small>' : '') + '</span></li>';
  });
  return html + '</ul>';
}

function csQuotes(list) {
  if (!list || !list.length) return '';
  var html = '<ul class="cs-quotes">';
  list.forEach(function (q) { html += '<li>' + csEsc(q) + '</li>'; });
  return html + '</ul>';
}

function csTypeStack(typeRes, typeDefs) {
  var html = '<div class="cs-stack" role="img" aria-label="感想タイプの割合">';
  typeDefs.forEach(function (t, i) {
    var row = typeRes.types.filter(function (x) { return x.key === t.key; })[0];
    if (!row || !row.primary) return;
    html += '<span class="cs-stack-seg cs-t' + i + '" style="flex-grow:' + row.primary + '" title="' + csEsc(t.label) + ' ' + row.primary + '件"></span>';
  });
  if (typeRes.other) html += '<span class="cs-stack-seg cs-t-other" style="flex-grow:' + typeRes.other + '" title="その他 ' + typeRes.other + '件"></span>';
  return html + '</div>';
}

function csTypeLegend(typeRes, typeDefs, withDesc) {
  var html = '<ul class="cs-legend">';
  typeDefs.forEach(function (t, i) {
    var row = typeRes.types.filter(function (x) { return x.key === t.key; })[0];
    if (!row) return;
    html += '<li><i class="cs-sw cs-t' + i + '"></i><b>' + csEsc(t.label) + '</b><span class="cs-num">' + row.primary + '名<small>' + csPct(row.primary, typeRes.n) + '%</small></span>' +
      (withDesc ? '<span class="cs-legend-desc">' + csEsc(t.desc || '') + '</span>' : '') + '</li>';
  });
  if (typeRes.other) html += '<li><i class="cs-sw cs-t-other"></i><b>その他</b><span class="cs-num">' + typeRes.other + '名<small>' + csPct(typeRes.other, typeRes.n) + '%</small></span></li>';
  return html + '</ul>';
}

// ---------- 部品 ----------

function csHead(meta, eyebrow, title, sub) {
  return '<header class="cs-hero"><p class="cs-eyebrow">' + eyebrow + '</p><h2>' + title + '</h2>' +
    (sub ? '<p class="cs-lede">' + sub + '</p>' : '') + '</header>';
}

function csFoot(sum, meta) {
  return '<footer class="cs-foot"><p>' + csEsc(meta.sourceNote || 'Google フォームの回答から自動集計。氏名・学籍番号は含めていません。感想タイプと語の集計は辞書による機械分類で、目安です。') +
    '</p><p>集計日 ' + csEsc(csFmtDate(sum.generatedAt)) + '</p></footer>';
}

function csWrap(inner) {
  return '<div class="cs-root">' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap">' +
    '<style>' + csCss() + '</style>' + inner + '</div>';
}

function csRoundBody(r, sum) {
  var html = '';
  if (r.notes && r.notes.length) {
    html += '<div class="cs-card cs-notes"><p class="cs-label">観察</p><ol>';
    r.notes.forEach(function (n) { html += '<li>' + csEsc(n) + '</li>'; });
    html += '</ol></div>';
  }
  if (r.works.length) {
    html += '<div class="cs-works">';
    r.works.forEach(function (w) {
      html += '<article class="cs-card cs-work"><p class="cs-label">' + csEsc(w.key) + '</p><h4>' + csEsc(w.label === w.key ? '' : w.label) + '</h4>' +
        '<p class="cs-sub">' + (w.mode === 'dict' ? '回答の分布' : 'よく挙がった語') + '<span class="cs-num">n=' + w.n + '</span>' +
        (w.mode === 'dict' && w.dist.none ? '<span class="cs-num">分類外 ' + w.dist.none + '</span>' : '') + '</p>' +
        csBars(w.dist.rows, w.n, { pct: w.mode === 'dict' }) +
        (w.quotes.length ? '<p class="cs-sub">学生たちの声</p>' + csQuotes(w.quotes) : '') +
        '</article>';
    });
    html += '</div>';
  }
  var c = r.comments;
  html += '<article class="cs-card cs-free"><p class="cs-label">授業感想</p><h4>自由記述<span class="cs-num">' + c.count + '件</span></h4>';
  html += '<div class="cs-two"><div><p class="cs-sub">感想のタイプ</p>' + csTypeStack(c.types, sum.typeDefs) + csTypeLegend(c.types, sum.typeDefs, false) + '</div>';
  html += '<div><p class="cs-sub">言及の多い語（延べ人数）</p>' + csBars(c.top, c.count, {}) + '</div></div>';
  var tq = [];
  sum.typeDefs.forEach(function (t) { (c.quotesByType[t.key] || []).forEach(function (q) { tq.push({ label: t.label, q: q }); }); });
  if (tq.length) {
    html += '<p class="cs-sub">タイプ別の声</p><ul class="cs-typed">';
    tq.forEach(function (x) { html += '<li><span class="cs-tag">' + csEsc(x.label) + '</span><span>' + csEsc(x.q) + '</span></li>'; });
    html += '</ul>';
  }
  html += '</article>';
  r.extras.forEach(function (e) {
    html += '<article class="cs-card cs-free"><p class="cs-label">' + csEsc(e.label) + '</p><h4>' + e.n + '件</h4>' +
      '<p class="cs-sub">言及の多い語</p>' + csBars(e.top, e.n, {}) + csQuotes(e.quotes) + '</article>';
  });
  if (r.questions.length) {
    html += '<details class="cs-card cs-questions"><summary>質問・相談<span class="cs-num">' + r.questions.length + '件</span></summary><ul>';
    r.questions.forEach(function (q) { html += '<li>' + csEsc(q) + '</li>'; });
    html += '</ul></details>';
  }
  return html;
}

// ---------- ページ ----------

/** メインページ：概要と全回のリンク。授業日から delayDays 後まではグレーアウト */
function csRenderIndex(sum, meta, links, opts) {
  opts = opts || {};
  var today = csDateOnly(opts.today || new Date());
  var delay = opts.delayDays === undefined ? 7 : opts.delayDays;
  var byNo = {};
  sum.rounds.forEach(function (r) { byNo[r.no] = r; });
  var total = Math.max(meta.roundTotal || 15, sum.roundCount);

  var html = csHead(meta, '授業感想とワークのまとめ', csEsc(meta.course || '授業'), csEsc(meta.term || ''));

  if (meta.overview && meta.overview.length) {
    html += '<section class="cs-card cs-overview">';
    meta.overview.forEach(function (o) { html += '<p class="cs-label">' + csEsc(o.label) + '</p><p class="cs-body">' + csEsc(o.text) + '</p>'; });
    html += '</section>';
  }

  if (meta.loginNote) html += '<p class="cs-notice">' + csEsc(meta.loginNote) + '</p>';
  html += '<section class="cs-index"><p class="cs-label">全' + total + '回　授業の 1 週間後に開きます</p><ol class="cs-index-list">';
  for (var no = 1; no <= total; no++) {
    var cfg = (meta.rounds || {})[no] || {};
    var r = byNo[no];
    var title = cfg.title || (r && r.title) || '';
    var classDate = csParseDate(cfg.date) || (r ? r.classDate : null);
    var openDate = csOpenDate(classDate, delay);
    var open = openDate && today >= openDate;
    var dateText = classDate ? csFmtMD(classDate) : '日程未定';
    html += '<li class="cs-row' + (open ? '' : ' is-locked') + '">' +
      '<span class="cs-badge">' + no + '</span>' +
      '<span class="cs-row-main"><span class="cs-row-title">' + (title ? csEsc(title) : '<span class="cs-mute">（タイトル未設定）</span>') + '</span>' +
      '<span class="cs-row-meta">' + csEsc(dateText) + (open ? '' : (openDate ? '　' + csFmtMD(openDate) + ' に公開' : '')) + '</span></span>' +
      '<span class="cs-row-links">' +
      (open && cfg.url ? '<a class="cs-pill" href="' + csEsc(cfg.url) + '">授業概要</a>' : '<span class="cs-pill is-off">授業概要</span>') +
      (open && r ? '<a class="cs-pill is-primary" href="' + csEsc(links.round(no)) + '">授業感想</a>' : '<span class="cs-pill is-off">授業感想</span>') +
      '</span></li>';
  }
  html += '</ol>';
  html += '<a class="cs-cta" href="' + csEsc(links.overall) + '">全' + sum.roundCount + '回を通した傾向を見る</a>';
  html += '</section>';
  html += csFoot(sum, meta);
  return csWrap(html);
}

/** 1 回分のページ。公開日前は中身を出さない */
function csRenderRoundPage(sum, no, meta, links, opts) {
  opts = opts || {};
  var today = csDateOnly(opts.today || new Date());
  var delay = opts.delayDays === undefined ? 7 : opts.delayDays;
  var r = sum.rounds.filter(function (x) { return x.no === no; })[0];
  var cfg = (meta.rounds || {})[no] || {};
  var eyebrow = csEsc(meta.course || '') + (meta.term ? '　' + csEsc(meta.term) : '');
  if (!r) {
    return csWrap(csHead(meta, eyebrow, '第' + no + '回', '') + '<div class="cs-card"><p class="cs-body">この回の感想データはまだありません。</p></div>' + csPager(sum, no, cfg, links));
  }
  var openDate = csOpenDate(csParseDate(cfg.date) || r.classDate, delay);
  if (openDate && today < openDate) {
    return csWrap(csHead(meta, eyebrow, '第' + no + '回　' + csEsc(r.title || ''), '') +
      '<div class="cs-card"><p class="cs-body">このページは ' + csFmtDate(openDate) + ' に公開されます。</p></div>' + csPager(sum, no, cfg, links));
  }
  var title = '<span class="cs-round-no">第' + no + '回</span>' + (r.title ? csEsc(r.title) : '（タイトル未設定）');
  var sub = csFmtDate(r.classDate || r.date) + '　提出 ' + r.n + '名';
  var html = csHead(meta, eyebrow, title, sub);
  html += csPager(sum, no, cfg, links);
  html += '<section class="cs-round">' + csRoundBody(r, sum) + '</section>';
  html += csPager(sum, no, cfg, links);
  html += csFoot(sum, meta);
  return csWrap(html);
}

function csPager(sum, no, cfg, links) {
  var nos = sum.rounds.map(function (x) { return x.no; });
  var i = nos.indexOf(no);
  var prev = i > 0 ? nos[i - 1] : null, next = i >= 0 && i < nos.length - 1 ? nos[i + 1] : null;
  return '<nav class="cs-pager"><a class="cs-pill" href="' + csEsc(links.index) + '">← メイン</a>' +
    (cfg.url ? '<a class="cs-pill" href="' + csEsc(cfg.url) + '">授業概要</a>' : '') +
    '<span class="cs-pager-nav">' +
    (prev ? '<a class="cs-pill" href="' + csEsc(links.round(prev)) + '">‹ ' + prev + '</a>' : '') +
    (next ? '<a class="cs-pill" href="' + csEsc(links.round(next)) + '">' + next + ' ›</a>' : '') +
    '</span></nav>';
}

/** 全回を通した傾向 */
function csRenderOverallPage(sum, meta, links) {
  var eyebrow = csEsc(meta.course || '') + (meta.term ? '　' + csEsc(meta.term) : '');
  var html = csHead(meta, eyebrow, '全' + sum.roundCount + '回を通した傾向', '提出のべ ' + sum.totalResponses + '件　感想 ' + sum.totalComments + '件　中央値 ' + sum.medianLength + '字');
  html += '<nav class="cs-pager"><a class="cs-pill" href="' + csEsc(links.index) + '">← メイン</a></nav>';
  html += '<section class="cs-card"><p class="cs-label">感想のタイプ</p><h4>' + sum.totalComments + '件を分類</h4>' +
    csTypeStack(sum.overall.types, sum.typeDefs) + csTypeLegend(sum.overall.types, sum.typeDefs, true) + '</section>';
  html += '<section class="cs-card"><p class="cs-label">言及の多い語</p><h4>延べ人数</h4>' + csBars(sum.overall.top, sum.totalComments, {}) + '</section>';
  html += '<section class="cs-card"><p class="cs-label">回ごとの感想タイプ</p><ol class="cs-timeline">';
  sum.rounds.forEach(function (r) {
    var lead = r.comments.top.slice(0, 3).map(function (x) { return x.label; }).join('・');
    html += '<li><a class="cs-badge" href="' + csEsc(links.round(r.no)) + '">' + r.no + '</a><div class="cs-tl-body"><div class="cs-tl-title"><a href="' + csEsc(links.round(r.no)) + '">' +
      (r.title ? csEsc(r.title) : '<span class="cs-mute">タイトル未設定</span>') + '</a><span class="cs-tl-words">' + csEsc(lead) + '</span></div>' +
      csTypeStack(r.comments.types, sum.typeDefs) + '</div></li>';
  });
  html += '</ol></section>';
  html += csFoot(sum, meta);
  return csWrap(html);
}

/** 単体 HTML ファイルにする（ウェブアプリ・Drive 保存・手元確認用） */
function csRenderDocument(fragment, title) {
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<base target="_top">' +  // Apps Script の枠（iframe）の中でリンクを開かず、ページ全体で開く。ログイン画面が拒否されるのを防ぐ
    '<title>' + csEsc(title) + '</title>' +
    '<style>body{margin:0;background:#e6e9ef;font-family:Inter,"Noto Sans JP",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}</style>' +
    '</head><body>' + fragment + '</body></html>';
}

function csCss() {
  return [
    '.cs-root{--bg:#e6e9ef;--panel:#eef1f6;--sd:#c5cad3;--sl:#ffffff;--ink:#2a3142;--mute:#7a8294;--teal:#2dd4bf;--teal-deep:#0d9488;--amber:#f59e0b;--amber-dark:#92400e;--mint:#d4f1eb;--amber-mint:#fef0d4;--divider:#dfe5ed;--purple:#7c3aed;',
    '--raise:8px 8px 18px var(--sd),-8px -8px 18px var(--sl);--raise-sm:6px 6px 14px var(--sd),-6px -6px 14px var(--sl);--inset:inset 4px 4px 10px var(--sd),inset -4px -4px 10px var(--sl);--inset-sm:inset 3px 3px 6px var(--sd),inset -3px -3px 6px var(--sl);',
    'color:var(--ink);background:var(--bg);font-family:Inter,"Noto Sans JP",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.7;max-width:720px;margin:0 auto;padding-block:28px 40px;padding-inline:22px;box-sizing:border-box;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}',
    '.cs-root *{box-sizing:border-box}.cs-root h2,.cs-root h3,.cs-root h4,.cs-root p,.cs-root ul,.cs-root ol{margin:0}.cs-root ul,.cs-root ol{padding:0;list-style:none}.cs-root a{color:var(--teal-deep)}.cs-root a:focus-visible{outline:2px solid var(--teal);outline-offset:3px;border-radius:6px}',
    '.cs-label{font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}',
    '.cs-eyebrow{font-size:11px;color:var(--mute);letter-spacing:.06em}.cs-hero{padding:6px 0 18px}.cs-hero h2{font-size:24px;font-weight:600;letter-spacing:-.02em;line-height:1.25;margin-top:2px;text-wrap:balance}.cs-hero .cs-round-no{display:block;font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--teal-deep);margin-bottom:4px}.cs-lede{font-size:11.5px;color:var(--mute);margin-top:6px;font-variant-numeric:tabular-nums}',
    '.cs-num{font-variant-numeric:tabular-nums;color:var(--mute);font-weight:500;font-size:11px;margin-left:.6em}.cs-num small,.cs-bar-num small{font-size:.85em;color:var(--mute);margin-left:.3em}.cs-mute{color:var(--mute)}',
    '.cs-card{background:var(--panel);border-radius:22px;box-shadow:var(--raise);padding:16px;margin-top:16px}.cs-card h4{font-size:14px;font-weight:600;margin-top:2px;line-height:1.4;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;text-wrap:balance}.cs-body{font-size:13px;line-height:1.8;margin-top:4px}.cs-overview .cs-label+.cs-body{margin-bottom:12px}.cs-overview .cs-body:last-child{margin-bottom:0}',
    '.cs-sub{font-size:11px;font-weight:500;color:var(--mute);letter-spacing:.06em;margin:14px 0 8px;display:flex;align-items:baseline;flex-wrap:wrap}.cs-sub .cs-num{margin-left:.8em}.cs-label+.cs-sub,h4+.cs-sub{margin-top:10px}',
    '.cs-index{margin-top:22px}.cs-index>.cs-label{padding:0 4px}.cs-index-list{display:grid;gap:10px;margin-top:10px}',
    '.cs-row{display:grid;grid-template-columns:34px 1fr;grid-template-areas:"badge main" "badge links";column-gap:12px;row-gap:8px;align-items:center;background:var(--panel);border-radius:20px;box-shadow:var(--raise-sm);padding:12px 14px}',
    '.cs-row.is-locked{box-shadow:var(--inset-sm);background:var(--bg);color:var(--mute)}.cs-row.is-locked .cs-badge{background:var(--sd);color:var(--panel);box-shadow:none}',
    '.cs-badge{width:30px;height:30px;border-radius:50%;background:var(--ink);color:var(--panel);font-weight:700;font-size:13px;display:inline-flex;align-items:center;justify-content:center;grid-area:badge;text-decoration:none;font-variant-numeric:tabular-nums;flex:none}',
    '.cs-row-main{grid-area:main;display:grid;gap:1px;min-width:0}.cs-row-title{font-size:13.5px;font-weight:600;line-height:1.4}.cs-row-meta{font-size:10.5px;color:var(--mute);letter-spacing:.06em;font-variant-numeric:tabular-nums}',
    '.cs-row-links{grid-area:links;display:flex;gap:8px;flex-wrap:wrap}',
    '@media (min-width:560px){.cs-row{grid-template-columns:34px 1fr auto;grid-template-areas:"badge main links"}.cs-row-links{justify-content:flex-end}}',
    '.cs-pill{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:34px;padding:6px 14px;border-radius:999px;background:var(--panel);box-shadow:var(--raise-sm);font-size:12px;font-weight:600;color:var(--ink);text-decoration:none;white-space:nowrap;transition:box-shadow .1s}.cs-pill:active{box-shadow:var(--inset-sm)}',
    '.cs-pill.is-primary{background:var(--teal);color:#fff;box-shadow:0 6px 14px -2px rgba(45,212,191,.4)}.cs-pill.is-off{box-shadow:var(--inset-sm);background:var(--bg);color:var(--mute);font-weight:500}',
    '.cs-notice{margin-top:16px;background:var(--mint);color:var(--teal-deep);border-radius:14px;padding:10px 14px;font-size:12.5px;font-weight:500;line-height:1.6}',
    '.cs-cta{display:flex;align-items:center;justify-content:center;margin-top:18px;min-height:46px;padding:12px 18px;border-radius:18px;background:var(--panel);box-shadow:var(--inset);font-size:13px;font-weight:600;color:var(--teal-deep);text-decoration:none}',
    '.cs-pager{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 4px}.cs-pager-nav{margin-left:auto;display:flex;gap:8px}.cs-round{margin-top:4px}',
    '.cs-notes ol{list-style:none;display:grid;gap:8px;margin-top:8px;counter-reset:n}.cs-notes li{display:grid;grid-template-columns:26px 1fr;column-gap:10px;align-items:start;font-size:13px;line-height:1.6;counter-increment:n}.cs-notes li::before{content:counter(n);width:26px;height:26px;border-radius:50%;background:var(--ink);color:var(--panel);font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;margin-top:1px}',
    '.cs-works{display:grid;grid-template-columns:1fr;gap:16px;margin-top:16px}.cs-works .cs-card{margin-top:0}@media (min-width:700px){.cs-works{grid-template-columns:1fr 1fr}}',
    '.cs-two{display:grid;grid-template-columns:1fr;gap:16px;margin-top:4px}@media (min-width:700px){.cs-two{grid-template-columns:1fr 1fr;gap:24px}}',
    '.cs-bars{display:grid;gap:7px}.cs-bars li{display:grid;grid-template-columns:minmax(84px,36%) 1fr 54px;align-items:center;column-gap:10px;font-size:12.5px;font-weight:500}.cs-bar-label{overflow-wrap:anywhere;line-height:1.35}.cs-bar-track{height:10px;border-radius:5px;background:var(--bg);box-shadow:var(--inset-sm);overflow:hidden}.cs-bar-fill{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,var(--teal),var(--teal-deep))}.cs-bar-num{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;font-weight:600}',
    '.cs-stack{display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--bg);box-shadow:var(--inset-sm);gap:2px;padding:2px}.cs-stack-seg{display:block;flex-basis:0;min-width:2px;border-radius:4px}',
    '.cs-t0{background:var(--teal-deep)}.cs-t1{background:var(--teal)}.cs-t2{background:var(--amber)}.cs-t3{background:var(--purple)}.cs-t4{background:var(--ink)}.cs-t5{background:#a78bfa}.cs-t-other{background:var(--sd)}',
    '.cs-legend{display:grid;gap:5px;margin-top:10px;font-size:12.5px}.cs-legend li{display:grid;grid-template-columns:12px auto 1fr;align-items:baseline;column-gap:8px}.cs-legend b{font-weight:600}.cs-legend .cs-legend-desc{grid-column:2/4;color:var(--mute);font-size:11px;margin-top:-3px}.cs-sw{width:10px;height:10px;border-radius:3px;display:inline-block;position:relative;top:1px}',
    '.cs-timeline{display:grid;gap:12px;margin-top:10px}.cs-timeline li{display:grid;grid-template-columns:30px 1fr;column-gap:12px;align-items:center}.cs-tl-body{display:grid;gap:5px;min-width:0}.cs-tl-title{font-size:12.5px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.cs-tl-title a{text-decoration:none;color:inherit;font-weight:600}.cs-tl-words{color:var(--mute);font-size:10.5px}.cs-timeline .cs-stack{height:10px}',
    '.cs-quotes{display:grid;gap:8px}.cs-quotes li{background:var(--bg);box-shadow:var(--inset-sm);border-radius:14px;padding:10px 12px 10px 30px;position:relative;font-size:12.5px;line-height:1.7}.cs-quotes li::before{content:"\\201C";position:absolute;left:12px;top:6px;font-size:22px;line-height:1;font-weight:700;color:var(--amber)}',
    '.cs-typed{display:grid;gap:8px}.cs-typed li{display:grid;gap:4px;background:var(--bg);box-shadow:var(--inset-sm);border-radius:14px;padding:10px 12px;font-size:12.5px;line-height:1.7}.cs-tag{display:inline-block;justify-self:start;font-size:10px;font-weight:600;letter-spacing:.06em;color:var(--teal-deep);background:var(--mint);border-radius:999px;padding:1px 9px}',
    '.cs-questions summary{cursor:pointer;font-size:13px;font-weight:600;list-style:none;display:flex;align-items:center;gap:8px}.cs-questions summary::before{content:"›";display:inline-flex;width:24px;height:24px;border-radius:50%;box-shadow:var(--inset-sm);align-items:center;justify-content:center;color:var(--mute);transition:transform .15s}.cs-questions[open] summary::before{transform:rotate(90deg)}.cs-questions ul{display:grid;gap:6px;margin-top:10px;padding-left:1.2em;list-style:disc;font-size:12.5px}',
    '.cs-empty{color:var(--mute);font-size:12px}',
    '.cs-foot{margin-top:28px;padding:0 6px;color:var(--mute);font-size:11px;display:grid;gap:3px;line-height:1.6}',
    '@media (prefers-reduced-motion:reduce){.cs-root *{transition:none!important}}'
  ].join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = { csRenderIndex: csRenderIndex, csRenderRoundPage: csRenderRoundPage, csRenderOverallPage: csRenderOverallPage, csRenderDocument: csRenderDocument, csEsc: csEsc };
}
