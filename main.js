'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, desktopCapturer, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const Peek = require('./peek');
const Net = require('./net');

// ---------------------------------------------------------------- defaults
const DEFAULT_BLADES = [
  { id: 'home',   name: 'Home',      filter: { home: true } },
  { id: 'games',  name: 'Games',     filter: {} },
  { id: 'steam',  name: 'Steam',     filter: { types: ['steam'] } },
  { id: 'emu',    name: 'Emulation', filter: { types: ['rom'] } },
  { id: 'pc',     name: 'PC',        filter: { types: ['exe', 'recomp', 'gog'] } },
  { id: 'apps',   name: 'Apps',      filter: { types: ['app'] } },
  { id: 'system', name: 'System',    special: 'system' }
];

const DEFAULT_LIB = () => ({
  version: 1,
  settings: {
    mode: 'console',
    theme: 'pearl',
    playerName: 'Player 1',
    hideOnLaunch: true,
    sounds: true,
    ambient: true,
    ambientVolume: 0.5,
    fx: true,
    quietWhilePlaying: true,
    steamPath: '',
    gogDirs: [],
    tileSize: 170,
    blades: DEFAULT_BLADES,
    wineCommand: '',
    secrets: {},
    rewards: [],
    friends: [],
    pokes: [],
    musicDir: '',
    musicVolume: 0.7,
    musicDuringGames: false,
    peekMinimize: false,
    rippleStyle: 'water'
  },
  emulators: [],
  entries: []
});

// ---------------------------------------------------------------- paths / io
const dataDir = () => app.getPath('userData');
const libFile = () => path.join(dataDir(), 'library.json');
const themesDir = () => path.join(dataDir(), 'themes');
const cssFile = () => path.join(dataDir(), 'custom.css');

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJson(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

function loadLib() {
  const base = DEFAULT_LIB();
  const lib = readJson(libFile(), null) || base;
  lib.settings = { ...base.settings, ...(lib.settings || {}) };
  if (!Array.isArray(lib.settings.blades) || !lib.settings.blades.length) lib.settings.blades = DEFAULT_BLADES;
  lib.emulators = Array.isArray(lib.emulators) ? lib.emulators : [];
  lib.entries = Array.isArray(lib.entries) ? lib.entries : [];
  // Libraries made before GOG support: GOG games belong on the PC blade too.
  const pc = lib.settings.blades.find((b) => b.id === 'pc');
  if (pc && pc.filter && Array.isArray(pc.filter.types) && pc.filter.types.includes('exe') && !pc.filter.types.includes('gog')) pc.filter.types.push('gog');
  return lib;
}

function loadThemes() {
  const out = {};
  for (const dir of [path.join(__dirname, 'themes'), themesDir()]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const t = readJson(path.join(dir, f), null);
      if (t && t.id) out[t.id] = t; // user themes override built-ins with the same id
    }
  }
  return Object.values(out);
}

function ensureUserFiles() {
  fs.mkdirSync(themesDir(), { recursive: true });
  if (!fs.existsSync(cssFile())) {
    fs.writeFileSync(cssFile(),
`/* Bladedeck custom CSS. Loaded after the active theme, so anything here wins.
   Example: make selected items square.
   .item.sel { border-radius: 0; }
   Example: bigger console titles.
   .item b { font-size: 22px; }
*/
`);
  }
}

// ---------------------------------------------------------------- window
let win = null;

function createWindow() {
  const lib = loadLib();
  const consoleMode = lib.settings.mode === 'console';
  win = new BrowserWindow({
    width: 1360, height: 840, minWidth: 900, minHeight: 600,
    backgroundColor: '#101410',
    autoHideMenuBar: true,
    show: false,
    fullscreen: consoleMode,
    title: 'Bladedeck',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Recording a clip has to keep running while the launcher is minimized behind the game.
      backgroundThrottling: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    Peek.start(win, { dataDir: dataDir(), minimize: !!lib.settings.peekMinimize, handler: (ev) => { if (win) win.webContents.send('peek', ev); } })
      .then((m) => {
        if (win) win.webContents.send('peek', { kind: 'mode', mode: m });
        // Without KWin, list windows another way (Windows, or Linux on X11 with wmctrl).
        require('./winlist').start({ dir: dataDir(), mode: m, onList: (l) => { if (win && !win.isDestroyed()) win.webContents.send('peek', { kind: 'windows', caption: JSON.stringify(l), pid: 0, cls: '' }); } });
      });
    if (process.platform === 'win32') require('./winpad').start(dataDir(), () => peekToggle(), () => { if (win) win.webContents.send('peek', { kind: 'pip', caption: '', pid: 0, cls: '' }); });
  });
  win.on('closed', () => { win = null; });
  startNet();
  // Coming back to the launcher means the player is done with whatever they started.
  win.on('focus', () => { quiet(false); win.webContents.send('returned'); });
  startDownloadWatch();
}

