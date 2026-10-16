'use strict';
/* Web apps: YouTube, Discord, Twitch and the rest open in Bladedeck's own windows instead of a
   browser. No tabs, no address bar, logins kept between visits (one shared session), full screen
   when Bladedeck is, and a controller works them: the d-pad and A act as arrow keys and Enter,
   B goes back, X plays and pauses, and View or the home button hops back to Bladedeck.
   YouTube can open its TV interface, which is made for a controller.
   Sites that need DRM (Netflix, Spotify) still go to the browser; Electron cannot play them. */
const { BrowserWindow, ipcMain, session, shell, screen } = require('electron');
const path = require('path');

// The TV interface only shows for TV browsers.
const TV_UA = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36';
const PARTITION = 'persist:webapps';
const apps = new Map(); // key -> BrowserWindow
let deck = null, send = () => {};

function list() {
  return [...apps.entries()].filter(([, w]) => !w.isDestroyed()).map(([key, w]) => ({
    id: `web:${key}`, key, caption: w.getTitle(), cls: 'bladedeck-web', pid: 0, min: w.isMinimized() || !w.isVisible(), active: w.isFocused(), web: true }));
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

/* The walkthrough window: a small YouTube that floats over games, for following a guide while
   playing. It pops up without taking focus from the game, and hides again (pausing the video).
   Mobile YouTube fits a small window best. */
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const searchUrl = (q) => `https://m.youtube.com/results?search_query=${encodeURIComponent(q)}`;
// A YouTube video page to play in it, from the YouTube panel. Only YouTube watch pages.
const videoUrl = (u) => { try { const x = new URL(String(u)); return /^https:$/.test(x.protocol) && /^(m|www)\.youtube\.com$/.test(x.hostname) && x.pathname === '/watch' && /^[\w-]{11}$/.test(x.searchParams.get('v') || '') ? x.toString() : ''; } catch { return ''; } };
// Windows: a game that opens full screen after this window showed covers it. For the first
// 15 seconds it is put back on top of the always-on-top windows now and then (without focus).
function keepOver(w) {
  if (process.platform !== 'win32') return;
  clearInterval(w.__over); let n = 0;
  w.__over = setInterval(() => {
    if (w.isDestroyed() || !w.isVisible() || ++n > 10) { clearInterval(w.__over); return; }
    w.setAlwaysOnTop(false); w.setAlwaysOnTop(true, 'screen-saver');
  }, 1500);
}
function pipToggle({ query = '', show, url = '' } = {}) {
  let w = apps.get('walkthrough');
  url = videoUrl(url);
  if (w && !w.isDestroyed()) {
    const visible = w.isVisible() && !w.isMinimized();
    if (visible && show !== true) {
      w.webContents.executeJavaScript("document.querySelectorAll('video').forEach((v) => v.pause()); 1").catch(() => {});
      w.hide(); tell(); return 'hidden';
    }
    if (url) { w.__q = ''; w.loadURL(url, { userAgent: MOBILE_UA }); }
    else if (query && query !== w.__q) { w.__q = query; w.loadURL(searchUrl(query), { userAgent: MOBILE_UA }); }
    if (w.isMinimized()) w.restore();
    w.showInactive(); w.setAlwaysOnTop(true, 'screen-saver'); keepOver(w); tell(); return 'shown';
  }
  setupSession();
  const area = screen.getPrimaryDisplay().workArea, W = Math.round(Math.min(560, area.width * 0.32)), H = Math.round(W * 0.66);
  w = new BrowserWindow({
    width: W, height: H, x: area.x + area.width - W - 24, y: area.y + area.height - H - 24, minWidth: 280, minHeight: 200,
    title: 'Walkthrough', backgroundColor: '#000000', autoHideMenuBar: true, show: false, alwaysOnTop: true, skipTaskbar: false, fullscreenable: false,
    webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'webapp-preload.js'), backgroundThrottling: false }
  });
  w.setMenuBarVisibility(false); w.setAlwaysOnTop(true, 'screen-saver'); w.setVisibleOnAllWorkspaces?.(true);
  w.__q = query;
  apps.set('walkthrough', w);
  w.loadURL(url || (query ? searchUrl(query) : 'https://m.youtube.com'), { userAgent: MOBILE_UA });
  w.webContents.setUserAgent(MOBILE_UA);
  w.once('ready-to-show', () => { w.showInactive(); keepOver(w); tell(); });
  w.webContents.setWindowOpenHandler(({ url: u }) => { if (/youtube\.com|youtu\.be/.test(u)) w.loadURL(u); else if (/^https?:/i.test(u)) shell.openExternal(u); return { action: 'deny' }; });
  for (const ev of ['page-title-updated', 'minimize', 'restore', 'focus', 'blur', 'show', 'hide']) w.on(ev, tell);
  w.on('closed', () => { apps.delete('walkthrough'); tell(); });
  return 'shown';
}

/* Coming back to the menu: the floating window hands its video back (which video, how far in, and
   whether it was showing), pauses and hides, so the menu's own mini player carries on. */
async function pipTake() {
  const w = apps.get('walkthrough'); if (!w || w.isDestroyed()) return null;
  const visible = w.isVisible() && !w.isMinimized();
  let t = 0; try { t = Math.floor(await w.webContents.executeJavaScript("(() => { const v = document.querySelector('video'); if (v) v.pause(); return v ? v.currentTime : 0; })()")) || 0; } catch { /* no page */ }
  const url = videoUrl(w.webContents.getURL());
  w.hide(); tell();
  return { visible, url, t };
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
  ipcMain.handle('pip-toggle', (_e, o) => pipToggle(o || {}));
  ipcMain.handle('pip-take', () => pipTake());
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

module.exports = { register, act, list, open, pipToggle };
