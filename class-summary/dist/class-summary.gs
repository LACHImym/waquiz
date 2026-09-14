/**
 * 授業感想・ワークまとめ（全部入り）
 * このファイルの中身をそのまま Apps Script に貼り付けてください。
 * 生成元: class-summary/src/*.js, src/gas/Code.gs
 */


// ===================================================================

/**
 * 授業感想・ワークまとめ：解析ロジック（Google Apps Script / Node 共通）
 *
 * このファイルは Apps Script にそのまま貼れる素の JavaScript です。
 * Node から使うときは末尾の module.exports を通して読み込みます。
 * 学生の氏名・学籍番号・メールは一切保持せず、文章だけを扱います。
 */

var CS_DEFAULT_TYPES = [
  { key: 'discover', label: '「知らなかった」型', desc: '新しい知識に触れた驚き', pattern: '知らなかった|初めて知|知れて|知ることができ|知る事ができ|驚|びっくり|意外|新鮮' },
  { key: 'click',    label: '「腑に落ちた」型',   desc: '日常にあった物に名前と理由がついた', pattern: 'なるほど|納得|腑に落ち|理解でき|理解が深|理解を深|分かった|わかった|つなが|繋が|気づ|気付|改めて' },
  { key: 'mixed',    label: '「複雑な気持ち」型', desc: '皮肉・複雑・悲しい、留保つきの感想', pattern: '複雑|皮肉|悲し|残念|もったいない|怖|不安|疑問|矛盾' },
  { key: 'apply',    label: '「活かしたい」型',   desc: '自分の制作に結びつけた', pattern: '活かし|生かし|活かせ|参考に|取り入れ|意識し|意識して|作ってみ|使ってみ|やってみ|挑戦|役立' },
  { key: 'hard',     label: '「難しかった」型',   desc: '内容や言葉の難しさに触れた', pattern: '難し|むずかし|分からな|わからな|ついていけ' },
  { key: 'fun',      label: '「楽しかった」型',   desc: '面白さ・好みを素直に書いた', pattern: '楽し|面白|おもしろ|好き|興味' }
];

var CS_STOPWORDS = (
  '自分 今回 今日 授業 感想 先生 内容 部分 全体 最初 最後 一番 場合 時間 必要 大切 大事 印象 意味 存在 関係 ' +
  '理解 勉強 学習 説明 紹介 話題 気持 感じ 思い 考え 発見 発想 問題 結果 目的 方法 状況 状態 現在 当時 以上 以下 ' +
  '今後 将来 過去 未来 世界 人間 人達 人々 皆 人生 生活 日常 身近 普通 非常 本当 一つ 二つ 三つ 実際 具体 全部 全然 ' +
  '沢山 色々 様々 多数 多く 少し 非常 特に 改めて 知識 知る 分かる わかる 学ぶ 学べ 今まで これから 前回 次回 回目 ' +
  'デザイン デザイナー 歴史 時代 作品 商品 製品 物 事 所 為 様 方 中 上 下 前 後 他 人 私 僕 何 良い 悪い ' +
  '面白 面白い 興味 興味深 楽しい 楽しかった 好き 参考 役立 明確 苦手 得意 キーワード 感動 感激 印象的 勉強になり 学び 学べた'
).split(/\s+/);

var CS_STOP_SET = {};
CS_STOPWORDS.forEach(function (w) { CS_STOP_SET[w] = true; });

// ---------- 匿名化 ----------

function csScrubText(s) {
  if (s === null || s === undefined) return '';
  s = String(s).replace(/​/g, '').trim();
  s = s.replace(/[A-Za-z]\d{3}[A-Za-z]?\d{4}/g, '[学籍番号]');           // K025G3015 など
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[メール]');
  s = s.replace(/\b0\d{1,3}[-‐ー]?\d{2,4}[-‐ー]?\d{3,4}\b/g, '[電話番号]');
  s = s.replace(/https?:\/\/\S+/g, '[URL]');
  return s;
}

// ---------- 分かち（簡易） ----------

function csTerms(text) {
  var out = [];
  var re = /[゠-ヿー]{2,}|[一-鿿]{2,}|[A-Za-z][A-Za-z0-9]{1,}/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var t = m[0];
    if (CS_STOP_SET[t]) continue;
    if (/^[ー]+$/.test(t)) continue;
    out.push(t);
  }
  return out;
}