// ---------------------------------------------------------------- quiet while playing
// Holds a desktop notification inhibit (KDE, GNOME and others honour it) for as long as
// a small helper process lives. Killing the helper releases it.
let quietProc = null;
const QUIET_PY = `
import dbus, signal, sys
b = dbus.SessionBus()
n = dbus.Interface(b.get_object('org.freedesktop.Notifications', '/org/freedesktop/Notifications'), 'org.freedesktop.Notifications')
n.Inhibit('Bladedeck', 'Playing a game', dbus.Dictionary({}, signature='sv'))
signal.signal(signal.SIGTERM, lambda *a: exit(0))
# Returns when Bladedeck goes away, even if it crashed, so the inhibit never outlives it.
sys.stdin.read()
`;
function quiet(on) {
  if (process.platform !== 'linux') return;
  if (on && !quietProc) {
    try {
      quietProc = spawn('python3', ['-c', QUIET_PY], { stdio: ['pipe', 'ignore', 'ignore'] });
      quietProc.on('error', () => { quietProc = null; });
      quietProc.on('exit', () => { quietProc = null; });
    } catch { quietProc = null; }
  } else if (!on && quietProc) {
    quietProc.kill(); quietProc = null;
  }
}
app.on('will-quit', () => { require('./procs').thawAll(); require('./winlist').stop(); quiet(false); Peek.stop(); Net.stop(); if (process.platform === 'win32') { require('./winaudio').stop(); require('./winpad').stop(); } });

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { ensureUserFiles(); createWindow(); setTimeout(prewarmSteam, 3000); });
  app.on('window-all-closed', () => app.quit());
}

// ---------------------------------------------------------------- ipc: library
ipcMain.handle('load', () => ({
  lib: loadLib(),
  themes: loadThemes(),
  customCss: (() => { try { return fs.readFileSync(cssFile(), 'utf8'); } catch { return ''; } })(),
  defaultBlades: DEFAULT_BLADES,
  platform: process.platform
}));

ipcMain.handle('save', (_e, lib) => { writeJson(libFile(), lib); return true; });

ipcMain.handle('set-mode', (_e, mode) => {
  if (!win) return;
  win.setFullScreen(mode === 'console');
});

ipcMain.handle('quit', () => app.quit());
ipcMain.handle('minimize', () => { if (win) win.minimize(); });
ipcMain.handle('open-themes', () => shell.openPath(themesDir()));
ipcMain.handle('open-css', () => { shell.showItemInFolder(cssFile()); return true; });

ipcMain.handle('pick', async (_e, { kind }) => {
  const props = kind === 'dir' ? ['openDirectory'] : ['openFile'];
  let filters = [{ name: 'All files', extensions: ['*'] }];
  if (kind === 'exe' && process.platform === 'win32') {
    filters = [{ name: 'Programs', extensions: ['exe', 'lnk', 'bat', 'cmd'] }, { name: 'All files', extensions: ['*'] }];
  }
  if (kind === 'image') {
    filters = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }];
  }
  if (kind === 'media') {
    filters = [{ name: 'Clips and pictures', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'webm', 'mp4', 'mkv', 'mov', 'm4v'] }];
  }
  const r = await dialog.showOpenDialog(win, { properties: props, filters: kind === 'dir' ? undefined : filters });
  return r.canceled ? null : r.filePaths[0];
});

