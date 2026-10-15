'use strict';
/* Phone messages (the owner's design): a notification the phone app forwards (only from apps the
   owner ticked on the phone) arrives as a mostly see-through bubble at the bottom of the screen,
   with a soft bubble sound, over the menu or a game, without ever taking focus. Holding LB + RB
   and a trigger floats it to the top while it fills with air: it grows to the message's size and
   the screen behind it blurs, so the text is easy to read. Letting go pops it into the
   notification bar, and a short choice follows: keep playing (the default, by waiting), LB pause,
   RB menu. A bubble left alone fades after a while and goes to the bar too, so nothing is lost.
   - Local network only: messages come through the paired phone connection (companion.js
     /api/notify), never from anywhere else, and are kept in memory for this session only.
   - Capped: 40 characters for the app and sender, 500 for the text, 12 messages a minute per phone.
   - Do not disturb (Settings, Phone app): everything; quiet (no sound); bar only (no bubble);
     off (dropped).
   The bubble lives in its own transparent window (renderer/bubble.html), click-through and never
   focusable, on top of everything; full-screen exclusive games (rare now) hide it. */
const { BrowserWindow, ipcMain, screen, desktopCapturer } = require('electron');
const path = require('path');

let deps = null, overlay = null, ready = false;
const queue = [], recent = new Map(); // phone name -> times of its last messages
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n);

function level() { const s = deps.settings() || {}; return ['all', 'quiet', 'bar', 'off'].includes(s.phoneMsgs) ? s.phoneMsgs : 'all'; }
const deck = () => { const w = deps.getWin(); return w && !w.isDestroyed() ? w : null; };
const tellDeck = (d) => { const w = deck(); if (w) w.webContents.send('phone-msg', d); };

function makeOverlay() {
  if (overlay && !overlay.isDestroyed()) return overlay;
  const w = deck(), d = w ? screen.getDisplayMatching(w.getBounds()) : screen.getPrimaryDisplay();
  ready = false;
  overlay = new BrowserWindow({
    ...d.bounds, transparent: true, frame: false, resizable: false, movable: false, focusable: false, skipTaskbar: true,
    hasShadow: false, show: false, backgroundColor: '#00000000', alwaysOnTop: true, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'bubble-preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true);
  overlay.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  overlay.loadFile(path.join(__dirname, 'renderer', 'bubble.html'));
  overlay.webContents.once('did-finish-load', () => { ready = true; flush(); });
  overlay.on('closed', () => { overlay = null; ready = false; });
  return overlay;
}
function flush() {
  if (!ready || !overlay) return;
  while (queue.length) overlay.webContents.send('bubble-show', queue.shift());
  if (!overlay.isVisible()) overlay.showInactive();
}

// A message from a paired phone (companion.js), or a test from Settings.
function receive(from, b = {}) {
  const now = Date.now(), t = (recent.get(from) || []).filter((x) => now - x < 60000);
  if (t.length >= 12) return { ok: false, error: 'Too many messages; slow down.' };
  t.push(now); recent.set(from, t);
  const msg = { id: `${now}-${Math.random().toString(36).slice(2, 7)}`, phone: clip(from, 40), app: clip(b.app, 40) || 'Phone', sender: clip(b.sender, 40), text: clip(b.text, 500), at: now };
  if (!msg.text && !msg.sender) return { ok: false, error: 'Empty message.' };
  const lv = level();
  if (lv === 'off') return { ok: true, shown: false };
  if (lv === 'bar') { tellDeck({ type: 'bar', msg }); return { ok: true, shown: false }; }
  queue.push({ ...msg, sound: lv === 'all' });
  makeOverlay(); flush();
  return { ok: true, shown: true };
}

function register(d) {
  deps = d;
  // The bubble is done: it went to the bar (opened and popped, or faded), and the owner chose.
  ipcMain.on('bubble-done', (e, r = {}) => {
    if (!overlay || e.sender !== overlay.webContents) return;
    if (r.msg) tellDeck({ type: 'bar', msg: r.msg, opened: !!r.opened });
    if (r.choice === 'pause' || r.choice === 'menu') tellDeck({ type: 'choice', choice: r.choice });
  });
  // Nothing left on screen: hide the window so it costs nothing.
  ipcMain.on('bubble-idle', (e) => { if (overlay && e.sender === overlay.webContents && overlay.isVisible()) overlay.hide(); });
  // One still picture of the screen, blurred behind the open bubble (a window cannot blur what
  // other programs draw, so it is taken once, when the bubble starts to fill).
  ipcMain.handle('bubble-snap', async (e) => {
    if (!overlay || e.sender !== overlay.webContents) return null;
    try {
      const b = overlay.getBounds();
      const src = (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(b.width / 2), height: Math.round(b.height / 2) } }))[0];
      return src ? src.thumbnail.toDataURL() : null;
    } catch { return null; }
  });
  ipcMain.handle('phone-msg-test', () => receive('Test', { app: 'Messages', sender: 'Bladedeck', text: 'This is how a message from your phone looks. Hold LB + RB and a trigger to read it, then let go.' }));
}

function stop() { if (overlay && !overlay.isDestroyed()) overlay.destroy(); overlay = null; }

module.exports = { register, receive, stop };
