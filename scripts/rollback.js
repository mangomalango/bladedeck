#!/usr/bin/env node
'use strict';
/* Rollback: puts the project's files back the way a snapshot (or any commit) had them.
     npm run rollback               lists the snapshots, newest first
     npm run rollback -- <name>     goes back to that one
   Nothing is lost: first the files as they are now are saved as a snapshot of their own
   ("before rollback"), so going back can be undone the same way. Your branch and its commits are
   not moved; the files simply change, ready to commit or keep working on. */
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const to = process.argv[2];
if (!to) {
  const list = git(['for-each-ref', '--sort=-creatordate', '--format=%(refname:short)  %(creatordate:relative)  %(contents:subject)', 'refs/tags/snapshot']);
  console.log(list || 'No snapshots yet. Make one with: npm run snapshot');
  process.exit(0);
}
try { git(['rev-parse', '--verify', `${to}^{commit}`]); } catch { console.error(`No snapshot or commit called ${to}.`); process.exit(1); }

// Keep what is here now first.
execFileSync(process.execPath, [path.join(__dirname, 'snapshot.js'), `before rollback to ${to}`], { cwd: root, stdio: 'inherit' });

// Files the snapshot does not have go; every file it has comes back as it was.
const want = new Set(git(['ls-tree', '-r', '--name-only', to]).split('\n').filter(Boolean));
const now = git(['ls-files', '--cached', '--others', '--exclude-standard']).split('\n').filter(Boolean);
const gone = now.filter((f) => !want.has(f));
if (gone.length) git(['rm', '-q', '--cached', '--ignore-unmatch', '--', ...gone]);
for (const f of gone) { try { require('fs').rmSync(path.join(root, f), { force: true }); } catch { /* already gone */ } }
git(['checkout', to, '--', '.']);
// Staged state goes back to the branch's, so `git status` shows the rollback as plain changes.
git(['reset', '-q']);
console.log(`Files are back to ${to}. The previous state is saved as a snapshot too (npm run rollback lists it).`);
