#!/usr/bin/env node
'use strict';
/* Before a build: write build-info.json (the commit, branch and time this build is made from), so
   System, Updates can list exactly the fixes a newer build adds. Run by `npm run dist` and CI. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const git = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const info = { commit: git('rev-parse', 'HEAD'), branch: process.env.GITHUB_REF_NAME || git('rev-parse', '--abbrev-ref', 'HEAD'), date: new Date().toISOString() };
fs.writeFileSync(path.join(root, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`build-info.json: ${info.commit.slice(0, 7)} on ${info.branch}`);