/** 文章群から「延べ言及数」の多い語を返す（1人1語1回） */
function csTopTerms(texts, limit) {
  var counts = {};
  texts.forEach(function (t) {
    var seen = {};
    csTerms(t).forEach(function (w) {
      if (seen[w]) return;
      seen[w] = true;
      counts[w] = (counts[w] || 0) + 1;
    });
  });
  var arr = Object.keys(counts).map(function (k) { return { label: k, count: counts[k] }; });
  arr.sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label, 'ja'); });
  return arr.slice(0, limit || 8).filter(function (x) { return x.count >= 2; });
}

// ---------- 分類 ----------

function csCompile(pattern) {
  try { return new RegExp(pattern); } catch (e) { return null; }
}

/** 辞書（[{label, pattern}]）で分布を出す。複数該当は延べで数える。 */
function csDistribution(texts, dict) {
  var rules = dict.map(function (d) { return { label: d.label, re: csCompile(d.pattern), count: 0 }; });
  var none = 0;
  texts.forEach(function (t) {
    var hit = false;
    rules.forEach(function (r) { if (r.re && r.re.test(t)) { r.count++; hit = true; } });
    if (!hit) none++;
  });
  var rows = rules.map(function (r) { return { label: r.label, count: r.count }; })
    .filter(function (r) { return r.count > 0; })
    .sort(function (a, b) { return b.count - a.count; });
  return { rows: rows, none: none, n: texts.length };
}

/** 感想タイプ：1件につき最初に該当した型を主タイプとする */
function csClassifyTypes(texts, types) {
  var rules = types.map(function (t) { return { key: t.key, label: t.label, desc: t.desc, re: csCompile(t.pattern), primary: 0, mentions: 0 }; });
  var other = 0;
  var byText = [];
  texts.forEach(function (t) {
    var primary = null;
    rules.forEach(function (r) {
      if (r.re && r.re.test(t)) {
        r.mentions++;
        if (!primary) { primary = r.key; r.primary++; }
      }
    });
    if (!primary) other++;
    byText.push(primary || 'other');
  });
  return {
    n: texts.length,
    other: other,
    types: rules.map(function (r) { return { key: r.key, label: r.label, desc: r.desc, primary: r.primary, mentions: r.mentions }; }),
    byText: byText
  };
}

// ---------- 引用の選び方 ----------

/**
 * 代表的な声を選ぶ。長さが 20〜110 字で、上位語やカテゴリ語を含むものを優先。
 * 同じ人の文が並ばないよう、テキストの重複は除く。
 */
function csPickQuotes(texts, keywords, limit, minLen, maxLen) {
  minLen = minLen || 18; maxLen = maxLen || 110; limit = limit || 3;
  var seen = {};
  var scored = [];
  texts.forEach(function (t, i) {
    var s = t.replace(/\s+/g, ' ');
    if (s.length < minLen || s.length > maxLen) return;
    if (seen[s]) return; seen[s] = true;
    if (/\[学籍番号\]|\[メール\]|\[電話番号\]/.test(s)) return;
    var score = 0;
    keywords.forEach(function (k) { if (k && s.indexOf(k) >= 0) score += 2; });
    score -= Math.abs(s.length - 55) / 40;           // 55字前後を好む
    if (/。$/.test(s)) score += 0.3;
    scored.push({ text: s, score: score, i: i });
  });
  scored.sort(function (a, b) { return b.score - a.score || a.i - b.i; });
  // 似た文が並ばないよう、先頭 8 字や語の重なりが大きいものは飛ばす
  var picked = [];
  for (var k = 0; k < scored.length && picked.length < limit; k++) {
    var cand = scored[k].text;
    var dup = picked.some(function (p) { return csSimilar(p, cand); });
    if (!dup) picked.push(cand);
  }
  return picked;
}

function csSimilar(a, b) {
  if (a.slice(0, 8) === b.slice(0, 8)) return true;
  var ta = csTerms(a), tb = csTerms(b);
  if (!ta.length || !tb.length) return false;
  var set = {}; ta.forEach(function (w) { set[w] = true; });
  var common = tb.filter(function (w) { return set[w]; }).length;
  return common / Math.min(ta.length, tb.length) >= 0.6;
}

