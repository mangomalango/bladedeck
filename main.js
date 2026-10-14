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
  try {
    fs.renameSync(tmp, p);
  } catch (err) {
    if (process.platform === 'win32') {
      fs.copyFileSync(tmp, p);
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    } else {
      throw err;
    }
  }
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

/* Plain http pages load in Bladedeck's browser views only from your own sites (a server on your
   network added in Sources); everything else has to be https. */
const httpOrigins = new Set();
const httpOk = (u) => { try { const x = new URL(String(u)); return x.protocol === 'http:' && httpOrigins.has(x.origin); } catch { return false; } };
ipcMain.handle('web-allow', (_e, origin) => {
  let o; try { o = new URL(String(origin)); } catch { return false; }
  if (o.protocol !== 'http:') return false;
  const lib = loadLib();
  if (!(lib.settings.sources || []).some((s) => { try { return new URL(s.where).origin === o.origin; } catch { return false; } })) return false;
  httpOrigins.add(o.origin); return true;
});

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
      backgroundThrottling: false,
      // Floating panels (YouTube, the browser) are <webview>s inside the menu.
      webviewTag: true
    }
  });
  win.setMenuBarVisibility(false);
  // Panels get no Node, no preload of their own, and the shared web-app session, whatever the page asks for.
  win.webContents.on('will-attach-webview', (_e, prefs, params) => {
    delete prefs.preload; prefs.nodeIntegration = false; prefs.contextIsolation = true; prefs.sandbox = true;
    // A Wallpaper Engine web wallpaper: only from a folder a wallpaper scan found, in its own session.
    if (params.partition === 'wallpaper' && require('./wallpaper').webAllowed(params.src)) { prefs.webSecurity = true; return; }
    if (!/^https:\/\//.test(params.src || '') && params.src !== 'about:blank' && !httpOk(params.src)) params.src = 'about:blank';
    params.partition = 'persist:webapps';
  });
  win.webContents.on('did-attach-webview', (_e, wc) => {
    // Wallpapers stay put: no leaving their page, no new windows.
    if (wc.session === require('electron').session.fromPartition('wallpaper')) {
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      wc.on('will-navigate', (ev, url) => { if (!require('./wallpaper').webAllowed(url)) ev.preventDefault(); });
      wc.setAudioMuted(true);
      return;
    }
    // Links that open new windows stay in the panel; a pop-up to another site (an ad) goes nowhere.
    wc.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url) && !require('./adblock').popupIsAd(wc.getURL(), url)) wc.loadURL(url); return { action: 'deny' }; });
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    Peek.start(win, { dataDir: dataDir(), minimize: !!lib.settings.peekMinimize, handler: (ev) => { if (win) win.webContents.send('peek', ev); const p2 = require('./players').p2(); if (p2 && !p2.isDestroyed() && /^(windows|opened|gone)$/.test(ev.kind)) p2.webContents.send('peek', ev); } })
      .then((m) => {
        if (win) win.webContents.send('peek', { kind: 'mode', mode: m });
        // Without KWin, list windows another way (Windows, or Linux on X11 with wmctrl).
        require('./winlist').start({ dir: dataDir(), mode: m, onList: (l) => { if (win && !win.isDestroyed()) win.webContents.send('peek', { kind: 'windows', caption: JSON.stringify(l), pid: 0, cls: '' }); } });
      });
    if (process.platform === 'win32') require('./winpad').start(dataDir(), () => peekToggle(), (kind = 'pip') => { if (win) win.webContents.send('peek', { kind, caption: '', pid: 0, cls: '' }); });
  });
  // Player 2's menu (multi-screen) goes with the main one.
  win.on('closed', () => { win = null; require('./players').stop(); });
  // Whether Bladedeck's window has the screen's focus, whatever is focused inside it (a panel's page).
  win.on('focus', () => win.webContents.send('deck-focus', true));
  win.on('blur', () => win.webContents.send('deck-focus', false));
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
app.on('will-quit', () => { require('./discord').stop(); require('./livecap').stop(); require('./procs').thawAll(); require('./capture').stop(); require('./players').stop(); require('./winlist').stop(); quiet(false); Peek.stop(); Net.stop(); if (process.platform === 'win32') { require('./winaudio').stop(); require('./winpad').stop(); } });

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

