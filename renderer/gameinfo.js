'use strict';
/* About a game (gameinfo.js in main): what kind of game it is, its story, how it plays with
   other people, and split screen, in a few short lines under the game's details. Each game is
   asked for once per run; main keeps what it found.
   Uses S, api, esc and TYPES at call time. */
const GameInfo = (() => {
  const memo = new Map();
  const on = () => S.lib.settings.gameInfo !== false;
  // Split screen of its own, or Bladedeck's (PartyDeck, Linux only) for PC games.
  const canSplit = (e) => !navigator.userAgent.includes('Windows') && ['steam', 'exe', 'gog', 'recomp'].includes(e.type);
  function html(e, i) {
    const split = i.split === 'yes' ? 'Yes, on one screen' : i.split === 'no' ? `No${canSplit(e) ? ' (👥 Split screen can still try it)' : ''}` : 'Not known';
    return [
      i.kind && `<p><b>🎮 ${esc(i.kind)}</b>${i.play ? ` · ${esc(i.play)}` : ''}</p>`,
      i.story && `<p>📖 ${esc(i.story)}</p>`,
      i.multi && `<p>👥 ${esc(i.multi)}</p>`,
      `<p>📺 Split screen: ${esc(split)}</p>`
    ].filter(Boolean).join('');
  }
  // Fills the box when the answer comes, if that game is still the one shown.
  function fill(e, el) {
    if (!el || !e || e.run || !on()) return;
    const put = (i) => { if (el.isConnected && el.dataset.id === e.id) { el.innerHTML = i ? html(e, i) : ''; el.hidden = !i; } };
    if (memo.has(e.id)) { put(memo.get(e.id)); return; }
    el.hidden = true;
    api.gameInfo({ id: e.id, type: e.type, title: e.title, appid: e.appid }).then((i) => { memo.set(e.id, i || null); put(i); }).catch(() => {});
  }
  const box = (e) => (e && !e.run && on() ? `<div class="ginfo" data-id="${esc(e.id)}" hidden></div>` : '');
  return { fill, box, forget: (id) => memo.delete(id) };
})();
