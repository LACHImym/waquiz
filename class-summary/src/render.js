/**
 * 授業感想・ワークまとめ：HTML 描画（Google Apps Script / Node 共通）
 * WordPress に貼っても崩れないよう、すべてのスタイルを .cs-root 配下に閉じています。
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
  html += '</ul>';
  return html;
}

function csQuotes(list, cls) {
  if (!list || !list.length) return '';
  var html = '<ul class="cs-quotes' + (cls ? ' ' + cls : '') + '">';
  list.forEach(function (q) { html += '<li>' + csEsc(q) + '</li>'; });
  return html + '</ul>';
}

function csTypeStack(typeRes, typeDefs) {
  var total = typeRes.n || 1;
  var html = '<div class="cs-stack" role="img" aria-label="感想タイプの割合">';
  typeDefs.forEach(function (t, i) {
    var row = typeRes.types.filter(function (x) { return x.key === t.key; })[0];
    if (!row || !row.primary) return;
    html += '<span class="cs-stack-seg cs-t' + i + '" style="flex-grow:' + row.primary + '" title="' + csEsc(t.label) + ' ' + row.primary + '件"></span>';
  });
  if (typeRes.other) html += '<span class="cs-stack-seg cs-t-other" style="flex-grow:' + typeRes.other + '" title="その他 ' + typeRes.other + '件"></span>';
  html += '</div>';
  return html;
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

function csRenderRound(r, sum) {
  var title = r.title ? csEsc(r.title) : '（回タイトル未設定）';
  var html = '<section class="cs-round" id="cs-round-' + r.no + '">';
  html += '<header class="cs-round-head"><span class="cs-round-no">第' + r.no + '回</span>' +
    '<h3>' + title + '</h3><span class="cs-round-meta">' + csFmtDate(r.date) + '　提出 ' + r.n + '名</span></header>';

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
  html += '<div class="cs-free-grid"><div>';
  html += '<p class="cs-sub">感想のタイプ</p>' + csTypeStack(c.types, sum.typeDefs) + csTypeLegend(c.types, sum.typeDefs, false);
  html += '</div><div><p class="cs-sub">言及の多い語（延べ人数）</p>' + csBars(c.top, c.count, {}) + '</div></div>';
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
  html += '</section>';
  return html;
}

/**
 * meta: { course, term, audience, sourceNote }
 */
function csRenderFragment(sum, meta) {
  meta = meta || {};
  var html = '<div class="cs-root">';
  html += '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">';
  html += '<style>' + csCss() + '</style>';

  html += '<header class="cs-hero"><p class="cs-eyebrow">授業感想とワークのまとめ</p>' +
    '<h2>' + csEsc(meta.course || '授業') + '</h2>' +
    '<p class="cs-lede">' + csEsc(meta.term || '') + (meta.audience ? '　' + csEsc(meta.audience) : '') + '</p>' +
    '<dl class="cs-facts">' +
    '<div><dt>回数</dt><dd>' + sum.roundCount + '<small>回</small></dd></div>' +
    '<div><dt>提出のべ</dt><dd>' + sum.totalResponses + '<small>件</small></dd></div>' +
    '<div><dt>受講者（最大）</dt><dd>' + sum.maxStudents + '<small>名</small></dd></div>' +
    '<div><dt>感想の中央値</dt><dd>' + sum.medianLength + '<small>字</small></dd></div>' +
    '</dl></header>';

  html += '<nav class="cs-nav" aria-label="回へ移動"><a href="#cs-overall">全体</a>';
  sum.rounds.forEach(function (r) { html += '<a href="#cs-round-' + r.no + '" title="' + csEsc(r.title) + '">' + r.no + '</a>'; });
  html += '</nav>';

  // 全体傾向
  html += '<section class="cs-overall" id="cs-overall"><h3>全' + sum.roundCount + '回を通した傾向</h3>';
  html += '<div class="cs-free-grid"><div><p class="cs-sub">感想のタイプ（' + sum.totalComments + '件を分類）</p>' +
    csTypeStack(sum.overall.types, sum.typeDefs) + csTypeLegend(sum.overall.types, sum.typeDefs, true) + '</div>';
  html += '<div><p class="cs-sub">全回で言及の多い語（延べ人数）</p>' + csBars(sum.overall.top, sum.totalComments, {}) + '</div></div>';

  // 回ごとの推移
  html += '<p class="cs-sub">回ごとの感想タイプ</p><ol class="cs-timeline">';
  sum.rounds.forEach(function (r) {
    var lead = r.comments.top.slice(0, 3).map(function (x) { return x.label; }).join('・');
    html += '<li><a class="cs-tl-no" href="#cs-round-' + r.no + '">' + r.no + '</a><div class="cs-tl-body"><div class="cs-tl-title">' +
      (r.title ? csEsc(r.title) : '<span class="cs-muted">タイトル未設定</span>') + '<span class="cs-tl-words">' + csEsc(lead) + '</span></div>' +
      csTypeStack(r.comments.types, sum.typeDefs) + '</div></li>';
  });
  html += '</ol></section>';

  html += '<section class="cs-rounds"><h3>回ごとの詳細</h3>';
  sum.rounds.forEach(function (r) { html += csRenderRound(r, sum); });
  html += '</section>';

  html += '<footer class="cs-foot"><p>' + csEsc(meta.sourceNote || 'Google フォームの回答から自動集計。氏名・学籍番号は含めていません。感想タイプと語の集計は辞書による機械分類で、目安です。') +
    '</p><p>最終更新 ' + csEsc(csFmtDate(sum.generatedAt)) + '</p></footer>';
  html += '</div>';
  return html;
}

