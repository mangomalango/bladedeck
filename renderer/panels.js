'use strict';
/* Panels: YouTube, the browser and Files float inside Bladedeck like a console's snap apps,
   instead of opening as separate windows. Rounded, a little see-through, and fully controllable
   from the controller:
     Using a panel     d-pad / A move and press inside it, B goes back, X plays and pauses,
                       LB / RB scroll a page, Y types an address (browser), View returns to the menu
     Arranging (Menu)  d-pad moves it, LB / RB make it smaller or bigger, LT / RT snap it to a half,
                       a corner, the middle or the whole screen, X pins it, Y closes it, A or B done
   With a mouse, drag the bar, pull the corner, double-click the bar to fill the screen.
   Pinned panels stay out while you use the menu; others tuck away when you leave them.
   Where each one sits is remembered. Web panels share the web apps' login session.
   Uses S, api, esc, save, toast, Sound, OSK, PadNav, Dock and $ at call time. */

const TV_UA = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36';
const PANEL_HOME = 'https://duckduckgo.com';

const Panels = (() => {
  const layer = document.createElement('div');
  layer.id = 'panels';
  document.body.appendChild(layer);
  const open = new Map(); // key -> panel
  let focused = null, arranging = false, z = 10;
  const geo = () => (S.lib.settings.panels = S.lib.settings.panels || {});

  // The space panels can use: below the top bar, above the hints.
  const isOpen = (k) => { const p = open.get(k); return !!p && !p.min; };
  // Inside the TV safe margin too (Settings, Look and sound).
  const inset = (k) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(k)) || 0;
  const area = () => { const sx = inset('--sx'), sy = inset('--sy'); return { x: 14 + sx, y: 76 + sy, w: innerWidth - 28 - 2 * sx, h: innerHeight - 76 - 84 - 2 * sy }; };
  const SNAPS = [
    ['Middle', (a) => ({ w: a.w * 0.64, h: a.h * 0.78, x: a.x + a.w * 0.18, y: a.y + a.h * 0.11 })],
    ['Right half', (a) => ({ w: a.w / 2 - 6, h: a.h, x: a.x + a.w / 2 + 6, y: a.y })],
    ['Left half', (a) => ({ w: a.w / 2 - 6, h: a.h, x: a.x, y: a.y })],
    ['Corner', (a) => ({ w: a.w * 0.36, h: a.h * 0.42, x: a.x + a.w * 0.64, y: a.y + a.h * 0.58 })],
    ['Top corner', (a) => ({ w: a.w * 0.36, h: a.h * 0.42, x: a.x + a.w * 0.64, y: a.y })],
    ['Full', (a) => ({ ...a })],
    // A small video-shaped box docked in the bottom corner: the mini player.
    ['Mini player', (a) => { const w = Math.max(320, a.w * 0.26), h = w * 9 / 16 + 40; return { w, h, x: a.x + a.w - w, y: a.y + a.h - h }; }]
  ];
  const MINI = SNAPS.length - 1;

  function place(p) {
    const a = area();
    p.w = Math.max(300, Math.min(a.w, p.w)); p.h = Math.max(200, Math.min(a.h, p.h));
    p.x = Math.max(a.x - p.w + 120, Math.min(a.x + a.w - 120, p.x)); p.y = Math.max(a.y, Math.min(a.y + a.h - 44, p.y));
    Object.assign(p.el.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px`, zIndex: p.z });
    clearTimeout(p.saveT); p.saveT = setTimeout(() => { geo()[p.key] = { x: p.x, y: p.y, w: p.w, h: p.h, pinned: p.pinned }; save(); }, 400);
  }

  /* -------------------------------------------------------------- opening */
  function show(spec) {
    const key = String(spec.key || spec.kind);
    let p = open.get(key);
    if (p) { p.min = false; p.el.hidden = false; wake(p); if (spec.path && p.kind === 'files') Files.go(p, spec.path); if (spec.url && p.kind === 'browser' && p.wv) go(p, spec.url); focus(p); tell(); return p; }
    const g = geo()[key];
    const s0 = SNAPS[0][1](area());
    p = { key, startPath: spec.path || '', kind: spec.kind || 'web', title: spec.title || 'Panel', icon: spec.icon || '🌐', url: spec.url || PANEL_HOME, tv: !!spec.tv,
      x: g?.x ?? s0.x, y: g?.y ?? s0.y, w: g?.w ?? s0.w, h: g?.h ?? s0.h, pinned: !!g?.pinned, min: false, z: ++z, snap: 0 };
    p.el = document.createElement('section');
    p.el.className = `fw ${p.kind}`;
    p.el.innerHTML = `<header class="fw-bar"><i class="fw-ic">${esc(p.icon)}</i><b class="fw-t">${esc(p.title)}</b>
        ${p.kind === 'browser' ? `<input class="fw-url" type="text" value="${esc(p.url)}" aria-label="Address">` : '<span class="fw-sp"></span>'}
        <div class="fw-btns"><button type="button" data-a="back" title="Back">‹</button>${p.kind === 'web' && /youtube/i.test(p.url) ? '<button type="button" data-a="over" title="Float over games">⧉</button>' : ''}<button type="button" data-a="mini" title="Mini player in the corner">▣</button><button type="button" data-a="pin" title="Pin">📌</button><button type="button" data-a="min" title="Minimize">–</button><button type="button" data-a="max" title="Fill the screen">▢</button><button type="button" data-a="close" title="Close">✕</button></div></header>
      <div class="fw-body"></div>${p.kind === 'browser' || p.kind === 'web' ? '<div class="fw-dl" hidden></div>' : ''}<i class="fw-grip"></i><div class="fw-hint"></div>`;
    p.body = p.el.querySelector('.fw-body');
    if (p.kind === 'files') Files.mount(p);
    else if (p.kind === 'system') SysPanel.mount(p);
    else if (p.kind === 'finder') Finder.mount(p);
    else view(p, p.tv ? 'https://www.youtube.com/tv' : p.url);
    p.el.classList.toggle('pinned', p.pinned);
    layer.appendChild(p.el);
    open.set(key, p);
    place(p);
    requestAnimationFrame(() => p.el.classList.add('in'));
    wire(p);
    focus(p);
    Sound.play('pop');
    tell();
    return p;
  }

  // A web panel's page. Made when the panel opens, and again when one that was unloaded comes back.
  function view(p, src) {
    const wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:webapps');
    if (p.tv) wv.setAttribute('useragent', TV_UA);
    wv.setAttribute('src', src);
    wv.addEventListener('page-title-updated', (ev) => { p.el.querySelector('.fw-t').textContent = ev.title || p.title; p.caption = ev.title; tell(); });
    wv.addEventListener('did-navigate', (ev) => { const u = p.el.querySelector('.fw-url'); if (u && document.activeElement !== u) u.value = ev.url; });
    wv.addEventListener('did-navigate-in-page', (ev) => { const u = p.el.querySelector('.fw-url'); if (u && ev.isMainFrame && document.activeElement !== u) u.value = ev.url; });
    p.body.appendChild(wv); p.wv = wv;
    WebDl.draw();
  }
  /* A web panel left minimized for 10 minutes gives its memory back: its page is closed and
     reopened where it was the next time the panel comes up. A pinned one, or one playing sound
     (music in the background), is left alone. */
  const IDLE = 10 * 60000;
  function idleLater(p) {
    clearTimeout(p.idleT);
    if (!p.wv || p.kind === 'finder') return;
    p.idleT = setTimeout(() => {
      if (!p.min || p.pinned || !p.wv || !open.has(p.key)) return;
      // Music playing in a tucked-away panel is still being listened to: check again later.
      let audible = false; try { audible = p.wv.isCurrentlyAudible(); } catch { /* not ready */ }
      if (audible) { idleLater(p); return; }
      try { p.lastUrl = p.wv.getURL(); } catch { p.lastUrl = ''; }
      p.wv.remove(); p.wv = null;
    }, IDLE);
  }
  function wake(p) {
    clearTimeout(p.idleT);
    if (p.wv || p.kind === 'files' || p.kind === 'system' || p.kind === 'finder') return;
    view(p, p.lastUrl || (p.tv ? 'https://www.youtube.com/tv' : p.url));
  }

  /* -------------------------------------------------------------- focus */
  function focus(p) {
    if (focused && focused !== p) { focused.el.classList.remove('focus'); }
    focused = p; arranging = false;
    if (!p) { document.body.classList.remove('panel-on'); hint(); tell(); return; }
    p.z = ++z; p.el.style.zIndex = p.z; p.el.classList.add('focus'); p.el.classList.remove('arrange');
    document.body.classList.add('panel-on');
    if (p.kind === 'finder') Finder.focus(p);
    else if (p.wv) setTimeout(() => p.wv.focus(), 60);
    else if (p.kind === 'files') Files.focus(p);
    else if (p.kind === 'system') SysPanel.focus(p);
    hint(); tell();
  }
  // Back to the menu: unpinned panels tuck away, pinned ones stay out.
  function leave() {
    const p = focused; if (!p) return;
    p.el.classList.remove('focus', 'arrange');
    focused = null; arranging = false;
    document.body.classList.remove('panel-on');
    if (!p.pinned) minimize(p, true);
    document.activeElement?.blur?.();
    Sound.play('back'); hint(); tell();
  }
  function minimize(p, quiet) { p.min = true; p.el.hidden = true; idleLater(p); if (focused === p) { focused = null; document.body.classList.remove('panel-on'); } if (!quiet) Sound.play('back'); tell(); }
  function close(p) {
    clearTimeout(p.idleT);
    p.el.classList.remove('in'); p.el.classList.add('out');
    setTimeout(() => p.el.remove(), 220);
    open.delete(p.key); if (focused === p) { focused = null; document.body.classList.remove('panel-on'); }
    Sound.play('back'); tell();
  }
  // The mini player: docked small in the corner and pinned, so it keeps playing over the menu.
  function mini(p) {
    if (p.snap === MINI && p.prev) { Object.assign(p, p.prev); p.prev = null; p.snap = 0; }
    else { p.prev = { x: p.x, y: p.y, w: p.w, h: p.h }; p.snap = MINI; Object.assign(p, SNAPS[MINI][1](area())); if (!p.pinned) { p.pinned = true; p.el.classList.add('pinned'); } }
    p.el.classList.add('anim'); place(p); setTimeout(() => p.el.classList.remove('anim'), 260);
    Sound.play('tick');
  }
  /* Over games: the video goes on in the walkthrough window, which floats above full-screen
     games without taking their focus; the panel pauses and tucks away. */
  function videoOf(p) {
    if (!p?.wv) return '';
    let u = ''; try { u = p.wv.getURL(); } catch { return ''; }
    const id = (u.match(/[?&#/]v=([\w-]{11})/) || u.match(/youtu\.be\/([\w-]{11})/) || [])[1];
    if (!id) return '';
    let t = 0; try { t = Math.floor(+(new URL(u).searchParams.get('t') || 0)) || 0; } catch { /* no time */ }
    return `https://m.youtube.com/watch?v=${id}${t ? `&t=${t}` : ''}`;
  }
  async function overGames(p) {
    const url = videoOf(p);
    if (!url) { toast('Play a video first, then float it over your games.', 'err'); return; }
    // Carry on from the same moment.
    let at = 0; try { at = Math.floor(await p.wv.executeJavaScript('(document.querySelector("video") || {}).currentTime || 0')); } catch { /* start over */ }
    try { p.wv.executeJavaScript('document.querySelectorAll("video").forEach((v) => v.pause()); 1'); } catch { /* fine */ }
    await api.pipToggle({ url: at ? `${url.replace(/&t=\d+/, '')}&t=${at}` : url, show: true });
    p.handed = true; minimize(p, true);
    toast('The video floats over your games now. View + Y hides or shows it.');
  }
  // The YouTube panel's video, for View + Y.
  // (Not one already handed over: then View + Y just shows and hides the floating window.)
  const video = () => { for (const p of open.values()) { if (!p.handed && videoOf(p)) return p; } return null; };

  function pin(p) { p.pinned = !p.pinned; p.el.classList.toggle('pinned', p.pinned); place(p); toast(p.pinned ? `${p.title} is pinned: it stays out while you use the menu.` : `${p.title} is unpinned: it tucks away when you leave it.`); Sound.play('tick'); }
  function maximize(p) {
    if (p.prev) { Object.assign(p, p.prev); p.prev = null; } else { p.prev = { x: p.x, y: p.y, w: p.w, h: p.h }; Object.assign(p, SNAPS[5][1](area())); }
    p.el.classList.add('anim'); place(p); setTimeout(() => p.el.classList.remove('anim'), 260);
  }
  function snap(p, d) {
    p.snap = (p.snap + d + SNAPS.length) % SNAPS.length; p.prev = null;
    Object.assign(p, SNAPS[p.snap][1](area()));
    p.el.classList.add('anim'); place(p); setTimeout(() => p.el.classList.remove('anim'), 260);
    hint(SNAPS[p.snap][0]); Sound.play('tick');
  }

  function hint(extra) {
    for (const q of open.values()) q.el.querySelector('.fw-hint').textContent = '';
    if (!focused) return;
    const h = focused.el.querySelector('.fw-hint');
    h.textContent = arranging
      ? `Arranging${extra ? `: ${extra}` : ''} · ✛ move · LB/RB size · LT/RT snap (Mini player is one) · X ${focused.pinned ? 'unpin' : 'pin'} · View minimize · Y close · A done`
      : `Menu arrange · View back to the menu${focused.kind === 'browser' ? ' · Y address' : ''}`;
  }

  // The dock, Running list and Quick Resume see panels as windows.
  function list() {
    return [...open.values()].map((p) => ({ id: `panel:${p.key}`, key: p.key, caption: p.caption || p.title, cls: 'bladedeck-panel', pid: 0, min: p.min, active: focused === p, web: true, panel: true }));
  }
  function tell() { document.dispatchEvent(new CustomEvent('panels-changed', { detail: list() })); }
  function act(key, a) {
    const p = open.get(key); if (!p) return false;
    if (a === 'show') p.handed = false;
    if (a === 'close') close(p); else if (a === 'min') minimize(p); else { p.min = false; p.el.hidden = false; wake(p); focus(p); }
    return true;
  }

  /* -------------------------------------------------------------- input */
  // A key press inside a web panel, as if typed there.
  function key(p, k) { if (!p.wv) return; p.wv.sendInputEvent({ type: 'keyDown', keyCode: k }); p.wv.sendInputEvent({ type: 'keyUp', keyCode: k }); }
  function back(p) {
    if (!p.wv) return Files.up(p);
    if (p.tv) return key(p, 'Escape');
    if (p.wv.canGoBack()) p.wv.goBack(); else leave();
  }
  function address(p) {
    const u = p.el.querySelector('.fw-url'); if (!u) return;
    PadNav.mark?.(u); OSK.open(u);
  }
  function go(p, text) {
    let t = String(text || '').trim(); if (!t || !p.wv) return;
    if (!/^https?:\/\//i.test(t)) t = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) ? `https://${t}` : `https://duckduckgo.com/?q=${encodeURIComponent(t)}`;
    if (!/^https:\/\//i.test(t)) t = t.replace(/^http:/i, 'https:');
    p.wv.loadURL(t); p.wv.focus();
  }

  function handle(a) {
    const p = focused; if (!p) return false;
    if (arranging) {
      const step = 40;
      if (a === 'left' || a === 'right' || a === 'up' || a === 'down') { p.x += a === 'left' ? -step : a === 'right' ? step : 0; p.y += a === 'up' ? -step : a === 'down' ? step : 0; p.prev = null; place(p); }
      else if (a === 'lb' || a === 'rb') { const f = a === 'rb' ? 1.08 : 0.92, cx = p.x + p.w / 2, cy = p.y + p.h / 2; p.w *= f; p.h *= f; p.x = cx - p.w / 2; p.y = cy - p.h / 2; place(p); }
      else if (a === 'lt' || a === 'rt') snap(p, a === 'rt' ? 1 : -1);
      else if (a === 'x') { pin(p); hint(); }
      else if (a === 'y') close(p);
      else if (a === 'a' || a === 'b' || a === 'start') { arranging = false; p.el.classList.remove('arrange'); hint(); Sound.play('tick'); if (p.wv && p.kind !== 'finder') p.wv.focus(); }
      else if (a === 'back') { arranging = false; p.el.classList.remove('arrange'); minimize(p); hint(); }
      return true;
    }
    if (a === 'start') { arranging = true; p.el.classList.add('arrange'); hint(); Sound.play('tick'); return true; }
    if (a === 'back') { leave(); return true; }
    if (p.kind === 'files') return Files.handle(p, a);
    if (p.kind === 'finder') return Finder.handle(p, a);
    if (p.kind === 'system') return SysPanel.handle(p, a);
    const map = { up: 'Up', down: 'Down', left: 'Left', right: 'Right', a: 'Enter', x: p.tv ? 'MediaPlayPause' : 'Space', lb: 'PageUp', rb: 'PageDown' };
    if (map[a]) { key(p, map[a]); return true; }
    if (a === 'b') { back(p); return true; }
    if (a === 'y' && p.kind === 'browser') { address(p); return true; }
    if (a === 'lt' || a === 'rt' || a === 'music' || a === 'vol' || a === 'guide') return false;
    return true;
  }

  function wire(p) {
    const bar = p.el.querySelector('.fw-bar'), grip = p.el.querySelector('.fw-grip');
    p.el.addEventListener('pointerdown', () => { if (focused !== p) focus(p); });
    bar.addEventListener('click', (ev) => {
      const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
      ({ back: () => back(p), pin: () => pin(p), min: () => minimize(p), max: () => maximize(p), close: () => close(p), mini: () => mini(p), over: () => overGames(p) })[a]?.();
    });
    bar.addEventListener('dblclick', (ev) => { if (!ev.target.closest('button, input')) maximize(p); });
    const drag = (ev, mode) => {
      if (ev.button !== 0 || ev.target.closest('button, input')) return;
      ev.preventDefault();
      const x0 = ev.clientX, y0 = ev.clientY, s = { x: p.x, y: p.y, w: p.w, h: p.h };
      p.el.classList.add('dragging'); p.prev = null;
      const move = (e) => { if (mode === 'move') { p.x = s.x + e.clientX - x0; p.y = s.y + e.clientY - y0; } else { p.w = s.w + e.clientX - x0; p.h = s.h + e.clientY - y0; } place(p); };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); p.el.classList.remove('dragging'); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    };
    bar.addEventListener('pointerdown', (ev) => drag(ev, 'move'));
    grip.addEventListener('pointerdown', (ev) => drag(ev, 'size'));
    const u = p.el.querySelector('.fw-url');
    if (u) u.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); go(p, u.value); } });
  }

  // Bladedeck changed size: keep every panel on screen.
  addEventListener('resize', () => { for (const p of open.values()) place(p); });
  // Games start: unpinned panels tuck away.
  document.addEventListener('deck-away', (ev) => { if (!ev.detail) return; for (const p of open.values()) if (!p.pinned && !p.min) minimize(p, true); });

  return { show, act, list, handle, leave, isOpen, video, overGames, active: () => !!focused, current: () => focused, has: (k) => open.has(k), focus: (k) => { const p = open.get(k); if (p) act(k, 'show'); } };
})();

