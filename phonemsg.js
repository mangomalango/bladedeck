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
   focusable, on top of everything; full-screen exclusive games (rare now) hide it.
   Quick replies (BD-030): when the phone says the app can be answered, the choice after the pop also
   offers four fixed phrases on A, B, X and Y, sent by holding the button (a tap from the game never
   sends). The bubble only names a phrase by its number; the words are here, so the bubble window can
   never send words of its own. The reply waits in memory until the phone fetches it (/api/replies)
   and is gone after that, after a few minutes, or when Bladedeck quits; nothing is written to disk. */
const { BrowserWindow, ipcMain, screen, desktopCapturer } = require('electron');
const path = require('path');

let deps = null, overlay = null, ready = false;
const queue = [], recent = new Map(); // phone name -> times of its last messages
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n);

// A, B, X, Y. The phone keeps the same four and sends nothing else (NotifyService.java).
const REPLIES = ['Sounds good \u{1F44D}', "Can't talk, busy right now", 'Give me 5 mins', 'In a match, be there soon!'];
const REPLY_MS = 3 * 60000;
const replyable = new Map(); // bubble id -> { who, ref, at }: messages the phone can answer
const outbox = new Map(); // pairing key -> [{ ref, text, at }]: replies waiting for the phone
function prune() {
  const old = Date.now() - REPLY_MS;
  for (const [id, r] of replyable) if (r.at < old) replyable.delete(id);
  while (replyable.size > 50) replyable.delete(replyable.keys().next().value);
  for (const [k, box] of outbox) { const keep = box.filter((x) => x.at >= old); if (keep.length) outbox.set(k, keep); else outbox.delete(k); }
}
// The phone (companion.js /api/replies) takes what is waiting for it, once.
function takeReplies(who) {
  prune();
  const box = outbox.get(who) || []; outbox.delete(who);
  return box.map(({ ref, text }) => ({ ref, text }));
}

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
  // Never in recordings, replays or screenshots (Windows and macOS honour this; Linux does not).
  overlay.setContentProtection(true);
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
// The limit counts per pairing key (a phone could rename itself; it cannot change its key).
function receive(from, b = {}, who = from) {
  const now = Date.now(), t = (recent.get(who) || []).filter((x) => now - x < 60000);
  if (t.length >= 12) return { ok: false, error: 'Too many messages; slow down.' };
  t.push(now); recent.set(who, t);
  // The sender's picture: a small PNG, JPEG or WebP the phone sends with the message, or none.
  const icon = typeof b.icon === 'string' && b.icon.length <= 24000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.icon) ? b.icon : '';
  const msg = { id: `${now}-${Math.random().toString(36).slice(2, 7)}`, phone: clip(from, 40), app: clip(b.app, 40) || 'Phone', sender: clip(b.sender, 40), text: clip(b.text, 500), icon, at: now };
  if (!msg.text && !msg.sender) return { ok: false, error: 'Empty message.' };
  const lv = level();
  if (lv === 'off') return { ok: true, shown: false };
  if (lv === 'bar') { tellDeck({ type: 'bar', msg }); return { ok: true, shown: false }; }
  // The phone's own name for this notification, so a reply finds it again; only the phone can use it.
  const ref = typeof b.reply === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(b.reply) ? b.reply : '';
  if (ref) { prune(); replyable.set(msg.id, { who, ref, at: now }); }
  queue.push({ ...msg, sound: lv === 'all', ...(ref ? { replies: REPLIES } : {}) });
  makeOverlay(); flush();
  return { ok: true, shown: true };
}

function register(d) {
  deps = d;
  // The bubble is done: it went to the bar (opened and popped, or faded), and the owner chose.
  ipcMain.on('bubble-done', (e, r = {}) => {
    if (!overlay || e.sender !== overlay.webContents) return;
    // Answered, dismissed or faded: it can no longer be answered from here.
    if (r.msg) replyable.delete(String(r.msg.id));
    if (r.msg) tellDeck({ type: 'bar', msg: r.msg, opened: !!r.opened, replied: r.replied ? REPLIES[r.replied - 1] || '' : '' });
    if (r.choice === 'pause' || r.choice === 'menu') tellDeck({ type: 'choice', choice: r.choice });
  });
  // The combo is held: the menu freezes the game in front, and lets it run again on release.
  ipcMain.on('bubble-hold', (e, on) => { if (overlay && e.sender === overlay.webContents) tellDeck({ type: 'hold', on: !!on }); });
  // A bubble or the choice is up: the menu leaves LB, RB, LT and RT alone meanwhile.
  ipcMain.on('bubble-up', (e, s) => { if (overlay && e.sender === overlay.webContents) tellDeck({ type: 'up', on: !!(s && s.on), face: !!(s && s.face) }); });
  // A quick reply, held on A, B, X or Y: only a phrase's number, only for a message the phone can
  // answer, only from the bubble window. It waits for the phone; true when it is queued.
  ipcMain.handle('bubble-reply', (e, r = {}) => {
    if (!overlay || e.sender !== overlay.webContents) return false;
    const pick = r.pick, id = String(r.id || '');
    if (!Number.isInteger(pick) || pick < 0 || pick >= REPLIES.length) return false;
    prune();
    const to = replyable.get(id); if (!to) return false;
    replyable.delete(id);
    const box = outbox.get(to.who) || [];
    box.push({ ref: to.ref, text: REPLIES[pick], at: Date.now() });
    outbox.set(to.who, box.slice(-10));
    return true;
  });
  // Nothing left on screen: hide the window so it costs nothing.
  ipcMain.on('bubble-idle', (e) => { if (overlay && e.sender === overlay.webContents && overlay.isVisible()) overlay.hide(); });
  // One still picture of the screen, blurred behind the open bubble (a window cannot blur what
  // other programs draw, so it is taken once, when the bubble starts to fill).
  ipcMain.handle('bubble-snap', async (e) => {
    if (!overlay || e.sender !== overlay.webContents) return null;
    // Linux cannot keep the bubble out of captures, so no still of the screen while Bladedeck records.
    if (process.platform === 'linux' && require('./capture').status().running) return null;
    try {
      const b = overlay.getBounds();
      const src = (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(b.width / 2), height: Math.round(b.height / 2) } }))[0];
      return src ? src.thumbnail.toDataURL() : null;
    } catch { return null; }
  });
  // A test message can be "answered" too (its reply goes nowhere: no phone has the key 'test').
  ipcMain.handle('phone-msg-test', (_e, o = {}) => receive('Test', { app: 'Messages', sender: 'Bladedeck', text: 'This is how a message from your phone looks. Hold LB + RB and a trigger to read it, then let go.', icon: o ? o.icon : '', reply: o && o.reply ? 'testreply0' : '' }, 'test'));
}

function stop() { if (overlay && !overlay.isDestroyed()) overlay.destroy(); overlay = null; }

module.exports = { register, receive, stop, takeReplies, REPLIES };
