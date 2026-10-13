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
  const area = () => ({ x: 14, y: 76, w: innerWidth - 28, h: innerHeight - 76 - 84 });
  const SNAPS = [
    ['Middle', (a) => ({ w: a.w * 0.64, h: a.h * 0.78, x: a.x + a.w * 0.18, y: a.y + a.h * 0.11 })],
    ['Right half', (a) => ({ w: a.w / 2 - 6, h: a.h, x: a.x + a.w / 2 + 6, y: a.y })],
    ['Left half', (a) => ({ w: a.w / 2 - 6, h: a.h, x: a.x, y: a.y })],
    ['Corner', (a) => ({ w: a.w * 0.36, h: a.h * 0.42, x: a.x + a.w * 0.64, y: a.y + a.h * 0.58 })],
    ['Top corner', (a) => ({ w: a.w * 0.36, h: a.h * 0.42, x: a.x + a.w * 0.64, y: a.y })],
    ['Full', (a) => ({ ...a })]
  ];

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
    if (p) { p.min = false; p.el.hidden = false; focus(p); tell(); return p; }
    const g = geo()[key];
    const s0 = SNAPS[0][1](area());
    p = { key, kind: spec.kind || 'web', title: spec.title || 'Panel', icon: spec.icon || '🌐', url: spec.url || PANEL_HOME, tv: !!spec.tv,
      x: g?.x ?? s0.x, y: g?.y ?? s0.y, w: g?.w ?? s0.w, h: g?.h ?? s0.h, pinned: !!g?.pinned, min: false, z: ++z, snap: 0 };
    p.el = document.createElement('section');
    p.el.className = `fw ${p.kind}`;
    p.el.innerHTML = `<header class="fw-bar"><i class="fw-ic">${esc(p.icon)}</i><b class="fw-t">${esc(p.title)}</b>
        ${p.kind === 'browser' ? `<input class="fw-url" type="text" value="${esc(p.url)}" aria-label="Address">` : '<span class="fw-sp"></span>'}
        <div class="fw-btns"><button type="button" data-a="back" title="Back">‹</button><button type="button" data-a="pin" title="Pin">📌</button><button type="button" data-a="min" title="Minimize">–</button><button type="button" data-a="max" title="Fill the screen">▢</button><button type="button" data-a="close" title="Close">✕</button></div></header>
      <div class="fw-body"></div><i class="fw-grip"></i><div class="fw-hint"></div>`;
    p.body = p.el.querySelector('.fw-body');
    if (p.kind === 'files') Files.mount(p);
    else {
      const wv = document.createElement('webview');
      wv.setAttribute('partition', 'persist:webapps');
      if (p.tv) wv.setAttribute('useragent', TV_UA);
      wv.setAttribute('src', p.tv ? 'https://www.youtube.com/tv' : p.url);
      wv.addEventListener('page-title-updated', (ev) => { p.el.querySelector('.fw-t').textContent = ev.title || p.title; p.caption = ev.title; tell(); });
      wv.addEventListener('did-navigate', (ev) => { const u = p.el.querySelector('.fw-url'); if (u && document.activeElement !== u) u.value = ev.url; });
      wv.addEventListener('did-navigate-in-page', (ev) => { const u = p.el.querySelector('.fw-url'); if (u && ev.isMainFrame && document.activeElement !== u) u.value = ev.url; });
      p.body.appendChild(wv); p.wv = wv;
    }
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

  /* -------------------------------------------------------------- focus */
  function focus(p) {
    if (focused && focused !== p) { focused.el.classList.remove('focus'); }
    focused = p; arranging = false;
    if (!p) { document.body.classList.remove('panel-on'); hint(); tell(); return; }
    p.z = ++z; p.el.style.zIndex = p.z; p.el.classList.add('focus'); p.el.classList.remove('arrange');
    document.body.classList.add('panel-on');
    if (p.wv) setTimeout(() => p.wv.focus(), 60);
    else if (p.kind === 'files') Files.focus(p);
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
  function minimize(p, quiet) { p.min = true; p.el.hidden = true; if (focused === p) { focused = null; document.body.classList.remove('panel-on'); } if (!quiet) Sound.play('back'); tell(); }
  function close(p) {
    p.el.classList.remove('in'); p.el.classList.add('out');
    setTimeout(() => p.el.remove(), 220);
    open.delete(p.key); if (focused === p) { focused = null; document.body.classList.remove('panel-on'); }
    Sound.play('back'); tell();
  }
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
      ? `Arranging${extra ? `: ${extra}` : ''} · ✛ move · LB/RB size · LT/RT snap · X ${focused.pinned ? 'unpin' : 'pin'} · Y close · A done`
      : `Menu arrange · View back to the menu${focused.kind === 'browser' ? ' · Y address' : ''}`;
  }

  // The dock, Running list and Quick Resume see panels as windows.
  function list() {
    return [...open.values()].map((p) => ({ id: `panel:${p.key}`, key: p.key, caption: p.caption || p.title, cls: 'bladedeck-panel', pid: 0, min: p.min, active: focused === p, web: true, panel: true }));
  }
  function tell() { document.dispatchEvent(new CustomEvent('panels-changed', { detail: list() })); }
  function act(key, a) {
    const p = open.get(key); if (!p) return false;
    if (a === 'close') close(p); else if (a === 'min') minimize(p); else { p.min = false; p.el.hidden = false; focus(p); }
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
      else if (a === 'a' || a === 'b' || a === 'start') { arranging = false; p.el.classList.remove('arrange'); hint(); Sound.play('tick'); if (p.wv) p.wv.focus(); }
      else if (a === 'back') leave();
      return true;
    }
    if (a === 'start') { arranging = true; p.el.classList.add('arrange'); hint(); Sound.play('tick'); return true; }
    if (a === 'back') { leave(); return true; }
    if (p.kind === 'files') return Files.handle(p, a);
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
      ({ back: () => back(p), pin: () => pin(p), min: () => minimize(p), max: () => maximize(p), close: () => close(p) })[a]?.();
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

  return { show, act, list, handle, leave, active: () => !!focused, has: (k) => open.has(k), focus: (k) => { const p = open.get(k); if (p) act(k, 'show'); } };
})();

