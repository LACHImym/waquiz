/**
 * 授業感想・ワークまとめ：Apps Script 本体
 *
 * ページ構成
 *   ?（なし）        メインページ：科目の概要と全回のリンク一覧
 *   ?round=3         第3回の感想・ワークまとめ
 *   ?page=overall    全回を通した傾向
 *
 * 閲覧制限
 *   デプロイ時に「アクセスできるユーザー：g.neec.ac.jp のユーザーのみ」を選ぶと、
 *   そのドメインの Google アカウントでログインした人だけが開けます（学校のアカウントから
 *   デプロイした場合に選べます）。CS_SETTINGS.ALLOWED_DOMAIN を入れると、コード側でも
 *   メールアドレスのドメインを確認します。
 *
 * 学生の氏名・学籍番号・メールは読み取り時点で捨てます（csReadTables_ 参照）。
 */

var CS_SETTINGS = {
  ALLOWED_DOMAIN: 'g.neec.ac.jp', // 空文字にするとコード側の確認をしない
  SPREADSHEET_ID: '',             // 空なら、このスクリプトが紐づくスプレッドシート
  CACHE_SECONDS: 6 * 60 * 60      // 生成した HTML をこの秒数だけ使い回す（更新関数を実行すると消える）
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
 *     A列に「科目名」「学期」「概要：見出し」の行（B列に値）。
 *     見出し行「回」以降：A:回 B:タイトル C:授業概要URL D:work1 E:work2 F:work3 G:work4 H:観察（改行区切り）
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
      ['work1', 'work2', 'work3', 'work4'].forEach(function (k, i) { if (r[3 + i]) works[k] = String(r[3 + i]); });
      var notes = String(r[7] || '').split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean);
      cfg.rounds[no] = { title: String(r[1] || ''), url: String(r[2] || ''), works: works, notes: notes };
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

// ---------- 生成 ----------

function csBuild_() {
  var ss = csOpenSpreadsheet_();
  var cfg = csReadConfig_(ss);
  var tables = csReadTables_(ss);
  var rounds = csRoundsFromTables(tables, cfg);
  var summary = csAnalyze(rounds, cfg);
  var meta = {
    course: cfg.meta.course || ss.getName(),
    term: cfg.meta.term || '',
    roundTotal: cfg.meta.roundTotal || 15,
    overview: cfg.meta.overview || [],
    rounds: cfg.rounds
  };
  return { summary: summary, meta: meta };
}

/** ウェブアプリの URL。スクリプト プロパティ WEBAPP_URL があればそれを優先 */
function csWebAppUrl_() {
  var u = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL');
  if (u) return u.replace(/\/$/, '');
  try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; }
}

function csLinks_() {
  var base = csWebAppUrl_();
  return {
    index: base,
    overall: base + '?page=overall',
    round: function (no) { return base + '?round=' + no; }
  };
}

function csPageHtml_(key) {
  var cache = CacheService.getScriptCache();
  var hit = CS_SETTINGS.CACHE_SECONDS ? cache.get('cs:' + key) : null;
  if (hit) return hit;
  var b = csBuild_();
  var links = csLinks_();
  var html;
  if (key === 'overall') html = csRenderOverallPage(b.summary, b.meta, links);
  else if (/^round:/.test(key)) html = csRenderRoundPage(b.summary, parseInt(key.slice(6), 10), b.meta, links);
  else html = csRenderIndex(b.summary, b.meta, links);
  if (CS_SETTINGS.CACHE_SECONDS && html.length < 90000) cache.put('cs:' + key, html, CS_SETTINGS.CACHE_SECONDS);
  return html;
}

/** キャッシュを捨てる（定期実行やシート更新後に呼ぶ） */
function refreshPages() {
  var keys = ['index', 'overall'];
  for (var i = 1; i <= 30; i++) keys.push('round:' + i);
  CacheService.getScriptCache().removeAll(keys.map(function (k) { return 'cs:' + k; }));
  csPageHtml_('index'); // 温めておく
  Logger.log('キャッシュを更新しました');
}

