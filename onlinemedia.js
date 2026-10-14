'use strict';
/* Online clips and music: for a game with nothing of its own on this PC, a short gameplay clip
   (for the preview loop) and its music (for hover music), found on YouTube with yt-dlp and kept
   in a cache so each game is looked up once.
   - Clip: 30 seconds, 480p, no sound, from two minutes into a "<game> gameplay no commentary"
     video (past the intro). About 1 MB.
   - Music: up to four minutes of the audio from "<game> OST main theme". About 4 MB.
   One download at a time, paused while a game has the screen. Nothing found is remembered for
   two weeks; a lookup that failed (offline) is tried again after an hour. The cache (online-media/ in Bladedeck's folder) is kept under a size set in
   Settings; the least recently used go first. "Find another" skips to the next search result. */
const { ipcMain, app } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const KINDS = {
  clip: { query: (t) => `${t} gameplay no commentary`, args: ['--match-filters', 'duration>180', '-f', 'bv*[height<=480][vcodec^=avc1]/bv*[height<=480]', '--download-sections', '*120-150'] },
  music: { query: (t) => `${t} OST main theme`, args: ['--match-filters', 'duration>60 & duration<900', '-f', 'ba[acodec=opus]/ba', '--download-sections', '*0-240'] }
};
const NONE_DAYS = 14;
const SKIP = new Set(['app', 'stream']); // launchers, apps and remote desktops have no gameplay of their own

const root = () => path.join(app.getPath('userData'), 'online-media');
const indexFile = () => path.join(app.getPath('userData'), 'online-media.json');
let index = null, settings = () => ({}), paused = false, chain = Promise.resolve();
const busy = new Map();
const load = () => { if (!index) { try { index = JSON.parse(fs.readFileSync(indexFile(), 'utf8')); } catch { index = {}; } } return index; };
let saveT = 0;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.writeFileSync(indexFile(), JSON.stringify(index)); } catch { /* optional */ } }, 300); };

function ytdlp() {
  const names = process.platform === 'win32' ? ['yt-dlp.exe'] : ['yt-dlp'];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const n of names) { const p = path.join(dir, n); try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* keep looking */ } }
  }
  return null;
}

// What to search for: the game's name, and for emulated games the console, which tells apart
// games that share a name.
function title(e) {
  const t = String(e.title || '').replace(/\s*[[(][^\])]*[\])]/g, '').replace(/^Minecraft: .*/, 'Minecraft').trim();
  return e.type === 'rom' && e.system ? `${t} ${e.system}` : t;
}
const wanted = (e) => e && e.id && !e.emuApp && !SKIP.has(e.type) && title(e).length >= 2;

function download(e, kind, skip) {
  const exe = ytdlp(); if (!exe) return Promise.resolve(null);
  const dir = path.join(root(), kind); fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, String(e.id).replace(/[^\w-]/g, '_'));
  const args = ['-q', '--no-warnings', '--no-playlist', '--no-part', '--max-downloads', '1', '-I', `${skip + 1}:`, ...KINDS[kind].args,
    '-o', `${base}.%(ext)s`, '--force-overwrites', '--print', 'after_move:%(filepath)s\t%(title)s\t%(webpage_url)s', `ytsearch${skip + 4}:${KINDS[kind].query(title(e))}`];
  // yt-dlp exits with 101 after --max-downloads; what it printed is what counts.
  return new Promise((res) => execFile(exe, args, { timeout: 180000, maxBuffer: 1 << 20 }, (err, out) => {
    const [file, name, url] = String(out || '').trim().split('\n').pop().split('\t');
    if (file && fs.existsSync(file)) return res({ file, name: name || '', url: url || '' });
    // 0 or 101 (stopped after one) with nothing saved: no result fit. Anything else (offline,
    // YouTube refusing for a moment): try again later.
    res(err && err.code !== 101 ? { failed: true } : null);
  }));
}

