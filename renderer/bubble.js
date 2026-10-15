'use strict';
/* The phone message bubble (phonemsg.js has the why). Bubbles wait at the bottom; holding LB + RB and
   LT or RT opens the front one: it floats to the top, fills to the message's size and the screen
   behind it blurs. Letting go pops it into the notification bar, then a 4-second choice: wait to
   keep playing, LB to pause, RB to go to the menu. A short tap of the combo (let go before a
   quarter full) just lets it sink back, so a stray press never opens anything. */
const tray = document.getElementById('tray'), snapImg = document.getElementById('snap'), choose = document.getElementById('choose');
const FILL_MS = 900, FADE_MS = 15000, CHOOSE_MS = 4000;
const live = []; // { msg, el, p, held, timer }
let choosing = null, needRelease = false, forced = null;

/* ---------------------------------------------------------- sound: soft bubble in, pop out */
let ctx = null;
function tone(f0, f1, dur, vol, type = 'sine') {
  try {
    ctx = ctx || new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch { /* no sound */ }
}
const bloop = () => { tone(420, 880, 0.16, 0.06); setTimeout(() => tone(700, 1100, 0.09, 0.025), 90); };
const popSound = () => { tone(1600, 200, 0.07, 0.09, 'triangle'); tone(260, 60, 0.12, 0.05); };

/* ---------------------------------------------------------- bubbles */
const initial = (m) => (m.sender || m.app || '?').trim().charAt(0).toUpperCase();
function show(m) {
  const el = document.createElement('div');
  el.className = 'bub';
  el.innerHTML = '<div class="ic"></div><div class="tx"><div class="who"></div><div class="peek"></div><div class="full"></div></div><i class="ring"></i>';
  el.querySelector('.ic').textContent = initial(m);
  el.querySelector('.who').textContent = m.sender ? `${m.sender} · ${m.app}` : m.app;
  el.querySelector('.peek').textContent = m.text.slice(0, 40);
  el.querySelector('.full').textContent = m.text;
  tray.prepend(el);
  const b = { msg: m, el, p: 0, held: false, timer: setTimeout(() => fade(b), FADE_MS) };
  live.unshift(b);
  while (live.length > 3) fade(live[live.length - 1]); // three at most; older ones go to the bar
  if (m.sound) bloop();
  loop();
}
function remove(b) { const i = live.indexOf(b); if (i >= 0) live.splice(i, 1); clearTimeout(b.timer); }
function fade(b) {
  if (!live.includes(b) || b.held) return;
  remove(b); b.el.classList.add('fade');
  setTimeout(() => b.el.remove(), 700);
  window.bubble.done({ msg: b.msg, opened: false });
  idleSoon();
}
function pop(b) {
  remove(b); popSound();
  const r = b.el.getBoundingClientRect();
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('i'); s.className = 'spark';
    const a = (i / 14) * Math.PI * 2, d = 60 + Math.random() * 60;
    Object.assign(s.style, { left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2}px`, '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px` });
    s.style.setProperty('--dx', `${Math.cos(a) * d}px`); s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    document.body.appendChild(s); setTimeout(() => s.remove(), 700);
  }
  b.el.classList.add('pop'); setTimeout(() => b.el.remove(), 400);
  snapImg.style.transition = 'opacity .35s'; snapImg.style.opacity = 0;
  startChoice(b.msg);
}

/* ---------------------------------------------------------- after the pop */
function startChoice(msg) {
  choosing = { msg, until: Date.now() + CHOOSE_MS };
  needRelease = true; // LB/RB count only once the combo is let go
  choose.classList.remove('on'); void choose.offsetWidth; choose.classList.add('on');
}
function endChoice(choice) {
  if (!choosing) return;
  window.bubble.done({ msg: choosing.msg, opened: true, choice });
  choosing = null; choose.classList.remove('on');
  idleSoon();
}

/* ---------------------------------------------------------- the controller */
function pads() {
  if (forced) return forced; // tests
  const ps = [...(navigator.getGamepads?.() || [])].filter(Boolean);
  const b = (i) => ps.some((g) => !!g.buttons[i]?.pressed || (g.buttons[i]?.value || 0) > 0.5);
  return { lb: b(4), rb: b(5), lt: b(6), rt: b(7) };
}
let running = false, last = 0;
function loop() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
function frame(now) {
  const dt = now - last; last = now;
  const st = pads(), combo = st.lb && st.rb && (st.lt || st.rt);
  const front = live[0];
  if (front) {
    if (combo && !needRelease) {
      if (!front.held) { front.held = true; front.el.classList.add('held'); clearTimeout(front.timer); window.bubble.snap().then((u) => { if (u && front.held) { snapImg.src = u; } }); }
      front.p = Math.min(1, front.p + dt / FILL_MS);
    } else if (front.held) {
      if (front.p >= 0.25) pop(front);
      else { front.held = false; front.el.classList.remove('held'); front.timer = setTimeout(() => fade(front), FADE_MS); }
    } else if (front.p > 0) front.p = Math.max(0, front.p - dt / 400);
    if (live.includes(front)) {
      front.el.style.setProperty('--p', front.p.toFixed(3));
      // Float from the bottom to the top of the screen as it fills.
      const travel = Math.max(0, innerHeight - 28 - 120 - front.el.offsetHeight);
      front.el.style.transform = front.p ? `translateY(${-front.p * travel}px)` : '';
      snapImg.style.transition = 'none'; snapImg.style.opacity = String(front.p);
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
