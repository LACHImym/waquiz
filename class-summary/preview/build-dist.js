#!/usr/bin/env node
/** analyze.js + render.js + Code.gs を 1 つに結合し、Apps Script に貼るだけのファイルを作る */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const strip = (s) => s.replace(/\nif \(typeof module !== 'undefined'\) \{[\s\S]*?\n\}\n?/g, '\n')
  .replace(/var __cs = \(typeof module[\s\S]*?\n\n/, '');
const parts = [
  '/**\n * 授業感想・ワークまとめ（全部入り）\n * このファイルの中身をそのまま Apps Script に貼り付けてください。\n * 生成元: class-summary/src/*.js, src/gas/Code.gs\n */\n',
  strip(fs.readFileSync(path.join(root, 'src/analyze.js'), 'utf8')),
  strip(fs.readFileSync(path.join(root, 'src/render.js'), 'utf8')),
  fs.readFileSync(path.join(root, 'src/gas/Code.gs'), 'utf8')
];
const out = path.join(root, 'dist/class-summary.gs');
fs.writeFileSync(out, parts.join('\n\n// ===================================================================\n\n'));
console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