/** 辞書分類のワークでは、カテゴリごとに 1 件ずつ声を拾う */
function csPickQuotesByCategory(texts, dict, limit) {
  var out = [];
  var used = {};
  for (var i = 0; i < dict.length && out.length < (limit || 3); i++) {
    var re = csCompile(dict[i].pattern);
    if (!re) continue;
    var pool = texts.filter(function (t) { return re.test(t) && !used[t]; });
    var q = csPickQuotes(pool, dict[i].pattern.split('|').slice(0, 3), 1, 12, 110);
    if (q.length) { out.push(q[0]); used[q[0]] = true; }
  }
  return out;
}

// ---------- データ整形 ----------

/**
 * シート群から「回」を組み立てる。
 * tables: [{ name, headers: [...], rows: [[...]] }]
 * ヘッダーに「タイムスタンプ」と「感想」を含むシートをフォーム回答とみなす。
 * 返り値の各回には文章だけを残し、個人情報列は読まない。
 */
function csRoundsFromTables(tables, config) {
  config = config || {};
  var rounds = [];
  tables.forEach(function (tb) {
    if (!tb || !tb.headers) return;
    if (tb.name && /^まとめ_/.test(tb.name)) return;
    var h = tb.headers.map(function (x) { return String(x || '').trim(); });
    var tsIdx = h.findIndex(function (x) { return /タイムスタンプ/.test(x); });
    var cmIdx = h.findIndex(function (x) { return /感想/.test(x) && !/小課題|に関する/.test(x); });
    if (tsIdx < 0 || cmIdx < 0) return;
    var qIdx = h.findIndex(function (x) { return /質問|相談|振り返り/.test(x) && !/小課題/.test(x); });
    var workIdx = [];
    h.forEach(function (x, i) { if (/^work\s*\d+/i.test(x)) workIdx.push({ i: i, key: x.toLowerCase().replace(/\s+/g, '') }); });
    var extraIdx = [];
    h.forEach(function (x, i) { if (/本授業全体|全体を通して/.test(x)) extraIdx.push({ i: i, label: x }); });

    var firstTs = null;
    var comments = [], questions = [], works = {}, extras = {};
    workIdx.forEach(function (w) { works[w.key] = []; });
    extraIdx.forEach(function (e) { extras[e.label] = []; });
    var n = 0;
    tb.rows.forEach(function (r) {
      var ts = r[tsIdx];
      var d = csParseDate(ts);
      if (!d) return;
      n++;
      if (!firstTs || d < firstTs) firstTs = d;
      var c = csScrubText(r[cmIdx]); if (c) comments.push(c);
      if (qIdx >= 0) { var q = csScrubText(r[qIdx]); if (q && !/^(なし|特になし|特にありません|ないです|無し|ありません)[。．.!！]*$/.test(q)) questions.push(q); }
      workIdx.forEach(function (w) { var v = csScrubText(r[w.i]); if (v) works[w.key].push(v); });
      extraIdx.forEach(function (e) { var v = csScrubText(r[e.i]); if (v) extras[e.label].push(v); });
    });
    if (n === 0) return;
    rounds.push({ sheet: tb.name || '', date: firstTs, n: n, comments: comments, questions: questions, works: works, workKeys: workIdx.map(function (w) { return w.key; }), extras: extras });
  });
  rounds.sort(function (a, b) { return a.date - b.date; });
  var cfgRounds = config.rounds || {};
  var dated = Object.keys(cfgRounds).map(function (k) { return { no: parseInt(k, 10), date: csParseDate(cfgRounds[k].date) }; })
    .filter(function (x) { return x.no && x.date; });
  var usedNo = {};
  rounds.forEach(function (r, i) {
    var no = null;
    if (dated.length) {
      // 授業日の当日〜6日後に始まった回答シートを、その授業の回とみなす
      var best = null;
      dated.forEach(function (d) {
        var diff = (csDateOnly(r.date) - csDateOnly(d.date)) / 86400000;
        if (diff >= 0 && diff <= 6 && !usedNo[d.no] && (best === null || diff < best.diff)) best = { no: d.no, diff: diff };
      });
      if (best) no = best.no;
    }
    if (!no) { no = i + 1; while (usedNo[no]) no++; }
    usedNo[no] = true;
    r.no = no;
    var c = cfgRounds[no] || {};
    r.title = c.title || '';
    r.workLabels = c.works || {};
    r.notes = c.notes || [];
    r.classDate = csParseDate(c.date) || csDateOnly(r.date);
  });
  rounds.sort(function (a, b) { return a.no - b.no; });
  return rounds;
}

