'use strict';
/* Steam Input for every game: each game in the library (and Bladedeck itself) becomes a non-Steam
   game in Steam, and Bladedeck starts it through Steam. Steam then gives the controller a gamepad
   layout (its own per-game layouts, gyro, back buttons, any controller as an Xbox one) instead of
   its desktop layout, which turns buttons into keys and mouse clicks while no Steam game runs:
   that is what made Start and Back open Task View and the on-screen keyboard on Windows.
   - Each game gets a small launch script (userData/steam-launch) made from the same command
     Bladedeck uses (emulator, Wine, environment, one core). Steam's entry points at the script, so
     editing a game only rewrites the script, and it is rewritten right before every start.
   - Steam reads its shortcuts.vdf only when it starts and writes it back when it quits, so new
     entries can only be written while Steam is closed: at once when it is, otherwise after the
     player says yes to a quick Steam restart. A copy of the file is kept first, once a day.
   - Only entries tagged "Bladedeck" are Bladedeck's; the player's own non-Steam games are left
     exactly as they are. Each entry's Steam id comes from the game's library id, so renaming a
     game keeps it. */
const { app, shell } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const TAG = 'Bladedeck';
const KINDS = new Set(['exe', 'recomp', 'gog', 'rom']); // apps, Steam games and streams stay as they are
const win = process.platform === 'win32';

/* -------------------------------------------------------------- binary VDF (shortcuts.vdf) */
// A node is [type, key, value]: 0 map (value: list of nodes), 1 string, 2 int32, anything else
// kept as raw bytes so a file Steam wrote round-trips unchanged.
function parse(buf) {
  let i = 0;
  const str = () => { const j = buf.indexOf(0, i); const s = buf.toString('utf8', i, j); i = j + 1; return s; };
  const SIZE = { 3: 4, 6: 4, 7: 8, 10: 8 };
  const map = () => {
    const out = [];
    for (;;) {
      if (i >= buf.length) return out;
      const t = buf[i++];
      if (t === 8) return out;
      const k = str();
      if (t === 0) out.push([0, k, map()]);
      else if (t === 1) out.push([1, k, str()]);
      else if (t === 2) { out.push([2, k, buf.readInt32LE(i)]); i += 4; }
      else if (SIZE[t]) { out.push([t, k, buf.subarray(i, i + SIZE[t])]); i += SIZE[t]; }
      else throw new Error(`shortcuts.vdf: unknown field type ${t}`);
    }
  };
  return map();
}
function write(nodes) {
  const parts = [];
  const put = (list) => {
    for (const [t, k, v] of list) {
      parts.push(Buffer.from([t]), Buffer.from(`${k}\0`, 'utf8'));
      if (t === 0) { put(v); parts.push(Buffer.from([8])); }
      else if (t === 1) parts.push(Buffer.from(`${v}\0`, 'utf8'));
      else if (t === 2) { const b = Buffer.alloc(4); b.writeInt32LE(v | 0); parts.push(b); }
      else parts.push(Buffer.from(v));
    }
  };
  put(nodes);
  parts.push(Buffer.from([8]));
  return Buffer.concat(parts);
}
const get = (list, k) => (list.find((n) => n[1].toLowerCase() === k.toLowerCase()) || [])[2];

/* -------------------------------------------------------------- where Steam is */
function steamRoots() {
  const h = os.homedir();
  const l = win ? [path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam'), path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Steam')]
    : [path.join(h, '.local/share/Steam'), path.join(h, '.steam/steam'), path.join(h, '.var/app/com.valvesoftware.Steam/.local/share/Steam')];
  const seen = new Set();
  return l.filter((p) => { try { const r = fs.realpathSync(p); if (seen.has(r) || !fs.existsSync(path.join(r, 'userdata'))) return false; seen.add(r); return true; } catch { return false; } });
}
// Every Steam account on this PC that has signed in (userdata/<id>/config).
function shortcutFiles() {
  const out = [];
  for (const r of steamRoots()) {
    let ids = []; try { ids = fs.readdirSync(path.join(r, 'userdata')).filter((d) => /^\d+$/.test(d) && d !== '0'); } catch { continue; }
    for (const id of ids) { const c = path.join(r, 'userdata', id, 'config'); if (fs.existsSync(c)) out.push(path.join(c, 'shortcuts.vdf')); }
  }
  return out;
}
const steamRunning = () => new Promise((res) => {
  if (win) execFile('tasklist', ['/FI', 'IMAGENAME eq steam.exe', '/NH'], { windowsHide: true }, (err, out) => res(!err && /steam\.exe/i.test(String(out))));
  else execFile('pgrep', ['-x', 'steam'], (err) => res(!err));
});

