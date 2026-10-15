#!/usr/bin/env node
'use strict';
/* Test for steamlink.plan() (BD-048, steamlink.js): npm run test-steamlink.
   Verifies that steamlink.plan():
   1. Detects outdated Bladedeck self entry and returns changed = 1 (to update options/overlay).
   2. Returns changed = 0 once fixed on subsequent plan runs.
   3. Leaves the owner's non-Bladedeck shortcuts completely untouched.
   4. Correctly tracks added and removed Bladedeck game shortcuts. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');

let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };

// Stub electron before requiring steamlink.js
const electron = {
  app: { isPackaged: true, getPath: () => os.tmpdir() },
  shell: { openExternal: () => {} },
  ipcMain: { handle: () => {} }
};
const load = Module._load;
Module._load = function (r, ...a) {
  return r === 'electron' ? electron : load.call(this, r, ...a);
};

const steamlink = require('../steamlink');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-test-steamlink-'));
const vdfFile = path.join(tmpDir, 'shortcuts.vdf');

const selfAppId = steamlink.appId('bladedeck-self');
const game1AppId = steamlink.appId('game-1');

// Owner shortcut (e.g., Discord or an emulator the user added directly to Steam)
const ownerShortcut = [
  [2, 'appid', -123456],
  [1, 'AppName', 'Discord'],
  [1, 'Exe', '"C:\\Users\\Test\\AppData\\Local\\Discord\\app.exe"'],
  [1, 'StartDir', '"C:\\Users\\Test\\AppData\\Local\\Discord"'],
  [1, 'icon', ''],
  [1, 'ShortcutPath', ''],
  [1, 'LaunchOptions', ''],
  [2, 'IsHidden', 0],
  [2, 'AllowDesktopConfig', 1],
  [2, 'AllowOverlay', 1],
  [2, 'OpenVR', 0],
  [2, 'Devkit', 0],
  [1, 'DevkitGameID', ''],
  [2, 'DevkitOverrideAppID', 0],
  [2, 'LastPlayTime', 1600000000],
  [1, 'FlatpakAppID', ''],
  [1, 'sortas', ''],
  [0, 'tags', [[1, '0', 'VoiceChat']]] // NOT 'Bladedeck'
];

// Old Bladedeck self entry (old launch options and overlay enabled)
const oldSelfShortcut = [
  [2, 'appid', selfAppId],
  [1, 'AppName', 'Bladedeck'],
  [1, 'Exe', '"/usr/bin/bladedeck"'],
  [1, 'StartDir', '"/usr/bin"'],
  [1, 'icon', ''],
  [1, 'ShortcutPath', ''],
  [1, 'LaunchOptions', '--via-steam'], // Old options
  [2, 'IsHidden', 0],
  [2, 'AllowDesktopConfig', 1],
  [2, 'AllowOverlay', 1], // Old overlay setting
  [2, 'OpenVR', 0],
  [2, 'Devkit', 0],
  [1, 'DevkitGameID', ''],
  [2, 'DevkitOverrideAppID', 0],
  [2, 'LastPlayTime', 1700000000],
  [1, 'FlatpakAppID', ''],
  [1, 'sortas', ''],
  [0, 'tags', [[1, '0', 'Bladedeck']]]
];

// Write initial VDF file with owner shortcut and old self entry
const initialTree = [
  [0, 'shortcuts', [
    [0, '0', ownerShortcut],
    [0, '1', oldSelfShortcut]
  ]]
];
fs.writeFileSync(vdfFile, steamlink.write(initialTree));

// New desired self entry (e.g. Linux without overlay)
const fixedSelfNode = [
  [2, 'appid', selfAppId],
  [1, 'AppName', 'Bladedeck'],
  [1, 'Exe', '"/usr/bin/bladedeck"'],
  [1, 'StartDir', '"/usr/bin"'],
  [1, 'icon', ''],
  [1, 'ShortcutPath', ''],
  [1, 'LaunchOptions', 'LD_PRELOAD= %command% --via-steam'],
  [2, 'IsHidden', 0],
  [2, 'AllowDesktopConfig', 1],
  [2, 'AllowOverlay', 0],
  [2, 'OpenVR', 0],
  [2, 'Devkit', 0],
  [1, 'DevkitGameID', ''],
  [2, 'DevkitOverrideAppID', 0],
  [2, 'LastPlayTime', 0],
  [1, 'FlatpakAppID', ''],
  [1, 'sortas', ''],
  [0, 'tags', [[1, '0', 'Bladedeck']]]
];

const want1 = [{ key: 'bladedeck-self', node: fixedSelfNode }];

// Plan 1: Should report changed = 1
const p1 = steamlink.plan(vdfFile, want1);
ok(p1.changed === 1, 'outdated self entry yields changed = 1');
ok(p1.added === 0, 'outdated self entry yields added = 0');
ok(p1.removed === 0, 'outdated self entry yields removed = 0');

// Verify owner shortcut preserved in plan 1
const root1 = p1.tree.find((n) => n[1].toLowerCase() === 'shortcuts');
const shortcuts1 = root1[2].map((s) => s[2]);
const hasDiscord1 = shortcuts1.some((s) => s.find((f) => f[1] === 'AppName')?.[2] === 'Discord');
ok(hasDiscord1, 'owner shortcut (Discord) preserved in plan 1 tree');

// Write the plan 1 tree
fs.writeFileSync(vdfFile, steamlink.write(p1.tree));

// Plan 2: Run plan again with the same want - should report changed = 0
const p2 = steamlink.plan(vdfFile, want1);
ok(p2.changed === 0, 'fixed self entry yields changed = 0 on subsequent plan');
ok(p2.added === 0, 'fixed self entry yields added = 0 on subsequent plan');
ok(p2.removed === 0, 'fixed self entry yields removed = 0 on subsequent plan');

// Verify owner shortcut preserved in plan 2
const root2 = p2.tree.find((n) => n[1].toLowerCase() === 'shortcuts');
const shortcuts2 = root2[2].map((s) => s[2]);
const hasDiscord2 = shortcuts2.some((s) => s.find((f) => f[1] === 'AppName')?.[2] === 'Discord');
ok(hasDiscord2, 'owner shortcut (Discord) preserved in plan 2 tree');

// Plan 3: Add a new Bladedeck game
const gameNode = [
  [2, 'appid', game1AppId],
  [1, 'AppName', 'Celeste'],
  [1, 'Exe', '"/games/celeste"'],
  [1, 'StartDir', '"/games"'],
  [1, 'icon', ''],
  [1, 'ShortcutPath', ''],
  [1, 'LaunchOptions', ''],
  [2, 'IsHidden', 0],
  [2, 'AllowDesktopConfig', 1],
  [2, 'AllowOverlay', 1],
  [2, 'OpenVR', 0],
  [2, 'Devkit', 0],
  [1, 'DevkitGameID', ''],
  [2, 'DevkitOverrideAppID', 0],
  [2, 'LastPlayTime', 0],
  [1, 'FlatpakAppID', ''],
  [1, 'sortas', ''],
  [0, 'tags', [[1, '0', 'Bladedeck']]]
];

const want2 = [...want1, { key: 'game-1', node: gameNode }];
const p3 = steamlink.plan(vdfFile, want2);
ok(p3.added === 1, 'adding a game yields added = 1');
ok(p3.removed === 0, 'adding a game yields removed = 0');
ok(p3.changed === 0, 'adding a game yields changed = 0');

fs.writeFileSync(vdfFile, steamlink.write(p3.tree));

// Plan 4: Remove the game
const p4 = steamlink.plan(vdfFile, want1);
ok(p4.removed === 1, 'removing a game yields removed = 1');
ok(p4.added === 0, 'removing a game yields added = 0');
ok(p4.changed === 0, 'removing a game yields changed = 0');

const root4 = p4.tree.find((n) => n[1].toLowerCase() === 'shortcuts');
const shortcuts4 = root4[2].map((s) => s[2]);
const hasDiscord4 = shortcuts4.some((s) => s.find((f) => f[1] === 'AppName')?.[2] === 'Discord');
ok(hasDiscord4, 'owner shortcut (Discord) preserved after game removal');

// Cleanup temporary files
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

console.log(`\nSteamlink test finished with ${fails} failure(s).`);
process.exit(fails > 0 ? 1 : 0);
