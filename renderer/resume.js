'use strict';
/* Quick Resume: every game and app that is running, most recent first, like a console's.
   A switches to it (thawing it first if it was frozen), X freezes or thaws it, Y closes it.
   Freezing stops a game where it is, keeping it in memory but using no processor or graphics
   (see procs.js); thawing carries on from the same frame. With "Freeze games when I switch" on,
   the game you leave freezes by itself, so two games can share the machine.
   Hold View (half a second), press Q, or click ▣ to open it. Switching back and forth is the
   first card: it is always the last thing you were in.
   On KDE it sees every window through the KWin script; elsewhere it knows the games Bladedeck
   started. Uses S, api, esc, cover, fileUrl, toast, Sound, Dock, NowPlaying and $ at call time. */

const Resume = (() => {
  const el = document.createElement('div');
  el.id = 'qr'; el.hidden = true;
  document.body.appendChild(el);
  let on = false, sel = 0, items = [], frozen = new Set(), order = [], busy = false;
  const st = () => S.lib.settings;

  // Remember which windows were used most recently: KWin tells us which is active.
  window.bladedeck.onPeek((ev) => {
    if (ev.kind !== 'windows') return;
    let l; try { l = JSON.parse(ev.caption) || []; } catch { return; }
    const a = l.find((w) => w.active);
    if (a) order = [a.id, ...order.filter((x) => x !== a.id)].slice(0, 40);
    if (on) build().then(draw);
  });
  window.bladedeck.onWebapps((l) => { const a = (l || []).find((w) => w.active); if (a) order = [a.id, ...order.filter((x) => x !== a.id)]; });

  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  function entryFor(w) {
    const ses = (S.sessions || []).find((x) => w.pid && (x.winPid === w.pid || x.pid === w.pid));
    if (ses) return S.lib.entries.find((e) => e.id === ses.id);
    const app = String(w.cls || '').match(/^steam_app_(\d+)$/i);
    if (app) return S.lib.entries.find((e) => String(e.appid) === app[1]);
    const c = norm(w.caption);
    return c.length > 3 ? S.lib.entries.find((e) => e.type !== 'app' && norm(e.title).length > 3 && (c === norm(e.title) || c.startsWith(norm(e.title)))) : null;
  }

  async function build() {
    frozen = new Set((await api.procFrozen()) || []);
    const wins = Dock.windows();
    if (wins.length) {
      items = wins.map((w) => {
        const e = entryFor(w), slot = !e && Dock.slotFor(w);
        return { w, e, pid: w.pid || 0, title: e ? e.title : slot ? slot.name : w.caption || w.cls, sub: e ? (w.caption && w.caption !== e.title ? w.caption : 'Running') : slot ? w.caption : w.cls, icon: slot?.icon || '' };
      });
    } else {
      // No window list (Windows, or another desktop): the games Bladedeck started.
      items = (S.sessions || []).map((ses) => { const e = S.lib.entries.find((x) => x.id === ses.id); return e && { ses, e, pid: ses.winPid || ses.pid || 0, title: e.title, sub: 'Running' }; }).filter(Boolean);
    }
    const rank = (it) => { const i = it.w ? order.indexOf(it.w.id) : -1; return i < 0 ? 999 : i; };
    items.sort((a, b) => rank(a) - rank(b) || (b.e ? 1 : 0) - (a.e ? 1 : 0));
    sel = Math.max(0, Math.min(sel, items.length - 1));
  }

  function draw() {
    if (!on) return;
    const card = (it, i) => {
      const fz = it.pid && frozen.has(it.pid);
      const art = it.e ? cover(it.e) : `<div class="qr-icon">${esc(it.icon || (it.title || '?').trim()[0] || '?')}</div>`;
      const badge = fz ? '<em class="qr-b fz">❄ Frozen</em>' : i === 0 ? '<em class="qr-b">Last played</em>' : '';
      return `<button type="button" class="qr-card ${i === sel ? 'cur' : ''} ${fz ? 'frozen' : ''} ${it.e ? 'game' : 'app'}" data-i="${i}">
        <div class="qr-art">${art}${badge}</div><b>${esc(it.title)}</b><small>${esc(it.sub || '')}</small></button>`;
    };
    const cur = items[sel];
    const canFreeze = cur && cur.pid && !(cur.w && cur.w.web);
    el.innerHTML = `<div class="qr-wrap">
      <div class="qr-head"><b>Quick Resume</b><span>${items.length ? `${items.length} running` : 'Nothing else is running'}</span>
        <label class="qr-auto"><input type="checkbox" class="qr-af" ${st().autoFreeze ? 'checked' : ''}> Freeze games when I switch away</label></div>
      <div class="qr-row">${items.map(card).join('') || '<p class="qr-empty">Start a game or open an app from the dock, and it shows up here.</p>'}</div>
      <p class="qr-tip"><i class="pad a">A</i>switch to it ${canFreeze ? `<i class="pad x">X</i>${frozen.has(cur.pid) ? 'thaw' : 'freeze'}` : ''} ${cur?.w ? '<i class="pad y">Y</i>close' : ''} <i class="pad b">B</i>back</p></div>`;
    el.querySelector('.qr-card.cur')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  async function open() {
    if (on) return;
    on = true; sel = 0;
    el.hidden = false; requestAnimationFrame(() => el.classList.add('open'));
    Sound.play('pop');
    await build(); draw();
  }
  function close() { if (!on) return; on = false; el.classList.remove('open'); setTimeout(() => { if (!on) el.hidden = true; }, 250); Sound.play('back'); }

  async function freeze(it, want) {
    if (!it?.pid || (it.w && it.w.web)) return false;
    const was = frozen.has(it.pid), to = want ?? !was;
    if (to === was) return true;
    const ok = await api.procFreeze(it.pid, to);
    if (!ok) { toast(to ? `${it.title} cannot be frozen.` : `${it.title} would not thaw.`, 'err'); return false; }
    if (to) frozen.add(it.pid); else frozen.delete(it.pid);
    Sound.play(to ? 'clank' : 'pop');
    toast(to ? `${it.title} is frozen. It uses no processor or graphics until you come back.` : `${it.title} is running again.`);
    return true;
  }

  async function switchTo(it) {
    if (!it || busy) return;
    busy = true;
    try {
      if (frozen.has(it.pid)) { await freeze(it, false); await new Promise((r) => setTimeout(r, 120)); }
      // The game being left freezes by itself, if that is turned on.
      if (st().autoFreeze) {
        const leaving = items.find((x) => x !== it && x.e && x.pid && !frozen.has(x.pid) && (x.w ? x.w.id === order[0] : S.playing && x.ses === S.playing));
        if (leaving) await freeze(leaving, true);
      }
      const ses = (S.sessions || []).find((x) => it.e && x.id === it.e.id);
      if (ses) S.playing = ses;
      close();
      if (it.w) await api.winAct(it.w.id, 'show');
      else if (it.pid) { const ok = await api.focusPid(it.pid); if (!ok) toast(`Could not bring ${it.title} to the front.`, 'err'); }
    } finally { busy = false; }
  }

  async function closeApp(it) {
    if (!it?.w) return;
    if (frozen.has(it.pid)) await freeze(it, false);
    await api.winAct(it.w.id, 'close');
    Sound.play('back');
    setTimeout(() => build().then(draw), 600);
  }

  function handle(a) {
    if (a === 'resume') { on ? close() : open(); return true; }
    if (!on) return false;
    const cur = items[sel];
    if (a === 'left' || a === 'lb') { sel = Math.max(0, sel - 1); Sound.play('tick'); draw(); }
    else if (a === 'right' || a === 'rb') { sel = Math.min(items.length - 1, sel + 1); Sound.play('tick'); draw(); }
    else if (a === 'a') switchTo(cur);
    else if (a === 'x') freeze(cur).then(draw);
    else if (a === 'y') closeApp(cur);
    else if (a === 'b' || a === 'back' || a === 'start') close();
    return true;
  }

  el.addEventListener('click', (ev) => {
    const c = ev.target.closest('.qr-card');
    if (c) { const i = +c.dataset.i; if (i === sel) switchTo(items[i]); else { sel = i; draw(); } return; }
  });
  el.addEventListener('contextmenu', (ev) => { const c = ev.target.closest('.qr-card'); if (c) { ev.preventDefault(); sel = +c.dataset.i; freeze(items[sel]).then(draw); } });
  el.addEventListener('change', (ev) => { if (ev.target.classList.contains('qr-af')) { st().autoFreeze = ev.target.checked; save(); if (ev.target.checked) toast('Games you switch away from will freeze. Online games may drop their connection while frozen.'); } });
  addEventListener('pointerdown', (ev) => { if (on && !el.contains(ev.target) && !ev.target.closest('#qr-btn')) close(); }, true);

  document.getElementById('qr-btn')?.addEventListener('click', () => (on ? close() : open()));
  return { open, close, handle, isOpen: () => on };
})();