/* -------------------------------------------------------------- ids */
// Steam's id for a non-Steam game: 32 bits with the top one set. Bladedeck's is made from the
// library id, so it never changes for a game. The id to start it: that id, shifted, plus 0x02000000.
const appId = (key) => ((zlib.crc32(`bladedeck:${key}`) | 0x80000000) | 0);
const gameId = (id) => ((BigInt(id >>> 0) << 32n) | 0x02000000n).toString();

/* -------------------------------------------------------------- launch scripts */
const scriptDir = () => path.join(app.getPath('userData'), 'steam-launch');
const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const wq = (s) => (/[\s"&|<>^]/.test(String(s)) || s === '' ? `"${String(s).replace(/"/g, '\\"')}"` : String(s));
function scriptFor(e, c) {
  fs.mkdirSync(scriptDir(), { recursive: true });
  const id = String(e.id).replace(/[^\w-]/g, '_');
  if (win) {
    const env = Object.entries(c.env || {});
    // Without its own environment, Steam starts the program itself (no console window).
    if (!env.length) return { exe: `"${c.exe}"`, dir: `"${c.cwd}"`, opts: c.args.map(wq).join(' ') };
    // With its own environment: a hidden Windows Script Host runner, which sets it and starts the
    // game, and waits for it. A .cmd script kept a console window open for the whole game.
    const vq = (s) => String(s).replace(/"/g, '""').replace(/[\r\n]/g, ' ');
    const f = path.join(scriptDir(), `${id}.vbs`);
    fs.writeFileSync(f, [`' Made by Bladedeck for Steam: ${vq(e.title)}. Bladedeck rewrites it when the game changes.`,
      'Set sh = CreateObject("WScript.Shell")', 'Set env = sh.Environment("Process")', ...env.map(([k, v]) => `env("${vq(k)}") = "${vq(v)}"`),
      `sh.CurrentDirectory = "${vq(c.cwd)}"`, `sh.Run "${vq([c.exe, ...c.args].map(wq).join(' '))}", 1, True`, ''].join('\r\n'));
    try { fs.rmSync(path.join(scriptDir(), `${id}.cmd`), { force: true }); } catch { /* none */ }
    const wscript = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
    return { exe: `"${wscript}"`, dir: `"${c.cwd}"`, opts: `//B //Nologo "${f}"` };
  }
  const f = path.join(scriptDir(), `${id}.sh`);
  fs.writeFileSync(f, ['#!/bin/sh', `# Made by Bladedeck for Steam: ${String(e.title).replace(/\n/g, ' ')}. Bladedeck rewrites it when the game changes.`,
    `cd ${sq(c.cwd)} 2>/dev/null || true`, ...Object.entries(c.env || {}).map(([k, v]) => `export ${k}=${sq(v)}`), `exec ${[c.exe, ...c.args].map(sq).join(' ')}`, ''].join('\n'));
  fs.chmodSync(f, 0o755);
  return { exe: `"${f}"`, dir: `"${scriptDir()}"`, opts: '' };
}

/* -------------------------------------------------------------- what Steam should list */
let deps = null; // { command(entry, emulator, settings), loadLib() }
const eligible = (e, lib) => e && KINDS.has(e.type) && !e.hidden && !e.emuApp && !(e.type === 'gog' && !e.exe) && (e.type !== 'rom' || lib.emulators.some((x) => x.id === e.emulatorId));

function shortcut(id, name, s, icon) {
  return [[2, 'appid', id], [1, 'AppName', name], [1, 'Exe', s.exe], [1, 'StartDir', s.dir], [1, 'icon', icon || ''], [1, 'ShortcutPath', ''],
    [1, 'LaunchOptions', s.opts], [2, 'IsHidden', 0], [2, 'AllowDesktopConfig', 1], [2, 'AllowOverlay', s.overlay === false ? 0 : 1], [2, 'OpenVR', 0], [2, 'Devkit', 0],
    [1, 'DevkitGameID', ''], [2, 'DevkitOverrideAppID', 0], [2, 'LastPlayTime', 0], [1, 'FlatpakAppID', ''], [1, 'sortas', ''], [0, 'tags', [[1, '0', TAG]]]];
}

// Bladedeck itself, so Steam gives it a gamepad layout too (only for a built Bladedeck).
function self() {
  if (!app.isPackaged) return null;
  const exe = process.env.APPIMAGE || process.execPath;
  /* Linux: Steam preloads its overlay (gameoverlayrenderer.so) into every process it starts, and in
     Electron's zygote it crashes on load: the window comes up white and Bladedeck dies a little
     later. It loads before any of Bladedeck's code runs, so the shortcut starts Bladedeck without
     it. Steam Input does not need the overlay. */
  if (process.platform === 'linux') return { exe: `"${exe}"`, dir: `"${path.dirname(exe)}"`, opts: 'LD_PRELOAD= %command% --via-steam', overlay: false };
  return { exe: `"${exe}"`, dir: `"${path.dirname(exe)}"`, opts: '--via-steam' };
}

async function wanted() {
  const lib = deps.loadLib(), out = [];
  for (const e of lib.entries) {
    if (!eligible(e, lib)) continue;
    const c = await deps.command(e, lib.emulators.find((x) => x.id === e.emulatorId), lib.settings, null).catch(() => ({ error: true }));
    // Not playable right now (its drive is unplugged): Steam keeps the entry it has, if any.
    if (c.error) { out.push({ key: e.id, keepOnly: true }); continue; }
    if (c.open) continue;
    out.push({ key: e.id, node: shortcut(appId(e.id), e.title, scriptFor(e, c), e.cover && fs.existsSync(e.cover) ? e.cover : '') });
  }
  const me = self();
  if (me) out.push({ key: 'bladedeck-self', node: shortcut(appId('bladedeck-self'), 'Bladedeck', me, '') });
  return out;
}

/* -------------------------------------------------------------- sync */
function plan(file, want) {
  let tree = [];
  try { tree = parse(fs.readFileSync(file)); } catch (err) { if (fs.existsSync(file)) throw err; }
  let root = tree.find((n) => n[0] === 0 && n[1].toLowerCase() === 'shortcuts');
  if (!root) { root = [0, 'shortcuts', []]; tree.push(root); }
  const ids = new Set(want.map((w) => appId(w.key)));
  const before0 = new Map(root[2].filter((n) => { const tags = get(n[2], 'tags'); return Array.isArray(tags) && tags.some((t) => t[2] === TAG); }).map((n) => [get(n[2], 'appid'), n]));
  // An entry kept only as it is: there when Steam has it, left out when it does not.
  want = want.filter((w) => !w.keepOnly || before0.has(appId(w.key)));
  const ours = (n) => { const tags = get(n[2], 'tags'); return Array.isArray(tags) && tags.some((t) => t[2] === TAG); };
  const keep = root[2].filter((n) => !ours(n)); // the player's own, untouched
  const before = new Map(root[2].filter(ours).map((n) => [get(n[2], 'appid'), n]));
  const next = [...keep.map((n) => n[2]), ...want.map((w) => {
    // Keep what Steam learned (last played) on an entry that is already there.
    const old = before.get(appId(w.key));
    if (w.keepOnly) return old[2];
    const lp = old ? get(old[2], 'LastPlayTime') : 0;
    return w.node.map((f) => (f[1] === 'LastPlayTime' ? [2, 'LastPlayTime', lp || 0] : f));
  })];
  root[2] = next.map((fields, i) => [0, String(i), fields]);
  const added = want.filter((w) => !w.keepOnly && !before.has(appId(w.key))).length;
  const removed = [...before.keys()].filter((id) => !ids.has(id)).length;
  return { tree, added, removed };
}

let present = new Set(); // entry ids Steam already has (as it read them at its last start)
function readPresent() {
  present = new Set();
  for (const f of shortcutFiles()) {
    try {
      const root = parse(fs.readFileSync(f)).find((n) => n[1].toLowerCase() === 'shortcuts');
      for (const n of root ? root[2] : []) { const tags = get(n[2], 'tags'); if (Array.isArray(tags) && tags.some((t) => t[2] === TAG)) present.add(get(n[2], 'appid')); }
    } catch { /* unreadable: nothing counts as there */ }
  }
}

async function sync({ force = false } = {}) {
  const files = shortcutFiles();
  if (!files.length) return { ok: false, noSteam: true };
  const want = await wanted();
  const plans = files.map((f) => ({ f, ...plan(f, want) }));
  const pending = plans.reduce((n, p) => n + p.added + p.removed, 0);
  if (!pending && !force) { readPresent(); return { ok: true, pending: 0, games: want.length }; }
  if (await steamRunning()) { readPresent(); return { ok: false, steamRunning: true, pending }; }
  for (const p of plans) {
    const keep = `${p.f}.bladedeck-${new Date().toISOString().slice(0, 10)}.bak`;
    if (fs.existsSync(p.f) && !fs.existsSync(keep)) fs.copyFileSync(p.f, keep);
    fs.writeFileSync(p.f, write(p.tree));
  }
  readPresent();
  return { ok: true, written: pending, games: want.length };
}

function steamCmd(args) {
  if (win) { const exe = steamRoots().map((r) => path.join(r, 'steam.exe')).find((p) => fs.existsSync(p)); return exe ? [exe, args] : null; }
  const onPath = (c) => (process.env.PATH || '').split(path.delimiter).map((d) => path.join(d, c)).find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } });
  const st = onPath('steam'); if (st) return [st, args];
  const fp = onPath('flatpak'); return fp ? [fp, ['run', 'com.valvesoftware.Steam', ...args]] : null;
}
// Steam closes, the new entries are written, Steam opens again (in the background).
async function restartAndSync() {
  const c = steamCmd(['-shutdown']); if (!c) return { ok: false, error: 'Steam was not found.' };
  if (await steamRunning()) {
    const k = spawn(c[0], c[1], { detached: true, stdio: 'ignore' }); k.on('error', () => {}); k.unref();
    const t0 = Date.now();
    while (await steamRunning()) { if (Date.now() - t0 > 60000) return { ok: false, error: 'Steam did not close. Close it from its menu (Steam, Exit) and try again.' }; await new Promise((r) => setTimeout(r, 1500)); }
    await new Promise((r) => setTimeout(r, 1500)); // its last write of the file
  }
  const r = await sync({ force: true });
  const s = steamCmd(['-silent']); if (s) { const k = spawn(s[0], s[1], { detached: true, stdio: 'ignore' }); k.on('error', () => {}); k.unref(); }
  return r;
}

/* -------------------------------------------------------------- starting a game */
// Through Steam when Steam already lists it; the script is rewritten first, so it is current.
async function launch(entry, emulator, settings) {
  if (!entry || !KINDS.has(entry.type) || !present.has(appId(entry.id))) return null;
  const c = await deps.command(entry, emulator, settings, null);
  if (c.error || c.open) return null;
  scriptFor(entry, c);
  await shell.openExternal(`steam://rungameid/${gameId(appId(entry.id))}`);
  // Steam names the game's processes and windows by the shortcut's id (32 bits) or its game id.
  return { ok: true, viaSteam: true, steamIds: [String(appId(entry.id) >>> 0), gameId(appId(entry.id))] };
}

/* At start: a built Bladedeck opened outside Steam goes again through Steam, when Steam is
   running and lists it, so Steam uses a gamepad layout for it. "--via-steam" (the shortcut's own
   option) and Steam's SteamGameId mark a start that already came through Steam; at most one try a
   minute, so it can never go round in circles. */
async function startThroughSteam(settings) {
  if (!settings || settings.steamInput === false || settings.bladedeckViaSteam === false || !app.isPackaged) return false;
  if (process.argv.includes('--via-steam') || process.env.SteamGameId || process.env.SteamAppId) return false;
  readPresent();
  if (!present.has(appId('bladedeck-self')) || !(await steamRunning())) return false;
  const stamp = path.join(app.getPath('userData'), 'steam-relaunch.txt');
  try { if (Date.now() - +fs.readFileSync(stamp, 'utf8') < 60000) return false; } catch { /* first time */ }
  try { fs.writeFileSync(stamp, String(Date.now())); } catch { /* fine */ }
  await shell.openExternal(`steam://rungameid/${gameId(appId('bladedeck-self'))}`);
  return true;
}

function register(d) {
  deps = d;
  const { ipcMain } = require('electron');
  const wrap = (fn) => async (...a) => { try { return await fn(...a); } catch (err) { return { ok: false, error: String(err.message || err) }; } };
  ipcMain.handle('steamlink-sync', wrap(() => sync()));
  ipcMain.handle('steamlink-restart', wrap(() => restartAndSync()));
  readPresent();
}

module.exports = { register, launch, sync, startThroughSteam, parse, write, appId, gameId, plan, wanted };
