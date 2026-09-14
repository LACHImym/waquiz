#!/usr/bin/env node
/**
 * ローカル確認用ビルダー。
 *   node preview/build.js <フォーム回答のJSON> <設定JSON> <出力HTML>
 * フォーム回答JSON: { sheets: [{ name?, headers: [...], rows: [[...]] }] }
 * （Apps Script 側では同じ構造を SpreadsheetApp から直接作ります）
 */
const fs = require('fs');
const path = require('path');
const A = require('../src/analyze.js');
const R = require('../src/render.js');

const [rawPath, cfgPath, outPath] = process.argv.slice(2);
if (!rawPath || !cfgPath || !outPath) {
  console.error('usage: node preview/build.js <raw.json> <config.json> <out.html>');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const unescapeMd = (s) => (typeof s === 'string' ? s.replace(/\\(.)/g, '$1') : s);
const tables = raw.sheets.map((s, i) => ({
  name: s.name || 'sheet' + i,
  headers: s.headers.map(unescapeMd),
  rows: s.rows.map((r) => r.map(unescapeMd))
}));
const rounds = A.csRoundsFromTables(tables, cfg);
const summary = A.csAnalyze(rounds, cfg);
const html = R.csRenderPage(summary, cfg.meta);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
console.log('rounds:', summary.roundCount, 'responses:', summary.totalResponses, '->', outPath, (html.length / 1024).toFixed(0) + 'KB');
