/**
 * 授業感想・ワークまとめ：Apps Script 本体
 *
 * 使い方（詳しくは class-summary/README.md）
 *  1. 成績表スプレッドシートを開き、拡張機能 → Apps Script
 *  2. analyze.js / render.js / Code.gs の中身をそれぞれファイルとして貼る
 *  3. 「プロジェクトの設定」→ スクリプト プロパティに WP_URL / WP_USER / WP_APP_PASSWORD / WP_PAGE_ID を入れる
 *  4. publishToWordPress を一度実行して動作確認 → installWeeklyTrigger で定期実行
 *
 * 学生の氏名・学籍番号・メールは読み取り対象の列に含めません（analyze.js 参照）。
 */

var CS_SETTINGS = {
  COURSE:   '',   // 空なら「まとめ_回設定」シートの B1（科目名）を使う
  TERM:     '',   // 同 B2
  AUDIENCE: '',   // 同 B3
  SPREADSHEET_ID: '' // 空なら、このスクリプトが紐づくスプレッドシート
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
    // ヘッダー行を 1〜3 行目から探す（「列 1」などの仮ヘッダーがある場合に対応）
    var hIdx = -1;
    for (var i = 0; i < head.length; i++) {
      var joined = head[i].join('|');
      if (/タイムスタンプ/.test(joined) && /感想/.test(joined)) { hIdx = i; break; }
    }
    if (hIdx < 0) return;
    var headers = head[hIdx];
    var rows = lastRow > hIdx + 1 ? sh.getRange(hIdx + 2, 1, lastRow - hIdx - 1, lastCol).getValues() : [];
    // 個人情報の列は読み込み時点で空にする
    var drop = [];
    headers.forEach(function (h, i) { if (/名前|氏名|学籍番号|メール|mail|IP/i.test(String(h))) drop.push(i); });
    rows = rows.map(function (r) { drop.forEach(function (i) { r[i] = ''; }); return r; });
    tables.push({ name: name, headers: headers, rows: rows });
  });
  return tables;
}

/**
 * 設定シートを読む。
 *  「まとめ_回設定」  A:回 B:タイトル C:work1 D:work2 E:work3 F:work4 G:観察（改行区切り）
 *                     ※ 1〜3 行目の B 列に 科目名 / 学期 / 対象 を書ける（A列に「科目名」等）
 *  「まとめ_分類辞書」A:回 B:work C:カテゴリ D:キーワード（| 区切り）
 *  「まとめ_タイプ辞書」A:キー B:表示名 C:説明 D:キーワード（| 区切り）
 */
function csReadConfig_(ss) {
  var cfg = { rounds: {}, categories: {}, types: null, meta: {} };
  var s1 = ss.getSheetByName('まとめ_回設定');
  if (s1) {
    s1.getDataRange().getValues().forEach(function (r) {
      var a = String(r[0] || '').trim();
      if (/^科目名$/.test(a)) { cfg.meta.course = String(r[1] || ''); return; }
      if (/^学期$/.test(a)) { cfg.meta.term = String(r[1] || ''); return; }
      if (/^対象$/.test(a)) { cfg.meta.audience = String(r[1] || ''); return; }
      var no = parseInt(a, 10);
      if (!no) return;
      var works = {};
      ['work1', 'work2', 'work3', 'work4'].forEach(function (k, i) { if (r[2 + i]) works[k] = String(r[2 + i]); });
      var notes = String(r[6] || '').split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean);
      cfg.rounds[no] = { title: String(r[1] || ''), works: works, notes: notes };
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
      if (!r[0] || !r[1] || !r[3] || /^キー$/.test(String(r[0]))) return;
      types.push({ key: String(r[0]), label: String(r[1]), desc: String(r[2] || ''), pattern: String(r[3]).replace(/\s*[|｜]\s*/g, '|') });
    });
    if (types.length) cfg.types = types;
  }
  return cfg;
}

// ---------- 生成 ----------