// ---------------------------------------------------------------- ipc: launching
function splitArgs(s = '') {
  const out = []; let cur = ''; let q = false; let has = false;
  for (const ch of s) {
    if (q) { if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') { q = true; has = true; }
    else if (/\s/.test(ch)) { if (has) { out.push(cur); cur = ''; has = false; } }
    else { cur += ch; has = true; }
  }
  if (has) out.push(cur);
  return out;
}

// ---------------------------------------------------------------- faster starts
// A big shader cache means a game compiles its shaders once and later starts and runs without
// recompiling them. Mesa (AMD, Intel) and NVIDIA read these; everything else ignores them.
const SHADER_ENV = {
  MESA_SHADER_CACHE_MAX_SIZE: '10G',
  __GL_SHADER_DISK_CACHE: '1', __GL_SHADER_DISK_CACHE_SIZE: '10737418240', __GL_SHADER_DISK_CACHE_SKIP_CLEANUP: '1',
  DXVK_STATE_CACHE: '1'
};
// Steam takes several seconds to start, and every Steam game waits for it. Starting it quietly
// in the background when Bladedeck opens means a game launches the moment you pick it.
function prewarmSteam() {
  const lib = loadLib();
  if (lib.settings.prewarmSteam === false || !lib.entries.some((e) => e.type === 'steam')) return;
  if (process.platform === 'linux') {
    require('child_process').execFile('pgrep', ['-x', 'steam'], (err) => {
      if (!err) return; // already running
      const exe = onPath('steam');
      const flat = !exe && flatpakHas('com.valvesoftware.Steam');
      if (!exe && !flat) return;
      try { spawn(exe || onPath('flatpak') || '/usr/bin/flatpak', exe ? ['-silent'] : ['run', 'com.valvesoftware.Steam', '-silent'], { detached: true, stdio: 'ignore' }).unref(); } catch { /* no Steam */ }
    });
  } else if (process.platform === 'win32') {
    require('child_process').execFile('tasklist', ['/FI', 'IMAGENAME eq steam.exe', '/NH'], (err, out) => {
      if (err || /steam\.exe/i.test(String(out))) return;
      const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean).map((d) => path.join(d, 'Steam', 'steam.exe')).find((p) => fs.existsSync(p));
      if (pf) try { spawn(pf, ['-silent'], { detached: true, stdio: 'ignore' }).unref(); } catch { /* no Steam */ }
    });
  }
}

