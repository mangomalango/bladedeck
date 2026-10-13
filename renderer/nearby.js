'use strict';
/* Nearby: other Bladedecks on the same home network (lan.js in main). Shows who is around, what
   they are playing and their level, the games you both have (if they share their list), and lets
   you invite them to a game or poke them. An invite pops up on their screen with Join, which
   starts the same game there (if they have it). Turn it off in Settings, "Show me to other
   Bladedecks"; "Share my game list" is separate. System, Nearby opens it.
   Uses S, api, esc, toast, openModal, closeModal, Sound, cover, launch and $ at call time. */

const Nearby = (() => {
  let peers = [];
  const norm = (t) => String(t || '').toLowerCase().replace(/[™®©:'’!.,-]/g, '').replace(/\s+/g, ' ').trim();
  const games = () => S.lib.entries.filter((e) => !e.hidden && e.type !== 'app' && !e.emuApp);
  const mine = (g) => g && (S.lib.entries.find((e) => g.appid && e.type === 'steam' && String(e.appid) === g.appid) || S.lib.entries.find((e) => norm(e.title) === norm(g.title)));
  const both = (p) => { if (!p.titles) return null; const set = new Set(p.titles.map(norm)); return games().filter((e) => set.has(norm(e.title))); };

  // What this Bladedeck tells the others. Sent again whenever it changes (cheap: one small packet).
  let last = '';
  function announce() {
    const st = S.lib.settings, p = S.playing, e = p && S.lib.entries.find((x) => x.id === p.id);
    const info = { enabled: st.lanOn !== false, name: st.playerName || 'Player', level: Player.levelOf(st.player?.xp || 0), share: st.lanShare !== false,
      playing: e ? { title: e.title, appid: e.type === 'steam' ? String(e.appid || '') : '' } : null, titles: games().map((x) => x.title) };
    const key = JSON.stringify([info.enabled, info.name, info.level, info.share, info.playing, info.titles.length]);
    if (key === last) return; last = key;
    api.lanSet(info);
  }
  setTimeout(announce, 3000);
  setInterval(announce, 5000);

  window.bladedeck.onLanPeers((list) => { peers = list || []; draw(); });
  window.bladedeck.onLanEvent((ev) => {
    if (ev.kind === 'arrived') toast(`${ev.name} is on Bladedeck nearby.`);
    else if (ev.kind === 'poke') { toast(`👉 ${ev.from} poked you from nearby.`, 'fun'); Sound.play('secret'); }
    else if (ev.kind === 'invite') invited(ev);
  });

  function invited(ev) {
    const e = mine(ev.game);
    Sound.play('secret');
    if (S.modal) { toast(`🎮 ${ev.from} invites you to play ${ev.game?.title || 'a game'}. Open System, Nearby to answer.`, 'fun'); return; }
    openModal({
      title: `${ev.from} invites you to play`,
      html: `<div class="nb-inv">${e ? `<span class="nb-art">${cover(e)}</span>` : ''}<p><b>${esc(ev.game?.title || 'A game')}</b></p>
        <p class="note">${e ? 'You have it. Join to start it now, then meet them in the game (LAN or online).' : 'This game is not in your library.'}</p></div>`,
      buttons: [{ label: 'Not now' }, ...(e ? [{ label: 'Join', primary: true, onClick: () => { closeModal(); S.sel = e; launch(e); return false; } }] : [])]
    });
  }

  function draw() {
    const root = $('.nb'); if (!root) return;
    const st = S.lib.settings;
    root.innerHTML = st.lanOn === false ? '<p class="note">Nearby is off. Turn on "Show me to other Bladedecks" in Settings.</p>'
      : peers.length ? peers.map((p) => {
        const b = both(p), g = p.playing && mine(p.playing);
        return `<div class="nb-p" data-peer="${esc(p.id)}">
          <div class="nb-who"><b>${esc(p.name)}</b><span>Level ${p.level}${p.pc ? ` · ${esc(p.pc)}` : ''}</span></div>
          <div class="nb-now">${p.playing ? `🎮 Playing <b>${esc(p.playing.title)}</b>${g ? ' · you have it' : ''}` : 'In the menus'}</div>
          ${b ? `<div class="nb-both">${b.length ? `${b.length} games you both have: ${b.slice(0, 8).map((e) => `<button type="button" data-inv="${esc(e.id)}">${esc(e.title)}</button>`).join('')}` : 'No games in common yet.'}</div>` : '<div class="nb-both note">They keep their game list to themselves.</div>'}
          <div class="nb-act">${g ? `<button type="button" data-join="${esc(g.id)}">Join their game</button>` : ''}${S.playing ? '<button type="button" data-inv="playing">Invite to my game</button>' : ''}<button type="button" data-poke>👉 Poke</button></div></div>`;
      }).join('') : '<p class="note">Nobody nearby yet. Other Bladedecks on this Wi-Fi show up here within a few seconds.</p>';
  }

  async function open() {
    peers = await api.lanPeers().catch(() => []);
    openModal({
      title: 'Nearby', wide: true,
      html: '<div class="nb"></div><p class="note">Bladedecks on the same network. Nothing leaves your home network, and invites only ever ask.</p>',
      buttons: [{ label: 'Close', primary: true }],
      onOpen: (root) => {
        draw();
        root.addEventListener('click', async (ev) => {
          const card = ev.target.closest('[data-peer]'); if (!card) return;
          const id = card.dataset.peer, t = ev.target.closest('button'); if (!t) return;
          if (t.hasAttribute('data-poke')) { await api.lanSend(id, { kind: 'poke' }); toast('Poked.'); Sound.play('pop'); return; }
          if (t.dataset.join) { const e = S.lib.entries.find((x) => x.id === t.dataset.join); closeModal(); S.sel = e; launch(e); return; }
          if (t.dataset.inv) {
            const e = t.dataset.inv === 'playing' ? S.lib.entries.find((x) => x.id === S.playing?.id) : S.lib.entries.find((x) => x.id === t.dataset.inv);
            if (!e) return;
            await api.lanSend(id, { kind: 'invite', game: { title: e.title, appid: e.type === 'steam' ? String(e.appid || '') : '' } });
            toast(`Invited them to ${e.title}.`, 'fun'); Sound.play('pop');
          }
        });
      }
    });
  }

  return { open, announce, peers: () => peers };
})();
