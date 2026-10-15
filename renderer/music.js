'use strict';
/* Music: plays a local folder. While a song plays its title travels the edge of the screen:
   right to left along the bottom, then down the left side facing left, then back along the bottom.
   Uses S, api, save, toast, openModal, esc, fileUrl, Sound and $ at call time. */

const Music = (() => {
  const audio = new Audio();
  const mq = document.getElementById('marquee'), mqText = mq.querySelector('span');
  const btn = document.getElementById('mu'), bar = document.getElementById('mu-bar');
  let list = [], order = [], pos = -1, loadedDir = null, shuffle = false, wasPlaying = false, loop = 0, fadeTimer = 0;
  const st = () => S.lib.settings;

  const title = (p) => {
    const b = String(p).split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    return b.replace(/^\d{1,3}[\s._-]+/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim() || b;
  };
  const artist = (p) => { const parts = String(p).split(/[\\/]/); return parts.length > 2 ? parts[parts.length - 2] : ''; };

  async function load(force) {
    let dir = st().musicDir;
    if (!dir) dir = await api.musicDefault();
    if (!force && dir === loadedDir) return list.length;
    loadedDir = dir;
    list = dir ? await api.musicScan(dir) : [];
    order = list.map((_, i) => i);
    if (shuffle) shuffleOrder();
    pos = -1;
    return list.length;
  }
  function shuffleOrder() { for (let i = order.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; } }

  async function playAt(k) {
    if (!list.length && !(await load())) { toast('No music was found. Choose a music folder in Settings.', 'err'); return; }
    pos = ((k % order.length) + order.length) % order.length;
    const file = list[order[pos]];
    audio.src = fileUrl(file);
    audio.volume = st().musicVolume ?? 0.7;
    try { await audio.play(); } catch { toast(`Could not play ${title(file)}.`, 'err'); return; }
    Sound.setAmbientLevel(0.2, 1.2);
    showTitle(file);
    draw();
  }

  function toggle() {
    if (!audio.src || pos < 0) return playAt(0);
    if (audio.paused) { audio.play(); Sound.setAmbientLevel(0.2, 1.2); startMarquee(); }
    else { audio.pause(); Sound.setAmbientLevel(1); stopMarquee(); }
    draw();
  }
  const next = () => playAt(pos + 1);
  const prev = () => (audio.currentTime > 4 ? (audio.currentTime = 0) : playAt(pos - 1));

  audio.addEventListener('ended', next);
  audio.addEventListener('error', () => { if (audio.src) setTimeout(next, 600); });

  // A game has the screen: fade out unless the player wants music in games too.
  document.addEventListener('deck-away', ({ detail: gone }) => {
    if (gone) {
      stopMarquee();
      if (!audio.paused && !st().musicDuringGames) { wasPlaying = true; fade(0, () => audio.pause()); }
      return;
    }
    const resume = wasPlaying;
    if (resume) { wasPlaying = false; audio.play().then(() => fade(st().musicVolume ?? 0.7)).catch(() => {}); }
    // The sea comes back up on return; keep it under the music.
    if (resume || !audio.paused) { Sound.setAmbientLevel(0.2, 1.2); startMarquee(); }
  });
  function fade(to, then) {
    clearInterval(fadeTimer);
    fadeTimer = setInterval(() => {
      const v = audio.volume + (to > audio.volume ? 0.05 : -0.05);
      if (Math.abs(to - audio.volume) <= 0.05) { audio.volume = to; clearInterval(fadeTimer); then?.(); } else audio.volume = Math.max(0, Math.min(1, v));
    }, 40);
  }

  /* -------------------------------------------------------------- the travelling title */
  function showTitle(file) {
    mqText.textContent = `♪  ${title(file)}${artist(file) ? '  ·  ' + artist(file) : ''}`;
    startMarquee();
  }

  function startMarquee() {
    stopMarquee();
    if (!mqText.textContent || document.hidden) return;
    const token = ++loop;
    mq.hidden = false;
    run(token);
  }
  function stopMarquee() { loop++; mq.getAnimations().forEach((a) => a.cancel()); mq.hidden = true; }

  async function run(token) {
    const SPEED = 120; // pixels a second
    while (token === loop) {
      const w = mqText.offsetWidth, h = mqText.offsetHeight, vw = innerWidth, vh = innerHeight;
      const y = vh - h - 6;
      // along the bottom, right to left, until it has gone
      const a = mq.animate([{ transform: `translate(${vw}px, ${y}px)` }, { transform: `translate(${-w}px, ${y}px)` }], { duration: (vw + w) / SPEED * 1000, easing: 'linear' });
      try { await a.finished; } catch { return; }
      if (token !== loop) return;
      // down the left side, turned so the letters face left and the first one leads the way down;
      // when the now-playing panel is open it runs just past the panel's edge instead
      const x = document.body.classList.contains('np-on') ? 356 : 10;
      const b = mq.animate([{ transform: `translate(${x}px, 0px) rotate(-90deg)` }, { transform: `translate(${x}px, ${vh + w}px) rotate(-90deg)` }], { duration: (vh + w) / SPEED * 1000, easing: 'linear' });
      try { await b.finished; } catch { return; }
    }
  }
  addEventListener('resize', () => { if (!mq.hidden) startMarquee(); });

  /* -------------------------------------------------------------- top bar button + player */
  function draw() {
    bar.hidden = !list.length && pos < 0;
    btn.classList.toggle('on', !audio.paused);
    btn.querySelector('i').textContent = audio.paused ? '▶\ufe0e' : '⏸\ufe0e';
    btn.title = pos >= 0 ? title(list[order[pos]]) : 'Music';
  }
  bar.addEventListener('click', (ev) => {
    const m = ev.target.closest('[data-mu]')?.dataset.mu;
    if (m === 'prev') prev(); else if (m === 'next') next(); else if (m === 'toggle') toggle(); else if (m === 'list') open();
  });
  audio.addEventListener('play', draw); audio.addEventListener('pause', draw);

  async function open() {
    const n = await load();
    const draw2 = (root) => {
      const cur = pos >= 0 ? list[order[pos]] : null;
      $('.dlg-body', root).innerHTML = `
        <div class="mu-now"><b>${cur ? esc(title(cur)) : 'Nothing playing'}</b><span>${cur ? esc(artist(cur)) : n ? `${n} songs in ${esc(loadedDir)}` : 'No music folder yet'}</span></div>
        <div class="mu-ctl"><button type="button" data-m="prev">⏮ Prev</button><button type="button" class="primary" data-m="toggle">${audio.paused ? '▶ Play' : '⏸ Pause'}</button><button type="button" data-m="next">Next ⏭</button><button type="button" data-m="shuffle" class="${shuffle ? 'on' : ''}">Shuffle ${shuffle ? 'on' : 'off'}</button></div>
        <label class="range-row">Volume<input type="range" name="mvol" min="0" max="1" step="0.05" value="${st().musicVolume ?? 0.7}"></label>
        <div class="mu-list">${list.map((p, i) => `<button type="button" class="mu-song ${cur === p ? 'on' : ''}" data-song="${i}"><b>${esc(title(p))}</b><span>${esc(artist(p))}</span></button>`).join('') || '<p class="note">Put songs in your Music folder, or choose another folder in Settings. MP3, FLAC, OGG, Opus, M4A and WAV all work.</p>'}</div>`;
    };
    openModal({
      title: 'Music', wide: true, html: '', buttons: [{ label: 'Choose folder', left: true, onClick: async () => { const d = await api.pick({ kind: 'dir' }); if (d) { st().musicDir = d; save(); await load(true); setTimeout(open, 0); } } }, { label: 'Close', primary: true }],
      onOpen: (root) => {
        draw2(root);
        root.addEventListener('click', async (ev) => {
          const m = ev.target.closest('[data-m]')?.dataset.m, sg = ev.target.closest('[data-song]');
          if (m === 'prev') await prev(); else if (m === 'next') await next(); else if (m === 'toggle') await toggle();
          else if (m === 'shuffle') { shuffle = !shuffle; const cur = order[pos]; order = list.map((_, i) => i); if (shuffle) shuffleOrder(); pos = cur === undefined ? -1 : order.indexOf(cur); }
          else if (sg) { const want = +sg.dataset.song; await playAt(order.indexOf(want)); }
          else return;
          const f = document.activeElement?.dataset; draw2(root);
          if (f?.m) $(`[data-m="${f.m}"]`, root)?.focus(); else if (f?.song) $(`[data-song="${f.song}"]`, root)?.focus();
        });
        root.addEventListener('input', (ev) => { if (ev.target.name === 'mvol') { st().musicVolume = +ev.target.value; audio.volume = +ev.target.value; save(); } });
      }
    });
  }

  function setVolume(v) { st().musicVolume = v; audio.volume = v; save(); }
  // What is on, for the guide flap's Music tab.
  function now() { const f = pos >= 0 ? list[order[pos]] : ''; return { title: f ? title(f) : '', artist: f ? artist(f) : '', playing: !audio.paused, count: list.length, shuffle, volume: Math.round((st().musicVolume ?? 0.7) * 100), at: audio.currentTime || 0, length: audio.duration || 0 }; }
  function toggleShuffle() { shuffle = !shuffle; const cur = order[pos]; order = list.map((_, i) => i); if (shuffle) shuffleOrder(); pos = cur === undefined ? -1 : order.indexOf(cur); draw(); }
  // Quieter while a game's own music plays over the menu, then back.
  function duck(on) { if (audio.paused) return; fade(on ? (st().musicVolume ?? 0.7) * 0.12 : st().musicVolume ?? 0.7); }
  return { load, toggle, next, prev, open, draw, setVolume, now, toggleShuffle, duck, playing: () => !audio.paused };
})();
