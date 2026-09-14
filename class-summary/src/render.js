/**
 * 授業感想・ワークまとめ：HTML 描画（Google Apps Script / Node 共通）
 *
 * ページは 3 種類。
 *   index   … 科目の概要と、全回の「授業概要」「授業感想」へのリンク一覧
 *   round   … 1 回分の感想・ワークのまとめ
 *   overall … 全回を通した傾向
 * links: { index: url, overall: url, round: function(no){ return url } }
 * WordPress に貼っても崩れないよう、スタイルは .cs-root 配下に閉じています。
 */

function csEsc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function csFmtDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
}

function csPct(a, b) { return b ? Math.round(a * 100 / b) : 0; }

function csBars(rows, total, opts) {
  opts = opts || {};
  if (!rows.length) return '<p class="cs-empty">集計できる回答がありません</p>';
  var max = rows.reduce(function (m, r) { return Math.max(m, r.count); }, 1);
  var html = '<ul class="cs-bars">';
  rows.forEach(function (r) {
    var w = Math.max(3, Math.round(r.count * 100 / max));
    html += '<li><span class="cs-bar-label">' + csEsc(r.label) + '</span>' +
      '<span class="cs-bar-track"><span class="cs-bar-fill" style="width:' + w + '%"></span></span>' +
      '<span class="cs-bar-num">' + r.count + (opts.pct && total ? '<small>' + csPct(r.count, total) + '%</small>' : '') + '</span></li>';
  });
  return html + '</ul>';
}

function csQuotes(list, cls) {
  if (!list || !list.length) return '';
  var html = '<ul class="cs-quotes' + (cls ? ' ' + cls : '') + '">';
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
    html += '<li><i class="cs-sw cs-t' + i + '"></i><b>' + csEsc(t.label) + '</b> <span class="cs-num">' + row.primary + '名<small>' + csPct(row.primary, typeRes.n) + '%</small></span>' +
      (withDesc ? '<span class="cs-legend-desc">' + csEsc(t.desc || '') + '</span>' : '') + '</li>';
  });
  if (typeRes.other) html += '<li><i class="cs-sw cs-t-other"></i><b>その他</b> <span class="cs-num">' + typeRes.other + '名<small>' + csPct(typeRes.other, typeRes.n) + '%</small></span></li>';
  return html + '</ul>';
}

// ---------- 部品 ----------

function csHead(meta, title, sub, eyebrow) {
  if (!eyebrow) eyebrow = csEsc(meta.course || '') + (meta.term ? '　' + csEsc(meta.term) : '');
  return '<header class="cs-hero"><p class="cs-eyebrow">' + eyebrow + '</p>' +
    '<h2>' + title + '</h2>' + (sub ? '<p class="cs-lede">' + sub + '</p>' : '') + '</header>';
}

function csFoot(sum, meta) {
  return '<footer class="cs-foot"><p>' + csEsc(meta.sourceNote || 'Google フォームの回答から自動集計。氏名・学籍番号は含めていません。感想タイプと語の集計は辞書による機械分類で、目安です。') +
    '</p><p>最終更新 ' + csEsc(csFmtDate(sum.generatedAt)) + '</p></footer>';
}

function csWrap(inner) {
  return '<div class="cs-root">' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">' +
    '<style>' + csCss() + '</style>' + inner + '</div>';
}

