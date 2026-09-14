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
  ALLOWED_DOMAIN: 'g.neec.ac.jp', // 学校のドメイン。スクリプト プロパティ ACCESS を public にすると確認しない
  SPREADSHEET_ID: '',             // 空なら、このスクリプトが紐づくスプレッドシート
  DELAY_DAYS: 7,                  // 授業日から何日後に公開するか
  SNAPSHOT_NAME: ''               // 空なら「まとめ_snapshot_<科目名>.json」
};

// ---------- スプレッドシートの読み取り ----------

function csOpenSpreadsheet_() {
  var id = CS_SETTINGS.SPREADSHEET_ID || PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(String(id).trim());
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('成績表スプレッドシートが見つかりません。成績表を開いて「拡張機能 → Apps Script」から作ったプロジェクトに貼るか、' +
      '「プロジェクトの設定 → スクリプト プロパティ」に SPREADSHEET_ID（成績表 URL の /d/ と /edit の間の文字列）を追加してください。');
  }
  return ss;
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

/** 公開範囲。スクリプト プロパティ ACCESS が public なら誰でも、それ以外は学校アカウントのみ */
function csAccessMode_() {
  var v = PropertiesService.getScriptProperties().getProperty('ACCESS');
  return (v && v.trim().toLowerCase() === 'public') ? 'public' : 'school';
}

/**
 * 学校アカウントかどうかの確認。
 * 本当の鍵は「デプロイ時のアクセス設定（g.neec.ac.jp のユーザーのみ）」で、ここは念のための確認。
 * Google がメールアドレスを教えてくれない場合（匿名アクセスなど）はデプロイ設定に任せて通す。
 */
function csAllowed_() {
  if (csAccessMode_() === 'public' || !CS_SETTINGS.ALLOWED_DOMAIN) return { ok: true };
  var email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (e) { email = ''; }
  if (!email) return { ok: true };
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
    else {
      if (csAccessMode_() === 'school') snap.meta.loginNote = '各回のページは、学校の Google アカウント（@' + CS_SETTINGS.ALLOWED_DOMAIN + '）でログインすると開きます。開かないときは、先に accounts.google.com で学校アカウントにログインしてから戻ってください。';
      html = csRenderIndex(snap.summary, snap.meta, links, opts); title = snap.meta.course + ' ' + snap.meta.term;
    }
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
  if (csAccessMode_() === 'school') snap.meta.loginNote = '各回のページは、学校の Google アカウント（@' + CS_SETTINGS.ALLOWED_DOMAIN + '）でログインすると開きます。開かないときは、先に accounts.google.com で学校アカウントにログインしてから戻ってください。';
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
  Logger.log('設定シートを用意しました → ' + ss.getName() + '（' + ss.getUrl() + '）');
}
