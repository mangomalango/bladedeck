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

  async function open(e) {
    if (!e) { pick(); return; }
    const st = await status();
    const ready = st.linux && st.installed;
    const warn = [];
    if (!st.linux) warn.push('PartyDeck is for Linux. On Windows, Nucleus Co-op does the same thing: splitscreen.me.');
    if (st.linux && !st.bwrap) warn.push('Bubblewrap (bwrap) is not installed, so players\' controllers may not stay separate. Install the "bubblewrap" package.');
    if (st.linux && !st.gamescope) warn.push('Gamescope is not installed; PartyDeck needs it. Install the "gamescope" package.');
    if (e.type === 'rom') warn.push('Emulated games have their own multiplayer: plug in more controllers and start the game as usual.');
    openModal({
      title: `Split screen: ${e.title}`, wide: true,
      html: `<div class="sp">
        <div class="sp-top"><span class="sp-art big">${cover(e)}</span><div>
          <p><b>Up to 4 players on this screen.</b> Each player gets their own part of the screen, their own controller and their own saves. PartyDeck starts a copy of the game for each player and links them as if they were on a network.</p>
          <ol class="sp-steps"><li>Press <b>Start split screen</b>.</li><li>In PartyDeck, each player presses a button on their controller to join.</li><li>Pick a profile for each player (it keeps their saves), then start.</li><li>In the game, one player hosts and the others join over LAN or online co-op.</li></ol>
        </div></div>
        ${warn.map((w) => `<p class="note sp-warn">${esc(w)}</p>`).join('')}
        <p class="note">Works with games that have online or LAN co-op. Games with anti-cheat refuse to run this way. Some games need a ready-made setup (a "handler", a .pd2 file) imported in PartyDeck first.</p>
        <div class="sp-status">${st.installed ? '✓ PartyDeck is installed.' : st.linux ? 'PartyDeck is not installed yet.' : ''}</div></div>`,
      buttons: [
        ...(st.linux && !st.installed ? [{ label: 'Install PartyDeck', onClick: async (root, btn) => { btn.textContent = 'Installing…'; const r = await api.emuGhInstall('partydeck'); if (!r.ok) { toast(`PartyDeck did not install: ${r.error}`, 'err'); btn.textContent = 'Install PartyDeck'; return false; } toast('PartyDeck is installed.', 'fun'); closeModal(); setTimeout(() => open(e), 0); return false; } }] : []),
        ...(st.linux ? [{ label: 'Game setups (handlers)', left: true, onClick: () => { api.openLink('https://drive.proton.me/urls/D9HBKM18YR#zG8XC8yVy9WL'); toast('Opened the handler downloads in your browser.'); return false; } }] : []),
        { label: 'Cancel' },
        ...(ready && e.type !== 'rom' ? [{ label: 'Start split screen', primary: true, onClick: () => { start(e); } }] : [])
      ]
    });
  }

  async function start(e) {
    const r = await api.splitLaunch({ entry: e, steamPath: S.lib.settings.steamPath });
    if (!r.ok) { toast(r.error, 'err'); return; }
    Sound.play('go');
    Intro.play(e);
    toast('PartyDeck is starting. Each player presses a button to join.', 'fun');
    // A session like any other: playtime, the Running list, recording.
    e.lastPlayed = Date.now(); save();
    S.playing = { id: e.id, t: Date.now(), pid: r.pid, tracked: true, split: true };
    S.sessions = [...S.sessions.filter((x) => x.id !== e.id), S.playing];
    Capture.sessionStarted();
  }

  return { open, pick, status };
})();
