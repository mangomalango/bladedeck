'use strict';
/* Downloads from Bladedeck's own browser: the browser panel, web apps, and Browse your sources.
   Every download is caught here instead of a save dialog: it goes to Downloads (or, for a game
   installed from Browse, to ~/Games/ROMs/Downloaded, which the library watches), and its progress
   goes to the page for the download bar, the notification center and the guide's quick menu.
   A finished archive installed from Browse is unpacked next to itself and the archive goes to the
   trash, so the game inside joins the library. Downloads use the browser's own session, so sites
   you signed in to (the Internet Archive) let you download what they let you download. */
const { app, ipcMain, session, Notification, shell } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let send = () => {};
const items = new Map(); // id -> { rec, item }
const expect = new Map(); // url -> { dir, unpack, title }
const ARCHIVE = /\.(zip|7z|rar)$/i;
const romsDir = () => path.join(os.homedir(), 'Games', 'ROMs', 'Downloaded');

const clean = (n) => String(n || 'download').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/^\.+/, '').slice(0, 180) || 'download';
function uniq(dir, name) {
  let f = path.join(dir, name), i = 1;
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  while (fs.existsSync(f)) f = path.join(dir, `${base} (${i++})${ext}`);
  return f;
}
const pub = (r) => ({ id: r.id, name: r.name, file: r.file, dir: path.dirname(r.file), total: r.total, got: r.got, state: r.state, paused: r.paused, speed: r.speed, from: r.from, at: r.at, unpacked: r.unpacked || '', title: r.title || '', note: r.note || '' });
let last = 0, pending = false;
function tell(now) {
  if (!now && Date.now() - last < 250) { if (!pending) { pending = true; setTimeout(() => { pending = false; tell(true); }, 260); } return; }
  last = Date.now();
  send('web-dl', [...items.values()].map((x) => pub(x.rec)));
}

function unpack(rec) {
  const dir = path.dirname(rec.file);
  const dest = uniq(dir, clean(path.basename(rec.file).replace(ARCHIVE, '')));
  rec.state = 'unpacking'; tell(true);
  fs.mkdirSync(dest, { recursive: true });
  const finish = async (err) => {
    if (err) { rec.state = 'completed'; rec.note = 'Could not unpack it; the archive is kept.'; try { fs.rmdirSync(dest); } catch { /* not empty */ } tell(true); send('web-dl-done', pub(rec)); return; }
    rec.unpacked = dest; rec.state = 'completed';
    try { await shell.trashItem(rec.file); } catch { /* keep it */ }
    tell(true);
    send('web-dl-done', pub(rec));
  };
  const z7 = process.platform === 'win32' ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', '7-Zip', '7z.exe'), '7z.exe'].find((p) => { try { fs.accessSync(p); return true; } catch { return false; } }) || '7z' : '7z';
  execFile(z7, ['x', '-y', `-o${dest}`, rec.file], { timeout: 3600000, maxBuffer: 1 << 24 }, (err) => {
    if (err && /\.zip$/i.test(rec.file)) execFile('tar', ['-xf', rec.file, '-C', dest], { timeout: 3600000 }, (tErr) => finish(tErr));
    else finish(err);
  });
}

function attach(ses) {
  if (ses.__bladedeckDl) return; ses.__bladedeckDl = true;
  ses.on('will-download', (_e, item, wc) => {
    const pageUrl = wc?.getURL?.() || '';
    const chain = [item.getURL(), ...(item.getURLChain?.() || []), ...(pageUrl ? [pageUrl] : [])];
    const want = chain.map((u) => expect.get(u)).find(Boolean);
    chain.forEach((u) => expect.delete(u));
    const dir = want?.dir || app.getPath('downloads');
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* the save fails and says so */ }
    const file = uniq(dir, clean(item.getFilename()));
    item.setSavePath(file);
    let from = ''; try { from = new URL(pageUrl || item.getURL()).hostname.replace(/^www\./, ''); } catch { /* none */ }
    const rec = { id: Math.random().toString(36).slice(2, 10), name: path.basename(file), file, total: item.getTotalBytes(), got: 0, state: 'progressing', paused: false, speed: 0, from, at: Date.now(), unpack: !!want?.unpack, title: want?.title || '' };
    items.set(rec.id, { rec, item });
    let t0 = Date.now(), g0 = 0;
    tell(true);
    send('web-dl-start', pub(rec));
    item.on('updated', (_ev, state) => {
      rec.got = item.getReceivedBytes(); rec.total = item.getTotalBytes(); rec.paused = item.isPaused(); rec.state = state === 'interrupted' ? 'interrupted' : 'progressing';
      const dt = (Date.now() - t0) / 1000; if (dt >= 1) { rec.speed = Math.max(0, Math.round((rec.got - g0) / dt)); t0 = Date.now(); g0 = rec.got; }
      tell();
    });
    item.once('done', (_ev, state) => {
      rec.got = item.getReceivedBytes(); rec.state = state; rec.speed = 0;
      items.set(rec.id, { rec, item: null });
      if (state === 'completed') {
        if (Notification.isSupported()) new Notification({ title: 'Download finished', body: `${rec.name}${rec.from ? ` · ${rec.from}` : ''}`, silent: true }).show();
        if (rec.unpack && ARCHIVE.test(rec.file)) { rec.state = 'unpacking'; send('web-dl-done', pub(rec)); unpack(rec); return; }
        send('web-dl-done', pub(rec));
      }
      tell(true);
    });
  });
}

function register({ getWin }) {
  send = (ch, d) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, d); const p2 = require('./players').p2(); if (p2 && !p2.isDestroyed()) p2.webContents.send(ch, d); };
  app.whenReady().then(() => { attach(session.fromPartition('persist:webapps')); attach(session.defaultSession); });
  ipcMain.handle('web-dl-list', () => [...items.values()].map((x) => pub(x.rec)));
  // Download one file now, through the browser's session. kind 'game' installs it for the library.
  ipcMain.handle('web-dl-start', (_e, { url, kind = '', title = '' } = {}) => {
    let u; try { u = new URL(String(url)); } catch { return { ok: false, error: 'That is not a web address.' }; }
    if (!/^https?:$/.test(u.protocol)) return { ok: false, error: 'Only web downloads.' };
    if (kind === 'game') expect.set(u.href, { dir: romsDir(), unpack: true, title: String(title).slice(0, 120) });
    session.fromPartition('persist:webapps').downloadURL(u.href);
    return { ok: true, dir: kind === 'game' ? romsDir() : app.getPath('downloads') };
  });
  // The next download that comes from this address (a link clicked on a page) is installed as a game.
  ipcMain.handle('web-dl-expect', (_e, { url, title = '' } = {}) => { try { expect.set(new URL(String(url)).href, { dir: romsDir(), unpack: true, title: String(title).slice(0, 120) }); return true; } catch { return false; } });
  ipcMain.handle('web-dl-act', (_e, id, act) => {
    const x = items.get(String(id)); if (!x) return false;
    const { rec, item } = x;
    if (act === 'pause' && item) { item.pause(); rec.paused = true; }
    else if (act === 'resume' && item) { if (item.canResume()) item.resume(); rec.paused = false; }
    else if (act === 'cancel' && item) item.cancel();
    else if (act === 'open' && rec.state === 'completed') shell.openPath(rec.unpacked || rec.file);
    else if (act === 'forget' && !item) items.delete(rec.id);
    tell(true); return true;
  });
  ipcMain.handle('web-dl-roms', () => romsDir());
}

module.exports = { register };
