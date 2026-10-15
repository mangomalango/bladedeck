'use strict';
/* Achievements, the system side.
   Steam: Steam keeps every game's achievement list (names, descriptions, icons) and your unlocks on
   this computer, in appcache/stats (a binary KeyValues format, read here). So achievements for
   Steam games need no account or key, and while a Steam game runs, a new unlock shows up the
   moment Steam writes it. Icons come from Steam's own image server.
   Clips: a saved replay is cut down to the moment, from 30 seconds before the unlock to 5 after
   (ffmpeg, copying the video as it is, so it is quick and loses nothing). */
const { ipcMain, app } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/* -------------------------------------------------------------- Steam's binary KeyValues */
function kv(buf) {
  let o = 0;
  const str = () => { const e = buf.indexOf(0, o); const s = buf.toString('utf8', o, e); o = e + 1; return s; };
  function obj(depth) {
    const out = {};
    if (depth > 20) throw new Error('too deep');
    while (o < buf.length) {
      const t = buf[o++]; if (t === 8) return out;
      const k = str();
      if (t === 0) out[k] = obj(depth + 1);
      else if (t === 1) out[k] = str();
      else if (t === 2) { out[k] = buf.readInt32LE(o); o += 4; }
      else if (t === 3) { out[k] = buf.readFloatLE(o); o += 4; }
      else if (t === 4 || t === 6) { out[k] = buf.readUInt32LE(o); o += 4; }
      else if (t === 7 || t === 10) { out[k] = buf.readBigUInt64LE(o).toString(); o += 8; }
      else throw new Error(`unknown type ${t}`);
    }
    return out;
  }
  return obj(0);
}

function steamRoots() {
  const h = os.homedir();
  return [path.join(h, '.local/share/Steam'), path.join(h, '.steam/steam'), path.join(h, '.var/app/com.valvesoftware.Steam/.local/share/Steam'),
    'C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'].filter((p) => fs.existsSync(path.join(p, 'appcache', 'stats')));
}
// The newest stats file for this game: there is one per Steam account that played it.
function statsFiles(appid) {
  for (const root of steamRoots()) {
    const dir = path.join(root, 'appcache', 'stats');
    const schema = path.join(dir, `UserGameStatsSchema_${appid}.bin`);
    if (!fs.existsSync(schema)) continue;
    const users = fs.readdirSync(dir).filter((f) => new RegExp(`^UserGameStats_\\d+_${appid}\\.bin$`).test(f))
      .map((f) => ({ f: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    return { dir, schema, user: users[0]?.f || null };
  }
  return null;
}
const ICONS = (appid) => `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appid}/`;
const word = (v) => (v && typeof v === 'object' ? v.english || Object.values(v).find((x) => typeof x === 'string') || '' : String(v || ''));

function steamAchievements(appid) {
  appid = String(appid).replace(/\D/g, '');
  const files = appid && statsFiles(appid); if (!files) return null;
  let schema; try { schema = kv(fs.readFileSync(files.schema)); } catch { return null; }
  let user = {}; try { user = files.user ? kv(fs.readFileSync(files.user)).cache || {} : {}; } catch { /* none unlocked */ }
  const stats = (schema[appid] || Object.values(schema)[0] || {}).stats || {};
  const out = [];
  for (const [sid, st] of Object.entries(stats)) {
    for (const [, b] of Object.entries(st.bits || {})) {
      const d = b.display || {}, bit = +b.bit;
      const u = user[sid] || {};
      const time = u.AchievementTimes?.[String(bit)] || 0;
      const got = !!time || (typeof u.data === 'number' && ((u.data >>> bit) & 1) === 1);
      out.push({ id: b.name, title: word(d.name), desc: word(d.desc), hidden: d.hidden === '1' || d.hidden === 1, got, time: time ? time * 1000 : 0,
        icon: d.icon ? ICONS(appid) + d.icon : '', iconGray: d.icon_gray ? ICONS(appid) + d.icon_gray : '' });
    }
  }
  return { appid, list: out, got: out.filter((a) => a.got).length, total: out.length };
}

/* While a Steam game runs: watch its stats file and report new unlocks as they are written. */
let watching = null;
function watchSteam(appid, send) {
  stopWatch();
  appid = String(appid).replace(/\D/g, '');
  const files = appid && statsFiles(appid); if (!files) return false;
  const known = new Set((steamAchievements(appid)?.list || []).filter((a) => a.got).map((a) => a.id));
  let t = 0;
  const check = () => {
    const now = steamAchievements(appid); if (!now) return;
    for (const a of now.list) if (a.got && !known.has(a.id)) { known.add(a.id); send('achievement', { kind: 'steam', appid, title: a.title, desc: a.desc, icon: a.icon, at: a.time || Date.now() }); }
  };
  try {
    const w = fs.watch(files.dir, (_ev, name) => { if (name && name.endsWith(`_${appid}.bin`)) { clearTimeout(t); t = setTimeout(check, 400); } });
    watching = { w, appid };
  } catch { return false; }
  return true;
}
function stopWatch() { if (watching) { try { watching.w.close(); } catch { /* closed */ } watching = null; } }

/* -------------------------------------------------------------- the achievement clip */
const run = (cmd, args, timeout = 60000) => new Promise((res) => execFile(cmd, args, { timeout, windowsHide: true }, (err, out) => res(err ? null : String(out))));
async function trim({ file, unlockAt, savedAt, title }) {
  const root = path.join(app.getPath('videos'), 'Bladedeck');
  const src = path.resolve(String(file || ''));
  if (!src.startsWith(root + path.sep) || !fs.existsSync(src)) return { ok: false, error: 'That clip is not in Videos/Bladedeck.' };
  const dur = parseFloat(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', src], 20000));
  if (!dur) return { ok: false, error: 'ffprobe could not read the clip.' };
  // The clip ends when it was saved; the unlock sits that far back from the end.
  const back = Math.max(0, (savedAt - unlockAt) / 1000);
  const from = Math.max(0, dur - back - 30), to = Math.min(dur, dur - back + 5);
  if (to - from < 3) return { ok: false, error: 'The unlock is not inside this clip.' };
  const safe = String(title || 'Achievement').replace(/[\\/:*?"<>|]+/g, '').slice(0, 60);
  const ext = path.extname(src), out = path.join(path.dirname(src), `${path.basename(src, ext).replace(/ replay.*$/i, '')} achievement ${safe}${ext}`.replace(/\s+/g, ' '));
  const ok = await run('ffmpeg', ['-y', '-v', 'error', '-ss', from.toFixed(2), '-to', to.toFixed(2), '-i', src, '-c', 'copy', out], 120000);
  if (ok === null || !fs.existsSync(out)) return { ok: false, error: 'ffmpeg could not cut the clip.' };
  fs.rmSync(src, { force: true });
  return { ok: true, file: out, secs: Math.round(to - from) };
}

function register({ getWin }) {
  const send = (ch, d) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, d); };
  ipcMain.handle('steam-ach', (_e, appid) => steamAchievements(appid));
  ipcMain.handle('steam-ach-watch', (_e, appid) => (appid ? watchSteam(appid, send) : (stopWatch(), true)));
  ipcMain.handle('ach-clip-trim', (_e, o) => trim(o || {}).catch((err) => ({ ok: false, error: String(err.message || err) })));
  app.on('will-quit', stopWatch);
}

module.exports = { register, steamAchievements, kv };
