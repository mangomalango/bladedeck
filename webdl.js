'use strict';
/* Downloads from Bladedeck's own browser: the browser panel, web apps, and Browse your sources.
   Every download is caught here instead of a save dialog: it goes to Downloads (or, for a game
   installed from Browse, to ~/Games/ROMs/Downloaded, which the library watches), and its progress
   goes to the page for the download bar, the notification center and the guide's quick menu.
   A finished archive installed from Browse is unpacked next to itself and the archive goes to the
   trash, so the game inside joins the library. Downloads use the browser's own session, so sites
   you signed in to (the Internet Archive) let you download what they let you download.
   Both folders can be changed (Downloads window, Where downloads go); a folder picked there may
   be used by Files too. Each download says what kind of file it is and where it went, and a
   finished archive can be extracted with 7-Zip (archive.js). */
const { app, ipcMain, session, Notification, shell, dialog } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let send = () => {};
const items = new Map(); // id -> { rec, item }
const expect = new Map(); // url -> { dir, unpack, title }
const ARCHIVE = /\.(zip|7z|rar)$/i;
let settings = () => ({});
const chosen = {}; // folders picked this run, before the library is saved
const romsDir = () => chosen.games || settings().gamesDir || path.join(os.homedir(), 'Games', 'ROMs', 'Downloaded');
const dlDir = () => chosen.dl || settings().dlDir || app.getPath('downloads');
// What a file is, from its name, in a word the download list can show.
const KINDS = [
  [/\.(iso|chd|cso|rvz|wbfs|gcz|wua|wux|nsp|xci|cue|bin|pbp|m3u|wad|xex|vpk)$/i, 'Disc image', '💿'],
  [/\.(nds|3ds|cia|gba|gbc|gb|nes|sfc|smc|n64|z64|v64|md|gen|sms|gg|pce|a26|lnx|ws|wsc|ngp)$/i, 'Game cartridge', '👾'],
  [/\.(zip|7z|rar|tar|tgz|gz|xz|bz2|zst)$/i, 'Archive', '🗜️'],
  [/\.(exe|msi|appimage|deb|rpm|flatpakref|apk|sh|run|pkg\.tar\.zst)$/i, 'Program', '⚙️'],
  [/\.(mp4|mkv|webm|mov|avi)$/i, 'Video', '🎬'], [/\.(mp3|flac|ogg|opus|m4a|wav)$/i, 'Music', '🎵'],
  [/\.(png|jpe?g|gif|webp|avif|bmp)$/i, 'Picture', '🖼️'], [/\.(pdf|txt|docx?|odt|epub|md)$/i, 'Document', '📄']
];
const kindOf = (name) => { const k = KINDS.find(([re]) => re.test(name)); return k ? { label: k[1], icon: k[2] } : { label: 'File', icon: '📄' }; };

