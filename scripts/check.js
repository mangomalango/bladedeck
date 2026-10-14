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
// Every file main.js and the modules it loads require must be packed into the app (the "files"
// list in package.json), or the built app stops at start while running from source works.
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packed = new Set(pkg.build.files.filter((f) => !f.includes('*')));
const seen = new Set();
(function need(file) {
  if (seen.has(file)) return; seen.add(file);
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const m of text.matchAll(/require\('\.\/([\w-]+)(?:\.js)?'\)/g)) {
    const dep = `${m[1]}.js`;
    if (!fs.existsSync(path.join(root, dep))) continue;
    if (!packed.has(dep) && !seen.has(dep)) { bad++; console.error(`✗ ${dep} is loaded by ${file} but missing from "files" in package.json`); }
    need(dep);
  }
})('main.js');
console.log(bad ? `${bad} of ${files.length} files have errors.` : `All ${files.length} files are fine.`);
process.exit(bad ? 1 : 0);