// Only the main menu writes the library: Player 2's menu (multi-screen) reads it.
ipcMain.handle('save', (_e, lib) => { if (win && _e.sender !== win.webContents) return false; if (require('./backup').restoring?.()) return false; writeJson(libFile(), lib); require('./backup').changed(); return true; });

// These act on the window that asked (Player 2's menu has its own).
const own = (e) => BrowserWindow.fromWebContents(e.sender);
ipcMain.handle('set-mode', (_e, mode) => {
  const w = own(_e); if (!w) return;
  w.setFullScreen(mode === 'console');
});

ipcMain.handle('quit', (_e) => { if (win && _e.sender !== win.webContents) return; app.quit(); });
ipcMain.handle('minimize', (_e) => { const w = own(_e); if (w) w.minimize(); });
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
  if (kind === 'audio') {
    filters = [{ name: 'Music', extensions: ['ogg', 'oga', 'opus', 'mp3', 'flac', 'wav', 'm4a'] }];
  }
  if (kind === 'media') {
    filters = [{ name: 'Clips and pictures', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'webm', 'mp4', 'mkv', 'mov', 'm4v'] }];
  }
  const r = await dialog.showOpenDialog(win, { properties: props, filters: kind === 'dir' ? undefined : filters });
  if (!r.canceled && r.filePaths[0]) require('./fsaccess').allowPicked(r.filePaths[0]);
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