ipcMain.handle('launch', async (_e, { entry, emulator, settings }) => {
  try {
    if (entry.type === 'steam') {
      await shell.openExternal(`steam://rungameid/${encodeURIComponent(entry.appid)}`);
      if (settings && settings.quietWhilePlaying) quiet(true);
      return { ok: true };
    }
    if (entry.type === 'gog' && entry.heroicId && !entry.exe) {
      await shell.openExternal(`heroic://launch/gog/${encodeURIComponent(entry.heroicId)}`);
      if (settings && settings.quietWhilePlaying) quiet(true);
      return { ok: true };
    }

    let exe, args, cwd;
    const sub = (t) => t
      .replaceAll('{rom}', entry.rom || '')
      .replaceAll('{romdir}', entry.rom ? path.dirname(entry.rom) : '')
      .replaceAll('{title}', entry.title || '');

    if (entry.type === 'rom') {
      if (!emulator) return { ok: false, error: 'This game has no emulator. Open Edit and pick one.' };
      if (!entry.rom || !fs.existsSync(entry.rom)) return { ok: false, error: `Game file not found: ${entry.rom || '(none)'}` };
      exe = emulator.exe;
      args = splitArgs(emulator.args).map(sub);
      cwd = path.dirname(exe || '.');
    } else {
      exe = entry.exe;
      args = splitArgs(entry.args).map(sub);
      cwd = entry.cwd || path.dirname(exe || '.');
    }

    if (!exe || !fs.existsSync(exe)) return { ok: false, error: `Program not found: ${exe || '(none)'}. Check the path in Edit.` };

    const ext = path.extname(exe).toLowerCase();
    if (ext === '.lnk' || ext === '.url') {
      const err = await shell.openPath(exe);
      return err ? { ok: false, error: err } : { ok: true };
    }

    // Windows programs can't run directly on Linux/macOS, so hand them to Wine.
    if (process.platform !== 'win32' && (ext === '.exe' || ext === '.msi')) {
      args = ext === '.msi' ? ['msiexec', '/i', exe, ...args] : [exe, ...args];
      exe = (settings && settings.wineCommand) || 'wine';
    }

    const started = Date.now();
    // GameMode asks the system for full speed while the game runs.
    const gm = settings && settings.gamemode && process.platform === 'linux' && onPath('gamemoderun');
    if (gm) { args = [exe, ...args]; exe = gm; }
    const child = spawn(exe, args, {
      cwd, detached: true, stdio: 'ignore',
      shell: ext === '.bat' || ext === '.cmd',
      env: { ...process.env, ...(settings && settings.shaderCache === false ? {} : SHADER_ENV) }
    });
    await new Promise((res, rej) => { child.once('spawn', res); child.once('error', rej); });
    child.unref();
    const pid = child.pid;

    // The renderer minimizes once its launch animation has played out.
    if (settings && settings.quietWhilePlaying) quiet(true);

    child.once('exit', () => {
      quiet(false);
      const seconds = Math.round((Date.now() - started) / 1000);
      if (!win) return;
      win.webContents.send('launch-ended', { id: entry.id, seconds });
      // A very short run usually means a launcher stub that handed off to another process.
      if (settings && settings.hideOnLaunch && seconds > 5) { win.restore(); win.focus(); }
    });
    return { ok: true, pid };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// ---------------------------------------------------------------- ipc: scanning
function steamRoot(custom) {
  const h = os.homedir();
  const candidates = [
    custom,
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    path.join(h, '.local/share/Steam'),
    path.join(h, '.steam/steam'),
    path.join(h, '.var/app/com.valvesoftware.Steam/.local/share/Steam'),
    path.join(h, 'Library/Application Support/Steam')
  ];
  return candidates.find((p) => p && fs.existsSync(path.join(p, 'steamapps'))) || null;
}

function steamCover(root, id) {
  try {
    const base = path.join(root, 'appcache', 'librarycache');
    const old = path.join(base, `${id}_library_600x900.jpg`);
    if (fs.existsSync(old)) return old;
    const dir = path.join(base, String(id));
    if (!fs.existsSync(dir)) return '';
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      for (const f of fs.readdirSync(cur, { withFileTypes: true })) {
        const fp = path.join(cur, f.name);
        if (f.isDirectory()) stack.push(fp);
        else if (f.name === 'library_600x900.jpg') return fp;
      }
    }
  } catch { /* no cover, fall back to generated art */ }
  return '';
}

const STEAM_IGNORE = /^(Steamworks Common Redistributables|Steam Linux Runtime|Proton\b|Steam Controller Configs)/i;

ipcMain.handle('scan-steam', (_e, custom) => {
  const root = steamRoot(custom);
  if (!root) return { error: 'Steam was not found. Set the Steam folder in Settings.' };
  const libs = new Set([root]);
  try {
    const vdf = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\'));
  } catch { /* single library */ }

  const games = [];
  for (const lib of libs) {
    const apps = path.join(lib, 'steamapps');
    if (!fs.existsSync(apps)) continue;
    for (const f of fs.readdirSync(apps)) {
      if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
      try {
        const txt = fs.readFileSync(path.join(apps, f), 'utf8');
        const appid = (txt.match(/"appid"\s+"(\d+)"/) || [])[1];
        const name = (txt.match(/"name"\s+"([^"]*)"/) || [])[1];
        if (!appid || !name || STEAM_IGNORE.test(name)) continue;
        games.push({ appid, title: name, cover: steamCover(root, appid) });
      } catch { /* skip unreadable manifest */ }
    }
  }
  return { games };
});

ipcMain.handle('scan-roms', (_e, { exts, dirs }) => {
  const want = new Set(exts.map((x) => x.toLowerCase()));
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 6 || found.length > 20000) return;
    let items;
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      const fp = path.join(dir, it.name);
      if (it.isDirectory()) walk(fp, depth + 1);
      else if (want.has(path.extname(it.name).slice(1).toLowerCase())) found.push(fp);
    }
  };
  for (const d of dirs) walk(d, 0);
  return found;
});

// ---------------------------------------------------------------- ipc: GOG
// GOG games carry a goggame-<id>.info file naming the game and its main executable.
// Heroic keeps its own list of installed GOG games, which we read when it exists.
function gogDefaultDirs() {
  const h = os.homedir();
  return [
    path.join(h, 'Games'), path.join(h, 'GOG Games'), path.join(h, 'Downloads'),
    path.join(h, '.wine/drive_c/GOG Games'), path.join(h, '.wine/drive_c/Program Files (x86)/GOG Galaxy/Games'),
    'C:\\GOG Games', 'C:\\Program Files (x86)\\GOG Galaxy\\Games'
  ];
}