const clean = (n) => String(n || 'download').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/^\.+/, '').slice(0, 180) || 'download';
function uniq(dir, name) {
  let f = path.join(dir, name), i = 1;
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  while (fs.existsSync(f)) f = path.join(dir, `${base} (${i++})${ext}`);
  return f;
}
const pub = (r) => ({ id: r.id, name: r.name, file: r.file, dir: path.dirname(r.file), what: r.game ? { label: `Game for your library (${kindOf(r.name).label.toLowerCase()})`, icon: '🎮' } : kindOf(r.name), archive: ARCHIVE.test(r.name), game: !!r.game, total: r.total, got: r.got, state: r.state, paused: r.paused, speed: r.speed, from: r.from, at: r.at, unpacked: r.unpacked || '', title: r.title || '', note: r.note || '' });
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
  execFile(require('./archive').bin() || '7z', ['x', '-y', `-o${dest}`, rec.file], { timeout: 3600000, maxBuffer: 1 << 24 }, (err) => {
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
    const dir = want?.dir || dlDir();
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* the save fails and says so */ }
    const file = uniq(dir, clean(item.getFilename()));
    item.setSavePath(file);
    let from = ''; try { from = new URL(pageUrl || item.getURL()).hostname.replace(/^www\./, ''); } catch { /* none */ }
    const rec = { id: Math.random().toString(36).slice(2, 10), name: path.basename(file), file, total: item.getTotalBytes(), got: 0, state: 'progressing', paused: false, speed: 0, from, at: Date.now(), unpack: !!want?.unpack, game: !!want?.unpack, title: want?.title || '' };
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

function register({ getWin, getSettings }) {
  settings = getSettings || settings;
  send = (ch, d) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, d); const p2 = require('./players').p2(); if (p2 && !p2.isDestroyed()) p2.webContents.send(ch, d); };
  app.whenReady().then(() => { attach(session.fromPartition('persist:webapps')); attach(session.defaultSession); });
  ipcMain.handle('web-dl-list', () => [...items.values()].map((x) => pub(x.rec)));
  // Download one file now, through the browser's session. kind 'game' installs it for the library.
  ipcMain.handle('web-dl-start', (_e, { url, kind = '', title = '' } = {}) => {
    let u; try { u = new URL(String(url)); } catch { return { ok: false, error: 'That is not a web address.' }; }
    if (!/^https?:$/.test(u.protocol)) return { ok: false, error: 'Only web downloads.' };
    if (kind === 'game') expect.set(u.href, { dir: romsDir(), unpack: true, title: String(title).slice(0, 120) });
    session.fromPartition('persist:webapps').downloadURL(u.href);
    return { ok: true, dir: kind === 'game' ? romsDir() : dlDir() };
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
    // Show it in the system's own file manager (Dolphin, Explorer), which needs no folder allowed.
    else if (act === 'reveal' && rec.state === 'completed') { if (rec.unpacked) shell.openPath(rec.unpacked); else shell.showItemInFolder(rec.file); }
    else if (act === 'extract' && rec.state === 'completed' && !rec.unpacked && ARCHIVE.test(rec.file) && fs.existsSync(rec.file)) {
      rec.state = 'unpacking'; rec.note = ''; tell(true);
      require('./archive').extract(rec.file, rec.id).then((r) => { rec.state = 'completed'; if (r.ok) rec.unpacked = r.out; else rec.note = r.error; tell(true); send('web-dl-done', pub(rec)); });
    }
    else if (act === 'forget' && !item) items.delete(rec.id);
    tell(true); return true;
  });
  ipcMain.handle('web-dl-roms', () => romsDir());
  // Where downloads go, and whether Bladedeck's Files may look there.
  const FA = require('./fsaccess');
  const folders = () => ({ dl: dlDir(), games: romsDir(), dlOk: FA.allowed(dlDir()), gamesOk: FA.allowed(romsDir()), z7: !!require('./archive').bin(), z7Install: process.platform === 'win32' ? 'winget install 7zip.7zip' : 'sudo pacman -S 7zip' });
  ipcMain.handle('web-dl-folders', () => folders());
  ipcMain.handle('web-dl-pick', async (_e, which) => {
    const key = which === 'games' ? 'games' : 'dl';
    const r = await dialog.showOpenDialog(getWin(), { title: key === 'games' ? 'Folder for games installed from Browse' : 'Folder for downloads', defaultPath: key === 'games' ? romsDir() : dlDir(), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, ...folders() };
    chosen[key] = r.filePaths[0];
    FA.grantPickedFolder(r.filePaths[0]);
    return { ok: true, path: r.filePaths[0], ...folders() };
  });
  ipcMain.handle('web-dl-allow', async (_e, which) => {
    const games = which === 'games', d = games ? romsDir() : dlDir();
    try { fs.mkdirSync(d, { recursive: true }); } catch { /* the question still makes sense */ }
    const r = await FA.allowFolder(d, games ? 'Games you install from Browse your sources land here.' : 'Files you download in Bladedeck land here.');
    return { ...r, ...folders() };
  });
}

module.exports = { register };