ipcMain.handle('launch', async (_e, { entry, emulator, settings, player }) => {
  // Whoever asked hears when the game ends: the main menu, or Player 2's.
  const asker = _e.sender;
  try {
    if (entry.type === 'steam') {
      await shell.openExternal(`steam://rungameid/${encodeURIComponent(entry.appid)}`);
      if (settings && settings.quietWhilePlaying) quiet(true);
      require('./discord').setActivity({ title: entry.title, type: 'steam', appid: entry.appid, started: Date.now() });
      return { ok: true };
    }
    if (entry.type === 'gog' && entry.heroicId && !entry.exe) {
      await shell.openExternal(`heroic://launch/gog/${encodeURIComponent(entry.heroicId)}`);
      if (settings && settings.quietWhilePlaying) quiet(true);
      require('./discord').setActivity({ title: entry.title, type: 'gog', started: Date.now() });
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
      // Starting from a save state: the emulator's own option, for a state found for this game.
      if (entry.stateFile) args = await require('./savestates').withState(args, entry, emulator, String(entry.stateFile));
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

    /* Games and emulators only read the controller while their window is in front, so pressing
       buttons in Bladedeck's menu does not also play the game behind it. Many emulators ask SDL
       for background input; the environment variable overrides that. A Flatpak needs it passed in. */
    const padEnv = (settings && settings.padBackground) || (player && player.multi) ? {} : { SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS: '0' };
    if (padEnv.SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS && path.basename(exe) === 'flatpak') {
      const r = args.indexOf('run');
      if (r >= 0) args.splice(r + 1, 0, '--env=SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS=0');
    }
    const started = Date.now();
    // GameMode asks the system for full speed while the game runs.
    const gm = settings && settings.gamemode && process.platform === 'linux' && onPath('gamemoderun');
    if (gm) { args = [exe, ...args]; exe = gm; }
    // Multi-screen: the player's own controller only, their sound, and input while unfocused.
    let playerEnv = {};
    if (player && player.multi && process.platform === 'linux') {
      const w = require('./players').wrapForPlayer(exe, args, player);
      exe = w.exe; args = w.args; playerEnv = w.env;
    }
    // A game's own environment (Edit, Environment): KEY=value lines, such as WINEDLLOVERRIDES.
    const ownEnv = {};
    for (const line of String(entry.env || '').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
      if (m) ownEnv[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1').replace(/^~(?=\/)/, os.homedir());
    }
    const child = spawn(exe, args, {
      cwd, detached: true, stdio: 'ignore',
      shell: ext === '.bat' || ext === '.cmd',
      env: { ...process.env, ...(settings && settings.shaderCache === false ? {} : SHADER_ENV), ...padEnv, ...playerEnv, ...ownEnv }
    });
    await new Promise((res, rej) => { child.once('spawn', res); child.once('error', rej); });
    child.unref();
    const pid = child.pid;

    // The renderer minimizes once its launch animation has played out.
    if (settings && settings.quietWhilePlaying) quiet(true);
    require('./discord').setActivity({ title: entry.title, system: emulator?.name || entry.system || '', type: entry.type, appid: entry.appid, started });

    child.once('exit', () => {
      quiet(false);
      require('./discord').clearActivity();
      const seconds = Math.round((Date.now() - started) / 1000);
      if (!asker.isDestroyed()) asker.send('launch-ended', { id: entry.id, seconds });
      if (!win || asker !== win.webContents) return;
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

// ---------------------------------------------------------------- split screen (PartyDeck)
/* PartyDeck runs up to four copies of a game side by side, each with its own controller and
   saves, joined to each other through an emulated Steam network. Bladedeck installs it (from
   GitHub, into ~/Games/Emulators/PartyDeck) and starts it for a game's program; on KDE it runs in
   its own KWin session that tiles the players. The game needs online or LAN multiplayer. */
const partydeckPath = () => {
  const d = path.join(os.homedir(), 'Games', 'Emulators', 'PartyDeck');
  try { const f = fs.readdirSync(d).filter((n) => /^partydeck.*\.AppImage$/i.test(n)).sort().pop(); return f ? path.join(d, f) : null; } catch { return null; }
};
// The program a library entry runs: its own, or for Steam games the one in the game's folder.
function gameProgram(entry, custom) {
  if (entry.type !== 'steam') return entry.exe && fs.existsSync(entry.exe) ? entry.exe : null;
  const root = steamRoot(custom); if (!root) return null;
  const libs = new Set([root]);
  try { for (const m of fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8').matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\')); } catch { /* one library */ }
  for (const lib of libs) {
    const mf = path.join(lib, 'steamapps', `appmanifest_${String(entry.appid).replace(/\D/g, '')}.acf`);
    if (!fs.existsSync(mf)) continue;
    const dir = (fs.readFileSync(mf, 'utf8').match(/"installdir"\s+"([^"]+)"/) || [])[1];
    if (dir) return require('./store').findLauncher(path.join(lib, 'steamapps', 'common', dir));
  }
  return null;
}
ipcMain.handle('split-status', () => ({ linux: process.platform === 'linux', installed: !!partydeckPath(), bwrap: !!onPath('bwrap'), gamescope: !!onPath('gamescope'), kde: /KDE/i.test(process.env.XDG_CURRENT_DESKTOP || '') }));
// Game setups ("handlers") installed in PartyDeck, by name, so a game can be told which one is its own.
ipcMain.handle('split-handlers', () => {
  const dir = path.join(os.homedir(), '.local', 'share', 'partydeck', 'handlers');
  let out = [];
  try {
    out = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
      let j = {}; try { j = JSON.parse(fs.readFileSync(path.join(dir, d.name, 'handler.json'), 'utf8')); } catch { /* name from the folder */ }
      return { id: d.name, name: String(j.display_name || j.name || j.game || d.name).slice(0, 80) };
    });
  } catch { /* none yet */ }
  return out;
});
ipcMain.handle('split-launch', (_e, { entry, steamPath, mode = 'exec', args = '' }) => {
  if (process.platform !== 'linux') return { ok: false, error: 'Split screen with PartyDeck works on Linux. On Windows, Nucleus Co-op does the same (splitscreen.me).' };
  const pd = partydeckPath(); if (!pd) return { ok: false, error: 'Install PartyDeck first.' };
  if (entry.type === 'rom') return { ok: false, error: 'Emulators have their own multiplayer: plug in more controllers and start the game as usual.' };
  const kde = /KDE/i.test(process.env.XDG_CURRENT_DESKTOP || '') && onPath('kwin_wayland');
  // A game with a handler starts from PartyDeck's own screen, where the handler is picked.
  if (mode === 'handler') {
    const t1 = Date.now();
    let c; try { c = spawn(pd, [...(kde ? ['--kwin'] : []), '--fullscreen'], { stdio: 'ignore' }); } catch (err) { return { ok: false, error: String(err.message || err) }; }
    c.on('exit', () => { if (win && !win.isDestroyed()) win.webContents.send('launch-ended', { id: entry.id, seconds: Math.round((Date.now() - t1) / 1000) }); });
    return { ok: true, pid: c.pid };
  }
  const exe = gameProgram(entry, steamPath);
  if (!exe) return { ok: false, error: entry.type === 'steam' ? 'The game\'s program was not found in its Steam folder. Is it installed?' : 'This game has no program file to run.' };
  const t0 = Date.now();
  let child;
  const extra = String(args || '').trim().slice(0, 300);
  try { child = spawn(pd, ['--exec', exe, ...(extra ? ['--args', extra] : []), ...(kde ? ['--kwin'] : []), '--fullscreen'], { cwd: path.dirname(exe), stdio: 'ignore' }); }
  catch (err) { return { ok: false, error: String(err.message || err) }; }
  child.on('exit', () => { if (win && !win.isDestroyed()) win.webContents.send('launch-ended', { id: entry.id, seconds: Math.round((Date.now() - t0) / 1000) }); });
  return { ok: true, pid: child.pid, exe };
});

// ---------------------------------------------------------------- cheats and mods
/* Where each emulator looks for cheats, patches and mods: its Flatpak folders and its usual
   folders when installed another way. Only the ones that exist are offered to open; a Flatpak
   one that does not exist yet can be created. Some emulators read cheats next to the game. */
function modDirs({ name = '', exe = '', rom = '' } = {}) {
  const h = os.homedir(), v = (id, ...p) => path.join(h, '.var/app', id, ...p), c = (...p) => path.join(h, '.config', ...p), d = (...p) => path.join(h, '.local/share', ...p);
  // Windows: Documents, AppData, and portable installs next to the emulator.
  const W = process.platform === 'win32', doc = (...p) => path.join(h, 'Documents', ...p), ad = (...p) => path.join(process.env.APPDATA || path.join(h, 'AppData', 'Roaming'), ...p);
  const ex = (...p) => (exe ? path.join(path.dirname(exe), ...p) : '');
  const romDir = rom ? path.dirname(rom) : '';
  const L = (...ps) => (W ? [] : ps), Win = (...ps) => (W ? ps : []);
  const MAP = [
    [/pcsx2/i, [['Cheats (.pnach)', ...L(v('net.pcsx2.PCSX2', 'config/PCSX2/cheats'), c('PCSX2/cheats')), ...Win(ex('cheats'), doc('PCSX2', 'cheats'))], ['Patches (.pnach)', ...L(v('net.pcsx2.PCSX2', 'config/PCSX2/patches'), c('PCSX2/patches')), ...Win(ex('patches'), doc('PCSX2', 'patches'))], ['Texture packs', ...L(v('net.pcsx2.PCSX2', 'config/PCSX2/textures'), c('PCSX2/textures')), ...Win(ex('textures'), doc('PCSX2', 'textures'))]]],
    [/rpcs3/i, [['Patches (patch.yml)', ...L(v('net.rpcs3.RPCS3', 'config/rpcs3/patches'), c('rpcs3/patches')), ...Win(ex('patches'))]]],
    [/dolphin/i, [['Game settings and cheats (.ini)', ...L(v('org.DolphinEmu.dolphin-emu', 'data/dolphin-emu/GameSettings'), d('dolphin-emu/GameSettings')), ...Win(ex('User', 'GameSettings'), doc('Dolphin Emulator', 'GameSettings'), ad('Dolphin Emulator', 'GameSettings'))], ['Texture packs', ...L(v('org.DolphinEmu.dolphin-emu', 'data/dolphin-emu/Load/Textures'), d('dolphin-emu/Load/Textures')), ...Win(ex('User', 'Load', 'Textures'), doc('Dolphin Emulator', 'Load', 'Textures'), ad('Dolphin Emulator', 'Load', 'Textures'))]]],
    [/ryujinx/i, [['Mods and cheats', ...L(v('io.github.ryubing.Ryujinx', 'config/Ryujinx/mods/contents'), c('Ryujinx/mods/contents')), ...Win(ex('portable', 'mods', 'contents'), ad('Ryujinx', 'mods', 'contents'))]]],
    [/cemu/i, [['Graphic packs and mods', ...L(v('info.cemu.Cemu', 'data/Cemu/graphicPacks'), d('Cemu/graphicPacks')), ...Win(ex('graphicPacks'), ad('Cemu', 'graphicPacks'))]]],
    [/ppsspp/i, [['Cheats', ...L(v('org.ppsspp.PPSSPP', 'config/ppsspp/PSP/Cheats'), c('ppsspp/PSP/Cheats')), ...Win(ex('memstick', 'PSP', 'Cheats'), doc('PPSSPP', 'PSP', 'Cheats'))], ['Texture packs', ...L(v('org.ppsspp.PPSSPP', 'config/ppsspp/PSP/TEXTURES'), c('ppsspp/PSP/TEXTURES')), ...Win(ex('memstick', 'PSP', 'TEXTURES'), doc('PPSSPP', 'PSP', 'TEXTURES'))]]],
    [/retroarch/i, [['Cheats (.cht)', ...L(v('org.libretro.RetroArch', 'config/retroarch/cheats'), c('retroarch/cheats')), ...Win(ex('cheats'), ad('RetroArch', 'cheats'))]]],
    [/azahar|citra/i, [['Mods (load/mods)', ...L(v('org.azahar_emu.Azahar', 'data/azahar-emu/load/mods'), d('azahar-emu/load/mods')), ...Win(ex('user', 'load', 'mods'), ad('Azahar', 'load', 'mods'))]]],
    [/shadps4/i, [['Patches', ...L(d('shadPS4/patches')), ex('user', 'patches'), ...Win(ad('shadPS4', 'patches'))]]],
    [/xenia/i, [['Patches (.patch.toml)', ex('patches')]]],
    [/mgba/i, [['Cheats: a .cheats file next to the game, named like it', romDir]]],
    [/melonds/i, [['Cheats: a .mch file next to the game, named like it', romDir]]],
    [/xemu|flycast|mupen|rmg|snes9x|duckstation/i, [['Cheats are set inside the emulator', '']]]
  ];
  const row = MAP.find(([re]) => re.test(`${name} ${exe}`));
  if (!row) return [];
  return row[1].map(([label, ...ps]) => {
    const paths = ps.filter(Boolean);
    const found = paths.find((p) => fs.existsSync(p));
    // Not there yet: it can be made where the emulator's own folder already is (a Flatpak's data
    // folder, the emulator's install folder, its Documents or AppData folder).
    const makeable = paths.find((p) => { const root = p.includes(`${path.sep}.var${path.sep}app${path.sep}`) ? p.split(path.sep).slice(0, p.split(path.sep).indexOf('app') + 2).join(path.sep) : path.dirname(p); return fs.existsSync(root); });
    return { label, path: found || makeable || paths[0] || '', exists: !!found, creatable: !found && !!makeable };
  });
}
// Only folders worked out here may be created or copied into, and only files in Bladedeck's
// allowed folders, or ones you just picked yourself, may be copied.
const modTargets = new Set();
ipcMain.handle('mod-dirs', (_e, em) => {
  const FA = require('./fsaccess');
  const out = modDirs(em || {});
  for (const d of out) if (d.path) { modTargets.add(path.resolve(d.path)); FA.allowForSession(d.path); }
  return out;
});
ipcMain.handle('mod-mkdir', (_e, dir) => { const d = path.resolve(String(dir)); if (!modTargets.has(d)) return false; fs.mkdirSync(d, { recursive: true }); return true; });
ipcMain.handle('mod-add', (_e, dir, file) => {
  const FA = require('./fsaccess');
  const d = path.resolve(String(dir)), f = path.resolve(String(file));
  if (!modTargets.has(d) || !fs.existsSync(f) || !(FA.allowed(f) || FA.wasPicked(f))) return { ok: false, error: 'That file or folder is not available.' };
  fs.mkdirSync(d, { recursive: true });
  const to = path.join(d, path.basename(f));
  try { fs.cpSync(f, to, { recursive: true }); return { ok: true, to }; } catch (err) { return { ok: false, error: String(err.message || err) }; }
});

// ---------------------------------------------------------------- the Files panel
// Lives in fsaccess.js: Bladedeck's own folder by default, other folders only when allowed.
require('./fsaccess').register({ getWin: () => win });
require('./voice').register({ getWin: () => win });
require('./wallpaper').register({ steamRoot: () => steamRoot(loadLib().settings?.steamPath) });

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
ipcMain.handle('win-act', async (_e, id, act, pid) => {
  id = String(id);
  // Never close the program Bladedeck itself runs under (that would close Bladedeck too).
  if (act === 'close' && pid && require('./procs').isOwn(pid)) return 'own';
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
ipcMain.handle('capture-want', (_e, caption = '', types = ['window'], ask = false, audio = false) => {
  if (process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland' && !ask) return false;
  captureWant = { caption: String(caption), types: types.filter((t) => t === 'window' || t === 'screen'), audio: !!audio };
  return true;
});
app.whenReady().then(() => session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
  try {
    const src = await desktopCapturer.getSources({ types: captureWant.types.length ? captureWant.types : ['window'], thumbnailSize: THUMB });
    const want = captureWant.caption.toLowerCase();
    const hit = src.length <= 1 ? src[0]
      : want && (src.find((s) => s.name.toLowerCase() === want) || src.find((s) => s.name.toLowerCase().includes(want) || want.includes(s.name.toLowerCase())));
    if (!hit) return cb({});
    // Windows can hand over the game's sound too.
    cb(captureWant.audio && process.platform === 'win32' ? { video: hit, audio: 'loopback' } : { video: hit });
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
require('./capture').register({ getWin: () => win });
require('./system').register();
require('./players').register({ getWin: () => win });
require('./extras').register({ settings: () => loadLib().settings });
require('./roms').register({ getWin: () => win });
require('./achievements').register({ getWin: () => win });
require('./gamemusic').register();
require('./savestates').register({ getLib: () => loadLib() });
require('./realdebrid').register({ getWin: () => win, settings: () => loadLib().settings });
// Nearby Bladedecks: a stable id for this install, so others do not see it twice.
{ const idFile = path.join(app.getPath('userData'), 'lan-id');
  const lanId = () => { try { return fs.readFileSync(idFile, 'utf8').trim(); } catch { const id = require('./lan').newId(); try { fs.writeFileSync(idFile, id); } catch { /* optional */ } return id; } };
  require('./lan').register({ getWin: () => win, dataId: lanId });
  app.on('will-quit', () => require('./lan').stop()); }
require('./companion').register({ getWin: () => win, loadLib: () => loadLib() });
require('./livecap').register();
require('./webdl').register({ getWin: () => win });
require('./finder').register();
require('./minecraft').register();
require('./backup').register({ getWin: () => win, libFile, dataDir });
require('./discord').register({ settings: () => loadLib().settings });
require('./adblock').register({ settings: () => loadLib().settings });

// ---------------------------------------------------------------- running apps: freeze, web apps, focus
const Procs = require('./procs');
app.whenReady().then(() => Procs.init(dataDir()));
ipcMain.handle('proc-freeze', (_e, pid, on) => Procs.freeze(pid, !!on));
ipcMain.handle('proc-frozen', () => Procs.list());
ipcMain.handle('pid-info', (_e, pid) => Procs.info(pid));
const WebApps = require('./webapps').register({ getDeck: () => win });
WebApps.setSend((ch, d) => { if (win && !win.isDestroyed()) win.webContents.send(ch, d); });
// Keep Bladedeck over Steam's "launching" pop-ups until the game's own window arrives.
ipcMain.handle('deck-focus', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); Peek.focusDeck(); } return true; });
ipcMain.handle('keep-on-top', (_e, on) => { if (win) win.setAlwaysOnTop(!!on, process.platform === 'win32' ? 'screen-saver' : 'floating'); return true; });
// Windows has no KWin: bring a program to the front by its process.
ipcMain.handle('focus-pid', (_e, pid) => new Promise((res) => {
  if (process.platform !== 'win32' || !(+pid)) return res(false);
  require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(New-Object -ComObject WScript.Shell).AppActivate(${+pid})`], { windowsHide: true, timeout: 8000 }, (err, out) => res(!err && /True/.test(String(out))));
}));
