'use strict';
/* Scenes: living backgrounds for themes that ask for one ("scene" in the theme file).
   bubbles  - soap bubbles drift up into the sky; click one to pop it.
   aquarium - a Frutiger Aero fish tank. Playing games earns fish flakes; click the water (or Feed in
              the Aquarium menu) to drop one. Fish grow as they eat, and a grown fish has a baby
              you get to name, again and again.
   Drawn on #scene behind the menus, and paused while a game has the screen.
   Uses S, save, toast, openModal, esc, val, uid, Sound, $ and $$ at call time. */

const FISH_NAMES = ['Mango', 'Pip', 'Coral', 'Bubbles', 'Kiwi', 'Sprout', 'Nori', 'Biscuit', 'Wasabi', 'Pebble', 'Tango', 'Lumi', 'Squish', 'Marble', 'Echo', 'Dot'];
const TANK_MAX = 12;
const ADULT_AT = 10;      // flakes a baby eats to grow up
const BABY_EVERY = 8;     // flakes a grown fish eats per baby

const Scenes = (() => {
  const c = document.getElementById('scene');
  const x = c.getContext('2d');
  let w = 0, h = 0, kind = null, away = false, last = 0, t = 0;
  let bubbles = [], pops = [], flakes = [], swimmers = new Map(), sand = null, label = null, fresh = true;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function size() { w = c.width = innerWidth; h = c.height = innerHeight; sand = null; }
  size(); addEventListener('resize', size);
  document.addEventListener('deck-away', (ev) => { away = ev.detail; });

  function set(k) {
    kind = k || null;
    c.hidden = !kind;
    document.body.dataset.scene = kind || '';
    bubbles = []; pops = []; flakes = []; swimmers = new Map(); fresh = true;
  }

  /* ============================================================ bubbles */
  function spawnBubble(anywhere) {
    const r = Math.random() < 0.12 ? rnd(40, 70) : rnd(9, 34);
    bubbles.push({ x: rnd(0, w), y: anywhere ? rnd(0, h) : h + r + rnd(0, 80), r, vy: rnd(18, 42) * (40 / (r + 20)) + 10,
      ph: rnd(0, 6.28), sway: rnd(8, 26), hue: rnd(0, 360) });
  }
  function drawBubble(b) {
    const { x: bx, y: by, r } = b;
    // Thin-film colour: a soft rainbow rim that slowly turns, with a clear middle.
    const rim = x.createConicGradient(t * 0.4 + b.hue / 57, bx, by);
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach((s, i) => rim.addColorStop(s, `hsla(${(b.hue + i * 70) % 360}, 90%, 72%, 0.55)`));
    x.beginPath(); x.arc(bx, by, r, 0, Math.PI * 2);
    const body = x.createRadialGradient(bx, by, r * 0.55, bx, by, r);
    body.addColorStop(0, 'rgba(255,255,255,0.02)'); body.addColorStop(0.85, 'rgba(255,255,255,0.10)'); body.addColorStop(1, 'rgba(255,255,255,0.32)');
    x.fillStyle = body; x.fill();
    x.lineWidth = Math.max(1.2, r * 0.07); x.strokeStyle = rim; x.stroke();
    // Window highlight, and a small glint opposite.
    x.beginPath(); x.ellipse(bx - r * 0.38, by - r * 0.42, r * 0.28, r * 0.16, -0.7, 0, Math.PI * 2);
    x.fillStyle = 'rgba(255,255,255,0.75)'; x.fill();
    x.beginPath(); x.arc(bx + r * 0.42, by + r * 0.45, r * 0.07, 0, Math.PI * 2);
    x.fillStyle = 'rgba(255,255,255,0.5)'; x.fill();
  }
  function stepBubbles(dt, count) {
    // A new sky starts full; after that they come up from below.
    while (bubbles.length < count) spawnBubble(fresh);
    fresh = false;
    for (const b of bubbles) { b.y -= b.vy * dt; b.ph += dt * 1.3; }
    bubbles = bubbles.filter((b) => b.y > -b.r * 2);
    for (const b of bubbles) { const bx = b.x; b.x = bx + Math.sin(b.ph) * b.sway * 0.02 * 60 * dt; drawBubble(b); }
    drawPops(dt);
  }
  function drawPops(dt) {
    for (const p of pops) {
      p.t += dt;
      const k = p.t / 0.45;
      x.globalAlpha = Math.max(0, 1 - k);
      x.lineWidth = 2; x.strokeStyle = `hsla(${p.hue}, 90%, 80%, 1)`;
      x.beginPath(); x.arc(p.x, p.y, p.r * (1 + k * 0.6), 0, Math.PI * 2); x.stroke();
      for (const d of p.drops) {
        d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 500 * dt;
        x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(d.x, d.y, 2, 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1;
    }
    pops = pops.filter((p) => p.t < 0.45);
  }
  function pop(b) {
    bubbles.splice(bubbles.indexOf(b), 1);
    const n = 6 + (b.r / 6 | 0);
    pops.push({ x: b.x, y: b.y, r: b.r, hue: b.hue, t: 0,
      drops: Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; const s = rnd(80, 220); return { x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60 }; }) });
    Sound.play('bubblepop');
    const st = S.lib.settings; st.bubblesPopped = (st.bubblesPopped || 0) + 1;
    if (st.bubblesPopped % 100 === 0) toast(`${st.bubblesPopped} bubbles popped!`, 'fun');
    save();
  }

  /* ============================================================ aquarium */
  const tank = () => {
    const st = S.lib.settings;
    if (!st.aquarium) st.aquarium = { flakes: 5, fish: ['Mango', 'Pip', 'Coral'].map((name, i) => ({ id: uid(), name, hue: [28, 195, 330][i], eaten: ADULT_AT, since: 0, born: Date.now() })) };
    return st.aquarium;
  };
  const sizeOf = (f) => 0.45 + 0.55 * Math.min(1, (f.eaten || 0) / ADULT_AT);
  const grown = (f) => (f.eaten || 0) >= ADULT_AT;
  const floor = () => h * 0.9;

  function swimmer(f) {
    let s = swimmers.get(f.id);
    if (!s) { s = { x: rnd(w * 0.1, w * 0.9), y: rnd(h * 0.25, h * 0.75), vx: rnd(-40, 40), vy: 0, tx: 0, ty: 0, ph: rnd(0, 6.28), dir: 1, next: 0 }; swimmers.set(f.id, s); }
    return s;
  }

  function drawWater() {
    // Light shafts from the surface, swaying slowly.
    x.save(); x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const cx = w * (0.1 + i * 0.17) + Math.sin(t * 0.2 + i * 1.7) * 60;
      const g = x.createLinearGradient(0, 0, 0, h * 0.85);
      g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath();
      x.moveTo(cx - 30, 0); x.lineTo(cx + 40, 0); x.lineTo(cx + 180 + i * 10, h * 0.85); x.lineTo(cx + 40 + i * 10, h * 0.85); x.closePath(); x.fill();
    }
    x.restore();
    // Sand dunes, drawn once per size.
    if (!sand) {
      sand = document.createElement('canvas'); sand.width = w; sand.height = h;
      const s = sand.getContext('2d'); const y0 = floor();
      const g = s.createLinearGradient(0, y0 - 40, 0, h); g.addColorStop(0, '#f6e7b8'); g.addColorStop(1, '#d9b877');
      s.fillStyle = g; s.beginPath(); s.moveTo(0, h);
      for (let px = 0; px <= w; px += 20) s.lineTo(px, y0 + Math.sin(px * 0.006) * 14 + Math.sin(px * 0.017 + 2) * 6);
      s.lineTo(w, h); s.closePath(); s.fill();
      for (let i = 0; i < 18; i++) { // pebbles
        s.fillStyle = `hsla(${rnd(20, 200)}, 30%, ${rnd(55, 80)}%, .9)`;
        s.beginPath(); s.ellipse(rnd(0, w), rnd(y0 + 18, h - 6), rnd(5, 12), rnd(3, 7), 0, 0, Math.PI * 2); s.fill();
      }
    }
    x.drawImage(sand, 0, 0);
    // Seaweed swaying from the sand.
    for (let i = 0; i < 9; i++) {
      const bx = w * ((i * 0.137 + 0.05) % 1), by = floor() + 12, len = h * (0.18 + (i % 3) * 0.08);
      x.strokeStyle = `hsla(${120 + (i % 4) * 12}, 65%, ${38 + (i % 3) * 8}%, .85)`; x.lineWidth = 9 - (i % 3) * 2; x.lineCap = 'round';
      x.beginPath(); x.moveTo(bx, by);
      for (let k = 1; k <= 8; k++) { const yy = by - (len * k) / 8; x.lineTo(bx + Math.sin(t * 1.1 + i + k * 0.5) * k * 3.2, yy); }
      x.stroke();
    }
    // A bubbler in the corner.
    if (Math.random() < 0.25) bubbles.push({ x: w * 0.93 + rnd(-6, 6), y: floor(), r: rnd(3, 8), vy: rnd(60, 110), ph: rnd(0, 6), sway: 10, hue: rnd(170, 220), small: true });
    for (const b of bubbles) { b.y -= b.vy / 60; b.ph += 0.08; b.x += Math.sin(b.ph) * 0.5; }
    bubbles = bubbles.filter((b) => b.y > -10);
    for (const b of bubbles) {
      x.beginPath(); x.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1.2; x.stroke();
      x.fillStyle = 'rgba(255,255,255,.12)'; x.fill();
      x.beginPath(); x.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, Math.PI * 2); x.fillStyle = 'rgba(255,255,255,.8)'; x.fill();
    }
  }

  function drawFish(f, s) {
    const k = sizeOf(f) * 46, L = k * 2;
    const hue = f.hue ?? 30;
    x.save(); x.translate(s.x, s.y); x.scale(s.dir, 1);
    const wag = Math.sin(s.ph * 2) * 0.35;
    // tail
    x.save(); x.translate(-L * 0.42, 0); x.rotate(wag);
    x.fillStyle = `hsl(${hue}, 85%, 58%)`; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(-k * 0.6, -k * 0.9, -k * 0.8, -k * 0.75); x.quadraticCurveTo(-k * 0.45, 0, -k * 0.8, k * 0.75); x.quadraticCurveTo(-k * 0.6, k * 0.9, 0, 0); x.fill();
    x.restore();
    // body with a glossy Aero gradient
    const g = x.createLinearGradient(0, -k * 0.6, 0, k * 0.6);
    g.addColorStop(0, `hsl(${hue}, 95%, 75%)`); g.addColorStop(0.5, `hsl(${hue}, 85%, 55%)`); g.addColorStop(1, `hsl(${(hue + 20) % 360}, 80%, 40%)`);
    x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, L * 0.48, k * 0.58, 0, 0, Math.PI * 2); x.fill();
    // stripe and fin
    x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.ellipse(-L * 0.05, 0, k * 0.12, k * 0.5, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = `hsla(${hue}, 85%, 50%, .9)`; x.beginPath(); x.moveTo(-L * 0.1, -k * 0.5); x.quadraticCurveTo(0, -k * 1.0 - wag * 4, L * 0.15, -k * 0.5); x.fill();
    // gloss
    x.fillStyle = 'rgba(255,255,255,.45)'; x.beginPath(); x.ellipse(L * 0.05, -k * 0.28, L * 0.3, k * 0.14, -0.08, 0, Math.PI * 2); x.fill();
    // eye
    x.fillStyle = '#fff'; x.beginPath(); x.arc(L * 0.3, -k * 0.1, k * 0.16, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#123'; x.beginPath(); x.arc(L * 0.33, -k * 0.1, k * 0.09, 0, Math.PI * 2); x.fill();
    x.restore();
    s.r = L * 0.5;
  }

  function stepFish(dt) {
    const fish = tank().fish;
    for (const f of fish) {
      const s = swimmer(f);
      s.ph += dt * 4;
      // Hungry fish chase the nearest flake; otherwise they wander to a new spot now and then.
      let target = null, best = 1e9;
      for (const fl of flakes) { const d = Math.hypot(fl.x - s.x, fl.y - s.y); if (d < best) { best = d; target = fl; } }
      if (target) { s.tx = target.x; s.ty = target.y; }
      else if (t > s.next) { s.tx = rnd(w * 0.06, w * 0.94); s.ty = rnd(h * 0.18, floor() - 40); s.next = t + rnd(3, 9); }
      const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy) || 1;
      const speed = target ? 170 : 55;
      s.vx += ((dx / d) * speed - s.vx) * Math.min(1, dt * 1.6);
      s.vy += ((dy / d) * speed * 0.6 - s.vy) * Math.min(1, dt * 1.6);
      s.x += s.vx * dt; s.y += s.vy * dt + Math.sin(s.ph * 0.5) * 0.2;
      if (Math.abs(s.vx) > 6) s.dir = s.vx > 0 ? 1 : -1;
      if (target && best < 18 + sizeOf(f) * 20) eat(f, target);
      drawFish(f, s);
    }
    if (label) {
      const f = fish.find((y) => y.id === label), s = f && swimmers.get(f.id);
      if (s) {
        const txt = `${f.name}${grown(f) ? '' : ' (little)'}`;
        x.font = '600 14px ' + getComputedStyle(document.body).fontFamily;
        const tw = x.measureText(txt).width + 18;
        x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.roundRect(s.x - tw / 2, s.y - s.r - 34, tw, 24, 12); x.fill();
        x.fillStyle = '#0a3a5c'; x.textAlign = 'center'; x.fillText(txt, s.x, s.y - s.r - 17);
      }
    }
  }

  function stepFlakes(dt) {
    for (const fl of flakes) { fl.y = Math.min(floor() - 4, fl.y + 38 * dt); fl.x += Math.sin(t * 2 + fl.ph) * 0.4; fl.age += dt; }
    flakes = flakes.filter((fl) => fl.age < 40);
    for (const fl of flakes) {
      x.save(); x.translate(fl.x, fl.y); x.rotate(fl.ph + t);
      x.fillStyle = `hsl(${fl.hue}, 80%, 60%)`; x.fillRect(-4, -2.5, 8, 5); x.restore();
    }
  }

  function drop(px) {
    const aq = tank();
    if (!aq.flakes) { toast('No fish flakes left. Play a game to earn more!', 'err'); return false; }
    aq.flakes--; save();
    flakes.push({ x: px ?? rnd(w * 0.15, w * 0.85), y: h * 0.1, ph: rnd(0, 6), hue: rnd(10, 45), age: 0 });
    Sound.play('drop');
    return true;
  }

  function eat(f, fl) {
    flakes.splice(flakes.indexOf(fl), 1);
    const wasGrown = grown(f);
    f.eaten = (f.eaten || 0) + 1;
    if (wasGrown) f.since = (f.since || 0) + 1;
    Sound.play('tick'); save();
    if (!wasGrown && grown(f)) toast(`${f.name} is all grown up!`, 'fun');
    if (wasGrown && f.since >= BABY_EVERY) {
      f.since = 0;
      if (tank().fish.length >= TANK_MAX) { toast(`${f.name} would have a baby, but the tank is full.`); return; }
      const baby = { id: uid(), name: FISH_NAMES.find((n) => !tank().fish.some((y) => y.name === n)) || 'Baby', hue: ((f.hue ?? 30) + rnd(-30, 30) + 360) % 360, eaten: 0, since: 0, born: Date.now(), parent: f.id };
      tank().fish.push(baby);
      const ps = swimmers.get(f.id); if (ps) swimmers.set(baby.id, { ...ps, vx: -ps.vx, next: 0 });
      save(); Sound.play('fixed');
      nameFish(baby, `${f.name} had a baby!`);
    }
  }

  function nameFish(f, title = 'Name your fish') {
    if (S.modal) { toast(`${title} Name it in System, Aquarium.`, 'fun'); return; }
    openModal({
      title, html: `<label>Name<input type="text" name="fishName" value="${esc(f.name)}" maxlength="24"></label>`,
      buttons: [{ label: 'Keep this name' }, { label: 'Save', primary: true, onClick: (root) => { f.name = val(root, 'fishName') || f.name; save(); } }]
    });
  }

  /* ============================================================ the Aquarium menu */
  function openTank() {
    const aq = tank();
    const rows = () => aq.fish.map((f) => `<div class="fish-row"><i style="--h:${f.hue}"></i><b>${esc(f.name)}</b>
      <span class="fish-bar"><span style="width:${grown(f) ? Math.round(((f.since || 0) / BABY_EVERY) * 100) : Math.round(((f.eaten || 0) / ADULT_AT) * 100)}%"></span></span>
      <em>${grown(f) ? `Baby in ${BABY_EVERY - (f.since || 0)} flakes` : `Grown up in ${ADULT_AT - (f.eaten || 0)} flakes`}</em>
      <button type="button" data-rename="${f.id}">Rename</button></div>`).join('');
    const html = () => `<p class="note">Play games to earn flakes: one for every five minutes played. ${kind === 'aquarium' ? 'Click the water to drop a flake where you like.' : ''}</p>
      <p class="fish-flakes">🐟 ${aq.flakes} fish flake${aq.flakes === 1 ? '' : 's'} · ${aq.fish.length} of ${TANK_MAX} fish</p>
      <div class="fish-list">${rows()}</div>`;
    openModal({
      title: 'Aquarium', wide: true, html: `<div class="tank-body">${html()}</div>`,
      buttons: [
        ...(kind === 'aquarium' ? [] : [{ label: 'Switch to the Aero Aquarium theme', left: true, onClick: () => { applyTheme('aero-aquarium'); save(); refresh(); } }]),
        { label: 'Close' },
        { label: 'Feed', primary: true, onClick: (root) => { if (kind !== 'aquarium') { toast('Switch to the Aero Aquarium theme to see them eat.'); return false; } drop(); $('.tank-body', root).innerHTML = html(); return false; } }
      ],
      onOpen: (root) => root.addEventListener('click', (ev) => {
        const id = ev.target.closest('[data-rename]')?.dataset.rename; if (!id) return;
        const f = aq.fish.find((y) => y.id === id); closeModal(); nameFish(f, `Rename ${f.name}`);
      })
    });
  }

  function earn(seconds) {
    const n = seconds >= 60 ? Math.max(1, Math.floor(seconds / 300)) : 0;
    if (!n) return;
    tank().flakes += n; save();
    toast(`+${n} fish flake${n === 1 ? '' : 's'} for your aquarium`, 'fun');
  }

  /* ============================================================ pointer */
  // Clicks on the background (not on a game, button or panel) reach the scene.
  const busy = (el) => !!el.closest(kind === 'bubbles' ? 'button, a, input, select, textarea, #modal, #dock, #np'
    : 'button, a, input, select, textarea, label, .item, .tile, .poster, .blade:not(.active), #np, #dock, #modal, #top, #hints, #drawer .btns, .side');
  addEventListener('pointerdown', (ev) => {
    if (!kind || S.modal || busy(ev.target)) return;
    if (kind === 'bubbles') {
      const b = [...bubbles].reverse().find((y) => Math.hypot(y.x - ev.clientX, y.y - ev.clientY) < y.r + 6);
      if (b) pop(b);
    } else if (kind === 'aquarium' && ev.clientY < floor()) drop(ev.clientX);
  });
  addEventListener('pointermove', (ev) => {
    if (kind !== 'aquarium') { label = null; return; }
    const hit = tank().fish.find((f) => { const s = swimmers.get(f.id); return s && Math.hypot(s.x - ev.clientX, s.y - ev.clientY) < (s.r || 30); });
    label = hit ? hit.id : null;
  }, { passive: true });

  /* ============================================================ loop */
  (function frame(ts) {
    requestAnimationFrame(frame);
    if (!kind || away || document.hidden || ts - last < 33) return;
    const dt = Math.min(0.1, last ? (ts - last) / 1000 : 0.033);
    last = ts; t += still ? 0 : dt;
    x.clearRect(0, 0, w, h);
    if (kind === 'bubbles') stepBubbles(still ? 0 : dt, Math.round((w * h) / 52000));
    else if (kind === 'aquarium') { drawWater(); stepFlakes(dt); stepFish(still ? 0 : dt); }
  })(0);

  return { set, openTank, earn, drop, kind: () => kind };
})();
