'use strict';
/* Now playing: when you hop out of a game (Ctrl+M, or any other way back to Bladedeck) the game
   shrinks from full screen into a live panel on the left. Clicking it, highlighting it and pressing
   A, or Ctrl+M again pops it back out over the whole menu and hands the screen back to the game.
   Uses S, api, esc, cover, toast, fxOn, steamWin and sessionOver at call time. */

/* Live view that remembers (livecap.js): JPEG frames from the desktop's screen share, drawn into
   a canvas whose stream the panel plays like any other. Remembered per game, so after the first
   time a game is shown live it starts by itself. Elsewhere getDisplayMedia is used, as before. */
const LiveCap = (() => {
  let canvas = null, g = null, key = null, avail = null, onEnd = null;
  window.bladedeck.onLiveFrame?.(({ key: k, jpeg }) => {
    if (k !== key || !g) return;
    createImageBitmap(new Blob([jpeg], { type: 'image/jpeg' })).then((bm) => {
      if (canvas.width !== bm.width || canvas.height !== bm.height) { canvas.width = bm.width; canvas.height = bm.height; }
      g.drawImage(bm, 0, 0); bm.close();
    }).catch(() => {});
  });
  window.bladedeck.onLiveEnded?.(({ key: k }) => { if (k === key) { key = null; const f = onEnd; onEnd = null; f?.(); } });
  async function ok() { if (avail === null) avail = !!(await window.bladedeck.liveAvailable?.().catch(() => false)); return avail; }
  // A stream for one game's window, or null. ask: the desktop's picker may open.
  async function stream(k, ask, ended) {
    canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
    g = canvas.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 640, 360);
    key = k; onEnd = ended;
    const r = await window.bladedeck.liveStart({ key: k, ask: !!ask }).catch(() => ({ ok: false }));
    if (!r.ok || key !== k) { if (key === k) { key = null; onEnd = null; } return { stream: null, why: r.error || (r.needsAsk ? 'ask' : '') }; }
    return { stream: canvas.captureStream(15) };
  }
  function stop() { if (key) { key = null; onEnd = null; window.bladedeck.liveStop(); } }
  return { ok, stream, stop, pause: (on) => window.bladedeck.livePause?.(on), has: (k) => window.bladedeck.liveHas(k) };
})();

