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

if (typeof module !== 'undefined') {
  module.exports = {
    CS_DEFAULT_TYPES: CS_DEFAULT_TYPES, csScrubText: csScrubText, csTerms: csTerms, csTopTerms: csTopTerms,
    csDistribution: csDistribution, csClassifyTypes: csClassifyTypes, csPickQuotes: csPickQuotes,
    csRoundsFromTables: csRoundsFromTables, csPickQuotesByCategory: csPickQuotesByCategory, csDateOnly: csDateOnly, csOpenDate: csOpenDate, csIsOpen: csIsOpen, csReviveSummary: csReviveSummary, csAnalyze: csAnalyze, csParseDate: csParseDate
  };
}