// ---------- ウェブアプリ ----------

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
    html = csRenderDocument('<div class="cs-root" style="max-width:640px;margin:48px auto;padding:0 20px;font-family:sans-serif;line-height:1.8">' +
      '<h2 style="font-size:20px">このページは学校のアカウント専用です</h2>' +
      '<p>@' + csEsc(CS_SETTINGS.ALLOWED_DOMAIN) + ' の Google アカウントでログインしてから開いてください。' +
      (gate.email ? '<br>いまのアカウント：' + csEsc(gate.email) : '') + '</p>' +
      '<p><a href="https://accounts.google.com/AccountChooser">アカウントを切り替える</a></p></div>', '閲覧制限');
    title = '閲覧制限';
  } else if (p.page === 'overall') { html = csPageHtml_('overall'); title = '全体の傾向'; }
  else if (p.round) { html = csPageHtml_('round:' + parseInt(p.round, 10)); title = '第' + parseInt(p.round, 10) + '回'; }
  else { html = csPageHtml_('index'); title = 'まとめ'; }
  return HtmlService.createHtmlOutput(/^<!doctype/i.test(html) ? html : csRenderDocument(html, title))
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---------- WordPress（lachiart.com）へメインページを流し込む ----------

/**
 * メインページ（概要とリンク一覧）を WordPress の固定ページ本文に書き込む。
 * 各回のリンク先はウェブアプリ（閲覧制限つき）になる。
 * スクリプト プロパティ：WP_URL / WP_USER / WP_APP_PASSWORD / WP_PAGE_ID / WEBAPP_URL
 */
function publishToWordPress() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('WP_URL'), user = props.getProperty('WP_USER');
  var pass = props.getProperty('WP_APP_PASSWORD'), pageId = props.getProperty('WP_PAGE_ID');
  if (!url || !user || !pass || !pageId) throw new Error('スクリプト プロパティ WP_URL / WP_USER / WP_APP_PASSWORD / WP_PAGE_ID を設定してください');
  if (!csWebAppUrl_()) throw new Error('スクリプト プロパティ WEBAPP_URL（ウェブアプリの URL）を設定してください');
  refreshPages();
  var b = csBuild_();
  var fragment = csRenderIndex(b.summary, b.meta, csLinks_());
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

/** 確認用：全ページを Drive のフォルダに HTML として保存する */
function saveHtmlToDrive() {
  var b = csBuild_();
  var links = { index: 'index.html', overall: 'overall.html', round: function (no) { return 'round-' + no + '.html'; } };
  var folderName = b.meta.course + '_まとめ';
  var it = DriveApp.getFoldersByName(folderName);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(folderName);
  var put = function (name, html) {
    var f = folder.getFilesByName(name);
    if (f.hasNext()) f.next().setContent(html); else folder.createFile(name, html, MimeType.HTML);
  };
  put('index.html', csRenderDocument(csRenderIndex(b.summary, b.meta, links), b.meta.course));
  put('overall.html', csRenderDocument(csRenderOverallPage(b.summary, b.meta, links), '全体の傾向'));
  b.summary.rounds.forEach(function (r) { put('round-' + r.no + '.html', csRenderDocument(csRenderRoundPage(b.summary, r.no, b.meta, links), '第' + r.no + '回')); });
  Logger.log('保存: ' + folder.getUrl());
}

// ---------- 定期実行 ----------

function csHasTrigger_(fn) {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === fn; });
}

/** 毎週月曜 6 時台：キャッシュ更新 ＋ WordPress のメインページ更新 */
function installWeeklyTrigger() {
  if (csHasTrigger_('scheduledUpdate')) { Logger.log('すでに登録済みです'); return; }
  ScriptApp.newTrigger('scheduledUpdate').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  Logger.log('毎週月曜 6 時台に更新するトリガーを登録しました');
}

/** 毎日 6 時台（授業期間中向け） */
function installDailyTrigger() {
  if (csHasTrigger_('scheduledUpdate')) { Logger.log('すでに登録済みです'); return; }
  ScriptApp.newTrigger('scheduledUpdate').timeBased().everyDays(1).atHour(6).create();
  Logger.log('毎日 6 時台に更新するトリガーを登録しました');
}

function scheduledUpdate() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('WP_PAGE_ID')) publishToWordPress();
  else refreshPages();
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
      ['科目名', 'デザイン史', '', '', '', '', '', ''],
      ['学期', '2026年度 前期', '', '', '', '', '', ''],
      ['全回数', 15, '', '', '', '', '', ''],
      ['概要：科目の目的', '', '', '', '', '', '', ''],
      ['概要：科目の概要', '', '', '', '', '', '', ''],
      ['回', 'タイトル', '授業概要URL', 'work1の設問', 'work2の設問', 'work3の設問', 'work4の設問', '観察（1行に1つ、改行で区切る）']
    ];
    for (var i = 1; i <= 15; i++) rows.push([i, '', '', '', '', '', '', '']);
    s.getRange(1, 1, rows.length, 8).setValues(rows);
    s.setFrozenRows(6);
    s.setColumnWidth(2, 260); s.setColumnWidth(3, 300); s.setColumnWidth(8, 360);
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
