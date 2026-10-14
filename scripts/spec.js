#!/usr/bin/env node
'use strict';
/* The shared interface, checked: every call the page can make (preload.js) must have a handler
   in the main process, and SPEC.md's channel table must match the code. This is Bladedeck's
   "header": changing a channel's name or what it takes is interface drift, which the auditor
   (Gemini) and the lead review on purpose.
   npm run spec            check, and fail when something drifted
   npm run spec -- --write rewrite the generated table in SPEC.md */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SKIP = /^(node_modules|dist|android|\.git|\.agents|scripts|renderer|companion)$/;

// The page's side: api name -> channel, and whether it is a call (invoke) or an event (on).
const pre = read('preload.js').replace(/\r\n/g, '\n');
const calls = [];
for (const [, api, args, rest] of pre.matchAll(/^\s*(\w+):\s*\(([^)]*)\)\s*=>(.*)$/gm)) {
  for (const [, how, ch] of rest.matchAll(/ipcRenderer\.(invoke|on|send|sendSync)\('([\w-]+)'/g)) calls.push({ api, args: args.trim(), how: how === 'on' ? 'event' : how === 'invoke' ? 'call' : how, ch });
}

// The main process's side: which file answers each channel.
const handlers = new Map();
(function walk(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.test(d.name)) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p);
    else if (d.name.endsWith('.js') && d.name !== 'preload.js' && d.name !== 'webapp-preload.js') {
      for (const [, ch] of fs.readFileSync(p, 'utf8').matchAll(/ipcMain\.(?:handle|on|once)\('([\w-]+)'/g)) {
        const list = handlers.get(ch) || []; list.push(path.relative(root, p)); handlers.set(ch, list);
      }
    }
  }
})(root);

const problems = [];
for (const c of calls) if ((c.how === 'call' || c.how === 'sendSync' || c.how === 'send') && !handlers.has(c.ch)) problems.push(`preload ${c.api}() calls '${c.ch}', which nothing in the main process answers`);
const called = new Set(calls.map((c) => c.ch));
const unused = [...handlers.keys()].filter((ch) => !called.has(ch)).sort();

const table = ['| Page calls | Channel | Kind | Answered in |', '|---|---|---|---|',
  ...calls.map((c) => `| \`${c.api}(${c.args})\` | \`${c.ch}\` | ${c.how} | ${(handlers.get(c.ch) || ['main process sends it']).join(', ')} |`)].join('\n');
const START = '<!-- spec:channels -->', END = '<!-- /spec:channels -->';
const specFile = path.join(root, 'SPEC.md');
// Windows checkouts may have CRLF line ends; the table is compared without them.
const spec = fs.existsSync(specFile) ? fs.readFileSync(specFile, 'utf8').replace(/\r\n/g, '\n') : '';
const now = spec.includes(START) ? spec.slice(spec.indexOf(START) + START.length, spec.indexOf(END)).trim() : '';

if (process.argv.includes('--write')) {
  if (!spec.includes(START)) { console.error('SPEC.md has no channel table markers.'); process.exit(1); }
  fs.writeFileSync(specFile, spec.replace(now ? now : `${START}\n${END}`, now ? table : `${START}\n${table}\n${END}`));
  console.log(`SPEC.md: ${calls.length} channels written.`);
} else if (now !== table) problems.push('SPEC.md\'s channel table is not what the code has: a channel was added, renamed or changed. Review it, then run npm run spec -- --write');

if (unused.length) console.log(`Answered but not in preload (other windows, or left over): ${unused.join(', ')}`);
if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1); }
console.log(`Interface OK: ${calls.length} channels, each answered.`);