function csDateOnly(d) {
  d = csParseDate(d);
  return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
}

/** 授業日から何日後に公開するか（既定 7 日） */
function csOpenDate(classDate, delayDays) {
  var d = csDateOnly(classDate);
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (delayDays === undefined ? 7 : delayDays));
}

function csIsOpen(classDate, today, delayDays) {
  var o = csOpenDate(classDate, delayDays);
  if (!o) return false;
  return csDateOnly(today || new Date()) >= o;
}

function csParseDate(v) {
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (!v) return null;
  var s = String(v).trim();
  var m = s.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})日?(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  var d = new Date(s);
  return isNaN(d) ? null : d;
}

// ---------- 解析本体 ----------

/**
 * rounds と設定から、描画用のまとめを作る。
 * config.categories: { "12": { work1: [{label, pattern}], ... } }
 * config.types: 感想タイプ辞書（省略時は既定）
 */
function csAnalyze(rounds, config) {
  config = config || {};
  var types = (config.types && config.types.length) ? config.types : CS_DEFAULT_TYPES;
  var allComments = [];
  var perRound = rounds.map(function (r) {
    var cat = (config.categories || {})[r.no] || {};
    var typeRes = csClassifyTypes(r.comments, types);
    var top = csTopTerms(r.comments, 8);
    var topWords = top.map(function (x) { return x.label; });
    var quotesByType = {};
    types.forEach(function (t) {
      var pool = r.comments.filter(function (c, i) { return typeRes.byText[i] === t.key; });
      quotesByType[t.key] = csPickQuotes(pool, topWords, 1, 20, 120);
    });
    var works = r.workKeys.filter(function (k) { return r.works[k].length > 0; }).map(function (k) {
      var texts = r.works[k];
      var dict = cat[k];
      var dist, mode;
      if (dict && dict.length) { dist = csDistribution(texts, dict); mode = 'dict'; }
      else { var tt = csTopTerms(texts, 6); dist = { rows: tt, none: 0, n: texts.length }; mode = 'auto'; }
      var quotes;
      if (mode === 'dict') {
        var order = dist.rows.map(function (row) { return dict.filter(function (d) { return d.label === row.label; })[0]; }).filter(Boolean);
        quotes = csPickQuotesByCategory(texts, order, 3);
      } else {
        quotes = csPickQuotes(texts, dist.rows.slice(0, 4).map(function (x) { return x.label; }), 3, 12, 110);
      }
      return { key: k, label: r.workLabels[k] || k, n: texts.length, mode: mode, dist: dist, quotes: quotes };
    });
    allComments = allComments.concat(r.comments);
    return {
      no: r.no, title: r.title, date: r.date, classDate: r.classDate, n: r.n, sheet: r.sheet,
      comments: { count: r.comments.length, types: typeRes, top: top, quotes: csPickQuotes(r.comments, topWords, 3, 20, 120), quotesByType: quotesByType },
      works: works,
      questions: r.questions,
      notes: r.notes,
      extras: Object.keys(r.extras).map(function (k) { return { label: k, n: r.extras[k].length, quotes: csPickQuotes(r.extras[k], [], 4, 20, 160), top: csTopTerms(r.extras[k], 6) }; })
    };
  });
  var overallTypes = csClassifyTypes(allComments, types);
  var overallTop = csTopTerms(allComments, 12);
  var lengths = allComments.map(function (c) { return c.length; }).sort(function (a, b) { return a - b; });
  var median = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0;
  return {
    generatedAt: new Date(),
    roundCount: rounds.length,
    totalResponses: rounds.reduce(function (s, r) { return s + r.n; }, 0),
    totalComments: allComments.length,
    medianLength: median,
    maxStudents: rounds.reduce(function (m, r) { return Math.max(m, r.n); }, 0),
    overall: { types: overallTypes, top: overallTop },
    typeDefs: types,
    rounds: perRound
  };
}