// Windows paths in GOG metadata ignore case, Linux file systems do not.
function findCaseless(dir, rel) {
  let cur = dir;
  for (const part of rel.split(/[\\/]/).filter(Boolean)) {
    let names;
    try { names = fs.readdirSync(cur); } catch { return null; }
    const hit = names.find((n) => n.toLowerCase() === part.toLowerCase());
    if (!hit) return null;
    cur = path.join(cur, hit);
  }
  return cur;
}

function gogCover(dir) {
  try {
    const f = fs.readdirSync(dir).find((n) => /^(cover|folder|boxart)\.(jpe?g|png|webp)$/i.test(n));
    return f ? path.join(dir, f) : '';
  } catch { return ''; }
}

ipcMain.handle('scan-gog', (_e, extraDirs = []) => {
  const games = new Map();
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let items;
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const info = items.find((it) => it.isFile() && /^goggame-\d+\.info$/i.test(it.name));
    if (info) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, info.name), 'utf8'));
        const task = (j.playTasks || []).find((t) => t.isPrimary) || (j.playTasks || []).find((t) => t.category === 'game');
        const exe = task && task.path ? findCaseless(dir, task.path) : null;
        if (exe && j.gameId && !games.has(j.gameId)) {
          games.set(j.gameId, { gogId: j.gameId, title: j.name || path.basename(dir), exe, args: task.arguments || '', cwd: task.workingDir ? path.join(dir, task.workingDir) : '', cover: gogCover(dir) });
        }
      } catch { /* unreadable info file */ }
      return;
    }
    for (const it of items) if (it.isDirectory() && !it.name.startsWith('.')) walk(path.join(dir, it.name), depth + 1);
  };
  for (const d of [...extraDirs, ...gogDefaultDirs()]) if (d && fs.existsSync(d)) walk(d, 0);

  for (const cfg of [path.join(os.homedir(), '.config/heroic'), path.join(os.homedir(), '.var/app/com.heroicgameslauncher.hgl/config/heroic')]) {
    const inst = readJson(path.join(cfg, 'gog_store', 'installed.json'), null);
    for (const g of (inst && inst.installed) || []) {
      if (!g.appName || games.has(g.appName)) continue;
      games.set(g.appName, { gogId: g.appName, heroicId: g.appName, title: g.title || path.basename(g.install_path || g.appName), exe: '', cover: '' });
    }
  }
  return { games: [...games.values()] };
});

// ---------------------------------------------------------------- Steam downloads
// Steam writes progress into each app manifest while it downloads, so polling them is enough.
let dlTimer = null, dlLast = '';
function readDownloads() {
  const root = steamRoot(loadLib().settings.steamPath);
  if (!root) return [];
  const libs = new Set([root]);
  try {
    const vdf = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\'));
  } catch { /* single library */ }
  const out = [];
  for (const lib of libs) {
    const apps = path.join(lib, 'steamapps');
    let files;
    try { files = fs.readdirSync(apps); } catch { continue; }
    for (const f of files) {
      if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
      try {
        const txt = fs.readFileSync(path.join(apps, f), 'utf8');
        const num = (k) => +((txt.match(new RegExp(`"${k}"\\s+"(\\d+)"`)) || [])[1] || 0);
        const flags = num('StateFlags'), total = num('BytesToDownload'), done = num('BytesDownloaded');
        // 4 installed, 2 update required, 256 update running, 512 paused, 1024 update started.
        const busy = flags & (2 | 256 | 512 | 1024);
        if (((flags & 4) && !busy) || !total || done >= total) continue;
        const name = (txt.match(/"name"\s+"([^"]*)"/) || [])[1] || 'Steam game';
        if (STEAM_IGNORE.test(name)) continue;
        out.push({ appid: String(num('appid')), title: name, done, total, paused: !!(flags & 512) });
      } catch { /* manifest mid-write */ }
    }
  }
  return out;
}
function startDownloadWatch() {
  if (dlTimer) return;
  const tick = () => {
    const list = readDownloads();
    const key = JSON.stringify(list);
    if (key !== dlLast && win) { dlLast = key; win.webContents.send('downloads', list); }
  };
  dlTimer = setInterval(tick, 3000);
  setTimeout(tick, 1500);
}
ipcMain.handle('downloads', () => readDownloads());

