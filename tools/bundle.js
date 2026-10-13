// Joins src/*.js into dist/AICaller.gs so the whole system can be pasted into
// the Apps Script editor as one file. Run: node tools/bundle.js
'use strict';
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'src');
const order = ['Config', 'Util', 'Sheets', 'Prompt', 'Gemini', 'Analysis', 'Vapi', 'Caller', 'Webhook', 'Email', 'Notify', 'Setup'];
const files = fs.readdirSync(src).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, ''));
const missing = files.filter(f => !order.includes(f));
if (missing.length) throw new Error('Add to bundle order: ' + missing.join(', '));
const out = [
  '/**',
  ' * AI Caller: outbound AI calls + call recording + lead scoring + email replies,',
  ' * running free inside Google Sheets. Generated from src/ by tools/bundle.js; edit src/, not this file.',
  ' * Setup guide: docs/SETUP.md',
  ' */',
  ''
].concat(order.map(f => '// ===== ' + f + ' =====\n\n' + fs.readFileSync(path.join(src, f + '.js'), 'utf8').trim() + '\n')).join('\n');
fs.mkdirSync(path.join(__dirname, '..', 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'AICaller.gs'), out);
console.log('dist/AICaller.gs: ' + out.split('\n').length + ' lines');
