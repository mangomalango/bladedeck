'use strict';
/* Backup and restore: everything you set in Bladedeck, kept safe and brought back.
   What is in a backup: the library (every setting, game, emulator, source, dock app, blade,
   place and choice you made), the folders you allowed, paired phones, the live view's remembered
   windows, your custom CSS and themes, and downloaded artwork. Sign-ins to websites stay in
   Bladedeck's own browser profile and are not copied.
   Where: ~/Bladedeck/Backups/<date and time>, outside Bladedeck's own settings folder, so a
   reinstall or a broken settings folder does not take the backups with it.
   When: one each day Bladedeck is used, one at most every 30 minutes while you change things,
   one before every restore, and whenever you ask. The newest 40 are kept, plus every one you
   named. Export writes a single file (for a USB stick or another PC); Import reads one back.
   Restoring restarts Bladedeck. */
const { app, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = () => path.join(os.homedir(), 'Bladedeck', 'Backups');
let deps = null;
const FILES = ['library.json', 'fs-grants.json', 'companion.json', 'live-tokens.json', 'custom.css', 'lan-id'];
const DIRS = ['themes', 'media'];
const KEEP = 40;

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
function copyDir(a, b) { if (fs.existsSync(a)) fs.cpSync(a, b, { recursive: true }); }

let restoring = false;

function make(note = '', auto = false) {
  const d = deps.dataDir();
  let id = `${stamp()}${auto ? '-auto' : ''}`, to = path.join(root(), id);
  for (let i = 2; fs.existsSync(to); i++) { id = `${stamp()}${auto ? '-auto' : ''}-${i}`; to = path.join(root(), id); }
  fs.mkdirSync(to, { recursive: true });
  for (const f of FILES) { const p = path.join(d, f); if (fs.existsSync(p)) fs.copyFileSync(p, path.join(to, f)); }
  for (const x of DIRS) copyDir(path.join(d, x), path.join(to, x));
  let lib = {}; try { lib = JSON.parse(fs.readFileSync(path.join(d, 'library.json'), 'utf8')); } catch { /* none yet */ }
  const man = { at: Date.now(), note: String(note || '').slice(0, 80), auto, version: app.getVersion(), games: (lib.entries || []).length, emulators: (lib.emulators || []).length, sources: (lib.settings?.sources || []).length };
  fs.writeFileSync(path.join(to, 'backup.json'), JSON.stringify(man, null, 2));
  prune();
  return { id, ...man };
}
function list() {
  let names = []; try { names = fs.readdirSync(root()).filter((n) => fs.existsSync(path.join(root(), n, 'backup.json'))); } catch { return []; }
  return names.map((id) => { try { return { id, ...JSON.parse(fs.readFileSync(path.join(root(), id, 'backup.json'), 'utf8')) }; } catch { return null; } }).filter(Boolean).sort((a, b) => b.at - a.at);
}
// The newest automatic ones are kept; named ones always are.
function prune() {
  const autos = list().filter((b) => b.auto && !b.note);
  for (const b of autos.slice(KEEP)) fs.rmSync(path.join(root(), b.id), { recursive: true, force: true });
}

function restoreFrom(dir) {
  const d = deps.dataDir();
  if (!fs.existsSync(path.join(dir, 'library.json'))) throw new Error('That backup has no library in it.');
  JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')); // readable, or nothing changes
  restoring = true;
  // A restore that fails halfway lets saving work again (the backup made first has what was there).
  try {
    make('Before restoring', false);
    for (const f of FILES) { const p = path.join(dir, f); if (fs.existsSync(p)) fs.copyFileSync(p, path.join(d, f)); }
    for (const x of DIRS) { const p = path.join(dir, x); if (fs.existsSync(p)) { fs.rmSync(path.join(d, x), { recursive: true, force: true }); copyDir(p, path.join(d, x)); } }
  } catch (err) { restoring = false; throw err; }
  setTimeout(() => { app.relaunch(); app.exit(0); }, 600);
  return true;
}

// One file: the small files as text, the folders' files as base64.
function bundle() {
  const d = deps.dataDir(), out = { bladedeck: 1, at: Date.now(), files: {} };
  for (const f of FILES) { const p = path.join(d, f); if (fs.existsSync(p)) out.files[f] = { b64: fs.readFileSync(p).toString('base64') }; }
  const walk = (base, rel) => { let it = []; try { it = fs.readdirSync(path.join(base, rel), { withFileTypes: true }); } catch { return; } for (const x of it) { const r = path.join(rel, x.name); if (x.isDirectory()) walk(base, r); else out.files[r.split(path.sep).join('/')] = { b64: fs.readFileSync(path.join(base, r)).toString('base64') }; } };
  for (const x of DIRS) walk(d, x);
  return out;
}
function unbundle(j) {
  if (!j || j.bladedeck !== 1 || !j.files?.['library.json']) throw new Error('That is not a Bladedeck backup file.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bladedeck-import-'));
  for (const [rel, v] of Object.entries(j.files)) {
    const clean = path.normalize(rel).replace(/^(\.\.[\\/])+/, '');
    if (path.isAbsolute(clean) || clean.startsWith('..') || !(FILES.includes(clean) || DIRS.some((x) => clean.startsWith(x + path.sep) || clean.startsWith(x + '/')))) continue;
    const to = path.join(tmp, clean); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, Buffer.from(v.b64, 'base64'));
  }
  return tmp;
}

let lastSnap = 0;
// Called whenever the library is saved: a backup at most every 30 minutes while things change.
function changed() {
  if (Date.now() - lastSnap < 30 * 60000) return;
  lastSnap = Date.now();
  setTimeout(() => { try { make('', true); } catch { /* the next one */ } }, 2000);
}

function register(d) {
  deps = d;
  // One at start-up, unless one was made in the last day.
  app.whenReady().then(() => setTimeout(() => { try { const l = list(); if (!l.length || Date.now() - l[0].at > 86400000) { make('', true); lastSnap = Date.now(); } } catch { /* read-only home */ } }, 8000));
  const wrap = (fn) => async (...a) => { try { return { ok: true, data: await fn(...a) }; } catch (err) { return { ok: false, error: String(err.message || err) }; } };
  ipcMain.handle('backup-list', () => list());
  ipcMain.handle('backup-make', wrap((_e, note) => make(note || 'Saved by you', false)));
  ipcMain.handle('backup-restore', wrap((_e, id) => {
    if (!/^[\w-]+$/.test(String(id))) throw new Error('Bad request.');
    return restoreFrom(path.join(root(), String(id)));
  }));
  ipcMain.handle('backup-export', wrap(async () => {
    const r = await dialog.showSaveDialog(d.getWin(), { title: 'Export a Bladedeck backup', defaultPath: path.join(os.homedir(), `Bladedeck backup ${new Date().toISOString().slice(0, 10)}.bladedeck`), filters: [{ name: 'Bladedeck backup', extensions: ['bladedeck'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, JSON.stringify(bundle()));
    return r.filePath;
  }));
  ipcMain.handle('backup-import', wrap(async () => {
    const r = await dialog.showOpenDialog(d.getWin(), { title: 'Import a Bladedeck backup', properties: ['openFile'], filters: [{ name: 'Bladedeck backup', extensions: ['bladedeck', 'json'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return restoreFrom(unbundle(JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'))));
  }));
  ipcMain.handle('backup-folder', () => { fs.mkdirSync(root(), { recursive: true }); shell.openPath(root()); return true; });
}

module.exports = { register, changed, restoring: () => restoring };