/** JSON から読み戻したまとめの日付を Date に戻す */
function csReviveSummary(sum) {
  sum.generatedAt = csParseDate(sum.generatedAt) || new Date();
  (sum.rounds || []).forEach(function (r) { r.date = csParseDate(r.date); r.classDate = csParseDate(r.classDate); });
  return sum;
}



// ===================================================================

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



// ===================================================================

/**
 * 授業感想・ワークまとめ：Apps Script 本体
 *
 * 動き方
 *   毎週月曜 6 時台  weeklySnapshot   … その時点のフォーム回答で集計し直し、結果（スナップショット）を Drive に保存
 *   毎日   6 時台   dailyPublish     … スナップショットから「今日」の公開判定でメインページを描き直し、WordPress に流し込む
 *   閲覧時           doGet            … スナップショットから各回・全体のページを描く（授業日から 7 日後まで非公開）
 *
 * ページ
 *   ?（なし）        メインページ：科目の概要と全回のリンク一覧
 *   ?round=3         第3回の感想・ワークまとめ
 *   ?page=overall    全回を通した傾向
 *
 * 閲覧制限
 *   学校アカウント（@g.neec.ac.jp）からデプロイし、アクセス範囲を「g.neec.ac.jp のユーザーのみ」に。
 *   CS_SETTINGS.ALLOWED_DOMAIN でコード側でも確認します。
 *
 * 学生の氏名・学籍番号・メールは読み取り時点で捨てます（csReadTables_ 参照）。
 */

var CS_SETTINGS = {
  ALLOWED_DOMAIN: 'g.neec.ac.jp', // 空文字にするとコード側の確認をしない
  SPREADSHEET_ID: '',             // 空なら、このスクリプトが紐づくスプレッドシート
  DELAY_DAYS: 7,                  // 授業日から何日後に公開するか
  SNAPSHOT_NAME: ''               // 空なら「まとめ_snapshot_<科目名>.json」
};

// ---------- スプレッドシートの読み取り ----------

function csOpenSpreadsheet_() {
  return CS_SETTINGS.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CS_SETTINGS.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

/** フォーム回答らしきシートを { name, headers, rows } の配列にする */
function csReadTables_(ss) {
  var tables = [];
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (/^まとめ_/.test(name)) return;
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 3) return;
    var head = sh.getRange(1, 1, Math.min(3, lastRow), lastCol).getValues();
    var hIdx = -1;
    for (var i = 0; i < head.length; i++) {
      var joined = head[i].join('|');
      if (/タイムスタンプ/.test(joined) && /感想/.test(joined)) { hIdx = i; break; }
    }
    if (hIdx < 0) return;
    var headers = head[hIdx];
    var rows = lastRow > hIdx + 1 ? sh.getRange(hIdx + 2, 1, lastRow - hIdx - 1, lastCol).getValues() : [];
    var drop = [];
    headers.forEach(function (h, i) { if (/名前|氏名|学籍番号|メール|mail|IP/i.test(String(h))) drop.push(i); });
    rows = rows.map(function (r) { drop.forEach(function (i) { r[i] = ''; }); return r; });
    tables.push({ name: name, headers: headers, rows: rows });
  });
  return tables;
}

/**
 * 設定シートを読む。
 *  「まとめ_回設定」
 *     上部：A列「科目名」「学期」「全回数」「概要：見出し」（B列に値）
 *     見出し行「回」以降：A:回 B:授業日 C:タイトル D:授業概要URL E:work1 F:work2 G:work3 H:work4 I:観察（改行区切り）
 *  「まとめ_分類辞書」 A:回 B:work C:カテゴリ D:キーワード（| 区切り）
 *  「まとめ_タイプ辞書」A:キー B:表示名 C:説明 D:キーワード（| 区切り）
 */
