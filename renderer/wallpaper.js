'use strict';
/* Wallpaper: a moving (or still) picture behind the menus, from Wallpaper Engine or your own.
   System, Wallpaper picks one: Wallpaper Engine's video and web wallpapers play as they are;
   scene wallpapers show their preview. "Add your own" takes a picture, GIF or video. Dim and blur
   keep the menus readable. It stops while a game has the screen, and replaces the theme's
   background (the theme's colours stay). See wallpaper.js in main for what is allowed to load.
   Uses S, api, esc, save, toast, openModal, closeModal, Sound, Drive, applyTheme, fileUrl and $
   at call time. */

const Wallpaper = (() => {
  const layer = document.createElement('div');
  layer.id = 'wall'; layer.hidden = true; layer.setAttribute('aria-hidden', 'true');
  document.body.prepend(layer);
  let list = [], cur = null, away = false;
  const cfg = () => S.lib?.settings?.wallpaper || null;
  const on = () => !!cfg()?.id;
  const KIND = { video: '🎬 Video', web: '🌐 Web', scene: '🖼 Scene (preview)', image: '🖼 Picture' };

  function mount(it) {
    layer.innerHTML = '';
    if (!it) return;
    let el;
    if (it.kind === 'video') { el = document.createElement('video'); Object.assign(el, { muted: true, loop: true, autoplay: true, playsInline: true }); el.src = fileUrl(it.file); }
    else if (it.kind === 'web') { el = document.createElement('webview'); el.setAttribute('partition', 'wallpaper'); el.setAttribute('src', fileUrl(it.file)); }
    else { el = document.createElement('img'); el.src = fileUrl(it.file); el.alt = ''; }
    el.className = 'wall-media';
    layer.append(el, Object.assign(document.createElement('i'), { className: 'wall-dim' }));
    style();
  }
  function style() {
    const c = cfg() || {};
    layer.style.setProperty('--wall-dim', c.dim ?? 0.35);
    layer.style.setProperty('--wall-blur', `${c.blur ?? 0}px`);
  }
  // Show the chosen one (or none), and let the theme's own background go or come back.
  function apply() {
    const c = cfg();
    cur = c?.id ? list.find((x) => x.id === c.id) || null : null;
    layer.hidden = !cur;
    document.body.classList.toggle('walled', !!cur);
    if (cur && !away) mount(cur); else layer.innerHTML = '';
    if (typeof Drive !== 'undefined') Drive.set(!cur && S.theme?.scene === 'drive');
  }
  async function load() { list = await api.wallList().catch(() => []); apply(); }

  // Nothing plays while a game has the screen; a web wallpaper is taken down entirely.
  document.addEventListener('deck-away', (ev) => {
    away = ev.detail;
    if (!cur) return;
    if (away) { const v = layer.querySelector('video'); if (v) v.pause(); if (cur.kind === 'web') layer.innerHTML = ''; }
    else if (!layer.firstChild) mount(cur); else layer.querySelector('video')?.play().catch(() => {});
  });

  async function open() {
    list = await api.wallList().catch(() => []);
    const c = cfg() || {};
    const tile = (it) => `<button type="button" class="wl-it ${it.id === c.id ? 'on' : ''}" data-wl="${esc(it.id)}">
        <span class="wl-th">${it.preview ? `<img src="${fileUrl(it.preview)}" loading="lazy" alt="">` : it.kind === 'video' ? '🎬' : '🖼'}</span>
        <b>${esc(it.title)}</b><small>${KIND[it.kind] || ''} · ${esc(it.source)}</small></button>`;
    const groups = {}; for (const it of list) (groups[it.source] = groups[it.source] || []).push(it);
    openModal({
      title: 'Wallpaper', wide: true,
      html: `<div class="wl">
        <div class="wl-opts"><label class="range-row">Dim<input type="range" name="wlDim" min="0" max="0.8" step="0.05" value="${c.dim ?? 0.35}"></label>
          <label class="range-row">Blur<input type="range" name="wlBlur" min="0" max="24" step="1" value="${c.blur ?? 0}"></label></div>
        <div class="wl-grid"><button type="button" class="wl-it ${!c.id ? 'on' : ''}" data-wl=""><span class="wl-th">✕</span><b>None</b><small>The theme's own background</small></button>
          <button type="button" class="wl-it" data-wl-add><span class="wl-th">＋</span><b>Add your own</b><small>Picture, GIF or video</small></button></div>
        ${Object.entries(groups).map(([g, items]) => `<div class="side-h">${esc(g)}</div><div class="wl-grid">${items.map(tile).join('')}</div>`).join('')}
        ${list.some((x) => x.source !== 'Yours') ? '' : '<p class="note">No Wallpaper Engine wallpapers found. Subscribe to some in Wallpaper Engine\'s Workshop on Steam (Wallpaper Engine, app 431960) and they show up here. Video and web wallpapers play; scene wallpapers show their preview.</p>'}
        <p class="note">Your own go in Bladedeck/Wallpapers. Wallpapers stop while a game is playing.</p></div>`,
      buttons: [{ label: 'Done', primary: true }],
      onOpen: (root) => {
        root.addEventListener('click', async (ev) => {
          if (ev.target.closest('[data-wl-add]')) {
            const f = await api.pick({ kind: 'media' }); if (!f) return;
            const r = await api.wallAdd(f);
            if (!r.ok) { toast(r.error, 'err'); return; }
            S.lib.settings.wallpaper = { ...(cfg() || {}), id: r.id }; save(); closeModal(); await load(); setTimeout(open, 0); toast('Wallpaper added.', 'fun');
            return;
          }
          const b = ev.target.closest('[data-wl]'); if (!b) return;
          S.lib.settings.wallpaper = { ...(cfg() || {}), id: b.dataset.wl || null }; save();
          root.querySelectorAll('.wl-it').forEach((x) => x.classList.toggle('on', x === b));
          apply(); Sound.play('tick');
          if (!b.dataset.wl) applyTheme(S.theme.id);
        });
        root.addEventListener('input', (ev) => {
          if (ev.target.name !== 'wlDim' && ev.target.name !== 'wlBlur') return;
          S.lib.settings.wallpaper = { ...(cfg() || {}), [ev.target.name === 'wlDim' ? 'dim' : 'blur']: +ev.target.value }; save(); style();
        });
      }
    });
  }

  setTimeout(() => { if (S.lib) load(); }, 1200);
  return { open, on, load, apply };
})();
