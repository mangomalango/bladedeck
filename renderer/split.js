'use strict';
/* Split screen: up to four players on one PC, each with their own part of the screen, their own
   controller and their own saves, using PartyDeck. It runs a copy of the game per player and joins
   them through an emulated Steam network, so it needs a game with online or LAN multiplayer
   (not story-only games, and not games with anti-cheat). One Steam account is enough.
   Open it from a game's Tasks (Start), PC mode's Split screen button, or System, Split screen.
   Uses S, api, esc, toast, openModal, closeModal, Sound, cover, Intro, Capture and $ at call time. */

const SplitScreen = (() => {
  async function status() { return api.splitStatus(); }

  // Without a game: pick one first.
  function pick() {
    const games = S.lib.entries.filter((e) => !e.hidden && ['steam', 'exe', 'gog', 'recomp'].includes(e.type))
      .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || a.title.localeCompare(b.title)).slice(0, 60);
    openModal({
      title: 'Split screen: pick a game', wide: true,
      html: `<p class="note">Games with online or LAN co-op work best. Most played first.</p>
        <div class="sp-grid">${games.map((e) => `<button type="button" class="sp-g" data-id="${esc(e.id)}"><span class="sp-art">${cover(e)}</span><b>${esc(e.title)}</b></button>`).join('')}</div>`,
      buttons: [{ label: 'Cancel' }],
      onOpen: (root) => root.addEventListener('click', (ev) => { const b = ev.target.closest('[data-id]'); if (b) { const e = S.lib.entries.find((x) => x.id === b.dataset.id); closeModal(); setTimeout(() => open(e), 0); } })
    });
  }

  /* A guided setup, three steps on one screen, remembered per game (e.split):
       1. What split screen needs on this PC, with a button for anything missing.
       2. Controllers: one per player, counted live as they are plugged in.
       3. How this game starts: straight in (PartyDeck runs the game for each player), or through
          a ready-made setup ("handler") picked in PartyDeck's own screen; plus launch options.
     A game that has been set up opens on a short "ready" version with Start first. */
  const pads = () => [...(navigator.getGamepads?.() || [])].filter(Boolean).length;
  async function open(e, full) {
    if (!e) { pick(); return; }
    const st = await status();
    if (!st.linux) { toast('PartyDeck is for Linux. On Windows, Nucleus Co-op does the same thing: splitscreen.me.', 'err'); return; }
    if (e.type === 'rom') { toast('Emulated games have their own multiplayer: plug in more controllers and start the game as usual.'); return; }
    const handlers = st.installed ? await api.splitHandlers().catch(() => []) : [];
    const cfg = { mode: 'exec', handler: '', args: '', ...(e.split || {}) };
    const need = [
      ['PartyDeck', st.installed, 'install'],
      ['Gamescope (draws each player\'s part of the screen)', st.gamescope, 'gamescope'],
      ['Bubblewrap (keeps each player\'s controller to their own copy)', st.bwrap, 'bubblewrap']
    ];
    const ready = need.every((n) => n[1]);
    const short = ready && e.split && !full;
    const guess = handlers.find((h) => norm(h.name).includes(norm(e.title)) || norm(e.title).includes(norm(h.name)));
    const steps = `
        <div class="sp-step"><b>1 · This PC</b><ul class="sp-need">${need.map(([label, ok, what]) => `<li class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${esc(label)}${ok ? '' : what === 'install' ? ' <button type="button" data-sp="install">Install</button>' : ` <small>install the "${what}" package</small>`}</li>`).join('')}</ul></div>
        <div class="sp-step"><b>2 · Controllers</b><p class="sp-pads"><span class="sp-n">${pads()}</span> connected. Each player needs their own; plug them in now (up to 4).</p></div>
        <div class="sp-step"><b>3 · How ${esc(e.title)} starts</b>
          <label class="sp-opt"><input type="radio" name="spMode" value="exec" ${cfg.mode !== 'handler' ? 'checked' : ''}> <span><b>Straight in</b> PartyDeck runs the game once per player and links them like a LAN. Works for most games with LAN or online co-op.</span></label>
          <label class="sp-opt"><input type="radio" name="spMode" value="handler" ${cfg.mode === 'handler' ? 'checked' : ''}> <span><b>With a game setup</b> Some games need a ready-made setup (a .pd2 "handler") imported in PartyDeck. PartyDeck opens on its own screen; pick the setup there.${handlers.length ? ` Installed: ${handlers.map((h) => esc(h.name)).join(', ')}.` : ' None installed yet.'}${guess ? ` <b>${esc(guess.name)}</b> looks like this game's.` : ''}</span></label>
          <label>Launch options for the game (optional)<input type="text" name="spArgs" value="${esc(cfg.args)}" placeholder="for example -windowed"></label></div>`;
    openModal({
      title: `Split screen: ${e.title}`, wide: true,
      html: `<div class="sp">
        <div class="sp-top"><span class="sp-art big">${cover(e)}</span><div>
          <p><b>Up to 4 players on this screen,</b> each with their own part of the screen, controller and saves.</p>
          ${short ? `<p class="sp-ready">Set up: ${cfg.mode === 'handler' ? 'with a game setup' : 'straight in'}${cfg.args ? ` · options ${esc(cfg.args)}` : ''} · <span class="sp-n">${pads()}</span> controllers connected.</p>
            <ol class="sp-steps"><li>Press <b>Start</b>.</li><li>In PartyDeck, each player presses a button on their controller to join, then picks a profile (it keeps their saves).</li><li>In the game, one player hosts and the others join over LAN.</li></ol>` : ''}
        </div></div>
        ${short ? '' : steps}
        <p class="note">Games with anti-cheat refuse to run this way. One Steam account is enough.</p></div>`,
      buttons: [
        ...(short ? [{ label: 'Change setup', left: true, onClick: () => { closeModal(); setTimeout(() => open(e, true), 0); return false; } }] : [{ label: 'Game setups (handlers)', left: true, onClick: () => { api.openLink('https://drive.proton.me/urls/D9HBKM18YR#zG8XC8yVy9WL'); toast('Opened the handler downloads in your browser. Import one in PartyDeck, then come back.'); return false; } }]),
        { label: 'Cancel' },
        ...(ready ? [{ label: short ? 'Start' : 'Save and start', primary: true, onClick: (root) => {
          if (!short) { e.split = { mode: $('[name=spMode]:checked', root)?.value === 'handler' ? 'handler' : 'exec', args: val(root, 'spArgs') }; save(); }
          start(e);
        } }] : [])
      ],
      onOpen: (root) => {
        // The controller count follows plugging in and out while this is open.
        const tick = setInterval(() => { if (!root.isConnected || !S.modal) { clearInterval(tick); return; } root.querySelectorAll('.sp-n').forEach((n) => { n.textContent = pads(); }); }, 700);
        root.addEventListener('click', async (ev) => {
          const b = ev.target.closest('[data-sp="install"]'); if (!b) return;
          b.disabled = true; b.textContent = 'Installing…';
          const r = await api.emuGhInstall('partydeck');
          if (!r.ok) { toast(`PartyDeck did not install: ${r.error}`, 'err'); b.disabled = false; b.textContent = 'Install'; return; }
          toast('PartyDeck is installed.', 'fun'); closeModal(); setTimeout(() => open(e, true), 0);
        });
      }
    });
  }
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  async function start(e) {
    const r = await api.splitLaunch({ entry: e, steamPath: S.lib.settings.steamPath, mode: e.split?.mode || 'exec', args: e.split?.args || '' });
    if (!r.ok) { toast(r.error, 'err'); return; }
    Sound.play('go');
    Intro.play(e);
    toast(e.split?.mode === 'handler' ? 'PartyDeck is opening. Pick this game\'s setup, then each player presses a button to join.' : 'PartyDeck is starting. Each player presses a button to join.', 'fun');
    // A session like any other: playtime, the Running list, recording.
    e.lastPlayed = Date.now(); save();
    S.playing = { id: e.id, t: Date.now(), pid: r.pid, tracked: true, split: true };
    S.sessions = [...S.sessions.filter((x) => x.id !== e.id), S.playing];
    Capture.sessionStarted();
  }

  return { open, pick, status };
})();
