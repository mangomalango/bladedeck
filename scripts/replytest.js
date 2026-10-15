#!/usr/bin/env node
'use strict';
/* Attack test for quick replies (BD-030, phonemsg.js): npm run test-replies.
   Loads the real phonemsg.js with a stubbed Electron and tries to make it send something the owner
   did not hold on A/B/X/Y, to a phone that should not get it, or after it should be gone. */
const path = require('path'), Module = require('module');
const h = {}, on = {};
let clock = Date.now();
const realNow = Date.now; Date.now = () => clock;
const overlayWC = { send: () => {}, once: (_e, f) => f(), on: () => {} };
class BrowserWindow {
  constructor() { this.webContents = overlayWC; this.visible = false; }
  setAlwaysOnTop() {} setIgnoreMouseEvents() {} setContentProtection() {} setVisibleOnAllWorkspaces() {}
  loadFile() {} on() {} isDestroyed() { return false; } isVisible() { return this.visible; } showInactive() { this.visible = true; } hide() { this.visible = false; } destroy() {}
}
const electron = {
  BrowserWindow, desktopCapturer: { getSources: async () => [] },
  ipcMain: { handle: (n, f) => { h[n] = f; }, on: (n, f) => { on[n] = f; } },
  screen: { getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }), getDisplayMatching: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }) }
};
const load = Module._load; Module._load = function (r, ...a) { return r === 'electron' ? electron : load.call(this, r, ...a); };

const P = require(path.join(__dirname, '..', 'phonemsg.js'));
const shown = []; overlayWC.send = (ch, m) => { if (ch === 'bubble-show') shown.push(m); };
P.register({ settings: () => ({}), getWin: () => null });
const fromOverlay = { sender: overlayWC }, fromElsewhere = { sender: { send() {} } };
let fails = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const last = () => shown[shown.length - 1];

(async () => {
  const r1 = P.receive('Pixel', { app: 'Messages', sender: 'Sam', text: 'hi', reply: 'abcdEFGH1234' }, 'KEY-A');
  const m1 = last();
  ok(r1.reply === true, 'the PC tells the phone it kept the message for a reply (so the phone asks)');
  ok(Array.isArray(m1.replies) && m1.replies.length === 4, 'an answerable message offers the four phrases');
  ok(!('ref' in m1) && !JSON.stringify(m1).includes('abcdEFGH1234'), "the phone's reference never reaches the bubble window");
  const r2 = P.receive('Pixel', { app: 'Mail', sender: 'Shop', text: 'sale' }, 'KEY-A');
  const m2 = last();
  ok(!r2.reply, 'no reference: the phone is not told to ask for replies');
  ok(!m2.replies, 'a message the phone cannot answer offers no replies');
  ok(!(await h['bubble-reply'](fromOverlay, { id: m2.id, pick: 0 })), 'replying to it is refused');
  P.receive('Pixel', { app: 'X', sender: 'Y', text: 'z', reply: 'bad ref!<script>' }, 'KEY-A');
  ok(!last().replies, 'a reference with odd characters is ignored (no replies)');

  ok(!(await h['bubble-reply'](fromElsewhere, { id: m1.id, pick: 0 })), 'a reply from any window but the bubble is refused');
  ok(!(await h['bubble-reply'](fromOverlay, { id: m1.id, pick: 4 })) && !(await h['bubble-reply'](fromOverlay, { id: m1.id, pick: -1 })), 'a phrase number out of range is refused');
  ok(!(await h['bubble-reply'](fromOverlay, { id: m1.id, pick: '0' })) && !(await h['bubble-reply'](fromOverlay, { id: m1.id, pick: 1.5 })), 'a phrase number that is not a whole number is refused');
  ok(!(await h['bubble-reply'](fromOverlay, { id: m1.id, text: 'send my bank details' })), 'free text is refused (no number)');
  ok(!(await h['bubble-reply'](fromOverlay, { id: 'nope', pick: 0 })) && !(await h['bubble-reply'](fromOverlay, { id: '__proto__', pick: 0 })), 'an unknown or odd id is refused');

  ok(P.takeReplies('KEY-A').length === 0, 'nothing is waiting before the owner answers');
  ok(await h['bubble-reply'](fromOverlay, { id: m1.id, pick: 3 }), 'holding Y queues the reply');
  ok(!(await h['bubble-reply'](fromOverlay, { id: m1.id, pick: 0 })), 'the same message cannot be answered twice');
  ok(P.takeReplies('KEY-B').length === 0, 'another paired phone cannot take it');
  const got = P.takeReplies('KEY-A');
  ok(got.length === 1 && got[0].ref === 'abcdEFGH1234' && got[0].text === P.REPLIES[3], 'the right phone gets the reference and the fixed phrase');
  ok(P.takeReplies('KEY-A').length === 0, 'it is taken once, then gone');

  P.receive('Pixel', { app: 'Messages', sender: 'Sam', text: 'later?', reply: 'zzzzYYYY9999' }, 'KEY-A');
  const m3 = last();
  on['bubble-done'](fromOverlay, { msg: m3, opened: false });
  ok(!(await h['bubble-reply'](fromOverlay, { id: m3.id, pick: 0 })), 'a dismissed or faded bubble can no longer be answered');

  P.receive('Pixel', { app: 'Messages', sender: 'Sam', text: 'old', reply: 'oldOLDold123' }, 'KEY-A');
  const m4 = last(); clock += 4 * 60000;
  ok(!(await h['bubble-reply'](fromOverlay, { id: m4.id, pick: 0 })), 'a message older than three minutes can no longer be answered');
  P.receive('Pixel', { app: 'Messages', sender: 'Sam', text: 'new', reply: 'newNEWnew123' }, 'KEY-A');
  await h['bubble-reply'](fromOverlay, { id: last().id, pick: 0 });
  clock += 4 * 60000;
  ok(P.takeReplies('KEY-A').length === 0, 'a reply the phone never fetched is gone after three minutes');

  for (let i = 0; i < 12; i++) { P.receive('Pixel', { app: 'M', sender: 'S', text: 't' + i, reply: 'flood' + String(i).padStart(4, '0') + 'xx' }, 'KEY-C'); await h['bubble-reply'](fromOverlay, { id: last().id, pick: 1 }); }
  const flood = P.takeReplies('KEY-C');
  ok(flood.length === 10, `12 answered in a minute: only the newest 10 wait for one phone (${flood.length})`);
  ok(P.REPLIES.length === 4 && P.REPLIES.every((t) => typeof t === 'string' && t.length < 60), 'the phrases are four short fixed strings');

  Date.now = realNow;
  console.log(fails ? `${fails} FAILED` : 'all passed');
  process.exit(fails ? 1 : 0);
})();
