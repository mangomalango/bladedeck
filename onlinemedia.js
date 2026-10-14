'use strict';
/* Online clips and music: for a game with nothing of its own on this PC, a short gameplay clip
   (for the preview loop) and its music (for hover music), found on YouTube with yt-dlp and kept
   in a cache so each game is looked up once.
   - Clip: 30 seconds, 480p, no sound, from two minutes into a "<game> gameplay no commentary"
     video (past the intro). About 1 MB.
   - Music: up to four minutes of the audio from "<game> OST main theme". About 4 MB.
   One download at a time, paused while a game has the screen. Nothing found is remembered for
   two weeks; a lookup that failed (offline) is tried again after an hour. The cache (online-media/ in Bladedeck's folder) is kept under a size set in
   Settings; the least recently used go first. The search results are sorted first (score(): about
   this game, the right kind of video), and "Find another" takes the next one down that list. */
const { ipcMain, app } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const KINDS = {
  clip: { query: (t) => `${t} gameplay no commentary`, args: ['-f', 'bv*[height<=480][vcodec^=avc1]/bv*[height<=480]'],
    // Past the intro: two minutes in, or further into a long playthrough (its first minutes are cutscenes).
    section: (d) => { const at = d > 3600 ? 600 : d > 900 ? 240 : 120; return `*${at}-${at + 30}`; },
    fits: (d) => d > 180, good: /gameplay|walkthrough|playthrough|longplay|no commentary|let'?s play|full game|mission|level|chapter/i,
    bad: /trailer|teaser|review|reaction|react|tier list|ranking|top \d+|\bvs\.?\b|comparison|unboxing|news|explained|lore|speedrun|\bmods?\b|modded|tutorial|how to|#shorts|meme|funny|livestream|\blive\b|stream highlights|ost|soundtrack|music|remaster(ed)? fan|fan ?made|\bai\b|ending|all cutscenes|movie/i },
  music: { query: (t) => `${t} OST main theme`, args: ['-f', 'ba[acodec=opus]/ba'], section: () => '*0-240',
    fits: (d) => d > 60 && d < 5400, good: /\bost\b|soundtrack|main theme|title (theme|screen)|menu (music|theme)|theme song|opening/i,
    bad: /remix|cover|piano|guitar|reaction|lo-?fi|1 hours?|10 hours?|extended|trailer|gameplay|walkthrough|review|#shorts|tutorial|ai |mashup|meme|slowed|reverb|nightcore/i }
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
const bare = (e) => String(e.title || '').replace(/\s*[[(][^\])]*[\])]/g, '').replace(/^Minecraft: .*/, 'Minecraft').trim();
function title(e) { const t = bare(e); return e.type === 'rom' && e.system ? `${t} ${e.system}` : t; }
const wanted = (e) => e && e.id && !e.emuApp && !SKIP.has(e.type) && title(e).length >= 2;

/* Sorting the search results: the video has to be about this game (its name in the title, the
   sequel's number too, so "Left 4 Dead" is not taken for "Left 4 Dead 2"), long enough, not live,
   and the kind of video wanted: gameplay, not a trailer, review or reaction; a soundtrack, not a
   remix or a cover. YouTube's own order breaks ties. */
const words = (t) => String(t).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1 || /\d/.test(w));
const NUM = /^(\d+|ii|iii|iv|v|vi|vii|viii|ix|x)$/;
function score(c, game, kind) {
  const K = KINDS[kind], d = +c.duration || 0;
  if (!d || c.live === 'is_live' || c.live === 'is_upcoming' || !K.fits(d)) return -Infinity;
  const want = words(game), have = words(c.title);
  const hits = want.filter((w) => have.includes(w)).length;
  if (!want.length || hits / want.length < 0.6) return -Infinity;
  let s = 10 * hits / want.length;
  // The sequel's number has to be there, and a different one right after the name is another game.
  const nums = want.filter((w) => NUM.test(w));
  if (nums.some((n) => !have.includes(n))) s -= 12;
  if (!nums.length) { const at = have.indexOf(want[want.length - 1]); if (at >= 0 && NUM.test(have[at + 1] || '')) s -= 8; }
  if (K.good.test(c.title)) s += 4;
  if (K.bad.test(c.title)) s -= 8;
  return s - c.rank * 0.3;
}
function candidates(exe, e, kind) {
  const args = ['-q', '--no-warnings', '--flat-playlist', '--print', '%(id)s\t%(title)s\t%(duration)s\t%(live_status)s', `ytsearch12:${KINDS[kind].query(title(e))}`];
  return new Promise((res) => execFile(exe, args, { timeout: 60000, maxBuffer: 1 << 20 }, (err, out) => {
    if (err && !out) return res(null);
    const list = String(out || '').trim().split('\n').filter(Boolean).map((l, rank) => { const [id, t, duration, live] = l.split('\t'); return { id, title: t || '', duration: parseFloat(duration), live, rank }; });
    res(list.map((c) => ({ ...c, s: score(c, bare(e), kind) })).filter((c) => c.s > -Infinity && /^[\w-]{6,20}$/.test(c.id)).sort((a, b) => b.s - a.s));
  }));
}

async function download(e, kind, skip) {
  const exe = ytdlp(); if (!exe) return null;
  const list = await candidates(exe, e, kind);
  if (!list) return { failed: true };
  const c = list[skip]; if (!c) return null;
  const dir = path.join(root(), kind); fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, String(e.id).replace(/[^\w-]/g, '_'));
  const url = `https://www.youtube.com/watch?v=${c.id}`;
  const args = ['-q', '--no-warnings', '--no-playlist', '--no-part', ...KINDS[kind].args, '--download-sections', KINDS[kind].section(c.duration),
    '-o', `${base}.%(ext)s`, '--force-overwrites', '--print', 'after_move:%(filepath)s', url];
  return new Promise((res) => execFile(exe, args, { timeout: 180000, maxBuffer: 1 << 20 }, (err, out) => {
    const file = String(out || '').trim().split('\n').pop();
    if (file && fs.existsSync(file)) return res({ file, name: c.title, url });
    // Offline, or YouTube refusing for a moment: try again later.
    res({ failed: true });
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
  const install = process.platform === 'win32' ? 'in a terminal: winget install yt-dlp.yt-dlp' : process.platform === 'darwin' ? 'brew install yt-dlp' : 'on CachyOS or Arch: sudo pacman -S yt-dlp';
  return { files, bytes, ytdlp: !!ytdlp(), queued: busy.size, install };
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