// ---------------------------------------------------------------- store launchers
// Finds Steam, Heroic (GOG and Epic), Lutris and GOG Galaxy so they can sit in the Apps blade.
function onPath(cmd) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, cmd);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* keep looking */ }
  }
  return null;
}
function flatpakHas(id) {
  return [path.join(os.homedir(), '.local/share/flatpak/app', id), path.join('/var/lib/flatpak/app', id)].some((p) => fs.existsSync(p));
}
ipcMain.handle('find-launchers', () => {
  const out = [];
  const add = (title, exe, args = '') => out.push({ title, exe, args });
  if (process.platform === 'win32') {
    const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean);
    const find = (rel) => pf.map((d) => path.join(d, rel)).find((p) => fs.existsSync(p));
    const st = find('Steam\\steam.exe'); if (st) add('Steam', st);
    const gg = find('GOG Galaxy\\GalaxyClient.exe'); if (gg) add('GOG Galaxy', gg);
    const he = find('heroic\\Heroic.exe'); if (he) add('Heroic Games Launcher', he);
    return out;
  }
  const native = (title, cmd, flat, args = '') => {
    const p = onPath(cmd);
    if (p) add(title, p, args);
    else if (flat && flatpakHas(flat)) add(title, onPath('flatpak') || '/usr/bin/flatpak', `run ${flat} ${args}`.trim());
  };
  native('Steam', 'steam', 'com.valvesoftware.Steam');
  native('Steam Big Picture', 'steam', 'com.valvesoftware.Steam', '-gamepadui');
  native('Heroic Games Launcher', 'heroic', 'com.heroicgameslauncher.hgl');
  native('Lutris', 'lutris', 'net.lutris.Lutris');
  return out;
});

// ---------------------------------------------------------------- media: clips and screenshots
const mediaDir = (id) => path.join(dataDir(), 'media', String(id).replace(/[^\w-]/g, ''));
const clips = new Map();
// On Wayland a 0x0 thumbnail makes getSources wait forever after the picker, so ask for a tiny one.
const THUMB = { width: 160, height: 90 };
ipcMain.handle('clip-open', (_e, id) => {
  fs.mkdirSync(mediaDir(id), { recursive: true });
  const file = path.join(mediaDir(id), `clip-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`);
  const key = Math.random().toString(36).slice(2);
  clips.set(key, { file, fd: fs.openSync(file, 'w') });
  return key;
});
ipcMain.handle('clip-chunk', (_e, key, buf) => {
  const c = clips.get(key); if (!c) return false;
  fs.writeSync(c.fd, Buffer.from(buf)); return true;
});
ipcMain.handle('clip-close', (_e, key) => {
  const c = clips.get(key); if (!c) return null;
  fs.closeSync(c.fd); clips.delete(key);
  if (fs.statSync(c.file).size < 50000) { fs.rmSync(c.file, { force: true }); return null; }
  return c.file;
});

// Steam keeps screenshots taken with F12 under userdata/<account>/760/remote/<appid>/screenshots.
ipcMain.handle('steam-shots', (_e, appid) => {
  const root = steamRoot(loadLib().settings.steamPath);
  if (!root || !/^\d+$/.test(String(appid))) return [];
  const out = [];
  let users = [];
  try { users = fs.readdirSync(path.join(root, 'userdata')); } catch { return []; }
  for (const u of users) {
    const dir = path.join(root, 'userdata', u, '760', 'remote', String(appid), 'screenshots');
    try { for (const f of fs.readdirSync(dir)) if (/\.(jpe?g|png)$/i.test(f)) out.push(path.join(dir, f)); } catch { /* none for this account */ }
  }
  return out.sort().slice(-40);
});

// ---------------------------------------------------------------- friends
ipcMain.handle('copy', (_e, text) => { clipboard.writeText(String(text)); return true; });
ipcMain.handle('open-link', (_e, url) => {
  if (!/^(https?:|mailto:|discord:|steam:\/\/(friends|install\/\d+$|store\/\d+$))/i.test(String(url))) return false;
  shell.openExternal(String(url)); return true;
});

// ---------------------------------------------------------------- peek + live view
ipcMain.handle('peek-back', () => Peek.back());
// The controller chord can arrive twice on Windows (the page and the XInput helper both see it).
let lastToggle = 0;
const peekToggle = () => { if (Date.now() - lastToggle < 700) return false; lastToggle = Date.now(); return Peek.toggle(); };
ipcMain.handle('peek-toggle', () => peekToggle());