function csRenderPage(sum, meta) {
  meta = meta || {};
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + csEsc(meta.course || 'まとめ') + '</title>' +
    '<style>:root{color-scheme:light dark}body{margin:0;background:#f6f5f1;font-family:"Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif}@media (prefers-color-scheme:dark){body{background:#14171c}}</style>' +
    '</head><body>' + csRenderFragment(sum, meta) + '</body></html>';
}

function csCss() {
  return [
    '.cs-root{--cs-ground:#f6f5f1;--cs-panel:#ffffff;--cs-ink:#1d2129;--cs-muted:#626978;--cs-line:#dad7cf;--cs-accent:#2c4b7c;--cs-accent-soft:#e3eaf4;--cs-quote:#a85e2c;',
    '--cs-t0:#2c4b7c;--cs-t1:#5f8fcf;--cs-t2:#a85e2c;--cs-t3:#3b8a6e;--cs-t4:#b89a3c;--cs-t5:#7c6aa8;--cs-tother:#c9c5bb;',
    'color:var(--cs-ink);background:var(--cs-ground);font-family:"Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif;font-size:15px;line-height:1.75;max-width:900px;margin:0 auto;padding-block:32px 48px;padding-inline:20px;box-sizing:border-box;font-feature-settings:"palt"}',
    '@media (prefers-color-scheme:dark){.cs-root:not([data-theme="light"]){--cs-ground:#14171c;--cs-panel:#1c2027;--cs-ink:#e8e6e0;--cs-muted:#9ca3ae;--cs-line:#2e343d;--cs-accent:#86a9dc;--cs-accent-soft:#24344a;--cs-quote:#d3906a;--cs-t0:#6f97d4;--cs-t1:#9dbde8;--cs-t2:#d3906a;--cs-t3:#5fb497;--cs-t4:#d3b85a;--cs-t5:#a999d6;--cs-tother:#4a505a}}',
    '.cs-root *{box-sizing:border-box}.cs-root h2,.cs-root h3,.cs-root h4{margin:0;font-family:"Shippori Mincho","Hiragino Mincho ProN","Yu Mincho",serif;font-weight:600;text-wrap:balance;line-height:1.35}',
    '.cs-root p{margin:0}.cs-root ul,.cs-root ol{margin:0;padding:0;list-style:none}.cs-root a{color:var(--cs-accent)}',
    '.cs-num{font-variant-numeric:tabular-nums;color:var(--cs-muted);font-weight:400;margin-left:.5em}.cs-num small,.cs-bar-num small{font-size:.75em;color:var(--cs-muted);margin-left:.35em}.cs-muted{color:var(--cs-muted)}',
    '.cs-eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--cs-muted)}.cs-hero h2{font-size:34px;margin-top:6px}.cs-lede{color:var(--cs-muted);margin-top:4px}',
    '.cs-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:22px 0 0;border-top:1px solid var(--cs-line);border-bottom:1px solid var(--cs-line);padding:14px 0}.cs-facts div{margin:0}.cs-facts dt{font-size:12px;color:var(--cs-muted)}.cs-facts dd{margin:0;font-family:"Shippori Mincho",serif;font-size:28px;line-height:1.2;font-variant-numeric:tabular-nums}.cs-facts dd small{font-size:13px;font-family:inherit;margin-left:2px;color:var(--cs-muted)}',
    '.cs-nav{display:flex;flex-wrap:wrap;gap:6px;margin:18px 0 30px}.cs-nav a{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:30px;padding:0 10px;border:1px solid var(--cs-line);border-radius:999px;text-decoration:none;font-size:13px;font-variant-numeric:tabular-nums;background:var(--cs-panel)}.cs-nav a:hover,.cs-nav a:focus-visible{border-color:var(--cs-accent);outline:none}',
    '.cs-overall h3,.cs-rounds>h3{font-size:22px;margin-bottom:16px}.cs-rounds>h3{margin-top:44px;padding-top:26px;border-top:2px solid var(--cs-ink)}',
    '.cs-sub{font-size:12.5px;color:var(--cs-muted);letter-spacing:.04em;margin:14px 0 6px}.cs-sub:first-child{margin-top:0}',
    '.cs-free-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px}@media (max-width:640px){.cs-free-grid{grid-template-columns:1fr}.cs-facts{grid-template-columns:1fr 1fr}}',
    '.cs-stack{display:flex;height:14px;border-radius:3px;overflow:hidden;background:var(--cs-tother);gap:2px}.cs-stack-seg{display:block;flex-basis:0;min-width:2px}',
    '.cs-t0{background:var(--cs-t0)}.cs-t1{background:var(--cs-t1)}.cs-t2{background:var(--cs-t2)}.cs-t3{background:var(--cs-t3)}.cs-t4{background:var(--cs-t4)}.cs-t5{background:var(--cs-t5)}.cs-t-other{background:var(--cs-tother)}',
    '.cs-legend{display:grid;gap:4px;margin-top:10px;font-size:13.5px}.cs-legend li{display:grid;grid-template-columns:10px auto 1fr;align-items:baseline;column-gap:8px}.cs-legend .cs-legend-desc{grid-column:2/4;color:var(--cs-muted);font-size:12.5px;margin-top:-2px}.cs-sw{width:10px;height:10px;border-radius:2px;display:inline-block;position:relative;top:1px}',
    '.cs-bars{display:grid;gap:5px}.cs-bars li{display:grid;grid-template-columns:minmax(90px,38%) 1fr 56px;align-items:center;column-gap:10px;font-size:13.5px}.cs-bar-label{overflow-wrap:anywhere}.cs-bar-track{height:9px;background:var(--cs-accent-soft);border-radius:2px;overflow:hidden}.cs-bar-fill{display:block;height:100%;background:var(--cs-accent)}.cs-bar-num{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}',
    '.cs-timeline{display:grid;gap:8px;margin-top:6px}.cs-timeline li{display:grid;grid-template-columns:34px 1fr;column-gap:12px;align-items:center}.cs-tl-no{font-family:"Shippori Mincho",serif;font-size:18px;text-decoration:none;text-align:center;font-variant-numeric:tabular-nums}.cs-tl-body{display:grid;gap:4px}.cs-tl-title{font-size:13.5px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.cs-tl-words{color:var(--cs-muted);font-size:12.5px}.cs-timeline .cs-stack{height:8px}',
    '.cs-round{margin-top:36px;padding-top:22px;border-top:1px solid var(--cs-line)}.cs-round-head{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}.cs-round-no{font-family:"Shippori Mincho",serif;font-size:15px;color:var(--cs-accent);letter-spacing:.06em}.cs-round-head h3{font-size:22px}.cs-round-meta{color:var(--cs-muted);font-size:13px;margin-left:auto;font-variant-numeric:tabular-nums}',
    '.cs-notes{margin-top:16px;padding:14px 18px;background:var(--cs-accent-soft);border-radius:4px}.cs-notes h4{font-size:13px;letter-spacing:.08em;color:var(--cs-accent);font-family:inherit;font-weight:700}.cs-notes ol{list-style:decimal;padding-left:1.4em;margin-top:4px;font-size:14px}',
    '.cs-works{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}@media (max-width:700px){.cs-works{grid-template-columns:1fr}}',
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
  module.exports = { csRenderFragment: csRenderFragment, csRenderPage: csRenderPage, csEsc: csEsc };
}
