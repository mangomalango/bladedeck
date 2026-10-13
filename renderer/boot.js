'use strict';
/* Boot: the start-up show. Specks of light swirl in and gather into the Bladedeck orb, the orb
   flashes, glass blades sweep in one after another, the name lights up letter by letter, and it
   all zooms away into the menu. About three seconds; any button, key or click skips it. It is in
   the page from the first frame, so there is no blank window while Bladedeck loads.
   Settings, "Boot animation" turns it off (remembered on this computer, so it never flashes). */
const Boot = (() => {
  const el = document.getElementById('boot');
  let off = false;
  try { off = localStorage.getItem('bd-boot') === 'off'; } catch { /* storage unavailable */ }
  if (!el) return { done: () => {}, setOn: () => {} };
  if (off) { el.remove(); return { done: () => {}, setOn }; }
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
  const t0 = performance.now(), LEN = 3100;
  let finished = false, chimed = false;
  const parts = Array.from({ length: 140 }, () => ({ a: Math.random() * Math.PI * 2, r: 0.55 + Math.random() * 0.6, s: 0.6 + Math.random() * 1.4, hue: Math.random() < 0.5 ? 330 : 45 }));

  function frame(now) {
    if (finished) return;
    requestAnimationFrame(frame);
    const w = cv.width = innerWidth, h = cv.height = innerHeight, t = (now - t0) / 1000;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.42, R = Math.min(w, h);
    // Specks spiral in to the middle over the first second.
    const k = Math.min(1, t / 1.05), ease = 1 - Math.pow(1 - k, 3);
    for (const p of parts) {
      const rr = R * p.r * (1 - ease) + R * 0.055 * ease, ang = p.a + t * p.s * 2.2;
      const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr * 0.9;
      ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${0.25 + 0.6 * (1 - ease)})`;
      ctx.beginPath(); ctx.arc(x, y, 1.6 + p.s, 0, Math.PI * 2); ctx.fill();
    }
    // The orb forms, then flashes.
    if (t > 0.75) {
      const g = Math.min(1, (t - 0.75) / 0.4), r = R * 0.07 * (0.6 + 0.4 * g) * (1 + 0.04 * Math.sin(t * 6));
      const flash = t > 1.05 && t < 1.5 ? 1 - (t - 1.05) / 0.45 : 0;
      const grd = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
      grd.addColorStop(0, '#fff'); grd.addColorStop(0.25, '#ffd23f'); grd.addColorStop(0.65, '#ff2d8a'); grd.addColorStop(1, '#4a0024');
      ctx.globalAlpha = g; ctx.shadowColor = '#ff2d8a'; ctx.shadowBlur = 50 + 120 * flash;
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      if (flash > 0) { ctx.globalAlpha = flash * 0.35; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
      ctx.globalAlpha = 1;
      if (!chimed && t > 1.05) { chimed = true; try { Sound.play('secret'); } catch { /* sound not ready */ } }
    }
    if (now - t0 > LEN) done();
  }

  function done() {
    if (finished) return;
    finished = true;
    el.classList.add('out');
    setTimeout(() => el.remove(), 650);
    document.body.classList.add('booted');
  }
  function setOn(on) { try { localStorage.setItem('bd-boot', on ? 'on' : 'off'); } catch { /* storage unavailable */ } }

  // Any input skips straight to the menu.
  for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, () => { if (!finished && performance.now() - t0 > 250) done(); }, { once: false, capture: true });
  (function padSkip() { if (finished) return; const p = [...(navigator.getGamepads?.() || [])].find(Boolean); if (p && p.buttons.some((b) => b.pressed) && performance.now() - t0 > 250) { done(); return; } requestAnimationFrame(padSkip); })();
  el.classList.add('go');
  requestAnimationFrame(frame);
  return { done, setOn, playing: () => !finished };
})();