const NowPlaying = (() => {
  const el = document.getElementById('np');
  const video = el.querySelector('video'), art = el.querySelector('.np-art');
  const tEl = el.querySelector('.np-title'), sEl = el.querySelector('.np-sub'), liveBtn = el.querySelector('.np-live-btn');
  const fly = document.getElementById('np-fly'), flyVideo = fly.querySelector('video'), flyArt = fly.querySelector('.np-fly-art');
  const stage = () => (S.mode === 'console' ? document.getElementById('console') : document.getElementById('pc'));
  let cur = null, stream = null, streamKey = null, asked = {}, hl = false, timer = 0, mode = null, covered = false, going = false;

  const visible = () => !el.hidden;
  const entryNow = () => (S.playing ? entryById(S.playing.id) : null);
  const keyOf = (ev) => `${ev.pid || 0}`;

  window.bladedeck.onPeek((ev) => {
    if (ev.kind === 'mode') { mode = ev.mode; return; }
    if (ev.kind === 'peek') show(ev, true);
    else if (ev.kind === 'focus') { if (S.playing && !steamWin(ev.cls)) show(ev, covered || !visible()); }
    else if (ev.kind === 'want-back') back();
    else if (ev.kind === 'back') highlight(false);
    else if (ev.kind === 'gone') gone(ev);
    else if (ev.kind === 'windows') setTimeout(stale, 150);
  });
  /* Windows: the window list is compared every 2 seconds, and a game closed with Alt+F4 (its window
     gone, its pid not the one the panel had) slipped past 'gone': the panel stayed, black, and going
     back to it left a black screen. So the panel also checks its window is still in the list. */
  const WIN = navigator.userAgent.includes('Windows');
  const stillOpen = () => Dock.windows().some((w) => (cur.winId ? w.id === cur.winId : w.pid === cur.pid));
  function stale() {
    if (!WIN || !cur || going || !(cur.winId || cur.pid)) return;
    if (stillOpen()) { cur.seen = true; return; }
    if (cur.seen) { gone({ kind: 'gone', pid: cur.pid }); if (cur) end(); }
  }
  window.bladedeck.peekMode().then((m) => { if (m) mode = m; });

  // The game's own window, if it is open: by the pid we verified, or Steam's class for it.
  function gameWindow() {
    const p = S.playing; if (!p) return null;
    const e = entryNow();
    return Dock.windows().find((w) => !w.web && ((p.winPid && w.pid === p.winPid) || (e?.type === 'steam' && String(w.cls).toLowerCase() === `steam_app_${e.appid}`))) || null;
  }

  /* What the panel shows must be where "back" goes. If you came from the game, it shows the game.
     If you came from something else (a browser, Discord) while a game runs, it still shows the
     game, and "back" goes to the game's own window, not to wherever you were. With no game
     window to go to, it shows the window you came from, by its own name. */
  function show(ev, animate) {
    const p = S.playing;
    const fromGame = !!(p && ev.pid && (ev.pid === p.winPid || (entryNow()?.type === 'steam' && String(ev.cls).toLowerCase() === `steam_app_${entryNow().appid}`)));
    const gw = !fromGame ? gameWindow() : null;
    const e = fromGame || gw ? entryNow() : null;
    cur = { ...ev, entry: e, key: keyOf(gw ? { pid: gw.pid } : ev), winId: gw ? gw.id : null, pid: gw ? gw.pid : ev.pid, caption: gw ? gw.caption : ev.caption };
    tEl.textContent = e?.title || ev.caption || 'Your game';
    art.innerHTML = e ? cover(e) : `<div class="art sys"><span>▶</span></div>`;
    updateSub();
    el.hidden = false;
    clearInterval(timer); timer = setInterval(updateSub, 30000);
    clearTimeout(idleStop);
    if (stream && streamKey === cur.key) { stream.getVideoTracks().forEach((t) => { t.enabled = true; }); el.classList.add('live'); }
    // Only the game being played is ever captured: coming from a browser or a chat shows its name,
    // not a live copy of it.
    else { stopLive(); if (!asked[cur.key] && cur.entry) startLive().then(() => autoAsk()); }
    if (stream && streamKey === cur.key) LiveCap.pause(false);
    if (animate) shrink();
    else requestAnimationFrame(() => document.body.classList.add('np-on'));
    // Not sure yet which window is the game: check this one, and show the game if it is.
    if (p && !p.winPid && ev.pid && !gw) {
      isGameWindow(p, ev).then((ok) => {
        if (!ok || p !== S.playing) return;
        p.winPid = ev.pid;
        if (cur && cur.pid === ev.pid) { cur.entry = entryNow(); tEl.textContent = cur.entry?.title || tEl.textContent; art.innerHTML = cover(cur.entry); updateSub(); }
      });
    }
  }

  /* -------------------------------------------------------------- shrink and pop
     A full-screen copy of the game (the live feed, or its cover art until there is one) flies
     between the whole window and the little view in the panel. */
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const box = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  const full = () => ({ left: 0, top: 0, width: innerWidth, height: innerHeight });
  // The copy stays full-screen size and only moves and scales, which the graphics card does
  // without redrawing it each frame. That is what keeps the shrink smooth.
  const at = (r) => `translate(${r.left}px, ${r.top}px) scale(${r.width / innerWidth}, ${r.height / innerHeight})`;
  const FULL_T = 'translate(0px, 0px) scale(1, 1)';
  const STAGE_AWAY = { transform: 'scale(1.05)', opacity: 0.25 }, STAGE_HERE = { transform: 'none', opacity: 1 };

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
    Object.assign(fly.style, box(full()), { transform: FULL_T, borderRadius: '0px' });
    fly.hidden = false;
    // The panel appears in place at once, with its view left empty for the game to land in.
    el.classList.add('instant', 'landing');
    document.body.classList.add('np-on');
    // Give the window a moment to be on screen and painted, so the first frames are not dropped.
    await nextFrame(); await new Promise((r) => setTimeout(r, 40));
    const to = el.querySelector('.np-view').getBoundingClientRect();
    Sound.play('shrink');
    const a = fly.animate([{ transform: FULL_T, borderRadius: '0px' }, { transform: at(to), borderRadius: `${10 * innerWidth / to.width}px` }], { duration: 520, easing: 'cubic-bezier(.3, .9, .25, 1)', fill: 'forwards' });
    stage().animate([STAGE_AWAY, STAGE_HERE], { duration: 520, easing: 'cubic-bezier(.3, .9, .25, 1)' });
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
    Object.assign(fly.style, box(full()), { transform: at(from), borderRadius: `${10 * innerWidth / from.width}px` });
    fly.hidden = false;
    el.classList.add('landing');
    Sound.play('pop');
    const a = fly.animate([{ transform: at(from), borderRadius: `${10 * innerWidth / from.width}px` }, { transform: FULL_T, borderRadius: '0px' }], { duration: 400, easing: 'cubic-bezier(.55, 0, .25, 1.12)', fill: 'forwards' });
    stage().animate([STAGE_HERE, { transform: 'scale(.95)', opacity: 0.35 }], { duration: 400, easing: 'ease-in', fill: 'forwards' });
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
  addEventListener('focus', () => setTimeout(() => {
    if (going) return;
    // Without KDE nothing tells us about alt-tab, so the window coming back does the same as Ctrl+M.
    if (mode !== 'kwin' && S.playing && (covered || !visible())) { show({ kind: 'focus', caption: '', pid: S.playing.pid || 0, cls: '' }, true); return; }
    if (covered && !cur) uncover();
  }, 250));

  function updateSub() {
    if (!cur) return;
    const mins = S.playing ? Math.round((Date.now() - S.playing.t) / 60000) : null;
    const bits = [];
    if (cur.entry && cur.caption && cur.caption !== cur.entry.title) bits.push(cur.caption);
    if (!cur.entry && S.playing) { const g = entryNow(); if (g) bits.push(`${g.title} is running too`); }
    if (mins !== null) bits.push(mins < 1 ? 'Just started' : `Playing for ${mins} min`);
    if (mins !== null && cur.entry) bits.push(Player.nextReward(mins));
    if (cur.entry?.goal) bits.push(`🎯 ${cur.entry.goal}`);
    const keys = Capture.saveKeys(cur.entry);
    if (keys?.save) bits.push(`Save state ${keys.save} · load ${keys.load}`);
    sEl.textContent = bits.join(' · ') || (mode === 'kwin' ? 'Running in the background' : '');
  }

  let starting = false, idleStop = 0;
  /* Asked for with X: say what is about to happen first. The desktop then shows its own window
     picker, which takes the keyboard and controller until it closes. */
  async function askLive() {
    if (!cur || starting) return;
    if (!cur.entry) { toast('Live view only shows the game you are playing.', 'err'); return; }
    const remembers = await LiveCap.ok();
    const ok = await confirmAsk({ title: 'Show a live view?', text: remembers
      ? `Your desktop will ask which window to share, this once. Pick ${cur.entry.title}, leave "Allow restoring" ticked and press Share. After that the live view starts by itself whenever you jump out of ${cur.entry.title}.`
      : `Your desktop will ask which window to share. Pick ${cur.entry.title} and press Share. The controller works that picker until it closes, then comes back here.`, yes: 'Continue' });
    if (ok) startLive(true);
  }
  /* Live view on its own: the first time you jump out of a game, Bladedeck offers it once (the
     desktop then asks which window, with "allow restoring" ticked); from then on it starts by
     itself for that game. Settings, Recording turns that off. */
  async function autoAsk() {
    const e = cur?.entry;
    if (!e || stream || S.lib.settings.liveAuto === false || !(await LiveCap.ok())) return;
    const seen = (S.lib.settings.liveAsked = S.lib.settings.liveAsked || {});
    if (seen[e.id]) return;
    seen[e.id] = true; save();
    askLive();
  }
  async function startLive(ask) {
    // One picker at a time: pressing X again while it is open must not stack a second one.
    if (!cur || starting) return;
    const key = cur.key;
    asked[key] = true;
    starting = true;
    let id = null, s = null;
    // The remembering live view, where the desktop has it.
    if (cur.entry && await LiveCap.ok()) {
      const r = await LiveCap.stream(cur.entry.id, !!ask, () => { if (streamKey === key) stopLive(); });
      starting = false;
      if (!r.stream || !cur || cur.key !== key) { if (r.stream) LiveCap.stop(); if (ask && r.why && r.why !== 'cancelled') toast('The live view could not start.', 'err'); el.classList.remove('live'); return; }
      stopLive(true);
      stream = r.stream; streamKey = key;
      video.srcObject = stream; video.play().catch(() => {});
      el.classList.add('live');
      return;
    }
    try {
      // Without KDE we don't learn the window's title, so look for one named like the game.
      id = await api.captureWant(cur.caption || cur.entry?.title || '', ['window'], !!ask);
      if (id) s = await navigator.mediaDevices.getDisplayMedia({ audio: false, video: { frameRate: { max: 30 }, width: { max: 1280 }, height: { max: 720 } } });
    } catch { /* picker cancelled or capture refused */ }
    starting = false;
    if (!s || !cur || cur.key !== key) { s?.getTracks().forEach((t) => t.stop()); el.classList.remove('live'); return; }
    stopLive();
    stream = s;
    streamKey = key;
    video.srcObject = stream;
    video.play().catch(() => {});
    el.classList.add('live');
    stream.getVideoTracks()[0].addEventListener('ended', () => stopLive());
  }

  function stopLive(keepCap) {
    if (!keepCap) LiveCap.stop();
    stream?.getTracks().forEach((t) => t.stop());
    stream = null; streamKey = null;
    video.srcObject = null;
    el.classList.remove('live');
  }

  async function back() {
    if (going || !cur) return;
    if (WIN && cur.seen && !stillOpen()) { gone({ kind: 'gone', pid: cur.pid }); if (cur) end(); toast('That game has closed.'); return; }
    going = true;
    highlight(false);
    await popIn();
    // Straight to the game's window when that is what the panel shows; otherwise wherever you were.
    // A paused game is thawed first, so you never land in a frozen window.
    if (cur.pid && ((await api.procFrozen()) || []).includes(cur.pid)) { await api.procFreeze(cur.pid, false); document.dispatchEvent(new CustomEvent('running-changed')); }
    const ok = (cur.winId && await winAct(cur.winId, 'show')) || await api.peekBack();
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
    // The game on screen closed (quit from its menu, or crashed): come back to Bladedeck, or the
    // desktop gets the screen and the controller has nothing to drive.
    if (S.playing?.winPid && S.playing.winPid === ev.pid && !deckFocused()) setTimeout(() => api.deckFocus(), 300);
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
      else if (a === 'x') { if (!el.classList.contains('live')) askLive(); }
      else if (a === 'down') { highlight(false); Running.edge() || Dock.edge(); }
      else if (a === 'right' || a === 'b') highlight(false);
      return true;
    }
    return false;
  }
  function edge() { if (!visible()) return false; highlight(true); return true; }

  // Live frames are not needed while the game itself is on screen.
  // After two minutes in the game the capture is stopped outright (not just paused), so nothing
  // keeps streaming the screen during a long session; it starts again on the next way back.
  document.addEventListener('deck-away', (ev) => {
    clearTimeout(idleStop);
    if (!ev.detail) { LiveCap.pause(false); return; }
    LiveCap.pause(true);
    stream?.getVideoTracks().forEach((t) => { t.enabled = false; });
    if (stream) idleStop = setTimeout(() => { const k = streamKey; stopLive(); if (k) delete asked[k]; }, 120000);
  });

  el.addEventListener('click', (ev) => {
    if (ev.target.closest('.np-live-btn')) { if (cur) askLive(); return; }
    back();
  });
  el.addEventListener('pointerenter', () => highlight(true));
  el.addEventListener('pointerleave', () => highlight(false));
  liveBtn.addEventListener('pointerdown', (ev) => ev.stopPropagation());

  return { show, end, handle, edge, visible, highlighted: () => hl, mode: () => mode, reset: () => { if (cur) end(); } };
})();