/* Files: Bladedeck's own file browser for the Files panel. Places on the left (Home, Downloads,
   Games…), the folder's contents on the right; A opens a folder or a file (with its usual app),
   B goes up a folder. Pictures show as thumbnails. */
const Files = (() => {
  const IMG = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;
  const icon = (it) => (it.dir ? '📁' : IMG.test(it.name) ? '' : /\.(mp4|webm|mkv|mov|avi)$/i.test(it.name) ? '🎬' : /\.(mp3|flac|ogg|opus|m4a|wav)$/i.test(it.name) ? '🎵'
    : /\.(zip|7z|rar|tar|gz|xz)$/i.test(it.name) ? '🗜️' : /\.(pdf)$/i.test(it.name) ? '📕' : /\.(appimage|exe|sh|x86_64)$/i.test(it.name) ? '⚙️' : /\.(iso|chd|nsp|xci|gba|gbc?|nes|sfc|smc|n64|z64|nds)$/i.test(it.name) ? '👾' : '📄');
  const size = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);

  async function mount(p) {
    p.places = await api.fsPlaces();
    p.body.innerHTML = '<div class="fl"><nav class="fl-side"></nav><div class="fl-main"><div class="fl-path"></div><div class="fl-grid"></div></div></div>';
    p.body.querySelector('.fl-side').innerHTML = p.places.map((pl) => `<button type="button" class="fl-pl" data-go="${esc(pl.path)}"><i>${pl.icon}</i>${esc(pl.name)}</button>`).join('');
    p.body.addEventListener('click', (ev) => {
      const g = ev.target.closest('[data-go]'); if (g) { load(p, g.dataset.go); return; }
      const f = ev.target.closest('[data-file]'); if (f) openItem(p, p.items[+f.dataset.file]);
    });
    p.body.addEventListener('dblclick', (ev) => ev.preventDefault());
    load(p, p.places[0]?.path);
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
    Sound.play('go');
    const ok = await api.fsOpen(it.path);
    toast(ok ? `Opening ${it.name}…` : `Nothing on this PC opens ${it.name}.`, ok ? 'ok' : 'err');
  }
  function focus(p) { const first = p.body.querySelector('.fl-it') || p.body.querySelector('.fl-pl'); if (first && !p.body.querySelector('.pad-hl')) PadNav.mark(first); }
  function up(p) { if (p.parent) load(p, p.parent); }
  function handle(p, a) {
    if (a === 'b') { if (p.parent) { up(p); Sound.play('back'); } else Panels.leave(); return true; }
    if (a === 'lt' || a === 'rt' || a === 'music' || a === 'vol' || a === 'guide') return false;
    return PadNav.input(p.body, a) || true;
  }
  return { mount, focus, up, handle };
})();

// One way to act on any window: panels here, everything else through the main process.
function winAct(id, a) { return String(id).startsWith('panel:') ? Promise.resolve(Panels.act(String(id).slice(6), a)) : api.winAct(id, a); }
