#!/usr/bin/env node
'use strict';
/* Check: every JavaScript file in Bladedeck parses, and every JSON file it ships reads. Quick
   (a few seconds), needs nothing installed, and is what CI runs before building. It cannot test
   controllers, sound, capture or the graphics card; those need a run on real hardware. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const SKIP = /^(node_modules|dist|android|\.git)$/;
const files = [];
(function walk(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.test(d.name) || d.name === 'vendor') continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p);
    else if (/\.(js|json)$/.test(d.name)) files.push(p);
  }
})(root);

let bad = 0;
for (const f of files) {
  try {
    if (f.endsWith('.json')) JSON.parse(fs.readFileSync(f, 'utf8'));
    else execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    bad++;
    console.error(`✗ ${path.relative(root, f)}\n${String(err.stderr || err.message).trim()}\n`);
  }
}
console.log(bad ? `${bad} of ${files.length} files have errors.` : `All ${files.length} files are fine.`);
process.exit(bad ? 1 : 0);