function csRoundBody(r, sum) {
  var html = '';
  if (r.notes && r.notes.length) {
    html += '<div class="cs-notes"><h4>観察</h4><ol>';
    r.notes.forEach(function (n) { html += '<li>' + csEsc(n) + '</li>'; });
    html += '</ol></div>';
  }
  if (r.works.length) {
    html += '<div class="cs-works">';
    r.works.forEach(function (w) {
      html += '<article class="cs-work"><h4><span class="cs-work-key">' + csEsc(w.key) + '</span>' + csEsc(w.label === w.key ? '' : w.label) + '</h4>' +
        '<p class="cs-sub">' + (w.mode === 'dict' ? '回答の分布' : 'よく挙がった語') + '　<span class="cs-num">n=' + w.n + '</span>' +
        (w.mode === 'dict' && w.dist.none ? '　<span class="cs-muted">分類外 ' + w.dist.none + '</span>' : '') + '</p>' +
        csBars(w.dist.rows, w.n, { pct: w.mode === 'dict' }) +
        (w.quotes.length ? '<p class="cs-sub">学生たちの声</p>' + csQuotes(w.quotes) : '') +
        '</article>';
    });
    html += '</div>';
  }
  var c = r.comments;
  html += '<article class="cs-free"><h4>授業感想（自由記述）<span class="cs-num">' + c.count + '件</span></h4>';
  html += '<div class="cs-free-grid"><div><p class="cs-sub">感想のタイプ</p>' + csTypeStack(c.types, sum.typeDefs) + csTypeLegend(c.types, sum.typeDefs, false) + '</div>';
  html += '<div><p class="cs-sub">言及の多い語（延べ人数）</p>' + csBars(c.top, c.count, {}) + '</div></div>';
  var tq = [];
  sum.typeDefs.forEach(function (t) { (c.quotesByType[t.key] || []).forEach(function (q) { tq.push({ label: t.label, q: q }); }); });
  if (tq.length) {
    html += '<p class="cs-sub">タイプ別の声</p><ul class="cs-quotes cs-quotes-typed">';
    tq.forEach(function (x) { html += '<li><span class="cs-tag">' + csEsc(x.label) + '</span>' + csEsc(x.q) + '</li>'; });
    html += '</ul>';
  }
  html += '</article>';
  r.extras.forEach(function (e) {
    html += '<article class="cs-free"><h4>' + csEsc(e.label) + '<span class="cs-num">' + e.n + '件</span></h4>' +
      '<p class="cs-sub">言及の多い語</p>' + csBars(e.top, e.n, {}) + csQuotes(e.quotes) + '</article>';
  });
  if (r.questions.length) {
    html += '<details class="cs-questions"><summary>質問・相談　<span class="cs-num">' + r.questions.length + '件</span></summary><ul>';
    r.questions.forEach(function (q) { html += '<li>' + csEsc(q) + '</li>'; });
    html += '</ul></details>';
  }
  return html;
}

// ---------- ページ ----------

/** メインページ：概要と全回のリンク */
function csRenderIndex(sum, meta, links) {
  var byNo = {};
  sum.rounds.forEach(function (r) { byNo[r.no] = r; });
  var total = Math.max(meta.roundTotal || 15, sum.roundCount);
  var html = csHead(meta, csEsc(meta.course || '授業'), csEsc(meta.term || ''), '授業感想とワークのまとめ');

  if (meta.overview && meta.overview.length) {
    html += '<section class="cs-overview">';
    meta.overview.forEach(function (o) {
      html += '<h3>' + csEsc(o.label) + '</h3><p>' + csEsc(o.text) + '</p>';
    });
    html += '</section>';
  }

  html += '<section class="cs-index"><h3>全' + total + '回</h3><ol class="cs-index-list">';
  for (var no = 1; no <= total; no++) {
    var cfg = (meta.rounds || {})[no] || {};
    var r = byNo[no];
    var title = cfg.title || (r && r.title) || '';
    html += '<li><span class="cs-idx-no">' + no + '</span><span class="cs-idx-title">' + (title ? csEsc(title) : '<span class="cs-muted">（タイトル未設定）</span>') + '</span><span class="cs-idx-links">' +
      (cfg.url ? '<a href="' + csEsc(cfg.url) + '">授業概要</a>' : '<span class="cs-muted">授業概要</span>') +
      (r ? '<a href="' + csEsc(links.round(no)) + '">授業感想<small>' + r.n + '名</small></a>' : '<span class="cs-muted">授業感想<small>なし</small></span>') +
      '</span></li>';
  }
  html += '</ol>';
  html += '<p class="cs-index-overall"><a href="' + csEsc(links.overall) + '">全' + sum.roundCount + '回を通した傾向を見る →</a></p>';
  html += '</section>';
  html += csFoot(sum, meta);
  return csWrap(html);
}