function trim() {
  const cap = (settings().onlineCacheMB ?? 2048) * 1048576;
  const all = [];
  for (const [id, rec] of Object.entries(load())) for (const k of Object.keys(KINDS)) {
    const r = rec[k]; if (!r?.file) continue;
    let size = 0; try { size = fs.statSync(r.file).size; } catch { delete rec[k]; continue; }
    all.push({ id, k, file: r.file, size, used: r.used || r.t || 0 });
  }
  let total = all.reduce((n, x) => n + x.size, 0);
  for (const x of all.sort((a, b) => a.used - b.used)) {
    if (total <= cap) break;
    try { fs.unlinkSync(x.file); } catch { /* already gone */ }
    delete index[x.id][x.k]; total -= x.size;
  }
  save();
}

async function waitWhilePaused() { while (paused) await new Promise((r) => setTimeout(r, 2000)); }

// The cached file for a game, or a download queued behind the others.
function get(e, kind, { fresh = false } = {}) {
  if (!KINDS[kind] || !wanted(e) || settings().onlineMedia === false) return Promise.resolve(null);
  const rec = (load()[e.id] ||= {});
  const r = rec[kind];
  if (!fresh && r?.file && fs.existsSync(r.file)) { r.used = Date.now(); save(); return Promise.resolve(r.file); }
  if (!fresh && r?.none && Date.now() - r.t < (r.failed ? 36e5 : NONE_DAYS * 864e5)) return Promise.resolve(null);
  const key = `${e.id}/${kind}`;
  if (busy.has(key)) return busy.get(key);
  const skip = fresh ? (r?.skip || 0) + 1 : (r?.skip || 0);
  const job = (chain = chain.then(async () => {
    await waitWhilePaused();
    const res = await download(e, kind, skip).catch(() => ({ failed: true }));
    const got = res?.file ? res : null;
    // Another result that found nothing keeps the one already here.
    if (!got && r?.file && fs.existsSync(r.file)) return r.file;
    if (got && r?.file && got.file !== r.file) { try { fs.unlinkSync(r.file); } catch { /* gone */ } }
    rec[kind] = got ? { ...got, skip, t: Date.now(), used: Date.now() } : { none: true, failed: !!res?.failed, skip: fresh ? skip - 1 : skip, t: Date.now() };
    save(); if (got) trim();
    return got ? got.file : null;
  })).finally(() => busy.delete(key));
  busy.set(key, job);
  return job;
}

function stats() {
  let files = 0, bytes = 0;
  for (const rec of Object.values(load())) for (const k of Object.keys(KINDS)) {
    if (!rec[k]?.file) continue;
    try { bytes += fs.statSync(rec[k].file).size; files++; } catch { /* gone */ }
  }
  return { files, bytes, ytdlp: !!ytdlp(), queued: busy.size };
}

function register(getSettings) {
  settings = getSettings || settings;
  const lite = (e) => e && { id: e.id, type: e.type, title: e.title, system: e.system, emuApp: e.emuApp };
  ipcMain.handle('online-media', (_e, entry, kind) => get(lite(entry), kind).catch(() => null));
  // Another search result for this game (the one found was not the right game, or not liked).
  ipcMain.handle('online-media-another', (_e, entry, kind) => get(lite(entry), kind, { fresh: true }).catch(() => null));
  ipcMain.handle('online-media-info', (_e, id) => {
    const rec = load()[id] || {};
    return Object.fromEntries(Object.keys(KINDS).map((k) => [k, rec[k]?.file ? { name: rec[k].name, url: rec[k].url } : null]));
  });
  ipcMain.handle('online-media-stats', () => stats());
  // Every game in the library, one after another (from Settings).
  ipcMain.handle('online-media-all', (_e, entries = []) => {
    const list = entries.map(lite).filter(wanted);
    for (const e of list) for (const k of Object.keys(KINDS)) get(e, k);
    return list.length;
  });
  ipcMain.handle('online-media-pause', (_e, on) => { paused = !!on; return true; });
  ipcMain.handle('online-media-clear', () => {
    try { fs.rmSync(root(), { recursive: true, force: true }); } catch { /* nothing there */ }
    index = {}; save(); return true;
  });
}

module.exports = { register, get };