function csReadConfig_(ss) {
  var cfg = { rounds: {}, categories: {}, types: null, meta: { overview: [] } };
  var s1 = ss.getSheetByName('まとめ_回設定');
  if (s1) {
    s1.getDataRange().getValues().forEach(function (r) {
      var a = String(r[0] || '').trim();
      if (a === '科目名') { cfg.meta.course = String(r[1] || ''); return; }
      if (a === '学期') { cfg.meta.term = String(r[1] || ''); return; }
      if (a === '全回数') { cfg.meta.roundTotal = parseInt(r[1], 10) || 15; return; }
      if (/^概要[：:]/.test(a)) { if (r[1]) cfg.meta.overview.push({ label: a.replace(/^概要[：:]/, ''), text: String(r[1]) }); return; }
      var no = parseInt(a, 10);
      if (!no) return;
      var works = {};
      ['work1', 'work2', 'work3', 'work4'].forEach(function (k, i) { if (r[4 + i]) works[k] = String(r[4 + i]); });
      var notes = String(r[8] || '').split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean);
      var date = r[1] instanceof Date ? Utilities.formatDate(r[1], 'Asia/Tokyo', 'yyyy/M/d') : String(r[1] || '');
      cfg.rounds[no] = { date: date, title: String(r[2] || ''), url: String(r[3] || ''), works: works, notes: notes };
    });
  }
  var s2 = ss.getSheetByName('まとめ_分類辞書');
  if (s2) {
    s2.getDataRange().getValues().forEach(function (r) {
      var no = parseInt(r[0], 10), wk = String(r[1] || '').toLowerCase().replace(/\s+/g, '');
      if (!no || !wk || !r[2] || !r[3]) return;
      cfg.categories[no] = cfg.categories[no] || {};
      cfg.categories[no][wk] = cfg.categories[no][wk] || [];
      cfg.categories[no][wk].push({ label: String(r[2]), pattern: String(r[3]).replace(/\s*[|｜]\s*/g, '|') });
    });
  }
  var s3 = ss.getSheetByName('まとめ_タイプ辞書');
  if (s3) {
    var types = [];
    s3.getDataRange().getValues().forEach(function (r) {
      if (!r[0] || !r[1] || !r[3] || String(r[0]) === 'キー') return;
      types.push({ key: String(r[0]), label: String(r[1]), desc: String(r[2] || ''), pattern: String(r[3]).replace(/\s*[|｜]\s*/g, '|') });
    });
    if (types.length) cfg.types = types;
  }
  return cfg;
}

function csMeta_(ss, cfg) {
  return {
    course: cfg.meta.course || ss.getName(),
    term: cfg.meta.term || '',
    roundTotal: cfg.meta.roundTotal || 15,
    overview: cfg.meta.overview || [],
    rounds: cfg.rounds,
    delayDays: CS_SETTINGS.DELAY_DAYS
  };
}

// ---------- スナップショット（週 1 回の集計結果） ----------

function csSnapshotName_(meta) {
  return CS_SETTINGS.SNAPSHOT_NAME || ('まとめ_snapshot_' + meta.course + '.json');
}

/** 今あるフォーム回答で集計し直し、Drive に保存する（毎週月曜に実行） */
function weeklySnapshot() {
  var ss = csOpenSpreadsheet_();
  var cfg = csReadConfig_(ss);
  var meta = csMeta_(ss, cfg);
  var tables = csReadTables_(ss);
  var summary = csAnalyze(csRoundsFromTables(tables, cfg), cfg);
  var payload = JSON.stringify({ summary: summary, meta: meta });
  var name = csSnapshotName_(meta);
  var files = DriveApp.getFilesByName(name);
  if (files.hasNext()) files.next().setContent(payload);
  else DriveApp.createFile(name, payload, MimeType.PLAIN_TEXT);
  CacheService.getScriptCache().remove('cs:snapshot');
  Logger.log('スナップショット保存: ' + name + '（' + summary.roundCount + '回 / ' + summary.totalResponses + '件）');
  return { summary: summary, meta: meta };
}

/** 保存済みのスナップショットを読む。無ければその場で作る */
function csLoadSnapshot_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('cs:snapshot');
  var text = hit;
  if (!text) {
    var ss = csOpenSpreadsheet_();
    var cfg = csReadConfig_(ss);
    var name = csSnapshotName_(csMeta_(ss, cfg));
    var files = DriveApp.getFilesByName(name);
    if (!files.hasNext()) return weeklySnapshot();
    text = files.next().getBlob().getDataAsString();
    if (text.length < 95000) cache.put('cs:snapshot', text, 3600);
  }
  var obj = JSON.parse(text);
  // 設定（タイトル・授業日・URL）は毎回シートから読み直す：公開判定に使うので最新にしておく
  var ss2 = csOpenSpreadsheet_();
  obj.meta = csMeta_(ss2, csReadConfig_(ss2));
  obj.summary = csReviveSummary(obj.summary);
  return obj;
}

