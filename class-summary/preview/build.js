#!/usr/bin/env node
/**
 * ローカル確認用ビルダー。index.html / overall.html / round-N.html を出力フォルダに作る。
 *   node preview/build.js <フォーム回答のJSON> <設定JSON> <出力フォルダ>
 * フォーム回答JSON: { sheets: [{ name?, headers: [...], rows: [[...]] }] }
 */
const fs = require('fs');
const path = require('path');
const A = require('../src/analyze.js');
const R = require('../src/render.js');

const [rawPath, cfgPath, outDir] = process.argv.slice(2);
if (!rawPath || !cfgPath || !outDir) {
  console.error('usage: node preview/build.js <raw.json> <config.json> <outDir>');
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
const meta = Object.assign({}, cfg.meta, { rounds: cfg.rounds });
const links = { index: 'index.html', overall: 'overall.html', round: (no) => 'round-' + no + '.html' };

fs.mkdirSync(outDir, { recursive: true });
const write = (name, frag, title) => fs.writeFileSync(path.join(outDir, name), R.csRenderDocument(frag, title));
write('index.html', R.csRenderIndex(summary, meta, links), meta.course + ' ' + meta.term);
write('overall.html', R.csRenderOverallPage(summary, meta, links), meta.course + ' 全体の傾向');
summary.rounds.forEach((r) => write('round-' + r.no + '.html', R.csRenderRoundPage(summary, r.no, meta, links), meta.course + ' 第' + r.no + '回'));
console.log('rounds:', summary.roundCount, 'responses:', summary.totalResponses, '->', outDir);