// ---------------------------------------------------------------- colours of a picture, for the Game theme
// base: the average colour. vivid: the brightest strong colour, for accents.
ipcMain.handle('palette', (_e, p) => {
  try {
    const img = nativeImage.createFromPath(String(p));
    if (img.isEmpty()) return null;
    const bmp = img.resize({ width: 32 }).toBitmap();
    let r = 0, g = 0, b = 0, n = 0, best = null, bestScore = -1;
    for (let i = 0; i + 3 < bmp.length; i += 4) {
      const B = bmp[i], G = bmp[i + 1], R = bmp[i + 2];
      r += R; g += G; b += B; n++;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      const score = (mx - mn) * (mx > 60 ? 1 : 0.2) * (mx < 250 ? 1 : 0.7);
      if (score > bestScore) { bestScore = score; best = [R, G, B]; }
    }
    if (!n) return null;
    const base = [r / n, g / n, b / n].map(Math.round);
    return { base, vivid: bestScore > 40 ? best : base };
  } catch { return null; }
});

// ---------------------------------------------------------------- fonts for the Look menu
let fontList = null;
ipcMain.handle('fonts', () => {
  if (fontList) return fontList;
  try {
    // Windows has no fc-list; .NET knows the installed families.
    const out = process.platform === 'win32'
      ? require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }'], { encoding: 'utf8', timeout: 15000, windowsHide: true })
      : require('child_process').execFileSync('fc-list', [':', 'family'], { encoding: 'utf8', timeout: 5000 });
    fontList = [...new Set(out.split(/\r?\n/).map((l) => l.split(',')[0].trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  } catch { fontList = []; }
  return fontList;
});

// ---------------------------------------------------------------- window dock
ipcMain.handle('win-act', async (_e, id, act) => {
  id = String(id);
  if (id.startsWith('web:')) return require('./webapps').act(id.slice(4), String(act));
  if (id.startsWith('w32:') || id.startsWith('x11:')) return require('./winlist').act(id, String(act));
  return Peek.windowAction(id, String(act));
});
// Open a dock app: the first installed program from its list, or else its web page or folder.
// Which of these apps are installed, so the dock can offer the ones people actually have.
ipcMain.handle('dock-detect', (_e, list = []) => list.map((a) => !!(a && ((a.cmd && process.platform !== 'win32' && onPath(a.cmd)) || (a.flat && process.platform === 'linux' && flatpakHas(a.flat))))));
// The way to run one program: on the PATH, or its Flatpak. Null when it is not installed.
function runner(a) {
  const exe = a.cmd && process.platform !== 'win32' ? onPath(a.cmd) : null;
  if (exe) return [exe, []];
  if (a.flat && process.platform === 'linux' && flatpakHas(a.flat)) return [onPath('flatpak') || '/usr/bin/flatpak', ['run', a.flat]];
  return null;
}
function startFirst(list, extra = []) {
  for (const a of list || []) {
    const r = runner(a); if (!r) continue;
    try { spawn(r[0], [...r[1], ...extra], { detached: true, stdio: 'ignore' }).unref(); return true; } catch { /* try the next one */ }
  }
  return false;
}
// spec: { apps: [{cmd, flat}], uri, url, home, web, browser: {list: [{cmd, flat}], app} }
// The app comes first unless the slot wants the web version. Web pages go to the chosen browser,
// as an app window of its own when asked (Chromium-style browsers), else to the default browser.
ipcMain.handle('dock-open', async (_e, spec = {}) => {
  if (!spec.web && startFirst(spec.apps)) return true;
  if (!spec.web && spec.uri && process.platform === 'win32') { try { await shell.openExternal(spec.uri); return true; } catch { /* not installed */ } }
  if (spec.home) return !(await shell.openPath(os.homedir()));
  if (!spec.url || !/^https?:/i.test(spec.url)) return false;
  // Bladedeck's own app window, unless the site needs DRM that Electron cannot play.
  if (spec.inApp && !spec.drm) return 'webapp';
  const b = spec.browser;
  if (b && startFirst(b.list || [b], b.app ? [`--app=${spec.url}`] : ['--new-window', spec.url])) return true;
  await shell.openExternal(spec.url); return true;
});
ipcMain.handle('peek-config', (_e, { minimize }) => Peek.reconfigure(!!minimize));
ipcMain.handle('peek-mode', () => Peek.mode());
// The window to show live. Wayland asks through the system picker; X11 and Windows list windows,
// so we match the title. The picker steals focus, so on Wayland it only opens when asked.
// Live view and clips ask the system once. The page calls getDisplayMedia; this hands it the
// window or screen the player picked (on Wayland the system picker opens just this one time),
// instead of asking for a source first and then again for the video.
let captureWant = { caption: '', types: ['window'] };
ipcMain.handle('capture-want', (_e, caption = '', types = ['window'], ask = false) => {
  if (process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland' && !ask) return false;
  captureWant = { caption: String(caption), types: types.filter((t) => t === 'window' || t === 'screen') };
  return true;
});
app.whenReady().then(() => session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
  try {
    const src = await desktopCapturer.getSources({ types: captureWant.types.length ? captureWant.types : ['window'], thumbnailSize: THUMB });
    const want = captureWant.caption.toLowerCase();
    const hit = src.length <= 1 ? src[0]
      : want && (src.find((s) => s.name.toLowerCase() === want) || src.find((s) => s.name.toLowerCase().includes(want) || want.includes(s.name.toLowerCase())));
    if (!hit) return cb({});
    cb({ video: hit });
  } catch { cb({}); }
}));

// A picture of the whole menu for the water effect to ripple.
ipcMain.handle('snap', async () => {
  if (!win || win.isMinimized()) return null;
  try { return (await win.webContents.capturePage()).toJPEG(90); } catch { return null; }
});

// ---------------------------------------------------------------- music
const AUDIO = /\.(mp3|flac|ogg|oga|opus|m4a|aac|wav|webm)$/i;
ipcMain.handle('music-default', () => {
  const p = path.join(os.homedir(), 'Music');
  return fs.existsSync(p) ? p : '';
});
ipcMain.handle('music-scan', (_e, dir) => {
  const out = [];
  const walk = (d, depth) => {
    if (depth > 6 || out.length > 5000) return;
    let items; try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (it.name.startsWith('.')) continue;
      const fp = path.join(d, it.name);
      if (it.isDirectory()) walk(fp, depth + 1);
      else if (AUDIO.test(it.name)) out.push(fp);
    }
  };
  if (dir) walk(dir, 0);
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
});