/* Files: Bladedeck's own file browser for the Files panel. Places on the left (Bladedeck's own
   folder and the folders you allowed), the folder's contents on the right; A opens a folder or a
   file (with its usual app), X (or right-click) sends a file, B goes up a folder. Pictures show
   as thumbnails. Bladedeck sees no other folders unless you allow them (fsaccess.js). */
const Files = (() => {
  const IMG = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;
  const icon = (it) => (it.dir ? '📁' : IMG.test(it.name) ? '' : /\.(mp4|webm|mkv|mov|avi)$/i.test(it.name) ? '🎬' : /\.(mp3|flac|ogg|opus|m4a|wav)$/i.test(it.name) ? '🎵'
    : /\.(zip|7z|rar|tar|gz|xz)$/i.test(it.name) ? '🗜️' : /\.(pdf)$/i.test(it.name) ? '📕' : /\.(appimage|exe|sh|x86_64)$/i.test(it.name) ? '⚙️' : /\.(iso|chd|nsp|xci|gba|gbc?|nes|sfc|smc|n64|z64|nds)$/i.test(it.name) ? '👾' : '📄');
  const size = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);

  // Places: Bladedeck's own folders, then folders you allowed (✕ takes one back), then "Allow a folder…".
  async function side(p) {
    p.places = await api.fsPlaces();
    p.body.querySelector('.fl-side').innerHTML = p.places.map((pl) => `<div class="fl-plr"><button type="button" class="fl-pl" data-go="${esc(pl.path)}"><i>${pl.icon}</i>${esc(pl.name)}</button>${pl.granted ? `<button type="button" class="fl-x" data-revoke="${esc(pl.path)}" aria-label="Stop allowing ${esc(pl.name)}">✕</button>` : ''}</div>`).join('')
      + '<button type="button" class="fl-pl fl-grant" data-grant><i>＋</i>Allow a folder…</button><p class="fl-why">Bladedeck only sees these folders.</p>';
  }
  async function mount(p) {
    p.body.innerHTML = '<div class="fl"><nav class="fl-side"></nav><div class="fl-main"><div class="fl-path"></div><div class="fl-grid"></div></div></div>';
    await side(p);
    p.body.addEventListener('click', async (ev) => {
      if (ev.target.closest('[data-grant]')) { const r = await api.fsGrant(); if (r.ok) { await side(p); load(p, r.path); toast('Bladedeck can use that folder now. ✕ next to it takes it back.'); } return; }
      const x = ev.target.closest('[data-revoke]');
      if (x) { await api.fsRevoke(x.dataset.revoke); toast('Bladedeck no longer uses that folder.'); await side(p); if (p.dir && (p.dir === x.dataset.revoke || p.dir.startsWith(x.dataset.revoke + '/') || p.dir.startsWith(x.dataset.revoke + '\\'))) load(p, p.places[0]?.path); return; }
      const g = ev.target.closest('[data-go]'); if (g) { load(p, g.dataset.go); return; }
      const f = ev.target.closest('[data-file]'); if (f) openItem(p, p.items[+f.dataset.file]);
    });
    p.body.addEventListener('dblclick', (ev) => ev.preventDefault());
    p.body.addEventListener('contextmenu', (ev) => { const f = ev.target.closest('[data-file]'); const it = f && p.items[+f.dataset.file]; if (it && !it.dir) { ev.preventDefault(); Transfer.open(it.path); } });
    load(p, p.startPath || p.places[0]?.path);
  }
  async function load(p, dir) {
    const r = await api.fsList(dir);
    p.dir = r.dir; p.parent = r.parent; p.items = r.items;
    p.el.querySelector('.fw-t').textContent = `Files · ${r.dir.split(/[\\/]/).pop() || r.dir}`; p.caption = `Files · ${r.dir}`;
    p.body.querySelector('.fl-path').innerHTML = `${r.parent ? `<button type="button" class="fl-up" data-go="${esc(r.parent)}">↑ Up</button>` : ''}<span>${esc(r.dir)}</span>`;
    p.body.querySelector('.fl-grid').innerHTML = r.error ? `<p class="note">${esc(r.error)}</p>` : r.items.length ? r.items.map((it, i) => `<button type="button" class="fl-it" data-file="${i}" title="${esc(it.name)}">
        <span class="fl-th">${IMG.test(it.name) && it.size < 25e6 ? `<img src="${fileUrl(it.path)}" loading="lazy" alt="">` : icon(it)}</span><b>${esc(it.name)}</b><small>${it.dir ? 'Folder' : size(it.size)}</small></button>`).join('') : '<p class="note">This folder is empty.</p>';
    p.body.querySelector('.fl-grid').scrollTop = 0;
    for (const b of p.body.querySelectorAll('.fl-pl')) b.classList.toggle('on', b.dataset.go === r.dir);
    if (p.el.classList.contains('focus')) focus(p);
  }
  async function openItem(p, it) {
    if (!it) return;
    if (it.dir) { load(p, it.path); Sound.play('tick'); return; }
    // A game file plays in its emulator, full screen.
    if (Roms.isRom(it.path)) { Roms.play(it.path); return; }
    Sound.play('go');
    const ok = await api.fsOpen(it.path);
    toast(ok ? `Opening ${it.name}…` : `Nothing on this PC opens ${it.name}.`, ok ? 'ok' : 'err');
  }
  function focus(p) { const first = p.body.querySelector('.fl-it') || p.body.querySelector('.fl-pl'); if (first && !p.body.querySelector('.pad-hl')) PadNav.mark(first); }
  function up(p) { if (p.parent) load(p, p.parent); }
  function handle(p, a) {
    if (a === 'b') { if (p.parent) { up(p); Sound.play('back'); } else Panels.leave(); return true; }
    // X on a file: send it (to the phone or a friend nearby).
    if (a === 'x') { const hl = p.body.querySelector('.fl-it.pad-hl'); const it = hl && p.items[+hl.dataset.file]; if (it && !it.dir) { Transfer.open(it.path); return true; } }
    if (a === 'lt' || a === 'rt' || a === 'music' || a === 'vol' || a === 'guide') return false;
    return PadNav.input(p.body, a) || true;
  }
  return { mount, focus, up, handle, go: (p, d) => load(p, d) };
})();

