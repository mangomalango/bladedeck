'use strict';
/* Hover music: stay on a game for 3 seconds and its own music fades in, like a console's home
   screen. Moving on, starting a game or leaving Bladedeck fades it out again. Bladedeck's music
   and the sea go quiet underneath while it plays. Where the music comes from: gamemusic.js, and
   with none on this PC, the game's theme from online (onlinemedia.js) when that is on.
   Settings, Look and sound turns it off. Uses S, api, fileUrl, Music, Sound and deckFocused. */

const HoverMusic = (() => {
  const audio = new Audio(); audio.loop = true; audio.preload = 'auto';
  const found = new Map(); // game id -> file or null
  let sel = null, since = 0, playingFor = null, fadeT = 0, asking = null;
  const on = () => S.lib?.settings.hoverMusic !== false;
  // Its own level (Settings, Look and sound), gentle by default: under the menu, not over it.
  const level = () => Math.max(0, Math.min(1, S.lib.settings.hoverMusicVolume ?? 0.35));

  function fade(to, ms, then) {
    clearInterval(fadeT);
    const from = audio.volume, t0 = performance.now();
    fadeT = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) { clearInterval(fadeT); then?.(); }
    }, 30);
  }

  async function start(e) {
    if (!found.has(e.id)) {
      if (asking === e.id) return;
      asking = e.id;
      let f = await api.gameMusic({ id: e.id, type: e.type, appid: e.appid, title: e.title, rom: e.rom, exe: e.exe, cwd: e.cwd, music: e.music }).catch(() => null);
      if (!f) f = await api.onlineMedia(e, 'music').catch(() => null);
      found.set(e.id, f);
      asking = null;
    }
    const f = found.get(e.id);
    if (!f || sel !== e || playingFor === e.id) return;
    playingFor = e.id;
    audio.src = fileUrl(f); audio.volume = 0;
    try { await audio.play(); } catch { playingFor = null; return; }
    if (playingFor !== e.id) return;
    Music.duck(true); Sound.setAmbientLevel(0.1, 0.8);
    fade(level(), 2600);
  }
  function stop(now) {
    if (!playingFor) return;
    playingFor = null;
    const end = () => { audio.pause(); audio.removeAttribute('src'); audio.load(); };
    if (now) { clearInterval(fadeT); end(); } else fade(0, 600, end);
    Music.duck(false); Sound.setAmbientLevel(1, 1.5);
  }

  // Watch what is highlighted, a few times a second.
  setInterval(() => {
    if (typeof S === 'undefined') return;
    const e = S.sel && !S.sel.run && S.sel.id ? S.sel : null;
    // Music you chose (Bladedeck's player, or a panel playing) wins over a game's theme.
    const yours = Music.playing() ||Panels.audible?.();
    const ok = on() && e && !S.playing && !S.modal && !yours && deckFocused() && !document.body.classList.contains('away');
    if (e !== sel) { sel = e; since = performance.now(); stop(); }
    if (!ok) { if (playingFor) stop(); return; }
    if (performance.now() - since >= 3000 && playingFor !== e.id) start(e);
  }, 250);
  document.addEventListener('deck-away', (ev) => { if (ev.detail) stop(true); });
  // Online lookups wait while a game has the screen, so they never take its bandwidth.
  document.addEventListener('deck-away', (ev) => { api.onlineMediaPause(!!ev.detail); });

  return { stop, forget: (id) => found.delete(id), forgetAll: () => found.clear(), playing: () => playingFor };
})();
