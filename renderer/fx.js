'use strict';
/* Bladedeck effects: launch tracers and the menu ripple (FX), the "you broke the menu"
   minigame with Rivet the handyman (Crash), and hidden secrets (Secrets).
   Loaded before app.js; uses S, $, $$, esc, save, toast and Sound at call time. */

const rnd = (a, b) => a + Math.random() * (b - a);
const fxOn = () => S.lib?.settings.fx !== false && !matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================================================================ FX: canvas particles */
const FX = (() => {
  const c = document.getElementById('fx'), x = c.getContext('2d');
  let w = 0, h = 0, running = false;
  const effects = new Set();
  const size = () => { w = c.width = innerWidth; h = c.height = innerHeight; };
  size(); addEventListener('resize', size);

  function add(e) { effects.add(e); if (!running) { running = true; requestAnimationFrame(loop); } }
  function loop(t) {
    // Fading the previous frame instead of clearing it is what leaves the tracer trails.
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'lighter';
    for (const e of effects) if (e.step(t) === false) effects.delete(e);
    if (effects.size) requestAnimationFrame(loop);
    else { x.clearRect(0, 0, w, h); running = false; }
  }

  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const theme = S.theme?.ribbon?.colors || [];
    return [cs.getPropertyValue('--accent-hi').trim() || '#9fe23c', cs.getPropertyValue('--accent').trim() || '#5aa516', ...theme, '#ffffff'];
  }
  const centerOf = (el) => {
    if (!el) return { x: w / 2, y: h / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  function sparks(p, n = 24, cols = palette(), speed = 7) {
    const ps = Array.from({ length: n }, (_, i) => {
      const a = Math.random() * Math.PI * 2, v = rnd(speed * 0.3, speed);
      return { x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(18, 34), col: cols[i % cols.length] };
    });
    add({ step() {
      let alive = false;
      for (const s of ps) {
        if (s.life <= 0) continue;
        alive = true; s.life--;
        x.strokeStyle = s.col; x.lineWidth = 2; x.globalAlpha = Math.min(1, s.life / 14);
        x.beginPath(); x.moveTo(s.x, s.y); s.x += s.vx; s.y += s.vy; s.vx *= 0.93; s.vy = s.vy * 0.93 + 0.18; x.lineTo(s.x, s.y); x.stroke();
      }
      x.globalAlpha = 1;
      return alive;
    } });
  }

  // Streaks fly in from every screen edge and converge on the target. Resolves on arrival.
  function tracers(el, { count = 46, dur = 620 } = {}) {
    return new Promise((done) => {
      if (!fxOn()) return done();
      const tgt = centerOf(el), cols = palette();
      const ps = Array.from({ length: count }, (_, i) => {
        const side = i % 4, u = Math.random();
        const sx = side === 0 ? u * w : side === 1 ? w + 20 : side === 2 ? u * w : -20;
        const sy = side === 0 ? -20 : side === 1 ? u * h : side === 2 ? h + 20 : u * h;
        const dx = tgt.x - sx, dy = tgt.y - sy, len = Math.hypot(dx, dy) || 1, bend = rnd(-0.35, 0.35) * len;
        return { sx, sy, cx: (sx + tgt.x) / 2 - dy / len * bend, cy: (sy + tgt.y) / 2 + dx / len * bend,
          delay: Math.random() * dur * 0.4, col: cols[i % cols.length], lw: rnd(1, 3.2), px: sx, py: sy };
      });
      const t0 = performance.now(); let arrived = false;
      add({ step(t) {
        const el2 = t - t0;
        for (const p of ps) {
          const k = Math.max(0, Math.min(1, (el2 - p.delay) / (dur - p.delay)));
          if (k <= 0 || p.done) continue;
          const e = k * k * (1.6 - 0.6 * k), m = 1 - e;
          const nx = m * m * p.sx + 2 * m * e * p.cx + e * e * tgt.x, ny = m * m * p.sy + 2 * m * e * p.cy + e * e * tgt.y;
          x.strokeStyle = p.col; x.lineWidth = p.lw; x.lineCap = 'round';
          x.beginPath(); x.moveTo(p.px, p.py); x.lineTo(nx, ny); x.stroke();
          x.fillStyle = '#fff'; x.beginPath(); x.arc(nx, ny, p.lw * 0.9, 0, 7); x.fill();
          p.px = nx; p.py = ny; if (k >= 1) p.done = true;
        }
        if (!arrived && el2 >= dur) { arrived = true; sparks(tgt, 30, cols, 6); done(); }
        return el2 < dur + 60;
      } });
    });
  }

  // The menu turns to water around a point (see water.js). With { dom: false }, or the classic
  // style, rings of light roll out instead while every panel on screen bobs as the wave passes.
  // Resolves when the effect is over.
  function ripple(el, { dom = true } = {}) {
    if (!fxOn()) return Promise.resolve();
    const style = S.lib?.settings.rippleStyle || 'water';
    // Every ripple follows the chosen style; { dom: false } only makes it a lighter splash.
    if (style !== 'classic' && Water.ok) return Water.splash(centerOf(el), style === 'rainbow' && Secrets.has('rainbow') ? 1 : 0, { light: !dom });
    const o = centerOf(el), cols = palette(), t0 = performance.now(), maxR = Math.hypot(w, h);
    const rings = [0, 110, 230, 380].map((d, i) => ({ d, col: cols[i % cols.length] }));
    add({ step(t) {
      const el2 = t - t0;
      if (el2 < 160) {
        const g = x.createRadialGradient(o.x, o.y, 0, o.x, o.y, 260);
        g.addColorStop(0, `rgba(255,255,255,${0.35 * (1 - el2 / 160)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(o.x - 260, o.y - 260, 520, 520);
      }
      let alive = false;
      for (const r of rings) {
        const k = (el2 - r.d) / 900;
        if (k < 0 || k > 1) { if (k < 0) alive = true; continue; }
        alive = true;
        x.globalAlpha = (1 - k) * 0.9; x.strokeStyle = r.col; x.lineWidth = 14 * (1 - k) + 1;
        x.beginPath(); x.arc(o.x, o.y, maxR * (1 - Math.pow(1 - k, 2.2)), 0, Math.PI * 2); x.stroke();
      }
      x.globalAlpha = 1;
      return alive;
    } });
    if (dom) rippleDom(o);
    return new Promise((r) => setTimeout(r, 1300));
  }

  function rippleDom(o) {
    const els = $$('.blade, .item, .tile, .poster, .info, #top > *, #hints .h, .side, .drawer, .bar');
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const d = Math.hypot(r.left + r.width / 2 - o.x, r.top + r.height / 2 - o.y);
      el.style.setProperty('--rip-d', (d * 0.55).toFixed(0) + 'ms');
      el.classList.remove('rip'); void el.offsetWidth; el.classList.add('rip');
    }
    setTimeout(() => els.forEach((el) => el.classList.remove('rip')), 1700);
  }

  function fizzle(el) {
    if (!fxOn() || !el) return;
    sparks(centerOf(el), 26, ['#ff5a4e', '#ffb199', '#ffffff'], 5);
    el.classList.remove('fizz'); void el.offsetWidth; el.classList.add('fizz');
  }

  // Slow glowing specks drifting up, shown when the launcher has been left alone.
  let snow = null;
  function marineSnow(on) {
    if (on && !snow && fxOn()) {
      const cols = palette();
      const ps = Array.from({ length: 70 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: rnd(0.6, 2.4), v: rnd(0.15, 0.6), ph: Math.random() * 6, col: cols[(Math.random() * cols.length) | 0] }));
      let fade = 0;
      snow = { stop: false, step(t) {
        fade = this.stop ? fade - 0.03 : Math.min(1, fade + 0.01);
        for (const p of ps) {
          p.y -= p.v; p.x += Math.sin(t / 1400 + p.ph) * 0.35;
          if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
          x.globalAlpha = fade * (0.5 + 0.5 * Math.sin(t / 700 + p.ph));
          x.fillStyle = p.col; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill();
        }
        x.globalAlpha = 1;
        return fade > 0 || !this.stop;
      } };
      add(snow);
    } else if (!on && snow) { snow.stop = true; snow = null; }
  }

  return { tracers, ripple, sparks, fizzle, marineSnow, centerOf };
})();

/* ================================================================ secret themes */
const SECRET_THEMES = {
  abyss: {
    id: 'abyss', name: 'Abyss (secret)', secret: true,
    vars: {
      '--bg': 'radial-gradient(130% 100% at 50% -10%, #0b3c5d 0%, #04182b 45%, #01060d 100%)',
      '--ink': '#d9f6ff', '--ink-dim': '#7fb3c7', '--accent': '#00a5c8', '--accent-hi': '#3ff2e0', '--accent-ink': '#01141f',
      '--glass-hi': 'rgba(70,170,210,0.30)', '--glass': 'rgba(20,90,130,0.22)', '--glass-lo': 'rgba(4,30,52,0.55)',
      '--glass-edge': 'rgba(110,230,255,0.45)', '--shadow': 'rgba(0,0,0,0.6)', '--panel': 'rgba(6,36,60,0.72)', '--panel-solid': '#082238',
      '--field': '#04182b', '--line': 'rgba(120,220,255,0.22)', '--btn-hi': '#0f4a6e', '--btn-lo': '#06283f', '--radius': '18px'
    },
    ribbon: { colors: ['#3ff2e0', '#2b7bff', '#9b5cff', '#00ffa6'], alpha: 0.22, blend: 'lighter', width: 90, count: 6, speed: 0.18 }
  },
  coral: {
    id: 'coral', name: 'Coral Reef (secret)', secret: true,
    vars: {
      '--bg': 'radial-gradient(120% 90% at 80% 0%, #fff4e0 0%, #ffd1b8 40%, #ff8a7a 100%)',
      '--ink': '#2a0f1c', '--ink-dim': '#7a3a4c', '--accent': '#008c8c', '--accent-hi': '#16e0c8', '--accent-ink': '#ffffff',
      '--glass-hi': 'rgba(255,255,255,0.85)', '--glass': 'rgba(255,240,230,0.5)', '--glass-lo': 'rgba(255,180,160,0.5)',
      '--glass-edge': 'rgba(255,255,255,0.95)', '--shadow': 'rgba(120,20,40,0.32)', '--panel': 'rgba(255,248,240,0.7)', '--panel-solid': '#fff3ea',
      '--field': '#ffffff', '--line': 'rgba(120,30,60,0.2)', '--btn-hi': '#ffffff', '--btn-lo': '#ffd9cc', '--radius': '20px'
    },
    ribbon: { colors: ['#ff5f7e', '#ffc14d', '#16e0c8', '#ffffff'], alpha: 0.4, blend: 'source-over', width: 110, count: 6, speed: 0.3 }
  },
  neon: {
    id: 'neon', name: 'Arcade Neon (secret)', secret: true,
    vars: {
      '--bg': 'radial-gradient(120% 100% at 50% 110%, #2a0040 0%, #0a0014 55%, #000 100%)',
      '--ink': '#fff6ff', '--ink-dim': '#c99ad9', '--accent': '#ff1f8f', '--accent-hi': '#ffe600', '--accent-ink': '#14000a',
      '--glass-hi': 'rgba(255,60,200,0.22)', '--glass': 'rgba(120,0,160,0.18)', '--glass-lo': 'rgba(20,0,40,0.6)',
      '--glass-edge': 'rgba(0,255,240,0.6)', '--shadow': 'rgba(255,0,150,0.35)', '--panel': 'rgba(20,0,40,0.78)', '--panel-solid': '#16002a',
      '--field': '#0a0014', '--line': 'rgba(0,255,240,0.3)', '--btn-hi': '#3a0060', '--btn-lo': '#1a002c', '--radius': '6px'
    },
    ribbon: { colors: ['#ff1f8f', '#00fff0', '#ffe600', '#7a5cff'], alpha: 0.3, blend: 'lighter', width: 70, count: 7, speed: 0.5 }
  }
};

/* ================================================================ Secrets */
const SECRETS = [
  { id: 'abyss',   name: 'Abyss theme',      hint: 'Some menus cannot take being rushed from one end to the other.' },
  { id: 'toolbox', name: "Rivet's Toolbox",  hint: 'Fix things twice.' },
  { id: 'neon',    name: 'Arcade Neon theme', hint: 'Fix things a third time.' },
  { id: 'coral',   name: 'Coral Reef theme', hint: 'A very old code. Up, up...' },
  { id: 'whale',   name: 'The whale',        hint: 'Knock on the orb. Keep knocking.' },
  { id: 'snow',    name: 'Marine snow',      hint: 'Put the controller down and listen to the sea for a while.' },
  { id: 'rainbow', name: 'Rainbow splash',   hint: 'Touch the water while it is still moving.' },
  { id: 'drive',   name: 'The wheel',        hint: 'On a rainy night, go down twice, up twice, then wiggle like a racer: right, left, right, left, and go.' }
];

const RIPPLES = [
  { id: 'water',   name: 'Clear water',    sub: 'Slow, glassy and calm' },
  { id: 'rainbow', name: 'Rainbow splash', sub: 'Fast and very colourful', secret: 'rainbow' },
  { id: 'classic', name: 'Light rings',    sub: 'The original rings' }
];

const Secrets = (() => {
  const KONAMI = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a'];
  const WHEEL = ['down', 'down', 'up', 'up', 'right', 'left', 'right', 'left', 'a'];
  let seq = [], orbHits = [], idleTimer = 0, idle = false;
  const has = (id) => !!S.lib.settings.secrets?.[id];

  function unlock(id, msg) {
    S.lib.settings.secrets = S.lib.settings.secrets || {};
    if (has(id)) return false;
    S.lib.settings.secrets[id] = Date.now();
    if (SECRET_THEMES[id]) installThemes();
    save(); Sound.play('secret');
    toast(msg || `Secret found: ${SECRETS.find((s) => s.id === id)?.name || id}`, 'fun');
    return true;
  }

  function installThemes() {
    for (const [id, t] of Object.entries(SECRET_THEMES)) if (has(id) && !S.themes.some((x) => x.id === id)) S.themes.push(t);
  }

  // Returns true when the action was eaten by a secret (the final A of the code must not launch a game).
  function feed(a) {
    bump();
    seq.push(a); if (seq.length > KONAMI.length) seq.shift();
    if (seq.slice(-WHEEL.length).join() === WHEEL.join() && Drive.on()) {
      seq = [];
      unlock('drive', 'Secret found: the wheel. It is yours. (System, Take the wheel, any time.)');
      Drive.start();
      return true;
    }
    if (seq.join() === KONAMI.join()) {
      seq = [];
      if (unlock('coral', 'Secret found: the Coral Reef theme. It is in Next theme now.')) { applyTheme('coral'); save(); refresh(); FX.ripple(null); Sound.play('ripple'); }
      else toast('You already know the code.', 'fun');
      return true;
    }
    return false;
  }

  function orb() {
    const now = Date.now();
    orbHits = orbHits.filter((t) => now - t < 4000); orbHits.push(now);
    Sound.play('tick');
    $('.orb').classList.remove('knock'); void $('.orb').offsetWidth; $('.orb').classList.add('knock');
    if (orbHits.length >= 7) {
      orbHits = [];
      Sound.whale();
      FX.ripple($('.orb'), { dom: false });
      unlock('whale', 'Secret found: something large answered from the deep.');
    }
  }

  // Two quiet minutes in console mode brings up the marine snow.
  function bump() {
    if (idle) { idle = false; FX.marineSnow(false); }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (S.mode !== 'console' || document.hidden || S.modal || Crash.busy()) return bump();
      idle = true; FX.marineSnow(true);
      setTimeout(() => { if (idle) unlock('snow', 'Secret found: marine snow. Stay still and it comes back.'); }, 8000);
    }, 120000);
  }

  function openToolbox() {
    const found = SECRETS.filter((s) => has(s.id)).length;
    openModal({
      title: "Rivet's Toolbox", wide: true,
      html: `<p class="note">${found} of ${SECRETS.length} secrets found.</p>
        <div class="secrets">${SECRETS.map((s) => has(s.id)
          ? `<div class="secret on"><b>${esc(s.name)}</b><span>Found ${esc(new Date(S.lib.settings.secrets[s.id]).toLocaleDateString())}</span></div>`
          : `<div class="secret"><b>???</b><span>${esc(s.hint)}</span></div>`).join('')}</div>
        <p class="note">Rivet's past finds: ${(S.lib.settings.rewards || []).length ? esc(S.lib.settings.rewards.map((r) => r.title).join(', ')) : 'nothing yet'}.</p>`,
      buttons: [{ label: 'Close', primary: true }]
    });
  }

  // Hidden settings, on the System blade once any secret has been found.
  function openOptions() {
    const st = S.lib.settings;
    const draw = (root) => {
      $('.dlg-body', root).innerHTML = `
        <div class="side-h" style="margin:0">When the menu ripples</div>
        <div class="opt-row">${RIPPLES.map((r) => { const locked = r.secret && !has(r.secret);
          return `<button type="button" data-rip="${r.id}" class="${(st.rippleStyle || 'water') === r.id ? 'on' : ''}" ${locked ? 'disabled' : ''}><b>${locked ? '???' : esc(r.name)}</b><span>${esc(locked ? SECRETS.find((s) => s.id === r.secret).hint : r.sub)}</span></button>`; }).join('')}</div>
        <p class="note">Press Try it to see the current style. ${SECRETS.filter((s) => has(s.id)).length} of ${SECRETS.length} secrets found.</p>`;
    };
    openModal({
      title: 'Secret options', wide: true, html: '',
      buttons: [{ label: 'Try it', left: true, onClick: () => { setTimeout(() => FX.ripple(null), 80); } }, { label: 'Done', primary: true }],
      onOpen: (root) => {
        draw(root);
        root.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-rip]'); if (!b || b.disabled) return;
          st.rippleStyle = b.dataset.rip; save(); draw(root); Sound.play('tick');
          $(`[data-rip="${b.dataset.rip}"]`, root)?.focus();
        });
      }
    });
  }

  return { feed, orb, bump, unlock, has, installThemes, openToolbox, openOptions, any: () => Object.keys(S.lib.settings.secrets || {}).length > 0 };
})();

/* ================================================================ Crash: break it, hammer it, get a prize */
const Crash = (() => {
  let state = null, progress = 0, decay = 0, pieces = [], impact = { x: 0, y: 0 }, cooldown = 0, rewardNow = null;
  const log = [];
  const OPP = { left: 'right', right: 'left', up: 'down', down: 'up' };

  const root = document.createElement('div');
  root.id = 'crash'; root.hidden = true;
  root.innerHTML = `
    <svg id="cracks" xmlns="http://www.w3.org/2000/svg"></svg>
    <div class="fixit">
      <svg class="hammer" viewBox="0 0 100 100" aria-hidden="true">
        <rect x="44" y="30" width="12" height="66" rx="5" fill="#a86a32"/><rect x="44" y="30" width="5" height="66" rx="2" fill="#c98a4d"/>
        <rect x="14" y="12" width="72" height="26" rx="6" fill="#6f7b86"/><rect x="14" y="12" width="72" height="9" rx="4" fill="#aab6c1"/>
        <rect x="8" y="14" width="10" height="22" rx="3" fill="#56616b"/>
      </svg>
      <h2>Whoa. You broke the menu.</h2>
      <p>Mash <i class="pad a">A</i> to hammer it back together</p>
      <div class="meter"><i></i></div>
      <p class="skip">Press B to leave it broken</p>
    </div>`;
  document.body.appendChild(root);

  // Rivet: an original little handyman. Yellow hard hat, big moustache, orange overalls.
  const rivet = document.createElement('div');
  rivet.id = 'rivet'; rivet.hidden = true;
  rivet.innerHTML = `
    <svg class="man" viewBox="0 0 120 170" aria-hidden="true">
      <ellipse cx="60" cy="164" rx="34" ry="5" fill="rgba(0,0,0,.25)"/>
      <rect x="38" y="128" width="16" height="32" rx="6" fill="#2f4a7a"/><rect x="66" y="128" width="16" height="32" rx="6" fill="#2f4a7a"/>
      <rect x="32" y="152" width="26" height="12" rx="6" fill="#3b2a1e"/><rect x="62" y="152" width="26" height="12" rx="6" fill="#3b2a1e"/>
      <rect x="30" y="84" width="60" height="54" rx="16" fill="#ff8a1f"/>
      <rect x="44" y="92" width="32" height="22" rx="4" fill="#ffa64d"/>
      <circle cx="48" cy="96" r="3" fill="#ffe08a"/><circle cx="72" cy="96" r="3" fill="#ffe08a"/>
      <g class="arm-l"><rect x="14" y="88" width="16" height="38" rx="8" fill="#ff8a1f"/><circle cx="22" cy="128" r="8" fill="#f2c39b"/></g>
      <g class="arm-r"><rect x="90" y="88" width="16" height="38" rx="8" fill="#ff8a1f"/><circle cx="98" cy="128" r="8" fill="#f2c39b"/>
        <rect x="94" y="132" width="8" height="26" rx="3" fill="#8b98a5"/><rect x="88" y="152" width="20" height="8" rx="3" fill="#8b98a5"/></g>
      <circle cx="60" cy="58" r="30" fill="#f2c39b"/>
      <circle cx="49" cy="54" r="4" fill="#1b1b1b"/><circle cx="71" cy="54" r="4" fill="#1b1b1b"/>
      <circle cx="50.5" cy="52.5" r="1.4" fill="#fff"/><circle cx="72.5" cy="52.5" r="1.4" fill="#fff"/>
      <ellipse cx="60" cy="64" rx="7" ry="6" fill="#e39a7a"/>
      <path d="M38 70 Q49 64 60 70 Q71 64 82 70 Q74 80 60 74 Q46 80 38 70Z" fill="#5a3a22"/>
      <ellipse class="mouth" cx="60" cy="78" rx="5" ry="2" fill="#7a2230"/>
      <path d="M26 44 Q28 16 60 14 Q92 16 94 44Z" fill="#ffd21f"/><rect x="20" y="40" width="80" height="9" rx="4" fill="#f2b705"/>
      <rect x="55" y="16" width="10" height="26" rx="4" fill="#ffe266"/>
    </svg>
    <div class="bubble"><p class="say"></p><div class="reward" hidden></div></div>`;
  document.body.appendChild(rivet);

  const busy = () => !!state;
  const container = () => (S.mode === 'console' ? $('#console') : $('#pc'));

  // Called after every directional input with whether the cursor actually moved.
  function watch(a, moved) {
    if (state || S.modal || Date.now() < cooldown || !fxOn()) return;
    const now = Date.now();
    log.push({ t: now, a, edge: !moved });
    while (log.length && now - log[0].t > 4000) log.shift();
    const edges = new Set(log.filter((e) => e.edge).map((e) => e.a));
    const crossed = [...edges].some((d) => edges.has(OPP[d]));
    if (log.length >= 14 && crossed) { log.length = 0; trigger(a); }
  }

  function trigger(dir) {
    state = 'whip';
    const box = container();
    const sx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, sy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    box.style.setProperty('--wx', sx || (Math.random() < 0.5 ? -1 : 1));
    box.style.setProperty('--wy', sy);
    box.classList.add('whip');
    Sound.play('whip');
    impact = { x: innerWidth * (0.5 + sx * 0.38), y: innerHeight * (0.5 + sy * 0.32) };
    setTimeout(() => { box.classList.remove('whip'); breakIt(); }, 560);
  }

  function breakIt() {
    state = 'broken'; progress = 0;
    pieces = S.mode === 'console' ? $$('.blade') : $$('#pc > *');
    pieces.forEach((p) => { p._c = { r: rnd(-15, 15), x: rnd(-30, 30), y: rnd(24, 110) }; p.classList.add('broken'); });
    $('#top').classList.add('broken'); $('#top')._c = { r: rnd(-4, 4), x: rnd(-10, 10), y: rnd(6, 20) }; pieces.push($('#top'));
    setBroken(1);
    document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake');
    Sound.play('crash');
    drawCracks();
    FX.sparks(impact, 50, ['#ffffff', '#cfe8ff', '#ffd27a'], 11);
    root.hidden = false; root.classList.remove('show'); void root.offsetWidth; root.classList.add('show');
    render();
    clearInterval(decay);
    decay = setInterval(() => { if (state === 'broken' && progress > 0) { progress = Math.max(0, progress - 0.004); render(); } }, 100);
  }

  function setBroken(k) {
    for (const p of pieces) {
      if (!p._c) continue;
      p.style.transform = k > 0.001 ? `translate(${p._c.x * k}px, ${p._c.y * k}px) rotate(${p._c.r * k}deg)` : '';
    }
  }

  function drawCracks() {
    const svg = $('#cracks', root);
    svg.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    const paths = [];
    const branch = (x0, y0, ang, len, depth) => {
      let px = x0, py = y0, seg = `M${px.toFixed(1)} ${py.toFixed(1)}`;
      const steps = 5 + (Math.random() * 4 | 0);
      for (let i = 0; i < steps; i++) {
        ang += rnd(-0.45, 0.45); const st = len / steps;
        px += Math.cos(ang) * st; py += Math.sin(ang) * st; seg += `L${px.toFixed(1)} ${py.toFixed(1)}`;
        if (depth < 2 && Math.random() < 0.3) branch(px, py, ang + rnd(-1, 1), len * 0.45, depth + 1);
      }
      paths.push(seg);
    };
    const n = 11;
    for (let i = 0; i < n; i++) branch(impact.x, impact.y, (i / n) * Math.PI * 2 + rnd(-0.2, 0.2), rnd(160, Math.max(innerWidth, innerHeight) * 0.55), 0);
    const d = paths.join('');
    // Concentric shards near the point of impact.
    let ring = '';
    for (const r of [26, 58]) { ring += `M${impact.x + r} ${impact.y}`; for (let a = 0.4; a <= Math.PI * 2 + 0.01; a += 0.4) ring += `L${(impact.x + Math.cos(a) * r * rnd(0.85, 1.15)).toFixed(1)} ${(impact.y + Math.sin(a) * r * rnd(0.85, 1.15)).toFixed(1)}`; }
    svg.innerHTML = `<path d="${d}${ring}" class="c-shadow"/><path d="${d}${ring}" class="c-line"/>`;
  }

  function render() {
    setBroken(1 - progress);
    $('#cracks', root).style.opacity = String(1 - progress * 0.92);
    $('.meter i', root).style.width = (progress * 100).toFixed(1) + '%';
  }

  function hit() {
    progress = Math.min(1, progress + 0.07);
    const hm = $('.hammer', root); hm.classList.remove('swing'); void hm.getBoundingClientRect(); hm.classList.add('swing');
    Sound.play('clank');
    FX.sparks({ x: impact.x + rnd(-60, 60), y: impact.y + rnd(-60, 60) }, 14, ['#ffd27a', '#ffffff', '#ff9d3b'], 7);
    render();
    if (progress >= 1) fixed();
  }

  function restore() {
    clearInterval(decay);
    for (const p of pieces) { p.style.transform = ''; p.classList.remove('broken'); delete p._c; }
    pieces = [];
    root.hidden = true; root.classList.remove('show');
  }

  function giveUp() {
    restore(); state = null; cooldown = Date.now() + 30000;
    toast('The menu pulled itself together. Rivet looks a little disappointed.');
  }

  function fixed() {
    state = 'reward';
    restore();
    S.lib.settings.fixes = (S.lib.settings.fixes || 0) + 1; save();
    Sound.play('fixed'); setTimeout(() => Sound.play('ripple'), 120);
    // Rivet walks in once the water has settled, or he would be hidden under it.
    Promise.race([FX.ripple(null), new Promise((r) => setTimeout(r, 4000))]).then(() => setTimeout(showRivet, 150));
  }

  /* -------------------------------------------------------------- Rivet + rewards */
  function pickReward() {
    const st = S.lib.settings, fixes = st.fixes || 1;
    if (!Secrets.has('abyss')) return { kind: 'theme', id: 'abyss', title: 'Secret theme: Abyss', text: 'Deep-sea blues with glowing plankton. Very calming.' };
    if (!Secrets.has('toolbox') && fixes >= 2) return { kind: 'menu', id: 'toolbox', title: "New menu option: Rivet's Toolbox", text: 'Look for it on the System blade. It keeps track of every secret you find.' };
    if (!Secrets.has('neon') && fixes >= 3) return { kind: 'theme', id: 'neon', title: 'Secret theme: Arcade Neon', text: 'Hot pink, electric cyan and a whole lot of contrast.' };
    const pool = S.lib.entries.filter((e) => !e.hidden);
    if (pool.length) {
      const score = (e) => (e.lastPlayed ? (Date.now() - e.lastPlayed) / 864e5 : 400) + Math.random() * 60 + (e.favorite ? 20 : 0);
      const g = pool.sort((a, b) => score(b) - score(a))[0];
      const days = g.lastPlayed ? Math.round((Date.now() - g.lastPlayed) / 864e5) : null;
      return { kind: 'game', id: g.id, title: `Try this: ${g.title}`,
        text: days === null ? "You've never launched it. I've got a feeling about this one." : days < 2 ? 'You were just playing it. Go finish what you started.' : `You haven't touched it in ${days} days. It misses you.` };
    }
    return { kind: 'tip', id: 'tip', title: "Rivet's tip", text: 'Add some games from the System blade, then break the menu again. I will have something better next time.' };
  }

  async function say(text) {
    const p = $('.say', rivet); p.textContent = '';
    const mouth = $('.mouth', rivet);
    for (let i = 0; i < text.length; i++) {
      if (state !== 'reward') return;
      p.textContent += text[i];
      if (i % 2 === 0 && text[i] !== ' ') { Sound.play('talk'); mouth.setAttribute('ry', i % 4 ? '5' : '2'); }
      await new Promise((r) => setTimeout(r, text[i] === '.' || text[i] === '!' ? 140 : 26));
    }
    mouth.setAttribute('ry', '2');
  }

  async function showRivet() {
    rivet.hidden = false; rivet.classList.remove('out'); rivet.classList.add('in');
    $('.reward', rivet).hidden = true;
    rewardNow = pickReward();
    await new Promise((r) => setTimeout(r, 450));
    await say('HEY! Thanks for fixing the bug!');
    await new Promise((r) => setTimeout(r, 450));
    await say('Here, check this out. You can have this!');
    if (state !== 'reward') return;
    const rw = $('.reward', rivet);
    rw.innerHTML = `<b>${esc(rewardNow.title)}</b><span>${esc(rewardNow.text)}</span>
      <div class="rw-btns"><span class="h"><i class="pad a">A</i>${rewardNow.kind === 'game' ? 'Play it' : rewardNow.kind === 'theme' ? 'Wear it' : 'Take it'}</span><span class="h"><i class="pad b">B</i>${rewardNow.kind === 'game' ? 'Later' : 'Keep it for later'}</span></div>`;
    rw.hidden = false; Sound.play('secret');
  }

  function finish(accept) {
    const r = rewardNow; rewardNow = null;
    if (r) {
      (S.lib.settings.rewards = S.lib.settings.rewards || []).push({ title: r.title, at: Date.now() });
      if (r.kind === 'theme') { Secrets.unlock(r.id, `${r.title} unlocked. Find it under Next theme.`); if (accept) { applyTheme(r.id); refresh(); } }
      if (r.kind === 'menu') { Secrets.unlock(r.id, `${r.title} is on the System blade now.`); refresh(); }
      save();
    }
    say(accept ? 'Enjoy! Try not to break anything. Or do.' : 'No rush. See ya!');
    setTimeout(() => {
      rivet.classList.remove('in'); rivet.classList.add('out');
      setTimeout(() => { rivet.hidden = true; rivet.classList.remove('out'); }, 600);
      state = null; cooldown = Date.now() + 20000;
      if (accept && r?.kind === 'game') { const g = S.lib.entries.find((e) => e.id === r.id); if (g) { S.sel = g; launch(g); } }
    }, 1300);
  }

  // Returns true when the crash sequence owns this input.
  function handle(a) {
    if (!state) return false;
    if (state === 'broken') { if (a === 'a') hit(); else if (a === 'b') giveUp(); return true; }
    if (state === 'reward') {
      if (rewardNow && !$('.reward', rivet).hidden && (a === 'a' || a === 'b')) finish(a === 'a');
      return true;
    }
    return true;
  }

  root.addEventListener('click', () => { if (state === 'broken') hit(); });
  rivet.addEventListener('click', (ev) => { if (state === 'reward' && rewardNow && !$('.reward', rivet).hidden) finish(!ev.target.closest('.pad.b, .h:last-child')); });
  addEventListener('resize', () => { if (state === 'broken') drawCracks(); });

  return { watch, handle, busy, trigger };
})();
