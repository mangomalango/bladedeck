// Attack test for the Shared games pool (fsaccess.js) and the read-only storage map (storage.js).
// npm run test-pool (or node scripts/pooltest.js <repo>). Runs with a fake home in a temp folder and a stubbed Electron.
const fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-'));
process.env.USERPROFILE = home; process.env.HOME = home;
const h = {}; let answer = 1, asked = 0, revealed = [];
const electron = {
  ipcMain: { handle: (n, f) => { h[n] = f; } },
  dialog: { showMessageBox: async () => { asked++; return { response: answer }; } },
  app: { getPath: (k) => path.join(home, k === 'userData' ? 'AppData' : k) },
  shell: { showItemInFolder: (p) => revealed.push(p), openPath: async () => '' },
};
const load = Module._load; Module._load = function (r, ...a) { return r === 'electron' ? electron : load.call(this, r, ...a); };

// A library: a ROM, a .cue disc, a PC game in its own folder, one on the Desktop, and a secret.
const w = (p, t = 'x') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); return p; };
const rom = w(path.join(home, 'Games', 'ROMs', 'Zelda.gba'));
const cue = w(path.join(home, 'Games', 'ROMs', 'psx', 'Crash.cue'), 'FILE "Crash (Track 1).bin" BINARY\nFILE "..\\..\\..\\secret.txt" BINARY\n');
w(path.join(home, 'Games', 'ROMs', 'psx', 'Crash (Track 1).bin'));
const game = w(path.join(home, 'Games', 'Hades', 'Hades.exe')); w(path.join(home, 'Games', 'Hades', 'data', 'a.pak'));
const desk = w(path.join(home, 'Desktop', 'Thing.exe'));
const secret = w(path.join(home, 'Documents', 'secret.txt'), 'SECRET');
try { fs.symlinkSync(path.join(home, 'Documents'), path.join(home, 'Games', 'Hades', 'docs-link'), 'junction'); } catch { /* links not allowed */ }
const lib = { entries: [
  { id: 'r1', type: 'rom', title: 'Zelda', rom }, { id: 'c1', type: 'rom', title: 'Crash', rom: cue },
  { id: 'g1', type: 'exe', title: 'Hades', exe: game }, { id: 'd1', type: 'exe', title: 'Desk', exe: desk },
  { id: 's1', type: 'steam', title: 'L4D2', appid: '550' } ] };

const FA = require(path.join(repo, 'fsaccess.js'));
FA.register({ getWin: () => null, getLib: () => lib });
require(path.join(repo, 'storage.js')).register(() => lib);
const shared = path.join(home, 'Bladedeck', 'Shared games');
let fails = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };

(async () => {
  ok(!FA.allowed(rom) && !FA.allowed(path.join(home, 'Games')), '~/Games is not allowed by itself');
  ok(!(await h['xfer-prep-game']({}, { exe: secret, type: 'exe' })).ok, 'a game object from the page is refused');
  ok(!(await h['xfer-prep-game']({}, 'nope')).ok && asked === 0, 'an unknown id is refused without asking');
  ok(!(await h['xfer-prep-game']({}, 'd1')).ok && asked === 0, 'a game on the Desktop is refused');
  ok(!(await h['xfer-prep-game']({}, 's1')).ok, 'a Steam game is not copied');
  answer = 0; const c = await h['xfer-prep-game']({}, 'r1'); ok(!c.ok && c.cancelled && !fs.existsSync(path.join(shared, 'Zelda.gba')), 'Cancel copies nothing');
  answer = 1; const r = await h['xfer-prep-game']({}, 'r1'); ok(r.ok && !r.isDir && fs.existsSync(path.join(shared, 'Zelda.gba')), 'a ROM is copied as one file after Yes');
  const d = await h['xfer-prep-game']({}, 'c1'); const inDisc = d.ok ? fs.readdirSync(d.path) : [];
  ok(d.ok && inDisc.includes('Crash (Track 1).bin') && !inDisc.includes('secret.txt'), `a .cue brings its track, not a ../ path (${inDisc.join(', ')})`);
  const g = await h['xfer-prep-game']({}, 'g1'); const inGame = g.ok ? fs.readdirSync(g.path) : [];
  ok(g.ok && inGame.includes('Hades.exe') && inGame.includes('data') && !inGame.includes('docs-link'), `a PC game folder is copied without links (${inGame.join(', ')})`);
  ok(!(await h['xfer-pack-game']({}, '..\\..\\Documents')).ok, 'packing outside the pool is refused');
  ok(!(await h['xfer-pack-game']({}, path.join(home, 'Games', 'Hades'))).ok || fs.existsSync(path.join(home, 'Bladedeck', 'To phone', 'Hades.zip')), 'a full path is reduced to a pool name');
  ok(!(await h['xfer-pool-remove']({}, '..')) && fs.existsSync(path.join(home, 'Documents', 'secret.txt')), 'removing ".." does nothing');
  ok(!(await h['xfer-pool-remove']({}, '')), 'removing the pool itself is refused');
  const m = await h['storage-map']({}, [{ id: 'x', type: 'rom', rom: secret }]);
  ok(m.ok && !m.items.some((i) => i.path === secret) && m.items.some((i) => i.id === 'r1'), 'the storage map ignores games from the page');
  ok(!FA.allowed(secret) && !FA.allowed(rom), 'the storage map unlocks nothing');
  ok((await h['storage-reveal']({}, 'r1')) && revealed[0] === rom && !(await h['storage-reveal']({}, secret)), 'Show works by id only');
  ok(!(await h['storage-reveal']({}, '__proto__')) && !(await h['storage-reveal']({}, 'toString')), 'prototype pollution on storage-reveal is refused');
  ok(!(await h['xfer-prep-game']({}, null)).ok && !(await h['xfer-prep-game']({}, {})).ok, 'null and non-string game ids are safely rejected');
  lib.entries.push({ id: 't1', type: 'rom', title: '..\\..\\EvilGame', rom: rom });
  const t = await h['xfer-prep-game']({}, 't1'); ok(t.ok && FA.inside(t.path, shared), 'path traversal in game title is sanitized to pool directory');
  ok(FA.allowed(path.join(shared, 'Zelda.gba')), 'the pool copy can be sent');
  console.log(fails ? `${fails} FAILED` : 'all passed');
  fs.rmSync(home, { recursive: true, force: true });
  process.exit(fails ? 1 : 0);
})();