// ---------------------------------------------------------------- friends over Tailscale
let presence = { name: 'Player 1', playing: null };
function startNet() {
  const r = Net.start({
    presence: () => presence,
    poke: (p) => { if (win) win.webContents.send('poked', p); }
  });
  // Tailscale may come up after Bladedeck does.
  if (!r.ok) setTimeout(startNet, 60000);
}
ipcMain.handle('presence', (_e, p) => { presence = { name: String(p.name || 'Player 1').slice(0, 40), playing: p.playing ? String(p.playing).slice(0, 120) : null, since: p.since || null }; });
ipcMain.handle('net-info', () => ({ ip: Net.myIp(), port: Net.PORT }));
ipcMain.handle('net-peers', () => Net.peers());
ipcMain.handle('net-hello', (_e, host) => Net.hello(String(host)));
ipcMain.handle('net-poke', (_e, host, body) => Net.poke(String(host), body));

// ---------------------------------------------------------------- artwork and RetroAchievements
require('./online').register({ settings: () => loadLib().settings, mediaDir });
require('./store').register({ getWin: () => win });

// ---------------------------------------------------------------- running apps: freeze, web apps, focus
const Procs = require('./procs');
app.whenReady().then(() => Procs.init(dataDir()));
ipcMain.handle('proc-freeze', (_e, pid, on) => Procs.freeze(pid, !!on));
ipcMain.handle('proc-frozen', () => Procs.list());
const WebApps = require('./webapps').register({ getDeck: () => win });
WebApps.setSend((ch, d) => { if (win && !win.isDestroyed()) win.webContents.send(ch, d); });
// Keep Bladedeck over Steam's "launching" pop-ups until the game's own window arrives.
ipcMain.handle('keep-on-top', (_e, on) => { if (win) win.setAlwaysOnTop(!!on, process.platform === 'win32' ? 'screen-saver' : 'floating'); return true; });
// Windows has no KWin: bring a program to the front by its process.
ipcMain.handle('focus-pid', (_e, pid) => new Promise((res) => {
  if (process.platform !== 'win32' || !(+pid)) return res(false);
  require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(New-Object -ComObject WScript.Shell).AppActivate(${+pid})`], { windowsHide: true, timeout: 8000 }, (err, out) => res(!err && /True/.test(String(out))));
}));
