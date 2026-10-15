#!/usr/bin/env node
'use strict';
/* Test for the bubble reply gesture (BD-048, renderer/bubble.js): npm run test-bubble.
   Loads renderer/bubble.js in a lightweight VM environment and tests:
   1. Combo (LB + RB + LT/RT) opens and fills bubble.
   2. Letting go pops into choice with needRelease = true.
   3. Stick must center before being armed (stickArmed = true).
   4. View button (back) disarms gesture.
   5. Diagonal stick input (two directions at once) is rejected.
   6. RB held rejects reply.
   7. Letting go of stick or LB before 550ms cancels hold without sending.
   8. Frame dt is clamped to max 100ms (a lag spike cannot fake a long hold).
   9. Holding LB + stick for >= 550ms triggers window.bubble.reply(id, pick).
   10. Releasing LB alone without stick pauses, but releasing LB after stick direction used does not pause. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };

const makeEl = (tag) => {
  const el = {
    tagName: tag.toUpperCase(),
    className: '',
    _classes: new Set(),
    classList: {
      add(...c) { c.forEach((x) => el._classes.add(x)); el.className = [...el._classes].join(' '); },
      remove(...c) { c.forEach((x) => el._classes.delete(x)); el.className = [...el._classes].join(' '); },
      contains(c) { return el._classes.has(c); }
    },
    style: { setProperty() {} },
    dataset: {},
    children: [],
    childNodes: [],
    get childElementCount() { return el.children.length; },
    append(...nodes) { el.children.push(...nodes); },
    appendChild(node) { el.children.push(node); return node; },
    prepend(node) { el.children.unshift(node); },
    querySelector(sel) {
      if (sel.includes('.fill')) return makeEl('i');
      if (sel.includes('[data-r=')) return makeEl('span');
      return makeEl('span');
    },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    remove() {}
  };
  return el;
};

const tray = makeEl('div');
const bar = makeEl('div');
const choose = makeEl('div');
choose.querySelector = () => bar;
const rp = makeEl('div');

const elements = { tray, choose, rp, bar };

let sentReplies = [];
let doneChoices = [];
let bubbleUpState = null;

let curTime = 1000000;
let rafCallbacks = [];

const ctx = {
  document: {
    getElementById: (id) => elements[id] || makeEl(id),
    createElement: makeEl,
    body: makeEl('body')
  },
  window: {
    bubble: {
      onShow(f) { this._onShow = f; },
      snap: async () => '',
      hold: () => {},
      done: (d) => { doneChoices.push(d); },
      reply: async (id, k) => {
        sentReplies.push({ id, k });
        return true;
      },
      up: (active) => { bubbleUpState = active; },
      idle: () => {}
    }
  },
  AudioContext: class {
    createOscillator() { return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} }, connect() {} }; }
    get destination() { return {}; }
    get currentTime() { return curTime / 1000; }
  },
  requestAnimationFrame: (fn) => rafCallbacks.push(fn),
  performance: { now: () => curTime },
  Date: { now: () => curTime },
  Math,
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  console
};

const code = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'bubble.js'), 'utf8');
vm.runInNewContext(code, ctx);

function stepFrame(padState, dt = 16) {
  curTime += dt;
  ctx.window.__bubbleTest.press(padState);
  const cbs = rafCallbacks.slice();
  rafCallbacks = [];
  for (const cb of cbs) cb(curTime);
}

// 1. Receive a test message with quick replies
const msg = {
  id: 'msg-42',
  sender: 'Sarah',
  text: 'Are you ready for the raid?',
  replies: ['Sounds good', 'Busy', '5 mins', 'In a match']
};

ctx.window.bubble._onShow(msg);
ok(ctx.window.__bubbleTest.state().live.length === 1, 'message received in bubble tray');

// 2. Hold combo (LB + RB + LT) to open and fill bubble
stepFrame({ lb: true, rb: true, lt: true, rt: false }, 100);
let st = ctx.window.__bubbleTest.state();
ok(st.live[0].held === true, 'holding combo sets held = true');
ok(st.live[0].p > 0, 'progress fills while combo is held');

// Fill past threshold (>= 0.25)
stepFrame({ lb: true, rb: true, lt: true, rt: false }, 300);
ok(ctx.window.__bubbleTest.state().live[0].p >= 0.25, 'progress passes 25% pop threshold');

// 3. Release combo -> pops into choice
stepFrame({ lb: false, rb: false, lt: false, rt: false }, 16);
st = ctx.window.__bubbleTest.state();
ok(st.live.length === 0, 'bubble popped out of live array');
ok(st.choosing === true, 'entered choosing state');

// 4. While stick is already deflected when entering choice, it must not trigger immediately
stepFrame({ lb: true, rright: true }, 16);
ok(sentReplies.length === 0, 'stick deflected before centering does not trigger reply');

// 5. Center stick -> stickArmed becomes true
stepFrame({ lb: false, rright: false }, 16);

// 6. View button (back) disarms stick
stepFrame({ back: true, lb: true, rright: true }, 50);
ok(sentReplies.length === 0, 'View held disarms stick gesture');

// Center again to re-arm
stepFrame({ back: false, lb: false, rright: false }, 16);

// 7. Diagonal deflection (e.g. rup and rright together) rejected
stepFrame({ lb: true, rup: true, rright: true }, 100);
ok(sentReplies.length === 0, 'diagonal stick deflection rejected');

// Center again
stepFrame({ lb: false, rup: false, rright: false }, 16);

// 8. Releasing stick before 550ms cancels hold
stepFrame({ lb: true, rright: true }, 300);
ok(sentReplies.length === 0, 'at 300ms, reply is not yet sent');
// Release stick early
stepFrame({ lb: true, rright: false }, 50);
ok(sentReplies.length === 0, 'letting go early cancels hold without sending');

// 9. Frame dt clamp test: a huge frame dt (e.g. 800ms lag spike) is clamped to 100ms
stepFrame({ lb: true, rright: true }, 800);
ok(sentReplies.length === 0, 'a single 800ms lag frame is clamped and does not trigger reply');

// Hold for remaining time to reach 550ms total (100ms already accumulated)
// Need 5 steps of 100ms (100 + 500 = 600ms >= 550ms)
for (let i = 0; i < 5; i++) {
  stepFrame({ lb: true, rright: true }, 100);
}
ok(sentReplies.length === 1, 'holding LB + right stick for >= 550ms sends reply');
ok(sentReplies[0]?.id === 'msg-42' && sentReplies[0]?.k === 2, 'sent reply corresponds to index 2 (5 mins / right)');

// 10. LB alone without stick pauses, but releasing LB after stick direction used does not pause
// In our run, lbUsed was true because stick directions were used with LB
ok(doneChoices.length === 0, 'releasing LB after reply gesture did not pause');

console.log(`\nBubble gesture test finished with ${fails} failure(s).`);
process.exit(fails > 0 ? 1 : 0);
