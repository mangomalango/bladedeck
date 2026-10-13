'use strict';
/* Running: a list on the left of everything you have going, so you always know what is on the
   screen, what is running behind, and what is paused. It sits under the live panel (or at the
   top when there is none), above the dock. Games come first, with their art and state:
     Playing    the game you are in, or were in last
     Running    started and still going behind
     Paused ❄   frozen: kept in memory, using nothing, until you resume it
     Minimized  tucked away
   then the dock's apps and web apps that are open, and how many other windows are open.
   Controller: push left from the blades (or down from the live panel) to reach it; up and down
   move, A switches to it, X pauses or resumes, Y closes. It shares Quick Resume's data and
   actions. Uses S, esc, cover, Sound, Resume, NowPlaying, Dock and $ at call time. */

const Running = (() => {
  const el = document.createElement('aside');
  el.id = 'run'; el.hidden = true; el.setAttribute('aria-label', 'Running');
  document.getElementById('dock').before(el);
  let rows = [], others = 0, focus = -1, frozen = new Set(), order = [], timer = 0, busy = false;
  const on = () => S.lib.settings.runningList !== false;

  async function refresh() {
    if (busy) return; busy = true;
    try {
      const snap = await Resume.snapshot();
      frozen = snap.frozen; order = snap.order;
      // Games, then the apps people choose to have around (the dock's, and web apps); other
      // windows are only counted, so a terminal or file manager does not crowd the list.
      const games = snap.items.filter((it) => it.e);
      const apps = snap.items.filter((it) => !it.e && it.w && (it.w.web || Dock.slotFor(it.w)));
      rows = [...games, ...apps];
      others = snap.items.length - rows.length;
      draw();
    } finally { busy = false; }
  }

  function state(it) {
    if (it.pid && frozen.has(it.pid)) return ['paused', '❄ Paused'];
    const playing = S.playing && it.e && S.playing.id === it.e.id;
    if (it.w?.active && !document.hasFocus()) return ['up', 'On screen'];
    if (playing || (it.e && it.w && order[0] === it.w.id)) return ['up', 'Playing'];
    if (it.w?.min) return ['min', 'Minimized'];
    return ['run', 'Running'];
  }

  function draw() {
    const show = on() && rows.length > 0;
    el.hidden = !show;
    document.body.classList.toggle('run-on', show);
    if (!show) { focus = -1; Dock.draw(); return; }
    focus = Math.min(focus, rows.length - 1);
    const n = rows.filter((it) => it.e).length;
    el.innerHTML = `<div class="rn-h"><b>Running</b><span>${n ? `${n} game${n === 1 ? '' : 's'}` : ''}${n && rows.length > n ? ' · ' : ''}${rows.length > n ? `${rows.length - n} app${rows.length - n === 1 ? '' : 's'}` : ''}</span></div>
      <div class="rn-list">${rows.map((it, i) => {
        const [k, label] = state(it);
        const art = it.e ? cover(it.e) : `<i class="rn-ic">${esc(it.icon || (it.title || '?').trim()[0] || '?')}</i>`;
        const canPause = it.pid && !(it.w && it.w.web);
        return `<div class="rn ${k} ${i === focus ? 'hl' : ''} ${it.e ? 'game' : 'app'}" data-i="${i}">
          <div class="rn-art">${art}</div>
          <div class="rn-t"><b>${esc(it.title)}</b><span class="rn-s ${k}">${esc(label)}</span></div>
          <div class="rn-acts">
            <button type="button" data-a="go" title="Switch to it">▶</button>
            ${canPause ? `<button type="button" data-a="pause" title="${k === 'paused' ? 'Resume' : 'Pause'}">${k === 'paused' ? '⏵' : '❄'}</button>` : ''}
            ${it.w ? '<button type="button" data-a="close" title="Close">✕</button>' : ''}
          </div></div>`;
      }).join('')}</div>
      ${others > 0 ? `<button type="button" class="rn-more" data-a="more">+ ${others} other window${others === 1 ? '' : 's'} · Quick Resume</button>` : ''}`;
    place(); Dock.draw();
  }
  // Under the live panel when it is out, otherwise at the top of the left side.
  function place() {
    const np = document.getElementById('np');
    const npOn = document.body.classList.contains('np-on') && !np.hidden;
    el.style.top = `${npOn ? Math.round(np.getBoundingClientRect().bottom + 12) : 84}px`;
  }
  new ResizeObserver(() => { if (!el.hidden) { place(); Dock.draw(); } }).observe(document.getElementById('np'));
  new MutationObserver(() => { if (!el.hidden) place(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  async function act(i, a) {
    const it = rows[i]; if (!it) return;
    Sound.play('tick');
    if (a === 'go') await Resume.switchTo(it);
    else if (a === 'pause') await Resume.freeze(it);
    else if (a === 'close') await Resume.closeApp(it);
    refresh();
  }

  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-a]');
    if (b?.dataset.a === 'more') { Resume.open(); return; }
    const r = ev.target.closest('.rn'); if (!r) return;
    act(+r.dataset.i, b ? b.dataset.a : 'go');
  });

  /* -------------------------------------------------------------- controller */
  function edge(fromBottom) { if (el.hidden || !rows.length) return false; focus = fromBottom ? rows.length - 1 : 0; draw(); Sound.play('tick'); return true; }
  function leave() { focus = -1; draw(); }
  function handle(a) {
    if (focus < 0) return false;
    if (a === 'up') { if (focus > 0) { focus--; draw(); Sound.play('tick'); } else { leave(); NowPlaying.edge(); } }
    else if (a === 'down') { if (focus < rows.length - 1) { focus++; draw(); Sound.play('tick'); } else { leave(); Dock.edge(); } }
    else if (a === 'a') act(focus, 'go');
    else if (a === 'x') act(focus, 'pause');
    else if (a === 'y') act(focus, 'close');
    else if (a === 'right' || a === 'b') leave();
    return true;
  }

  // Keep it current: windows open and close, games freeze, and Bladedeck gains or loses focus.
  window.bladedeck.onPeek((ev) => { if (ev.kind === 'windows' || ev.kind === 'gone' || ev.kind === 'opened') setTimeout(refresh, 150); });
  window.bladedeck.onWebapps(() => setTimeout(refresh, 150));
  document.addEventListener('running-changed', refresh);
  addEventListener('focus', () => setTimeout(refresh, 300));
  timer = setInterval(() => { if (deckFocused()) refresh(); }, 4000);

  return { refresh, edge, handle, active: () => focus >= 0, visible: () => !el.hidden };
})();