function csBuild_() {
  var ss = csOpenSpreadsheet_();
  var cfg = csReadConfig_(ss);
  var tables = csReadTables_(ss);
  var rounds = csRoundsFromTables(tables, cfg);
  var summary = csAnalyze(rounds, cfg);
  var meta = {
    course: CS_SETTINGS.COURSE || cfg.meta.course || ss.getName(),
    term: CS_SETTINGS.TERM || cfg.meta.term || '',
    audience: CS_SETTINGS.AUDIENCE || cfg.meta.audience || ''
  };
  return { summary: summary, meta: meta };
}

/** ウェブアプリとして公開したとき（URL を知っている人が見られる） */
function doGet() {
  var b = csBuild_();
  return HtmlService.createHtmlOutput(csRenderPage(b.summary, b.meta))
    .setTitle(b.meta.course + ' まとめ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** WordPress（lachiart.com）の固定ページ本文を書き換える */
function publishToWordPress() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('WP_URL'), user = props.getProperty('WP_USER');
  var pass = props.getProperty('WP_APP_PASSWORD'), pageId = props.getProperty('WP_PAGE_ID');
  if (!url || !user || !pass || !pageId) throw new Error('スクリプト プロパティ WP_URL / WP_USER / WP_APP_PASSWORD / WP_PAGE_ID を設定してください');
  var b = csBuild_();
  var fragment = csRenderFragment(b.summary, b.meta);
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
  Logger.log('更新完了: ' + endpoint + ' （' + b.summary.roundCount + '回 / ' + b.summary.totalResponses + '件）');
}

/** 確認用：生成した HTML を Drive に保存する（WordPress を使わない場合の置き場所にもなる） */
function saveHtmlToDrive() {
  var b = csBuild_();
  var name = b.meta.course + '_まとめ.html';
  var files = DriveApp.getFilesByName(name);
  var html = csRenderPage(b.summary, b.meta);
  if (files.hasNext()) files.next().setContent(html);
  else DriveApp.createFile(name, html, MimeType.HTML);
  Logger.log('保存: ' + name);
}

/** 週1回（月曜 6 時台）に WordPress を更新するトリガーを入れる。二重登録はしない。 */
function installWeeklyTrigger() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'publishToWordPress'; });
  if (exists) { Logger.log('すでに登録済みです'); return; }
  ScriptApp.newTrigger('publishToWordPress').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  Logger.log('毎週月曜 6 時台に更新するトリガーを登録しました');
}

/** 授業のある学期だけ毎日更新したいとき */
function installDailyTrigger() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'publishToWordPress'; });
  if (exists) { Logger.log('すでに登録済みです'); return; }
  ScriptApp.newTrigger('publishToWordPress').timeBased().everyDays(1).atHour(6).create();
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('トリガーをすべて削除しました');
}

/** 設定シートの雛形を作る（すでにあれば何もしない） */
function createConfigSheets() {
  var ss = csOpenSpreadsheet_();
  if (!ss.getSheetByName('まとめ_回設定')) {
    var s = ss.insertSheet('まとめ_回設定');
    s.getRange(1, 1, 4, 7).setValues([
      ['科目名', ss.getName(), '', '', '', '', ''],
      ['学期', '', '', '', '', '', ''],
      ['対象', '', '', '', '', '', ''],
      ['回', 'タイトル', 'work1の設問', 'work2の設問', 'work3の設問', 'work4の設問', '観察（1行に1つ、改行で区切る）']
    ]);
    for (var i = 1; i <= 15; i++) s.getRange(4 + i, 1).setValue(i);
    s.setFrozenRows(4);
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
    var rows = [['キー', '表示名', '説明', 'キーワード（| 区切り）']];
    CS_DEFAULT_TYPES.forEach(function (x) { rows.push([x.key, x.label, x.desc, x.pattern]); });
    t.getRange(1, 1, rows.length, 4).setValues(rows);
    t.setFrozenRows(1);
  }
  Logger.log('設定シートを用意しました');
}