// ---------- ウェブアプリ ----------

function csWebAppUrl_() {
  var u = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL');
  if (u) return u.replace(/\/$/, '');
  try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; }
}

function csLinks_() {
  var base = csWebAppUrl_();
  return { index: base, overall: base + '?page=overall', round: function (no) { return base + '?round=' + no; } };
}

function csAllowed_() {
  if (!CS_SETTINGS.ALLOWED_DOMAIN) return { ok: true };
  var email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (e) { email = ''; }
  var ok = email.toLowerCase().slice(-(CS_SETTINGS.ALLOWED_DOMAIN.length + 1)) === '@' + CS_SETTINGS.ALLOWED_DOMAIN.toLowerCase();
  return { ok: ok, email: email };
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var gate = csAllowed_();
  var title, html;
  if (!gate.ok) {
    html = '<div style="max-width:560px;margin:48px auto;padding:0 22px;font-family:Inter,\'Noto Sans JP\',sans-serif;line-height:1.8;color:#2a3142">' +
      '<h2 style="font-size:20px;font-weight:600">このページは学校のアカウント専用です</h2>' +
      '<p>@' + csEsc(CS_SETTINGS.ALLOWED_DOMAIN) + ' の Google アカウントでログインしてから開いてください。' +
      (gate.email ? '<br>いまのアカウント：' + csEsc(gate.email) : '') + '</p>' +
      '<p><a href="https://accounts.google.com/AccountChooser" style="color:#0d9488">アカウントを切り替える</a></p></div>';
    title = '閲覧制限';
  } else {
    var snap = csLoadSnapshot_();
    var links = csLinks_();
    var opts = { today: new Date(), delayDays: CS_SETTINGS.DELAY_DAYS };
    if (p.page === 'overall') { html = csRenderOverallPage(snap.summary, snap.meta, links); title = snap.meta.course + ' 全体の傾向'; }
    else if (p.round) { var no = parseInt(p.round, 10); html = csRenderRoundPage(snap.summary, no, snap.meta, links, opts); title = snap.meta.course + ' 第' + no + '回'; }
    else { html = csRenderIndex(snap.summary, snap.meta, links, opts); title = snap.meta.course + ' ' + snap.meta.term; }
  }
  return HtmlService.createHtmlOutput(csRenderDocument(html, title))
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---------- WordPress（lachiart.com）へメインページを流し込む ----------

/**
 * メインページ（概要とリンク一覧）を WordPress の固定ページ本文に書き込む。
 * スクリプト プロパティ：WP_URL / WP_USER / WP_APP_PASSWORD / WP_PAGE_ID / WEBAPP_URL
 */
function dailyPublish() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('WP_URL'), user = props.getProperty('WP_USER');
  var pass = props.getProperty('WP_APP_PASSWORD'), pageId = props.getProperty('WP_PAGE_ID');
  if (!url || !user || !pass || !pageId) throw new Error('スクリプト プロパティ WP_URL / WP_USER / WP_APP_PASSWORD / WP_PAGE_ID を設定してください');
  if (!csWebAppUrl_()) throw new Error('スクリプト プロパティ WEBAPP_URL（ウェブアプリの URL）を設定してください');
  var snap = csLoadSnapshot_();
  var fragment = csRenderIndex(snap.summary, snap.meta, csLinks_(), { today: new Date(), delayDays: CS_SETTINGS.DELAY_DAYS });
  var endpoint = url.replace(/\/$/, '') + '/wp-json/wp/v2/pages/' + pageId;
  var res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(user + ':' + pass) },
    payload: JSON.stringify({ content: fragment }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('WordPress 更新に失敗: HTTP ' + code + ' ' + res.getContentText().slice(0, 300));
  Logger.log('WordPress 更新完了: ' + endpoint);
}

/** 週次集計 → メインページ更新 を続けて行う（手動で今すぐ反映したいとき用） */
function updateNow() {
  weeklySnapshot();
  if (PropertiesService.getScriptProperties().getProperty('WP_PAGE_ID')) dailyPublish();
}

