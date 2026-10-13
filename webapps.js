'use strict';
/* Web apps: YouTube, Discord, Twitch and the rest open in Bladedeck's own windows instead of a
   browser. No tabs, no address bar, logins kept between visits (one shared session), full screen
   when Bladedeck is, and a controller works them: the d-pad and A act as arrow keys and Enter,
   B goes back, X plays and pauses, and View or the home button hops back to Bladedeck.
   YouTube can open its TV interface, which is made for a controller.
   Sites that need DRM (Netflix, Spotify) still go to the browser; Electron cannot play them. */
const { BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');

// The TV interface only shows for TV browsers.
const TV_UA = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36';
const PARTITION = 'persist:webapps';
const apps = new Map(); // key -> BrowserWindow
let deck = null, send = () => {};

function list() {
  return [...apps.entries()].filter(([, w]) => !w.isDestroyed()).map(([key, w]) => ({
    id: `web:${key}`, key, caption: w.getTitle(), cls: 'bladedeck-web', pid: 0, min: w.isMinimized(), active: w.isFocused(), web: true }));
}
const tell = () => send('webapps', list());

function setupSession() {
  const ses = session.fromPartition(PARTITION);
  if (ses.__bd) return ses;
  ses.__bd = true;
  // Voice chat, notifications, full screen and gamepads are what these sites ask for.
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'fullscreen', 'notifications', 'clipboard-sanitized-write', 'pointerLock', 'speaker-selection'].includes(perm)));
  return ses;
}

function open({ key, name, url, tv }) {
  if (!/^https:\/\//i.test(String(url))) return false;
  key = String(key || name).replace(/[^\w-]/g, '').slice(0, 40) || 'web';
  const have = apps.get(key);
  if (have && !have.isDestroyed()) { if (have.isMinimized()) have.restore(); have.show(); have.focus(); return true; }
  setupSession();
  const w = new BrowserWindow({
    width: 1280, height: 800, title: name || 'Bladedeck', backgroundColor: '#000000', autoHideMenuBar: true, show: false,
    fullscreen: !!(deck && !deck.isDestroyed() && deck.isFullScreen()),
    webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'webapp-preload.js'), backgroundThrottling: false }
  });
  w.setMenuBarVisibility(false);
  apps.set(key, w);
  const home = new URL(tv ? 'https://www.youtube.com/tv' : url);
  w.loadURL(home.href, tv ? { userAgent: TV_UA } : {});
  if (tv) w.webContents.setUserAgent(TV_UA);
  w.once('ready-to-show', () => { w.show(); w.focus(); });
  // Links to the same site stay in the app; anything else opens in the browser.
  w.webContents.setWindowOpenHandler(({ url: u }) => {
    try { if (new URL(u).hostname.endsWith(home.hostname.replace(/^www\./, ''))) { w.loadURL(u); return { action: 'deny' }; } } catch { /* odd link */ }
    if (/^https?:/i.test(u)) shell.openExternal(u);
    return { action: 'deny' };
  });
  for (const ev of ['page-title-updated', 'minimize', 'restore', 'focus', 'blur', 'show', 'hide']) w.on(ev, tell);
  w.on('closed', () => { apps.delete(key); tell(); });
  tell();
  return true;
}

function act(key, a) {
  const w = apps.get(key); if (!w || w.isDestroyed()) return false;
  if (a === 'close') w.close();
  else if (a === 'min') w.minimize();
  else { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
  return true;
}

// Keys a controller sends, as real key presses so every site understands them.
const KEYS = new Set(['Up', 'Down', 'Left', 'Right', 'Enter', 'Escape', 'Backspace', 'Space', 'Tab', 'MediaPlayPause', 'PageUp', 'PageDown']);
function register({ getDeck }) {
  ipcMain.handle('webapp-open', (_e, spec) => { deck = getDeck(); return open(spec || {}); });
  ipcMain.handle('webapp-list', () => list());
  ipcMain.handle('webapp-act', (_e, key, a) => act(String(key), String(a)));
  ipcMain.on('webapp-key', (e, key) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w || ![...apps.values()].includes(w)) return;
    if (key === 'deck') { w.minimize(); const d = getDeck(); if (d) { d.show(); d.focus(); } return; }
    if (key === 'back') { if (e.sender.navigationHistory?.canGoBack?.() ?? e.sender.canGoBack()) { e.sender.navigationHistory?.goBack ? e.sender.navigationHistory.goBack() : e.sender.goBack(); } else w.minimize(); return; }
    if (!KEYS.has(key)) return;
    e.sender.sendInputEvent({ type: 'keyDown', keyCode: key });
    if (key.length === 1 || key === 'Space') e.sender.sendInputEvent({ type: 'char', keyCode: key === 'Space' ? ' ' : key });
    e.sender.sendInputEvent({ type: 'keyUp', keyCode: key });
  });
  return { setSend: (fn) => { send = fn; } };
}

module.exports = { register, act, list, open };