/** 1 回分のページ */
function csRenderRoundPage(sum, no, meta, links) {
  var r = sum.rounds.filter(function (x) { return x.no === no; })[0];
  if (!r) return csWrap(csHead(meta, '第' + no + '回', '') + '<p class="cs-empty">この回の感想データはまだありません。</p><p><a href="' + csEsc(links.index) + '">← メインページ</a></p>');
  var cfg = (meta.rounds || {})[no] || {};
  var title = '<span class="cs-round-no">第' + no + '回</span>' + (r.title ? csEsc(r.title) : '（タイトル未設定）');
  var sub = csFmtDate(r.date) + '　提出 ' + r.n + '名';
  var html = csHead(meta, title, sub);
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
  return '<nav class="cs-pager"><a href="' + csEsc(links.index) + '">← メイン</a>' +
    (cfg.url ? '<a href="' + csEsc(cfg.url) + '">この回の授業概要</a>' : '') +
    '<span class="cs-pager-nav">' +
    (prev ? '<a href="' + csEsc(links.round(prev)) + '">‹ 第' + prev + '回</a>' : '<span class="cs-muted">‹</span>') +
    (next ? '<a href="' + csEsc(links.round(next)) + '">第' + next + '回 ›</a>' : '<span class="cs-muted">›</span>') +
    '</span></nav>';
}

/** 全回を通した傾向 */
function csRenderOverallPage(sum, meta, links) {
  var html = csHead(meta, '全' + sum.roundCount + '回を通した傾向', '提出のべ ' + sum.totalResponses + '件　感想 ' + sum.totalComments + '件　感想の長さの中央値 ' + sum.medianLength + '字');
  html += '<nav class="cs-pager"><a href="' + csEsc(links.index) + '">← メイン</a></nav>';
  html += '<section class="cs-overall">';
  html += '<div class="cs-free-grid"><div><p class="cs-sub">感想のタイプ（' + sum.totalComments + '件を分類）</p>' +
    csTypeStack(sum.overall.types, sum.typeDefs) + csTypeLegend(sum.overall.types, sum.typeDefs, true) + '</div>';
  html += '<div><p class="cs-sub">全回で言及の多い語（延べ人数）</p>' + csBars(sum.overall.top, sum.totalComments, {}) + '</div></div>';
  html += '<p class="cs-sub">回ごとの感想タイプ</p><ol class="cs-timeline">';
  sum.rounds.forEach(function (r) {
    var lead = r.comments.top.slice(0, 3).map(function (x) { return x.label; }).join('・');
    html += '<li><a class="cs-tl-no" href="' + csEsc(links.round(r.no)) + '">' + r.no + '</a><div class="cs-tl-body"><div class="cs-tl-title"><a href="' + csEsc(links.round(r.no)) + '">' +
      (r.title ? csEsc(r.title) : '<span class="cs-muted">タイトル未設定</span>') + '</a><span class="cs-tl-words">' + csEsc(lead) + '</span></div>' +
      csTypeStack(r.comments.types, sum.typeDefs) + '</div></li>';
  });
  html += '</ol></section>';
  html += csFoot(sum, meta);
  return csWrap(html);
}

/** 単体 HTML ファイルにする（ウェブアプリ・Drive 保存・手元確認用） */
function csRenderDocument(fragment, title) {
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + csEsc(title) + '</title>' +
    '<style>:root{color-scheme:light dark}body{margin:0;background:#f6f5f1;font-family:"Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif}@media (prefers-color-scheme:dark){body{background:#14171c}}</style>' +
    '</head><body>' + fragment + '</body></html>';
}

