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
const GAMES = path.join(os.homedir(), 'Games');
const SUB = { mods: 'Mods', fromPhone: 'From phone', toPhone: 'To phone', fromFriends: 'From friends' };
let grantsFile = '', grants = [], getWin = () => null;
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
const inside = (p, root) => { const r = real(root), q = real(p); const rel = path.relative(r, q); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
const roots = () => [ROOT, ...(fs.existsSync(GAMES) ? [GAMES] : []), ...grants.map((g) => g.path), ...session];
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

function register({ getWin: gw }) {
  getWin = gw;
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
  ipcMain.handle('xfer-prep-game', async (_e, g) => {
    if (!g) return { ok: false, error: 'No game chosen.' };
    ensure();
    let target = '';
    if (g.type === 'rom' && g.rom) target = g.rom;
    else if (g.type === 'recomp' && g.exe) target = g.exe;
    else if (g.exe) target = g.exe;
    if (!target) return { ok: false, error: 'This game has no file set.' };

    const resolved = path.resolve(target);
    if (!fs.existsSync(resolved)) return { ok: false, error: 'The game file was not found on disk.' };
    allowForSession(resolved);
    allowForSession(path.dirname(resolved));

    const st = fs.statSync(resolved);
    if (st.isFile()) {
      return { ok: true, path: resolved, name: path.basename(resolved), size: st.size, isDir: false };
    }
    return { ok: true, path: resolved, name: path.basename(resolved), size: 0, isDir: true };
  });
  ipcMain.handle('xfer-pack-game', async (_e, dirPath, title) => {
    const d = path.resolve(String(dirPath || ''));
    if (!allowed(d) || !fs.existsSync(d)) return { ok: false, error: 'Folder not available.' };
    ensure();
    const safeTitle = (String(title || path.basename(d))).replace(/[^\w .()'-]/g, '_').trim() || 'game';
    const outDir = dir('toPhone');
    let out = path.join(outDir, `${safeTitle}.zip`);
    for (let i = 2; fs.existsSync(out); i++) out = path.join(outDir, `${safeTitle} (${i}).zip`);
    try {
      const arch = require('./archive');
      const bin = arch.bin ? arch.bin() : null;
      if (bin) {
        const { spawn } = require('child_process');
        await new Promise((res, rej) => {
          const p = spawn(bin, ['a', '-tzip', '-y', out, path.basename(d)], { cwd: path.dirname(d), windowsHide: true });
          p.on('close', (c) => c === 0 ? res() : rej(new Error('Zip failed')));
          p.on('error', rej);
        });
        if (fs.existsSync(out)) {
          allowForSession(out);
          return { ok: true, path: out, name: path.basename(out), size: fs.statSync(out).size };
        }
      }
    } catch { /* skip */ }
    return { ok: false, error: 'Could not pack folder into .zip. 7-Zip is needed.' };
  });
  ipcMain.handle('fs-root', () => ({ root: ROOT, mods: dir('mods'), fromPhone: dir('fromPhone'), toPhone: dir('toPhone') }));
}

module.exports = { register, allowFolder, grantPickedFolder, allowed, allowForSession, allowPicked, wasPicked, real, inside, dir, ROOT, ensure };
