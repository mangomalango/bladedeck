'use strict';
/* Intro: a little show while a game starts. A glass blade sweeps in with the game's art and
   name, then a random sponsor ("This game was brought to you by an angry monkey"), and the blade
   dissolves into rising steam. It covers the dull part of a launch, Steam getting ready, and any
   button skips it. Settings, "Launch intro" turns it off.
   Uses S, cover, fileUrl, esc, fxOn and Sound at call time. */

const SPONSORS = [
  ['🐒', 'An Angry Monkey', 'He wants his controller back.'],
  ['🦝', 'A Raccoon in a Trench Coat', 'Definitely just one raccoon. Do not ask.'],
  ['🐸', 'A Frog Who Believes in You', 'Ribbit. You got this.'],
  ['🦆', 'A Suspicious Duck', 'Quack. That is all you need to know.'],
  ['🍞', 'Sentient Toast', 'Lightly buttered. Heavily armed.'],
  ['🐌', 'Snail Express Shipping', 'Your game will arrive. Eventually.'],
  ['🦀', 'Crab Rave Productions', 'Loading is gone.'],
  ['🐙', 'An Octopus With Eight Controllers', 'Co-op? He is co-op.'],
  ['🧦', 'The Lost Sock Foundation', 'Searching dryers since 1987.'],
  ['🦖', 'A T-Rex Who Cannot Reach the Buttons', 'Tiny arms. Big dreams.'],
  ['🥔', 'A Very Ambitious Potato', 'Starch-powered gaming.'],
  ['🐧', 'Penguin Overclocking Ltd.', 'Cool under pressure.'],
  ['🦉', 'An Owl Who Stays Up Too Late', 'Just one more game. Hoo.'],
  ['🍕', 'Pizza Found Under the Couch', 'Still good. Probably.'],
  ['🐐', 'A Goat That Screams', 'AAAAAAAAAAAAAAAA.'],
  ['🦙', 'The No Drama Llama', 'Calm vibes only.'],
  ['🤖', 'A Robot Learning to Feel', 'It feels… mostly loading.'],
  ['🐢', 'Turbo Turtle Internet', 'Fastest in its pond.'],
  ['🦩', 'A Flamingo on One Leg', 'Balance is everything.'],
  ['🐿️', 'A Squirrel Who Buried Your Save File', 'He forgot where.'],
  ['🧙', 'A Wizard Who Blew on the Cartridge', 'It works now. Magic.'],
  ['🐟', 'Your Aquarium Fish', 'Please feed us afterwards.'],
  ['🫧', 'Several Bubbles', 'Pop us later.'],
  ['🐈', 'A Cat Sitting on the Keyboard', 'asdfghjkl;;;;;;'],
  ['👻', 'The Ghost of Saves Past', 'Did you remember to save?'],
  ['🐉', 'A Dragon on Its Lunch Break', 'Back in fifteen minutes.'],
  ['🦦', 'Two Otters Holding Hands', 'So you never drift away from your game.'],
  ['🐝', 'A Bee With a Business Plan', 'Buzzness is booming.'],
  ['🦔', 'A Hedgehog Who Is Not That Fast', 'Gotta go… at a reasonable pace.'],
  ['🍌', 'The Monkey\'s Lawyer', 'My client was not that angry.']
];

const Intro = (() => {
  const el = document.createElement('div');
  el.id = 'intro'; el.hidden = true;
  el.innerHTML = '<canvas class="in-steam"></canvas><div class="in-blade"></div>';
  document.body.appendChild(el);
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d'), blade = el.querySelector('.in-blade');
  let puffs = [], running = false, until = 0, endAt = 0, skipT = 0, last = '';

  const on = () => S.lib.settings.intro !== false && fxOn();
  const pick = () => {
    let s; do { s = SPONSORS[Math.floor(Math.random() * SPONSORS.length)]; } while (s[1] === last && SPONSORS.length > 1);
    last = s[1]; return s;
  };

  /* -------------------------------------------------------------- steam */
  function puff(x, y, big) {
    puffs.push({ x, y, r: (big ? 26 : 14) + Math.random() * 30, vx: (Math.random() - 0.5) * 0.6, vy: -0.6 - Math.random() * 1.4, life: 0, max: 70 + Math.random() * 60, a: big ? 0.5 : 0.32 });
  }
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const w = cv.width = innerWidth, h = cv.height = innerHeight;
    ctx.clearRect(0, 0, w, h);
    const now = performance.now();
    // While the blade is up it breathes a little steam off its edges; at the end it all goes up.
    const r = blade.getBoundingClientRect();
    const dissolving = now > endAt - 900;
    const n = dissolving ? 9 : 1;
    if (now < endAt) for (let i = 0; i < n; i++) {
      if (!dissolving && Math.random() > 0.35) continue;
      const edge = dissolving ? r.left + Math.random() * r.width : (Math.random() < 0.5 ? r.left : r.right) + (Math.random() - 0.5) * 30;
      puff(edge, dissolving ? r.top + Math.random() * r.height : r.bottom - Math.random() * r.height * 0.4, dissolving);
    }
    puffs = puffs.filter((p) => p.life < p.max);
    for (const p of puffs) {
      p.life++; p.x += p.vx; p.y += p.vy; p.r += 0.55; p.vy *= 0.995;
      const k = p.life / p.max, alpha = p.a * Math.sin(Math.PI * Math.min(1, k * 1.2)) * (1 - k);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(255,255,255,${alpha})`); g.addColorStop(0.6, `rgba(235,240,245,${alpha * 0.45})`); g.addColorStop(1, 'rgba(235,240,245,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    if (now > until && !puffs.length) stop();
  }

  /* -------------------------------------------------------------- the show */
  function play(e) {
    if (!on() || running) return;
    const [emoji, who, line] = pick();
    const hero = e.hero || e.cover;
    blade.innerHTML = `
      ${hero ? `<div class="in-art" style="background-image:url('${fileUrl(hero)}')"></div>` : ''}
      <div class="in-txt">
        <span class="in-pre">Now starting</span>
        <b class="in-title">${esc(e.title)}</b>
        ${e.goal ? `<span class="in-goal">🎯 ${esc(e.goal)}</span>` : ''}
        <span class="in-by">This game was brought to you by</span>
        <div class="in-sponsor"><i class="in-emoji">${emoji}</i><div><b>${esc(who)}</b><small>${esc(line)}</small></div></div>
      </div>`;
    el.hidden = false; el.className = 'go';
    running = true; puffs = [];
    const t0 = performance.now();
    endAt = t0 + 3600; until = endAt + 1400;
    requestAnimationFrame(frame);
    Sound.play('whip');
    clearTimeout(skipT);
    skipT = setTimeout(() => { if (running) Sound.play('pop'); }, 1250);
    setTimeout(() => { if (running && el.classList.contains('go')) el.classList.add('fade'); }, endAt - t0 - 900);
  }
  function stop() {
    running = false; el.hidden = true; el.className = ''; puffs = []; clearTimeout(skipT);
    ctx.clearRect(0, 0, cv.width, cv.height);
  }
  // Any button: go straight to the steam.
  function skip() {
    if (!running || el.classList.contains('fade')) return false;
    const now = performance.now();
    endAt = now + 900; until = endAt + 1200;
    el.classList.add('fade');
    return true;
  }
  const handle = (a) => (running ? (skip(), true) : false);
  addEventListener('pointerdown', () => { if (running) skip(); }, true);

  return { play, skip, handle, stop, playing: () => running };
})();