function csCss() {
  return [
    '.cs-root{--cs-ground:#f6f5f1;--cs-panel:#ffffff;--cs-ink:#1d2129;--cs-muted:#626978;--cs-line:#dad7cf;--cs-accent:#2c4b7c;--cs-accent-soft:#e3eaf4;--cs-quote:#a85e2c;',
    '--cs-t0:#2c4b7c;--cs-t1:#5f8fcf;--cs-t2:#a85e2c;--cs-t3:#3b8a6e;--cs-t4:#b89a3c;--cs-t5:#7c6aa8;--cs-tother:#c9c5bb;',
    'color:var(--cs-ink);background:var(--cs-ground);font-family:"Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif;font-size:15px;line-height:1.75;max-width:900px;margin:0 auto;padding-block:32px 48px;padding-inline:20px;box-sizing:border-box;font-feature-settings:"palt"}',
    '@media (prefers-color-scheme:dark){.cs-root:not([data-theme="light"]){--cs-ground:#14171c;--cs-panel:#1c2027;--cs-ink:#e8e6e0;--cs-muted:#9ca3ae;--cs-line:#2e343d;--cs-accent:#86a9dc;--cs-accent-soft:#24344a;--cs-quote:#d3906a;--cs-t0:#6f97d4;--cs-t1:#9dbde8;--cs-t2:#d3906a;--cs-t3:#5fb497;--cs-t4:#d3b85a;--cs-t5:#a999d6;--cs-tother:#4a505a}}',
    '.cs-root *{box-sizing:border-box}.cs-root h2,.cs-root h3,.cs-root h4{margin:0;font-family:"Shippori Mincho","Hiragino Mincho ProN","Yu Mincho",serif;font-weight:600;text-wrap:balance;line-height:1.35}',
    '.cs-root p{margin:0}.cs-root ul,.cs-root ol{margin:0;padding:0;list-style:none}.cs-root a{color:var(--cs-accent)}.cs-root a:focus-visible{outline:2px solid var(--cs-accent);outline-offset:2px}',
    '.cs-num{font-variant-numeric:tabular-nums;color:var(--cs-muted);font-weight:400;margin-left:.5em}.cs-num small,.cs-bar-num small{font-size:.75em;color:var(--cs-muted);margin-left:.35em}.cs-muted{color:var(--cs-muted)}',
    '.cs-eyebrow{font-size:12.5px;letter-spacing:.12em;color:var(--cs-muted)}.cs-hero h2{font-size:30px;margin-top:6px}.cs-hero .cs-round-no{display:block;font-size:14px;color:var(--cs-accent);letter-spacing:.08em;margin-bottom:2px}.cs-lede{color:var(--cs-muted);margin-top:6px;font-variant-numeric:tabular-nums}',
    '.cs-overview{margin-top:28px;display:grid;gap:14px;max-width:44em}.cs-overview h3{font-size:15px;font-family:inherit;font-weight:700;letter-spacing:.04em;color:var(--cs-accent)}.cs-overview p{font-size:14.5px}',
    '.cs-index{margin-top:36px;padding-top:22px;border-top:2px solid var(--cs-ink)}.cs-index h3{font-size:20px;margin-bottom:12px}',
    '.cs-index-list{display:grid}.cs-index-list li{display:grid;grid-template-columns:36px 1fr auto;align-items:center;column-gap:12px;padding:10px 0;border-bottom:1px solid var(--cs-line)}',
    '.cs-idx-no{font-family:"Shippori Mincho",serif;font-size:19px;color:var(--cs-accent);text-align:center;font-variant-numeric:tabular-nums}.cs-idx-title{font-size:15px}',
    '.cs-idx-links{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.cs-idx-links a,.cs-idx-links>span{display:inline-flex;align-items:baseline;gap:4px;font-size:13px;padding:4px 11px;border:1px solid var(--cs-line);border-radius:999px;text-decoration:none;background:var(--cs-panel);white-space:nowrap}.cs-idx-links a:hover{border-color:var(--cs-accent)}.cs-idx-links small{font-size:11px;color:var(--cs-muted)}.cs-idx-links>span{color:var(--cs-muted);background:transparent}',
    '@media (max-width:560px){.cs-index-list li{grid-template-columns:30px 1fr}.cs-idx-links{grid-column:2;justify-content:flex-start}}',
    '.cs-index-overall{margin-top:18px;font-size:14.5px}',
    '.cs-pager{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:18px 0 8px;font-size:13.5px}.cs-pager a{text-decoration:none}.cs-pager-nav{margin-left:auto;display:flex;gap:14px}',
    '.cs-sub{font-size:12.5px;color:var(--cs-muted);letter-spacing:.04em;margin:14px 0 6px}.cs-sub:first-child{margin-top:0}',
    '.cs-free-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px}@media (max-width:640px){.cs-free-grid{grid-template-columns:1fr}}',
    '.cs-stack{display:flex;height:14px;border-radius:3px;overflow:hidden;background:var(--cs-tother);gap:2px}.cs-stack-seg{display:block;flex-basis:0;min-width:2px}',
    '.cs-t0{background:var(--cs-t0)}.cs-t1{background:var(--cs-t1)}.cs-t2{background:var(--cs-t2)}.cs-t3{background:var(--cs-t3)}.cs-t4{background:var(--cs-t4)}.cs-t5{background:var(--cs-t5)}.cs-t-other{background:var(--cs-tother)}',
    '.cs-legend{display:grid;gap:4px;margin-top:10px;font-size:13.5px}.cs-legend li{display:grid;grid-template-columns:10px auto 1fr;align-items:baseline;column-gap:8px}.cs-legend .cs-legend-desc{grid-column:2/4;color:var(--cs-muted);font-size:12.5px;margin-top:-2px}.cs-sw{width:10px;height:10px;border-radius:2px;display:inline-block;position:relative;top:1px}',
    '.cs-bars{display:grid;gap:5px}.cs-bars li{display:grid;grid-template-columns:minmax(90px,38%) 1fr 56px;align-items:center;column-gap:10px;font-size:13.5px}.cs-bar-label{overflow-wrap:anywhere}.cs-bar-track{height:9px;background:var(--cs-accent-soft);border-radius:2px;overflow:hidden}.cs-bar-fill{display:block;height:100%;background:var(--cs-accent)}.cs-bar-num{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}',
    '.cs-overall{margin-top:20px}.cs-timeline{display:grid;gap:8px;margin-top:6px}.cs-timeline li{display:grid;grid-template-columns:34px 1fr;column-gap:12px;align-items:center}.cs-tl-no{font-family:"Shippori Mincho",serif;font-size:18px;text-decoration:none;text-align:center;font-variant-numeric:tabular-nums}.cs-tl-body{display:grid;gap:4px}.cs-tl-title{font-size:13.5px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.cs-tl-title a{text-decoration:none;color:inherit}.cs-tl-words{color:var(--cs-muted);font-size:12.5px}.cs-timeline .cs-stack{height:8px}',
    '.cs-round{margin-top:8px}',
    '.cs-notes{margin-top:12px;padding:14px 18px;background:var(--cs-accent-soft);border-radius:4px}.cs-notes h4{font-size:13px;letter-spacing:.08em;color:var(--cs-accent);font-family:inherit;font-weight:700}.cs-notes ol{list-style:decimal;padding-left:1.4em;margin-top:4px;font-size:14px}',
    '.cs-works{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}@media (max-width:700px){.cs-works{grid-template-columns:1fr}}',
    '.cs-work,.cs-free{background:var(--cs-panel);border:1px solid var(--cs-line);border-radius:6px;padding:16px 18px 18px;min-width:0}.cs-free{margin-top:16px}',
    '.cs-work h4,.cs-free h4{font-family:inherit;font-weight:700;font-size:15px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.cs-work-key{font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--cs-accent);border:1px solid currentColor;border-radius:3px;padding:0 6px;line-height:1.6}',
    '.cs-quotes{display:grid;gap:8px}.cs-quotes li{position:relative;padding-left:20px;font-size:14px;line-height:1.7}.cs-quotes li::before{content:"\\201C";position:absolute;left:0;top:-2px;font-family:"Shippori Mincho",serif;font-size:24px;line-height:1;color:var(--cs-quote)}',
    '.cs-quotes-typed li{padding-left:0}.cs-quotes-typed li::before{content:none}.cs-tag{display:inline-block;font-size:11.5px;color:var(--cs-muted);border:1px solid var(--cs-line);border-radius:3px;padding:0 6px;margin-right:8px;line-height:1.6;vertical-align:1px}',
    '.cs-questions{margin-top:14px;font-size:14px}.cs-questions summary{cursor:pointer;color:var(--cs-accent)}.cs-questions ul{display:grid;gap:6px;margin-top:8px;padding-left:1.2em;list-style:disc}',
    '.cs-empty{color:var(--cs-muted);font-size:13px}',
    '.cs-foot{margin-top:44px;padding-top:16px;border-top:1px solid var(--cs-line);color:var(--cs-muted);font-size:12.5px;display:grid;gap:4px}',
    '@media (prefers-reduced-motion:no-preference){.cs-bar-fill{transition:width .4s ease}}'
  ].join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = { csRenderIndex: csRenderIndex, csRenderRoundPage: csRenderRoundPage, csRenderOverallPage: csRenderOverallPage, csRenderDocument: csRenderDocument, csEsc: csEsc };
}
