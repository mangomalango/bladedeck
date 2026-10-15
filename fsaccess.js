'use strict';
/* File access: by default Bladedeck only touches its own folder, ~/Bladedeck (Mods, From phone,
   To phone inside it). Any other folder has to be allowed on purpose: a confirmation drawn by the
   system (not by the page, so nothing in the page can click it for you), then the folder picker.
   Allowed folders are kept in fs-grants.json and can be taken back from the Files panel.
   Every file call from the page (Files, Cheats & mods, phone transfers) is checked here, after
   following links, so a shortcut inside an allowed folder cannot lead outside it.
   A few places are allowed for this run only, because Bladedeck itself worked them out: the
   cheat and mod folders of an emulator you opened Cheats & mods for, and files you picked
   yourself in the system's file picker. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ipcMain, dialog, shell, app } = require('electron');

const ROOT = path.join(os.homedir(), 'Bladedeck');
const SUB = { mods: 'Mods', fromPhone: 'From phone', toPhone: 'To phone', fromFriends: 'From friends', shared: 'Shared games' };
let grantsFile = '', grants = [], getWin = () => null, getLib = () => ({ entries: [] });
const session = new Set(), picked = new Set();

const dir = (k) => path.join(ROOT, SUB[k] || '');
function ensure() { for (const k of Object.keys(SUB)) { try { fs.mkdirSync(dir(k), { recursive: true }); } catch { /* read-only home */ } } }
function load() { try { grants = JSON.parse(fs.readFileSync(grantsFile, 'utf8')).filter((g) => g && typeof g.path === 'string'); } catch { grants = []; } }
function persist() { try { fs.writeFileSync(grantsFile, JSON.stringify(grants, null, 2)); } catch { /* optional */ } }

// The real place a path points to (links followed); for a path that does not exist yet, its nearest existing parent.
function real(p) {
  let cur = path.resolve(String(p || '')), rest = '';
  for (;;) {
    try { return path.join(fs.realpathSync.native(cur), rest); } catch { /* not there yet */ }
    const up = path.dirname(cur); if (up === cur) return path.resolve(String(p));
    rest = path.join(path.basename(cur), rest); cur = up;
  }
}
const inside = (p, root) => { const r = real(root), q = real(p); const rel = path.relative(r, q); return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !rel.startsWith('../') && !path.isAbsolute(rel)); };
const roots = () => [ROOT, ...grants.map((g) => g.path), ...session];
function allowed(p) { return !!p && roots().some((r) => inside(p, r)); }
function rootOf(p) { return roots().filter((r) => inside(p, r)).sort((a, b) => b.length - a.length)[0] || null; }

// Allow a folder for this run only (worked out by Bladedeck itself, never sent by the page).
const allowForSession = (p) => { if (p) session.add(path.resolve(p)); };
const allowPicked = (p) => { if (p) picked.add(real(p)); };
const wasPicked = (p) => picked.has(real(p));

