'use strict';
/* Wrecking ball (alpha draft): LB + RB + Y together (Shift+W on a keyboard) swings a crane's
   wrecking ball through the menu, which shatters and falls away, and behind it is a draft of a
   different Bladedeck: a PS5-style home with one row of big game tiles over the game's own art.
   It is a sketch of an idea, not a finished second interface: left / right pick, A plays, B (or
   the combo again) builds the normal menu back. Uses S, esc, cover, fileUrl, launch, homeSections,
   Sound, FX and $ at call time. */
const Wreck = (() => {
  let on = false, busy = false, i = 0, games = [];
  const el = document.createElement('div');
  el.id = 'wreck'; el.hidden = true;
  document.body.appendChild(el);

  function start() {
    if (busy) return;
    if (on) { rebuild(); return; }
    busy = true;
    games = homeSections(S.lib.entries.filter((e) => !e.hidden)).filter((e) => !e.header && !e.run).slice(0, 14);
    if (!games.length) games = S.lib.entries.filter((e) => !e.hidden && e.type !== 'app').slice(0, 14);
    i = 0;
    el.hidden = false;
    el.innerHTML = `<div class="wk-crane"><i class="wk-arm"></i><i class="wk-cable"></i><b class="wk-ball"></b></div><div class="wk-shards"></div>`;
    Sound.play('whip');
    // The ball swings in, hits the middle of the menu, the menu shatters.
    setTimeout(() => { Sound.play('crash'); shatter(); }, 900);
    setTimeout(() => { draft(); busy = false; on = true; }, 1900);
  }
  function shatter() {
    const box = $('.wk-shards', el), n = 18;
    box.innerHTML = Array.from({ length: n }, (_, k) => {
      const x = (k % 6) * 16.66, y = Math.floor(k / 6) * 33.3;
      return `<i style="left:${x}%;top:${y}%;--dx:${(Math.random() - 0.5) * 60}vw;--dy:${60 + Math.random() * 60}vh;--r:${(Math.random() - 0.5) * 140}deg;animation-delay:${Math.random() * 0.15}s"></i>`;
    }).join('');
    document.body.classList.add('wrecked');
  }
  function draft() {
    el.classList.add('draft');
    el.innerHTML = `<div class="wk-hero"></div><div class="wk-ui">
      <div class="wk-top"><b>Games</b><span>Media</span><em>Alpha draft · B puts the menu back</em></div>
      <div class="wk-row">${games.map((e, k) => `<button type="button" class="wk-tile" data-k="${k}">${cover(e)}</button>`).join('')}</div>
      <div class="wk-info"><h1></h1><p></p><div class="wk-acts"><button type="button" class="wk-play">▶ Play</button><button type="button" class="wk-more">⋯</button></div></div></div>`;
    el.querySelector('.wk-row').addEventListener('click', (ev) => { const t = ev.target.closest('[data-k]'); if (t) { if (+t.dataset.k === i) play(); else pick(+t.dataset.k); } });
    el.querySelector('.wk-play').addEventListener('click', play);
    pick(0);
  }
  function pick(k) {
    if (!games.length) return;
    i = Math.max(0, Math.min(games.length - 1, k));
    const e = games[i];
    el.querySelectorAll('.wk-tile').forEach((t, n) => t.classList.toggle('on', n === i));
    el.querySelector('.wk-tile.on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    const bg = e.hero || e.background || e.cover;
    el.querySelector('.wk-hero').style.backgroundImage = bg ? `url("${fileUrl(bg)}")` : '';
    el.querySelector('.wk-info h1').textContent = e.title;
    el.querySelector('.wk-info p').textContent = [TYPES[e.type]?.label, e.system, e.playtime ? fmtPlay(e.playtime) : ''].filter(Boolean).join(' · ');
    Sound.play('tick');
  }
  function play() { const e = games[i]; if (!e) return; rebuild(); setTimeout(() => { S.sel = e; launch(e); }, 700); }
  function rebuild() {
    el.classList.remove('draft'); el.classList.add('out');
    document.body.classList.remove('wrecked');
    Sound.play('back');
    setTimeout(() => { el.hidden = true; el.className = ''; el.innerHTML = ''; on = false; }, 600);
  }
  function handle(a) {
    if (!on && !busy) return false;
    if (busy) return true;
    if (a === 'left' || a === 'lb') pick(i - 1);
    else if (a === 'right' || a === 'rb') pick(i + 1);
    else if (a === 'a') play();
    else if (a === 'b' || a === 'back') rebuild();
    return true;
  }
  addEventListener('keydown', (ev) => { if (ev.shiftKey && (ev.key === 'W' || ev.key === 'w') && !S.modal && !/INPUT|TEXTAREA/.test(ev.target.tagName)) { ev.preventDefault(); start(); } });
  return { start, handle, isOn: () => on || busy };
})();