/* The System panel: how the computer is doing, and its everyday controls. Processor, graphics,
   memory, temperatures, storage, battery and network refresh every two seconds while it is out;
   brightness, Wi-Fi and power are below. Power buttons need a second press. */
const SysPanel = (() => {
  const gb = (n) => `${(n / 1073741824).toFixed(n > 1e11 ? 0 : 1)} GB`;
  const bar = (pct, hot) => `<i class="sy-bar ${hot ? 'hot' : ''}"><b style="width:${Math.max(0, Math.min(100, pct || 0))}%"></b></i>`;
  const up = (s) => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${m} min`; };
  let armed = null;

  function mount(p) {
    p.body.innerHTML = `<div class="sy"><div class="sy-cards"></div>
      <div class="sy-ctl">
        <label class="sy-row sy-bright" hidden><span>☀️ Brightness</span><input type="range" min="5" max="100" step="5" name="syBright"></label>
        <div class="sy-row"><span>📶 Wi-Fi</span><button type="button" data-sy="wifi">Networks</button><button type="button" data-sy="wifioff">Disconnect</button></div>
        <div class="sy-wifi"></div>
        <div class="sy-row sy-power"><span>⏻ Power</span><button type="button" data-sy="lock">Lock</button><button type="button" data-sy="sleep">Sleep</button><button type="button" data-sy="restart">Restart</button><button type="button" data-sy="off">Shut down</button></div>
      </div></div>`;
    p.body.addEventListener('click', (ev) => { const b = ev.target.closest('[data-sy]'); if (b) act(p, b); });
    p.body.addEventListener('change', async (ev) => { if (ev.target.name === 'syBright') { const r = await api.sysBrightness(+ev.target.value); if (!r.ok) toast(r.error || 'Brightness could not be changed here.', 'err'); } });
    p.timer = setInterval(() => { if (!p.min && p.el.isConnected && deckFocused()) refresh(p); }, 2000);
    refresh(p);
  }

  // Memory compression, in a few words: what it holds and how small it got.
  const zram = (c) => !c ? '' : c.kind === 'zram' ? ` · compressed swap (zram${c.algo ? `, ${esc(c.algo)}` : ''}) ${c.orig ? `holding ${gb(c.orig)} in ${gb(c.compr)}` : 'on, unused'}` : c.kind === 'zswap' ? ' · zswap compression on' : ' · no memory compression';
  async function refresh(p) {
    const s = await api.sysStats(); if (!p.el.isConnected) { clearInterval(p.timer); return; }
    const t = s.temps || {}, card = (ic, title, big, sub, pct, hot) => `<div class="sy-card"><span>${ic} ${esc(title)}</span><b>${big}</b>${pct != null ? bar(pct, hot) : ''}<small>${sub}</small></div>`;
    const g = s.gpu, b = s.battery, n = s.net;
    p.body.querySelector('.sy-cards').innerHTML = [
      card('🧠', 'Processor', s.cpu.load != null ? `${s.cpu.load}%` : '…', `${esc(s.cpu.model)} · ${s.cpu.cores} threads${t.Processor ? ` · ${t.Processor}°C` : ''}`, s.cpu.load, t.Processor > 85),
      g ? card('🎮', 'Graphics', g.busy != null ? `${g.busy}%` : g.mhz ? `${g.mhz} MHz` : esc(g.name), `${esc(g.name)}${g.maxMhz ? ` · up to ${g.maxMhz} MHz` : ''}${t.Graphics ? ` · ${t.Graphics}°C` : ''}`, g.busy ?? (g.mhz && g.maxMhz ? 100 * g.mhz / g.maxMhz : null), t.Graphics > 85) : '',
      card('💾', 'Memory', gb(s.mem.used), `of ${gb(s.mem.total)}${zram(s.mem.compression)}`, 100 * s.mem.used / s.mem.total, s.mem.used / s.mem.total > 0.9),
      b ? card(b.status === 'Charging' ? '⚡' : '🔋', 'Battery', `${b.pct}%`, `${esc(b.status || '')}${b.watts ? ` · ${b.watts} W` : ''}`, b.pct, b.pct < 15) : '',
      ...(s.disks || []).map((d) => card('🗄️', d.label, `${gb(d.free)} free`, `of ${gb(d.total)}`, 100 * (1 - d.free / d.total), d.free / d.total < 0.08)),
      n ? card(n.kind === 'Ethernet' ? '🔌' : '📶', 'Network', n.connected ? esc(n.name) : 'Offline', n.connected ? `${n.kind}${n.signal != null ? ` · ${n.signal}% signal` : ''}` : 'Not connected', n.signal, false) : '',
      card('🌡️', 'Temperatures', Object.keys(t).length ? `${Math.max(...Object.values(t))}°C` : '—', Object.entries(t).map(([k, v]) => `${esc(k)} ${v}°`).join(' · ') || 'No sensors', null),
      card('⏱️', 'Up for', up(s.uptime), esc(s.host), null)
    ].join('');
    const br = p.body.querySelector('.sy-bright');
    if (s.brightness) { br.hidden = false; const r = br.querySelector('input'); if (document.activeElement !== r && !r.classList.contains('pad-hl')) r.value = s.brightness.pct; }
  }

  async function act(p, b) {
    const a = b.dataset.sy;
    if (a === 'wifi') {
      const box = p.body.querySelector('.sy-wifi'); box.innerHTML = '<p class="note">Looking for networks…</p>';
      const r = await api.sysWifi();
      box.innerHTML = r.error ? `<p class="note">${esc(r.error)}</p>` : r.networks.map((w) => `<button type="button" class="sy-net ${w.on ? 'on' : ''}" data-sy="join" data-ssid="${esc(w.ssid)}" data-secure="${w.secure ? 1 : ''}"><b>${esc(w.ssid)}</b><small>${w.on ? 'Connected · ' : ''}${w.signal}%${w.secure ? ' · 🔒' : ''}</small></button>`).join('');
      return;
    }
    if (a === 'join') {
      const ssid = b.dataset.ssid;
      const go = async (password) => { toast(`Connecting to ${ssid}…`); const r = await api.sysWifiConnect({ ssid, password }); toast(r.ok ? `Connected to ${ssid}.` : r.error, r.ok ? 'fun' : 'err'); refresh(p); };
      if (!b.dataset.secure) { go(''); return; }
      openModal({ title: `Wi-Fi: ${ssid}`, html: '<label>Password<input type="password" name="wpw" autocomplete="off"></label><p class="note">Saved networks connect without it: leave it empty to try.</p>',
        buttons: [{ label: 'Cancel' }, { label: 'Connect', primary: true, onClick: (root) => { go($('[name=wpw]', root).value); } }] });
      return;
    }
    if (a === 'wifioff') { const r = await api.sysWifiOff(); toast(r.ok ? 'Wi-Fi disconnected.' : 'Could not disconnect.'); refresh(p); return; }
    // Power: a second press within four seconds does it.
    const name = { lock: 'lock the screen', sleep: 'sleep', restart: 'restart', off: 'shut down' }[a];
    if (!name) return;
    if (armed !== a) { armed = a; b.classList.add('armed'); const t = b.textContent; b.textContent = 'Press again'; setTimeout(() => { if (armed === a) armed = null; b.classList.remove('armed'); b.textContent = t; }, 4000); return; }
    armed = null;
    const r = await api.sysPower(a);
    if (!r.ok) toast(`Could not ${name}: ${r.error || 'not allowed'}`, 'err');
  }
  function focus(p) { const f = p.body.querySelector('button, input'); if (f && !p.body.querySelector('.pad-hl')) PadNav.mark(f); }
  function handle(p, a) {
    if (a === 'b') { Panels.leave(); return true; }
    if (a === 'lt' || a === 'rt' || a === 'music' || a === 'vol' || a === 'guide') return false;
    return PadNav.input(p.body, a) || true;
  }
  return { mount, focus, handle };
})();

// One way to act on any window: panels here, everything else through the main process.
function winAct(id, a, pid) { return String(id).startsWith('panel:') ? Promise.resolve(Panels.act(String(id).slice(6), a)) : api.winAct(id, a, pid); }