async function grant() {
  const w = getWin();
  const ask = await dialog.showMessageBox(w, {
    type: 'warning', buttons: ['Cancel', 'Choose a folder…'], defaultId: 0, cancelId: 0, noLink: true,
    title: 'Allow another folder?',
    message: 'Let Bladedeck see another folder?',
    detail: `Right now Bladedeck only uses its own folder (${ROOT}). If you allow another folder, the Files panel can show and open everything in it, and in the folders inside it. You can take this back in Files at any time.`
  });
  if (ask.response !== 1) return { ok: false };
  const r = await dialog.showOpenDialog(w, { title: 'Folder Bladedeck may use', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const p = real(r.filePaths[0]);
  // Very wide folders get a second, plainer warning.
  const wide = p === path.parse(p).root || p === real(os.homedir());
  if (wide) {
    const sure = await dialog.showMessageBox(w, { type: 'warning', buttons: ['Cancel', 'Allow it anyway'], defaultId: 0, cancelId: 0, noLink: true, title: 'That is a lot',
      message: p === path.parse(p).root ? 'That is your whole drive.' : 'That is your whole home folder.',
      detail: 'Everything in it, including your documents and settings of other apps, would be visible in Bladedeck. A smaller folder is safer. Are you sure?' });
    if (sure.response !== 1) return { ok: false };
  }
  if (!grants.some((g) => g.path === p)) { grants.push({ path: p, at: Date.now() }); persist(); }
  return { ok: true, path: p };
}

// One folder Bladedeck names itself (where downloads go): the same system-drawn question, for
// that folder only, with why it is asked.
async function allowFolder(p0, why) {
  const p = real(p0);
  if (allowed(p)) return { ok: true, path: p };
  if (p === path.parse(p).root || p === real(os.homedir())) return { ok: false, error: 'That is a whole drive or your whole home folder. Pick a smaller folder for downloads (Change folder…).' };
  const ask = await dialog.showMessageBox(getWin(), {
    type: 'question', buttons: ['Not now', 'Let Bladedeck see it'], defaultId: 1, cancelId: 0, noLink: true,
    title: 'Let Bladedeck see this folder?', message: `Let Bladedeck see ${p}?`,
    detail: `${why} The Files panel could then show and open everything in it. You can take this back in Files at any time.`
  });
  if (ask.response !== 1) return { ok: false };
  if (!grants.some((g) => g.path === p)) { grants.push({ path: p, at: Date.now() }); persist(); }
  return { ok: true, path: p };
}
// A folder you picked yourself in the system's folder picker for a job (where downloads go) is
// allowed with it: picking it there was the choice. Not a whole drive or the whole home folder.
function grantPickedFolder(p0) {
  const p = real(p0);
  if (p === path.parse(p).root || p === real(os.homedir()) || allowed(p)) return allowed(p);
  grants.push({ path: p, at: Date.now() }); persist();
  return true;
}

// What sharing a game copies, worked out from the library on disk: a ROM is its file (a .cue or
// .m3u with the tracks it names, from its own folder); a PC game is the folder its program is in,
// unless that folder holds more than one game (home, Desktop, Program Files, a drive's root...).
const BROAD = () => [os.homedir(), ROOT, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.SystemRoot,
  ...['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos', 'Games', 'Applications'].map((n) => path.join(os.homedir(), n))].filter(Boolean).map(real);
function tooBroad(d) { const r = real(d); return path.parse(r).root === r || BROAD().includes(r) || inside(r, ROOT); }
function gameSource(e) {
  if (!e || !['rom', 'exe', 'gog', 'recomp'].includes(e.type)) return null;
  const f = e.type === 'rom' ? e.rom : e.exe;
  if (!f || typeof f !== 'string') return null;
  const file = path.resolve(f);
  try { if (!fs.lstatSync(file).isFile()) return null; } catch { return null; }
  if (e.type !== 'rom') { const d = path.dirname(file); return tooBroad(d) ? null : { file, dir: d }; }
  const files = [file];
  if (/\.(cue|m3u)$/i.test(file)) {
    let text = ''; try { text = fs.readFileSync(file, 'utf8'); } catch { /* just the sheet */ }
    const names = /\.cue$/i.test(file) ? [...text.matchAll(/^\s*FILE\s+"([^"]+)"/gim)].map((m) => m[1]) : text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
    for (const n of names) { const t = path.join(path.dirname(file), path.basename(n.trim())); try { if (fs.lstatSync(t).isFile() && !files.includes(t)) files.push(t); } catch { /* missing track */ } }
  }
  return { file, dir: null, files };
}
const notLink = (p) => { try { return !fs.lstatSync(p).isSymbolicLink(); } catch { return false; } };
function sizeOf(src) {
  if (!src.dir) return src.files.reduce((n, f) => n + (fs.statSync(f).size || 0), 0);
  let n = 0; const walk = (d) => { for (const x of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, x.name); if (x.isSymbolicLink()) continue; if (x.isDirectory()) walk(p); else if (x.isFile()) n += fs.statSync(p).size; } };
  try { walk(src.dir); } catch { /* partly unreadable */ }
  return n;
}
const fmt = (n) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const safeName = (t) => String(t || 'game').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^[. ]+|[. ]+$/g, '').trim().slice(0, 80) || 'game';
function uniqName(d, name) {
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  let n = name; for (let i = 2; fs.existsSync(path.join(d, n)); i++) n = `${stem} (${i})${ext}`;
  return n;
}

