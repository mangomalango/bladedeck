'use strict';
/* Notifications: everything Bladedeck told you, kept in one place, so a message that popped up
   while you were in a game is still there afterwards. Downloads sit at the top: Steam's, and
   whatever Bladedeck itself is installing (emulators, ports, PartyDeck), with their progress.
   The 🔔 at the top shows how many are new; System, Notifications and N open it too. Kept for
   this session (the last 120). Controller: up/down scroll, X clears all, B closes.
   Uses S, esc, Sound, Downloads and $ at call time. */
const Notify = (() => {
  const items = [];
  const installs = new Map(); // id -> { name, pct }
  let unread = 0, on = false;
  const el = document.createElement('aside');
  el.id = 'nc'; el.hidden = true; el.setAttribute('aria-label', 'Notifications');
  document.body.appendChild(el);
  const ICON = { fun: '✨', err: '⚠️', ok: '💬' };

  function add(msg, kind = 'ok') {
    const last = items[0];
    if (last && last.msg === msg && Date.now() - last.t < 5000) return; // the same thing twice
    items.unshift({ msg: String(msg), kind, t: Date.now() });
    if (items.length > 120) items.pop();
    if (!on) { unread++; badge(); } else draw();
  }
  function badge() {
    const b = document.getElementById('nc-btn'); if (!b) return;
    b.querySelector('em').textContent = unread > 99 ? '99+' : unread || '';
    b.classList.toggle('new', unread > 0);
  }
  // Bladedeck's own downloads, from the install progress messages.
  window.bladedeck.onEmuProgress?.(({ id, pct }) => {
    const name = String(id).replace(/^gh:/, '').replace(/^[\w-]+\.[\w-]+\./, '');
    if (pct >= 100) installs.delete(id); else installs.set(id, { name, pct });
    if (on) draw();
  });

  const when = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  function draw() {
    const dl = (typeof Downloads !== 'undefined' && Downloads.list?.()) || [];
    const gb = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${(n / 1e6).toFixed(0)} MB`);
    const rows = [
      ...dl.map((d) => `<div class="nc-dl"><b>⬇️ ${esc(d.title)}</b><i class="nc-bar"><b style="width:${(d.done / d.total * 100).toFixed(1)}%"></b></i><small>Steam · ${gb(d.done)} of ${gb(d.total)}${d.paused ? ' · paused' : ''}</small></div>`),
      ...[...installs.values()].map((x) => `<div class="nc-dl"><b>⬇️ Installing ${esc(x.name)}</b><i class="nc-bar"><b style="width:${x.pct}%"></b></i><small>${x.pct}%</small></div>`)
    ];
    el.innerHTML = `<div class="nc-card"><div class="nc-head"><b>Notifications</b><button type="button" data-nc="clear">Clear all</button><button type="button" data-nc="close" aria-label="Close">✕</button></div>
      ${rows.length ? `<div class="nc-h">Downloads</div>${rows.join('')}` : ''}
      <div class="nc-h">${items.length ? 'Recent' : ''}</div>
      <div class="nc-list">${items.map((n) => `<div class="nc-it ${n.kind}"><i>${ICON[n.kind] || '💬'}</i><span>${esc(n.msg)}</span><small>${when(n.t)}</small></div>`).join('') || '<p class="nc-empty">Nothing yet. Messages from Bladedeck collect here.</p>'}</div></div>`;
  }
  function open() { on = true; unread = 0; badge(); draw(); el.hidden = false; requestAnimationFrame(() => el.classList.add('open')); Sound.play('pop'); }
  function close() { if (!on) return; on = false; el.classList.remove('open'); setTimeout(() => { if (!on) el.hidden = true; }, 250); Sound.play('back'); }
  const toggle = () => (on ? close() : open());

  function handle(a) {
    if (a === 'notify') { toggle(); return true; }
    if (!on) return false;
    const list = el.querySelector('.nc-card');
    if (a === 'up' || a === 'down') list.scrollBy({ top: a === 'down' ? 120 : -120, behavior: 'smooth' });
    else if (a === 'x') { items.length = 0; draw(); }
    else if (a === 'b' || a === 'a' || a === 'start') close();
    return true;
  }
  el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-nc]'); if (!b) return; if (b.dataset.nc === 'clear') { items.length = 0; draw(); } else close(); });
  addEventListener('pointerdown', (ev) => { if (on && !el.contains(ev.target) && !ev.target.closest('#nc-btn')) close(); }, true);
  document.getElementById('nc-btn')?.addEventListener('click', toggle);
  setInterval(() => { if (on) draw(); }, 5000);

  return { add, open, close, toggle, handle, isOpen: () => on };
})();
