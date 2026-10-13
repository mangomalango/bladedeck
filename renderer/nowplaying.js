'use strict';
/* Now playing: when you hop out of a game (Ctrl+M, or any other way back to Bladedeck) the game
   shrinks from full screen into a live panel on the left. Clicking it, highlighting it and pressing
   A, or Ctrl+M again pops it back out over the whole menu and hands the screen back to the game.
   Uses S, api, esc, cover, toast, fxOn, steamWin and sessionOver at call time. */

const NowPlaying = (() => {
  const el = document.getElementById('np');
  const video = el.querySelector('video'), art = el.querySelector('.np-art');
  const tEl = el.querySelector('.np-title'), sEl = el.querySelector('.np-sub'), liveBtn = el.querySelector('.np-live-btn');
  const fly = document.getElementById('np-fly'), flyVideo = fly.querySelector('video'), flyArt = fly.querySelector('.np-fly-art');
  const stage = () => (S.mode === 'console' ? document.getElementById('console') : document.getElementById('pc'));
  let cur = null, stream = null, streamKey = null, asked = {}, hl = false, timer = 0, mode = null, covered = false, going = false;

  const visible = () => !el.hidden;
  const entryNow = () => (S.playing ? S.lib.entries.find((e) => e.id === S.playing.id) : null);
  const keyOf = (ev) => `${ev.pid || 0}`;

  window.bladedeck.onPeek((ev) => {
    if (ev.kind === 'mode') { mode = ev.mode; return; }
    if (ev.kind === 'peek') show(ev, true);
    else if (ev.kind === 'focus') { if (S.playing && !steamWin(ev.cls)) show(ev, covered); }
    else if (ev.kind === 'want-back') back();
    else if (ev.kind === 'back') highlight(false);
    else if (ev.kind === 'gone') gone(ev);
  });
  window.bladedeck.peekMode().then((m) => { if (m) mode = m; });

  function show(ev, animate) {
    const e = entryNow();
    // The first real window seen during a Steam session is the game; it closing ends the session.
    if (S.playing && !S.playing.winPid && ev.pid && !steamWin(ev.cls)) S.playing.winPid = ev.pid;
    cur = { ...ev, entry: e, key: keyOf(ev) };
    tEl.textContent = e?.title || ev.caption || 'Your game';
    art.innerHTML = e ? cover(e) : `<div class="art sys"><span>▶</span></div>`;
    updateSub();
    el.hidden = false;
    clearInterval(timer); timer = setInterval(updateSub, 30000);
    if (stream && streamKey === cur.key) { stream.getVideoTracks().forEach((t) => { t.enabled = true; }); el.classList.add('live'); }
    else { stopLive(); if (!asked[cur.key]) startLive(); }
    if (animate) shrink();
    else requestAnimationFrame(() => document.body.classList.add('np-on'));
  }

  /* -------------------------------------------------------------- shrink and pop
     A full-screen copy of the game (the live feed, or its cover art until there is one) flies
     between the whole window and the little view in the panel. */
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const box = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  const full = () => ({ left: 0, top: 0, width: innerWidth, height: innerHeight });

  function dressFly() {
    const live = !!(stream && streamKey === cur?.key);
    fly.classList.toggle('live', live);
    flyVideo.srcObject = live ? stream : null;
    if (live) flyVideo.play().catch(() => {});
    flyArt.innerHTML = cur?.entry ? cover(cur.entry) : '';
  }

  async function shrink() {
    covered = false;
    if (!fxOn()) { fly.hidden = true; document.body.classList.add('np-on'); return; }
    dressFly();
    fly.getAnimations().forEach((a) => a.cancel());
    Object.assign(fly.style, box(full()), { borderRadius: '0px' });
    fly.hidden = false;
    // The panel appears in place at once, with its view left empty for the game to land in.
    el.classList.add('instant', 'landing');
    document.body.classList.add('np-on');
    await nextFrame();
    const to = el.querySelector('.np-view').getBoundingClientRect();
    Sound.play('shrink');
    const a = fly.animate([{ ...box(full()), borderRadius: '0px' }, { ...box(to), borderRadius: '10px' }], { duration: 560, easing: 'cubic-bezier(.3, .9, .25, 1)', fill: 'forwards' });
    stage().animate([{ transform: 'scale(1.07)', filter: 'blur(8px)', opacity: 0.3 }, { transform: 'none', filter: 'none', opacity: 1 }], { duration: 560, easing: 'cubic-bezier(.3, .9, .25, 1)' });
    try { await a.finished; } catch { return; }
    if (covered) return;
    fly.hidden = true; a.cancel();
    el.classList.remove('landing');
    requestAnimationFrame(() => el.classList.remove('instant'));
  }

  async function popIn() {
    covered = true;
    if (!fxOn()) return;
    dressFly();
    const from = el.querySelector('.np-view').getBoundingClientRect();
    fly.getAnimations().forEach((a) => a.cancel());
    Object.assign(fly.style, box(from), { borderRadius: '10px' });
    fly.hidden = false;
    el.classList.add('landing');
    Sound.play('pop');
    const a = fly.animate([{ ...box(from), borderRadius: '10px' }, { ...box(full()), borderRadius: '0px' }], { duration: 430, easing: 'cubic-bezier(.55, 0, .25, 1.12)', fill: 'forwards' });
    stage().animate([{ transform: 'none', filter: 'none', opacity: 1 }, { transform: 'scale(.94)', filter: 'blur(6px)', opacity: 0.4 }], { duration: 430, easing: 'ease-in', fill: 'forwards' });
    try { await a.finished; } catch { /* replaced by a newer animation */ }
    // It stays covering the menu, so coming back starts from a full-screen game, not the menu.
  }

  function uncover() {
    if (!covered) return;
    covered = false;
    stage().getAnimations().forEach((a) => a.cancel());
    fly.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).finished.then(() => { if (!covered) { fly.hidden = true; fly.getAnimations().forEach((a) => a.cancel()); el.classList.remove('landing'); } });
  }

  // Back in Bladedeck some other way (taskbar, alt-tab) with nothing to shrink into: just reveal the menu.
  addEventListener('focus', () => setTimeout(() => { if (covered && !going && !cur) uncover(); }, 250));

  function updateSub() {
    if (!cur) return;
    const mins = S.playing ? Math.round((Date.now() - S.playing.t) / 60000) : null;
    const bits = [];
    if (cur.entry && cur.caption && cur.caption !== cur.entry.title) bits.push(cur.caption);
    if (mins !== null) bits.push(mins < 1 ? 'Just started' : `Playing for ${mins} min`);
    sEl.textContent = bits.join(' · ') || (mode === 'kwin' ? 'Running in the background' : '');
  }

  let starting = false;
  async function startLive(ask) {
    // One picker at a time: pressing X again while it is open must not stack a second one.
    if (!cur || starting) return;
    const key = cur.key;
    asked[key] = true;
    starting = true;
    let id = null, s = null;
    try {
      // Without KDE we don't learn the window's title, so look for one named like the game.
      id = await api.captureWindow(cur.caption || cur.entry?.title || '', !!ask);
      if (id) s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxFrameRate: 30, maxWidth: 1280, maxHeight: 720 } } });
    } catch { /* picker cancelled or capture refused */ }
    starting = false;
    if (!s || !cur || cur.key !== key) { s?.getTracks().forEach((t) => t.stop()); el.classList.remove('live'); return; }
    stopLive();
    stream = s;
    streamKey = key;
    video.srcObject = stream;
    video.play().catch(() => {});
    el.classList.add('live');
    stream.getVideoTracks()[0].addEventListener('ended', stopLive);
  }

  function stopLive() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null; streamKey = null;
    video.srcObject = null;
    el.classList.remove('live');
  }

  async function back() {
    if (going || !cur) return;
    going = true;
    highlight(false);
    await popIn();
    const ok = await api.peekBack();
    going = false;
    if (!ok) { toast('Could not switch back to the game.', 'err'); shrink(); return; }
    // The game has the screen now; the menu underneath goes back to normal, hidden by the cover.
    stage().getAnimations().forEach((a) => a.cancel());
  }

  function highlight(on) {
    hl = on && visible();
    el.classList.toggle('hl', hl);
    if (hl) Sound.play('tick');
  }

  function gone(ev) {
    if (S.playing && !S.playing.tracked && S.playing.winPid && S.playing.winPid === ev.pid) {
      const p = S.playing; S.playing = null;
      const e = S.lib.entries.find((x) => x.id === p.id);
      if (e) sessionOver(e, Math.round((Date.now() - p.t) / 1000));
    }
    if (cur && cur.pid && cur.pid === ev.pid) end();
  }

  function end() {
    uncover();
    cur = null; asked = {};
    stopLive(); highlight(false); clearInterval(timer);
    document.body.classList.remove('np-on');
    setTimeout(() => { if (!cur) el.hidden = true; }, 450);
  }

  // Controller and keyboard: pushing left past the first blade highlights the panel.
  function handle(a) {
    if (!visible()) return false;
    if (hl) {
      if (a === 'a') back();
      else if (a === 'x') { if (!el.classList.contains('live')) startLive(true); }
      else if (a === 'down') { highlight(false); Dock.edge(); }
      else if (a === 'right' || a === 'b') highlight(false);
      return true;
    }
    return false;
  }
  function edge() { if (!visible()) return false; highlight(true); return true; }

  // Live frames are not needed while the game itself is on screen.
  document.addEventListener('deck-away', (ev) => { if (ev.detail) stream?.getVideoTracks().forEach((t) => { t.enabled = false; }); });

  el.addEventListener('click', (ev) => {
    if (ev.target.closest('.np-live-btn')) { if (cur) startLive(true); return; }
    back();
  });
  el.addEventListener('pointerenter', () => highlight(true));
  el.addEventListener('pointerleave', () => highlight(false));
  liveBtn.addEventListener('pointerdown', (ev) => ev.stopPropagation());

  return { show, end, handle, edge, visible, mode: () => mode, reset: () => { if (cur) end(); } };
})();
