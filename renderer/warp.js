'use strict';
/* Warp: the trip from the menu into a game, and back (Settings, Look and sound, "Into the game").
   Telescope: the menu is tugged off the screen like a suction cup and lets go with a pop; black
   closes in around it and it falls away down a tunnel of frames, each one a shade lighter, until
   it is a point that twinkles. The black folds up like an accordion and is
   gone; then the game's art comes back out of that point, slowly and then all at once, slams into
   the screen and shakes it, with a black to white flash. Coming back from a game plays the tunnel
   in reverse, quickly. Only transforms and opacity move (no layout), so it stays smooth; it runs
   on top of the real launch, never delays it, and any button cuts it short.
   Uses S, fileUrl, esc, fxOn and Sound at call time. */
const Warp = (() => {
  const el = document.createElement('div');
  el.id = 'warp'; el.hidden = true; el.setAttribute('aria-hidden', 'true');
  const RINGS = 5, FOLDS = 9;
  el.innerHTML = `${'<i class="wp-ring"></i>'.repeat(RINGS)}<div class="wp-acc">${'<b></b>'.repeat(FOLDS)}</div>`
    + '<div class="wp-edge"></div><div class="wp-star"><i></i><i></i></div><div class="wp-art"></div><div class="wp-flash"></div>';
  // On <html>, beside <body>: the menu (all of <body>) is what shrinks, and this stays full size.
  document.documentElement.appendChild(el);
  const art = el.querySelector('.wp-art');
  let token = 0, busy = false;

  // Off unless chosen (the owner's call): Classic is the default, None is no animation at all.
  const style = () => S.lib?.settings.launchAnim || 'classic';
  const on = () => fxOn() && style() === 'telescope';
  const wait = (ms, t) => new Promise((r) => setTimeout(() => r(t === token), ms));
  const stage = (name) => { document.documentElement.dataset.warp = name; };

  function end() {
    token++; busy = false;
    document.documentElement.classList.remove('warping', 'warp-back');
    el.hidden = true; delete document.documentElement.dataset.warp; art.style.backgroundImage = ''; art.innerHTML = '';
  }

  // Menu to game. Returns when the slam has landed (about 2.6 s), or at once when it is off.
  async function out(e) {
    if (!on() || busy) return false;
    const t = ++token; busy = true;
    const pic = e.hero || e.background || e.cover;
    art.style.backgroundImage = pic ? `url("${fileUrl(pic)}")` : '';
    art.innerHTML = pic ? '' : `<span>${esc(e.title || '')}</span>`;
    art.classList.toggle('tall', !e.hero && !e.background && !!e.cover);
    el.hidden = false; void el.offsetWidth;
    document.documentElement.classList.add('warping');
    stage('peel'); Sound.play('stretch');               // the edges strain, like a suction cup
    if (!(await wait(420, t))) return false;
    Sound.play('pop');                                  // and it rips free
    stage('shrink');                                    // black closes in, the menu falls away
    if (!(await wait(1100, t))) return false;
    stage('twinkle'); Sound.play('tick');               // a point of light, and a twinkle
    if (!(await wait(450, t))) return false;
    stage('fold');                                      // the black folds up like an accordion
    if (!(await wait(520, t))) return false;
    stage('slam');                                      // slow, then all at once
    if (!(await wait(620, t))) return false;
    stage('shake'); Sound.play('go');                   // impact: shake, black, white
    if (!(await wait(700, t))) return false;
    end();
    return true;
  }

  // Game to menu: the tunnel in reverse, quick, so getting back never feels slow.
  async function back() {
    if (!on() || busy) return;
    const t = ++token; busy = true;
    el.hidden = false; void el.offsetWidth;
    document.documentElement.classList.add('warping', 'warp-back');
    stage('return');
    if (await wait(900, t)) end();
  }

  // Any button skips it; the launch itself is never held up.
  const skip = () => { if (busy) end(); };
  addEventListener('keydown', skip, true);
  addEventListener('mousedown', skip, true);

  return { out, back, skip, on, playing: () => busy };
})();