function register({ getWin: gw, getLib: gl }) {
  getWin = gw; if (gl) getLib = gl;
  grantsFile = path.join(app.getPath('userData'), 'fs-grants.json');
  load(); ensure();

  ipcMain.handle('fs-places', () => {
    ensure();
    return [
      { icon: '🗃️', name: 'Bladedeck', path: ROOT, own: true },
      { icon: '🧩', name: 'Mods', path: dir('mods'), own: true },
      { icon: '📲', name: 'From phone', path: dir('fromPhone'), own: true },
      { icon: '📤', name: 'To phone', path: dir('toPhone'), own: true },
      { icon: '🤝', name: 'From friends', path: dir('fromFriends'), own: true },
      { icon: '🎁', name: 'Shared games', path: dir('shared'), own: true },
      ...grants.filter((g) => fs.existsSync(g.path)).map((g) => ({ icon: '📁', name: path.basename(g.path) || g.path, path: g.path, granted: true }))
    ];
  });
  ipcMain.handle('fs-list', (_e, d0) => {
    const d = path.resolve(String(d0 || ROOT));
    if (!allowed(d)) return { dir: d, error: 'Bladedeck is not allowed to look in this folder. Use "Allow a folder…" if you want it to.', items: [], parent: null, locked: true };
    let items; try { items = fs.readdirSync(d, { withFileTypes: true }); } catch (err) { return { dir: d, error: err.code === 'EACCES' ? 'You do not have access to this folder.' : 'This folder could not be opened.', items: [] }; }
    const out = [];
    for (const it of items) {
      if (it.name.startsWith('.')) continue;
      const full = path.join(d, it.name);
      if (!allowed(full)) continue; // a link that leads outside
      let st; try { st = fs.statSync(full); } catch { continue; }
      out.push({ name: it.name, path: full, dir: st.isDirectory(), size: st.size, at: st.mtimeMs });
    }
    out.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    const root = rootOf(d), up = path.dirname(d);
    return { dir: d, parent: root && real(d) !== real(root) && up !== d ? up : null, items: out.slice(0, 2000) };
  });
  ipcMain.handle('fs-reveal', (_e, p) => { const f = path.resolve(String(p)); if (!allowed(f)) return false; shell.showItemInFolder(f); return true; });
  ipcMain.handle('fs-open', async (_e, p) => { const f = path.resolve(String(p)); if (!allowed(f)) return false; return !(await shell.openPath(f)); });
  ipcMain.handle('fs-grant', () => grant());
  ipcMain.handle('fs-revoke', (_e, p) => { const n = grants.length; grants = grants.filter((g) => g.path !== String(p)); persist(); return grants.length < n; });
  // Send to phone: a copy goes into Bladedeck/To phone, where paired phones can download it.
  ipcMain.handle('xfer-to-phone', (_e, f) => {
    const src = path.resolve(String(f || ''));
    if (!(allowed(src) || wasPicked(src)) || !fs.existsSync(src) || !fs.statSync(src).isFile()) return { ok: false, error: 'That file is not available.' };
    ensure();
    const ext = path.extname(src), stem = path.basename(src, ext);
    let to = path.join(dir('toPhone'), path.basename(src));
    if (real(src) === real(to)) return { ok: true, name: path.basename(to) };
    for (let i = 2; fs.existsSync(to); i++) to = path.join(dir('toPhone'), `${stem} (${i})${ext}`);
    try { fs.copyFileSync(src, to); return { ok: true, name: path.basename(to) }; } catch (err) { return { ok: false, error: String(err.message || err) }; }
  });
  ipcMain.handle('xfer-phone-list', () => { ensure(); try { return fs.readdirSync(dir('toPhone'), { withFileTypes: true }).filter((d) => d.isFile() && !d.name.startsWith('.')).map((d) => ({ name: d.name, size: fs.statSync(path.join(dir('toPhone'), d.name)).size })); } catch { return []; } });
  ipcMain.handle('xfer-unshare', (_e, name) => { const f = path.join(dir('toPhone'), path.basename(String(name))); if (!inside(f, dir('toPhone')) || real(f) === real(dir('toPhone'))) return false; try { fs.rmSync(f); return true; } catch { return false; } });
  /* Shared games: the pool. Bladedeck can see every game in the library (the storage map only reads
     sizes), but nothing of a game leaves this PC until the owner copies it into Bladedeck/Shared
     games, after a Windows/desktop confirmation the page cannot press for them. Only the pool is
     packed or sent; the original stays where it is. The page names a game by its library id, and
     the file comes from the library on disk, never from the page. ROM sync is separate (romsync.js). */
  ipcMain.handle('xfer-prep-game', async (_e, id) => {
    const e = (getLib().entries || []).find((x) => x && x.id === String(id || ''));
    const src = gameSource(e);
    if (!src) return { ok: false, error: e ? 'Bladedeck can only share a game whose file is in its own game folder, not a folder like Desktop or Program Files.' : 'That game is not in your library.' };
    const from = src.dir || src.file, size = sizeOf(src);
    const w = getWin();
    const { response } = await dialog.showMessageBox(w && !w.isDestroyed() ? w : undefined, {
      type: 'question', buttons: ['Cancel', 'Copy to Shared games'], defaultId: 0, cancelId: 0, noLink: true,
      title: 'Share this game?', message: `Copy ${e.title} into Shared games?`,
      detail: `From: ${from}\nSize: ${fmt(size)}\n\nOnly what is in Bladedeck${path.sep}Shared games can be sent to your phone or a friend, and only when you send it. The original stays where it is.`
    });
    if (response !== 1) return { ok: false, cancelled: true, error: 'Not shared.' };
    ensure();
    // One file stays one file in the pool; a game folder, or a disc with its tracks, becomes a folder.
    const single = !src.dir && src.files.length === 1;
    const name = uniqName(dir('shared'), safeName(e.title) + (single ? path.extname(src.file) : ''));
    const to = path.join(dir('shared'), name);
    try {
      if (src.dir) await fs.promises.cp(src.dir, to, { recursive: true, errorOnExist: true, filter: notLink });
      else if (single) await fs.promises.copyFile(src.file, to, fs.constants.COPYFILE_EXCL);
      else { fs.mkdirSync(to); for (const f of src.files) await fs.promises.copyFile(f, path.join(to, path.basename(f)), fs.constants.COPYFILE_EXCL); }
    } catch (err) { try { fs.rmSync(to, { recursive: true, force: true }); } catch { /* left behind */ } return { ok: false, error: `The copy did not finish: ${err.message || err}` }; }
    return { ok: true, path: to, name, isDir: !single };
  });
  ipcMain.handle('xfer-pool-list', () => { ensure(); try { return fs.readdirSync(dir('shared'), { withFileTypes: true }).filter((d) => !d.name.startsWith('.')).map((d) => ({ name: d.name, isDir: d.isDirectory() })); } catch { return []; } });
  ipcMain.handle('xfer-pool-remove', (_e, name) => {
    const f = path.join(dir('shared'), path.basename(String(name || '')));
    if (!inside(f, dir('shared')) || real(f) === real(dir('shared'))) return false;
    try { fs.rmSync(f, { recursive: true, force: true }); return true; } catch { return false; }
  });
  // A game folder in the pool, packed into one .zip in To phone so a phone or friend gets it whole.
  ipcMain.handle('xfer-pack-game', async (_e, name) => {
    const d = path.join(dir('shared'), path.basename(String(name || '')));
    if (!inside(d, dir('shared')) || real(d) === real(dir('shared')) || !fs.existsSync(d) || !fs.statSync(d).isDirectory()) return { ok: false, error: 'Only a game in Shared games can be packed.' };
    const bin = require('./archive').bin(); if (!bin) return { ok: false, error: 'Packing needs 7-Zip.' };
    ensure();
    const out = path.join(dir('toPhone'), uniqName(dir('toPhone'), `${path.basename(d)}.zip`));
    const ok = await new Promise((res) => {
      // -snl stores links as links, so a link inside the folder can never pull in a file from outside it.
      const p = require('child_process').spawn(bin, ['a', '-tzip', '-y', '-snl', out, path.basename(d)], { cwd: dir('shared'), windowsHide: true, stdio: 'ignore' });
      p.on('close', (c) => res(c === 0 || c === 1)); p.on('error', () => res(false));
    });
    if (!ok || !fs.existsSync(out)) { try { fs.rmSync(out, { force: true }); } catch { /* none */ } return { ok: false, error: 'It could not be packed.' }; }
    return { ok: true, path: out, name: path.basename(out), size: fs.statSync(out).size };
  });
  ipcMain.handle('fs-root', () => ({ root: ROOT, mods: dir('mods'), fromPhone: dir('fromPhone'), toPhone: dir('toPhone') }));
}

module.exports = { register, allowFolder, grantPickedFolder, allowed, allowForSession, allowPicked, wasPicked, real, inside, dir, ROOT, ensure };