/** 確認用：全ページを Drive のフォルダに HTML として保存する */
function saveHtmlToDrive() {
  var snap = csLoadSnapshot_();
  var links = { index: 'index.html', overall: 'overall.html', round: function (no) { return 'round-' + no + '.html'; } };
  var opts = { today: new Date(), delayDays: CS_SETTINGS.DELAY_DAYS };
  var folderName = snap.meta.course + '_まとめ';
  var it = DriveApp.getFoldersByName(folderName);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(folderName);
  var put = function (name, html) {
    var f = folder.getFilesByName(name);
    if (f.hasNext()) f.next().setContent(html); else folder.createFile(name, html, MimeType.HTML);
  };
  put('index.html', csRenderDocument(csRenderIndex(snap.summary, snap.meta, links, opts), snap.meta.course));
  put('overall.html', csRenderDocument(csRenderOverallPage(snap.summary, snap.meta, links), '全体の傾向'));
  snap.summary.rounds.forEach(function (r) { put('round-' + r.no + '.html', csRenderDocument(csRenderRoundPage(snap.summary, r.no, snap.meta, links, opts), '第' + r.no + '回')); });
  Logger.log('保存: ' + folder.getUrl());
}

// ---------- 定期実行 ----------

function csHasTrigger_(fn) {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === fn; });
}

/** 毎週月曜 6 時台に集計、毎日 6 時台にメインページの公開判定を更新 */
function installTriggers() {
  if (!csHasTrigger_('weeklySnapshot')) {
    ScriptApp.newTrigger('weeklySnapshot').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  }
  if (!csHasTrigger_('dailyPublish') && PropertiesService.getScriptProperties().getProperty('WP_PAGE_ID')) {
    ScriptApp.newTrigger('dailyPublish').timeBased().everyDays(1).atHour(7).create();
  }
  Logger.log('トリガー登録: 月曜 6 時台に集計、毎日 7 時台にメインページ更新');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('トリガーをすべて削除しました');
}

// ---------- 設定シートの雛形 ----------

function createConfigSheets() {
  var ss = csOpenSpreadsheet_();
  if (!ss.getSheetByName('まとめ_回設定')) {
    var s = ss.insertSheet('まとめ_回設定');
    var rows = [
      ['科目名', 'デザイン史', '', '', '', '', '', '', ''],
      ['学期', '2026年度 前期', '', '', '', '', '', '', ''],
      ['全回数', 15, '', '', '', '', '', '', ''],
      ['概要：科目の目的', '', '', '', '', '', '', '', ''],
      ['概要：科目の概要', '', '', '', '', '', '', '', ''],
      ['回', '授業日', 'タイトル', '授業概要URL', 'work1の設問', 'work2の設問', 'work3の設問', 'work4の設問', '観察（1行に1つ、改行で区切る）']
    ];
    for (var i = 1; i <= 15; i++) rows.push([i, '', '', '', '', '', '', '', '']);
    s.getRange(1, 1, rows.length, 9).setValues(rows);
    s.getRange(7, 2, 15, 1).setNumberFormat('yyyy/m/d');
    s.setFrozenRows(6);
    s.setColumnWidth(2, 100); s.setColumnWidth(3, 240); s.setColumnWidth(4, 300); s.setColumnWidth(9, 360);
    s.getRange('B6').setNote('授業を行った日。休講や長期休みで空いた週はそのまま日付が飛ぶだけでよい。授業日の ' + CS_SETTINGS.DELAY_DAYS + ' 日後にメインページのリンクが開く。');
  }
  if (!ss.getSheetByName('まとめ_分類辞書')) {
    var d = ss.insertSheet('まとめ_分類辞書');
    d.getRange(1, 1, 3, 4).setValues([
      ['回', 'work', 'カテゴリ', 'キーワード（| 区切り）'],
      [12, 'work1', '100円ショップ・ダイソー系', '100円|ダイソー|セリア|キャンドゥ|100均'],
      [12, 'work1', '無印良品', '無印']
    ]);
    d.setFrozenRows(1);
  }
  if (!ss.getSheetByName('まとめ_タイプ辞書')) {
    var t = ss.insertSheet('まとめ_タイプ辞書');
    var trows = [['キー', '表示名', '説明', 'キーワード（| 区切り）']];
    CS_DEFAULT_TYPES.forEach(function (x) { trows.push([x.key, x.label, x.desc, x.pattern]); });
    t.getRange(1, 1, trows.length, 4).setValues(trows);
    t.setFrozenRows(1);
  }
  Logger.log('設定シートを用意しました');
}
