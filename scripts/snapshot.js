#!/usr/bin/env node
'use strict';
/* Snapshot: saves the project exactly as it is right now (committed or not, new files too) as a
   git tag named snapshot/<date>-<time>, without touching your files, your branch or what is staged.
   Run before each AI session (npm run snapshot); the Claude Code hook in .claude/settings.json does
   it by itself. Go back to one with scripts/rollback.js. Files in .gitignore are left out. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const git = (args, env) => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } }).trim();

const label = process.argv.slice(2).join(' ').trim();
const now = new Date(), pad = (n) => String(n).padStart(2, '0');
const name = `snapshot/${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

// A private index, so the real one (what is staged) is never changed.
const index = path.join(os.tmpdir(), `bladedeck-snap-${process.pid}`);
try {
  const head = git(['rev-parse', 'HEAD']);
  git(['read-tree', 'HEAD'], { GIT_INDEX_FILE: index });
  git(['add', '-A'], { GIT_INDEX_FILE: index });
  const tree = git(['write-tree'], { GIT_INDEX_FILE: index });
  // Nothing changed since the last snapshot: say so instead of making another.
  const last = git(['tag', '--list', 'snapshot/*', '--sort=-creatordate']).split('\n')[0];
  if (last && git(['rev-parse', `${last}^{tree}`]) === tree) { console.log(`Nothing changed since ${last}.`); process.exit(0); }
  const commit = git(['commit-tree', tree, '-p', head, '-m', `Snapshot ${now.toLocaleString()}${label ? `: ${label}` : ''}`]);
  // Two in the same second get -2, -3…
  const taken = new Set(git(['tag', '--list', `${name}*`]).split('\n'));
  let tag = name; for (let i = 2; taken.has(tag); i++) tag = `${name}-${i}`;
  git(['tag', tag, commit]);
  console.log(`Saved ${tag}${label ? ` (${label})` : ''}. Roll back with: npm run rollback -- ${tag}`);
} finally {
  fs.rmSync(index, { force: true });
}
