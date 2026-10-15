'use strict';
/* The phone message bubble (phonemsg.js has the why; the owner's design). A soft glass orb waits at
   the bottom. Holding LB + RB and LT or RT opens the front one: a faint rising tone plays as it
   floats up and fills into a header across the top of the screen, with the sender's picture and the
   message; only the header's own background is blurred (a still of what is behind it). The game is
   frozen while the combo is held and runs again on release (the menu does that, phonemsg.js tells it).
   Letting go pops it into the notification bar; the game keeps running and 4 seconds offer: wait to
   keep playing, LB to pause, RB for the menu. Letting go before a quarter full just sinks it back. */
const tray = document.getElementById('tray'), choose = document.getElementById('choose');
const FILL_MS = 900, FADE_MS = 15000, CHOOSE_MS = 4000, TOP = 24;
const live = []; // { msg, el, p, held, timer, from }
let choosing = null, needRelease = false, forced = null, snap = '';

/* ---------------------------------------------------------- sound: a plip in, a faint rise up, a pop */
let ctx = null, riser = null;
const ac = () => (ctx = ctx || new AudioContext());
function tone(f0, f1, dur, vol, type = 'sine') {
  try {
    const c = ac(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch { /* no sound */ }
}
const plip = () => tone(900, 1300, 0.07, 0.045);
function riseStart() {
  try {
    const c = ac(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(280, t); o.frequency.exponentialRampToValueAtTime(820, t + FILL_MS / 1000);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.15);
    o.connect(g).connect(c.destination); o.start(t); riser = { o, g };
  } catch { /* no sound */ }
}
function riseStop() { if (!riser) return; try { const t = ctx.currentTime; riser.g.gain.cancelScheduledValues(t); riser.g.gain.setTargetAtTime(0.0001, t, 0.05); riser.o.stop(t + 0.3); } catch { /* gone */ } riser = null; }
const popSound = () => { tone(1600, 200, 0.07, 0.09, 'triangle'); tone(260, 60, 0.12, 0.05); };

/* ---------------------------------------------------------- bubbles */
const initial = (m) => (m.sender || m.app || '?').trim().charAt(0).toUpperCase();
const report = () => window.bubble.up(live.length > 0 || !!choosing);
function show(m) {
  const el = document.createElement('div');
  el.className = 'bub';
  el.innerHTML = '<div class="bg"></div><div class="ic"></div><div class="tx"><div class="who"></div><div class="full"></div></div><i class="shine"></i><i class="ring"></i>';
  const ic = el.querySelector('.ic');
  if (/^data:image\/(png|jpeg|webp);base64,/.test(m.icon || '')) { const im = new Image(); im.src = m.icon; ic.appendChild(im); } else ic.textContent = initial(m);
  el.querySelector('.who').textContent = m.sender ? `${m.sender} · ${m.app}` : m.app;
  el.querySelector('.full').textContent = m.text;
  tray.prepend(el);
  const b = { msg: m, el, p: 0, held: false, timer: setTimeout(() => fade(b), FADE_MS) };
  live.unshift(b);
  while (live.length > 3) fade(live[live.length - 1]); // three at most; older ones go to the bar
  if (m.sound) plip();
  report(); loop();
}
function remove(b) { const i = live.indexOf(b); if (i >= 0) live.splice(i, 1); clearTimeout(b.timer); }
function fade(b) {
  if (!live.includes(b) || b.held) return;
  remove(b); b.el.classList.add('fade');
  setTimeout(() => b.el.remove(), 700);
  window.bubble.done({ msg: b.msg, opened: false });
  report(); idleSoon();
}
function open(b) {
  b.held = true; b.from = b.el.getBoundingClientRect();
  b.el.classList.add('held', 'open');
  document.body.appendChild(b.el); // out of the tray, so it can travel to the top
  clearTimeout(b.timer);
  window.bubble.hold(true); riseStart();
  snap = '';
  window.bubble.snap().then((u) => { if (u && b.held) { snap = u; b.el.querySelector('.bg').style.backgroundImage = `url("${u}")`; } });
}
function sink(b) {
  b.held = false; riseStop(); window.bubble.hold(false);
  b.el.classList.remove('held', 'open'); b.el.style.top = ''; b.el.style.left = '';
  tray.prepend(b.el);
  b.timer = setTimeout(() => fade(b), FADE_MS);
}
function pop(b) {
  remove(b); riseStop(); window.bubble.hold(false); popSound();
  const r = b.el.getBoundingClientRect();
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('i'); s.className = 'spark';
    const a = (i / 16) * Math.PI * 2, d = 60 + Math.random() * 80;
    s.style.left = `${r.left + 40 + Math.random() * (r.width - 80)}px`; s.style.top = `${r.top + r.height / 2}px`;
    s.style.setProperty('--dx', `${Math.cos(a) * d}px`); s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    document.body.appendChild(s); setTimeout(() => s.remove(), 700);
  }
  b.el.classList.add('pop'); setTimeout(() => b.el.remove(), 400);
  startChoice(b.msg);
}

/* ---------------------------------------------------------- after the pop: the game keeps running */
function startChoice(msg) {
  choosing = { msg, until: Date.now() + CHOOSE_MS };
  needRelease = true; // LB/RB count only once the combo is let go
  choose.classList.remove('on'); void choose.offsetWidth; choose.classList.add('on');
  report();
}
function endChoice(choice) {
  if (!choosing) return;
  window.bubble.done({ msg: choosing.msg, opened: true, choice });
  choosing = null; choose.classList.remove('on');
  report(); idleSoon();
}

/* ---------------------------------------------------------- the controller */
function pads() {
  if (forced) return forced; // tests
  const ps = [...(navigator.getGamepads?.() || [])].filter(Boolean);
  const b = (i) => ps.some((g) => !!g.buttons[i]?.pressed || (g.buttons[i]?.value || 0) > 0.5);
  return { lb: b(4), rb: b(5), lt: b(6), rt: b(7) };
}
function place(b) {
  const p = b.p, f = b.from || { left: 28, top: innerHeight - 90 };
  b.el.style.setProperty('--p', p.toFixed(3));
  // From where the orb sat to the top left, where the header is read.
  b.el.style.left = `${f.left + (28 - f.left) * Math.min(1, p * 1.6)}px`;
  b.el.style.top = `${f.top + (TOP - f.top) * (1 - (1 - p) * (1 - p))}px`;
  if (snap) {
    const r = b.el.getBoundingClientRect(), bg = b.el.querySelector('.bg');
    bg.style.backgroundSize = `${innerWidth}px ${innerHeight}px`;
    bg.style.backgroundPosition = `${-r.left}px ${-r.top}px`;
  }
}
let running = false, last = 0;
function loop() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
function frame(now) {
  const dt = now - last; last = now;
  const st = pads(), combo = st.lb && st.rb && (st.lt || st.rt);
  const front = live[0];
  if (front) {
    if (combo && !needRelease) {
      if (!front.held) open(front);
      front.p = Math.min(1, front.p + dt / FILL_MS);
      place(front);
    } else if (front.held) {
      if (front.p >= 0.25) pop(front);
      else { front.p = 0; front.el.style.setProperty('--p', 0); sink(front); }
    }
  }
  if (choosing) {
    if (!st.lb && !st.rb && !st.lt && !st.rt) needRelease = false;
    else if (!needRelease && st.lb && !st.rb) endChoice('pause');
    else if (!needRelease && st.rb && !st.lb) endChoice('menu');
    if (choosing && Date.now() > choosing.until) endChoice('keep');
  } else if (!combo) needRelease = false;
  if (live.length || choosing) requestAnimationFrame(frame); else running = false;
}
let idleT = 0;
function idleSoon() { clearTimeout(idleT); idleT = setTimeout(() => { if (!live.length && !choosing) window.bubble.idle(); }, 900); }

window.bubble.onShow(show);
// For test copies: press and let go of the combo, or LB / RB, without a controller.
window.__bubbleTest = { press: (s) => { forced = s ? { lb: false, rb: false, lt: false, rt: false, ...s } : null; loop(); }, state: () => ({ live: live.map((b) => ({ who: b.msg.sender, p: b.p, held: b.held })), choosing: !!choosing }) };
