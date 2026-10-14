'use strict';
/* Zip and unzip with 7-Zip: Extract here (into a new folder named after the archive, next to it,
   so nothing already there is overwritten) and Compress to .zip or .7z (the new archive next to
   what was packed). Used by Files and Downloads. Only files in folders Bladedeck may use
   (fsaccess.js) can be packed or unpacked, and what comes out lands in that same folder.
   7-Zip is 7z on Linux (the 7zip package) and 7z.exe on Windows (Program Files, or on PATH).
   Progress goes to the page as archive-progress, about every few percent. */
const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const FA = require('./fsaccess');

const ARCHIVE = /\.(zip|7z|rar|tar|tgz|tar\.gz|tar\.xz|tar\.bz2|gz|xz|bz2|zst|cab|iso)$/i;
let send = () => {};

function bin() {
  const names = process.platform === 'win32' ? ['7z.exe'] : ['7z', '7zz', '7za'];
  const extra = process.platform === 'win32' ? [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432].filter(Boolean).map((d) => path.join(d, '7-Zip')) : [];
  for (const dir of [...extra, ...(process.env.PATH || '').split(path.delimiter)]) {
    for (const n of names) { const p = path.join(dir, n); try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* keep looking */ } }
  }
  return null;
}
const install = () => (process.platform === 'win32' ? 'in a terminal: winget install 7zip.7zip' : 'on CachyOS or Arch: sudo pacman -S 7zip');

function uniq(dir, name, ext = '') {
  let f = path.join(dir, name + ext);
  for (let i = 2; fs.existsSync(f); i++) f = path.join(dir, `${name} (${i})${ext}`);
  return f;
}
const stem = (f) => path.basename(f).replace(/\.tar\.(gz|xz|bz2|zst)$/i, '').replace(/\.[^.]+$/, '') || 'archive';

// Runs 7-Zip, reporting progress (-bsp1 prints "  42% ..." as it goes).
function run(args, cwd, id, name, op) {
  return new Promise((resolve) => {
    const exe = bin(); if (!exe) return resolve({ ok: false, error: `7-Zip is not installed. Install it ${install()}.` });
    const p = spawn(exe, ['-bsp1', '-bso0', '-bse1', ...args], { cwd, windowsHide: true });
    let last = -10, err = '';
    const read = (b) => {
      const m = String(b).match(/(\d{1,3})%/g); if (!m) return;
      const pct = +m[m.length - 1].replace('%', '');
      if (pct >= last + 5 || pct === 100) { last = pct; send('archive-progress', { id, pct, name, op }); }
    };
    p.stdout.on('data', read);
    p.stderr.on('data', (b) => { err += b; read(b); });
    p.on('error', () => resolve({ ok: false, error: '7-Zip could not be started.' }));
    p.on('close', (code) => resolve(code === 0 || code === 1 ? { ok: true } : { ok: false, error: /Wrong password|encrypted/i.test(err) ? 'That archive has a password.' : /Can not open|not archive/i.test(err) ? 'That is not an archive 7-Zip can open.' : 'It did not finish. The original is untouched.' }));
  });
}

async function extract(file, id) {
  const dest = uniq(path.dirname(file), stem(file));
  fs.mkdirSync(dest, { recursive: true });
  const r = await run(['x', '-y', `-o${dest}`, file], path.dirname(file), id, path.basename(file), 'extract');
  if (!r.ok) { try { fs.rmSync(dest, { recursive: true, force: true }); } catch { /* left behind */ } return r; }
  // An archive that holds one folder: that folder, not "Game/Game".
  try {
    const inside = fs.readdirSync(dest);
    if (inside.length === 1 && fs.statSync(path.join(dest, inside[0])).isDirectory()) {
      const tmp = `${dest}.bd-move`; fs.renameSync(dest, tmp);
      const to = uniq(path.dirname(dest), inside[0]); fs.renameSync(path.join(tmp, inside[0]), to); fs.rmdirSync(tmp);
      return { ok: true, out: to };
    }
  } catch { /* leave it as it came out */ }
  return { ok: true, out: dest };
}

async function compress(target, fmt, id) {
  const ext = fmt === '7z' ? '.7z' : '.zip';
  const out = uniq(path.dirname(target), path.basename(target).replace(/\.[^.]+$/, '') || 'archive', ext);
  // Packed by name, from the folder it is in, so the archive holds "Game/..." and not the whole path.
  const r = await run(['a', fmt === '7z' ? '-t7z' : '-tzip', '-y', out, path.basename(target)], path.dirname(target), id, path.basename(target), 'compress');
  if (!r.ok) { try { fs.rmSync(out, { force: true }); } catch { /* none */ } return r; }
  return { ok: true, out };
}

function register({ getWin }) {
  send = (ch, d) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, d); };
  ipcMain.handle('archive-tool', () => ({ found: !!bin(), install: install() }));
  ipcMain.handle('archive-run', async (_e, { op, file, fmt } = {}) => {
    const f = path.resolve(String(file || ''));
    if (!FA.allowed(f) || !fs.existsSync(f)) return { ok: false, error: 'Bladedeck may not use that folder. Allow it in Files first.' };
    const id = Math.random().toString(36).slice(2, 9);
    if (op === 'extract') { if (!fs.statSync(f).isFile()) return { ok: false, error: 'That is a folder, not an archive.' }; return extract(f, id); }
    if (op === 'compress') return compress(f, fmt === '7z' ? '7z' : 'zip', id);
    return { ok: false, error: 'Unknown job.' };
  });
}

module.exports = { register, bin, extract, ARCHIVE };
