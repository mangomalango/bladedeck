'use strict';
/* Steam Input for every game, the menu's side (steamlink.js in main does the work): keep Steam's
   list of Bladedeck's games current, and when new ones can only be added by restarting Steam, ask
   once (never during a game or over another window). Settings, Games turns it off.
   Uses S, api, toast, openModal and Players at call time. */

const SteamLink = (() => {
  const KINDS = ['exe', 'recomp', 'gog', 'rom'];
  let asked = false, sig = '', timer = 0, pendingAsk = 0;
  const on = () => S.lib && S.lib.settings.steamInput !== false && !Players.isP2();

  // What the launch scripts are made from: when none of it changed, there is nothing to do.
  function signature() {
    const st = S.lib.settings;
    return JSON.stringify([S.lib.entries.filter((e) => KINDS.includes(e.type)).map((e) => [e.id, e.title, e.hidden, e.exe, e.args, e.cwd, e.env, e.emulatorId, e.rom, e.oneCore, e.cover]),
      S.lib.emulators.map((x) => [x.id, x.exe, x.args]), st.wineCommand, st.gamemode, st.shaderCache, st.padBackground]);
  }

  async function sync() {
    if (!on()) return;
    const r = await api.steamlinkSync().catch(() => null);
    if (!r) return;
    if (r.steamRunning && r.pending && !asked) { pendingAsk = r.pending; ask(); }
  }
  function ask() {
    if (!pendingAsk || asked) return;
    // Not during a game, and not over something the player is doing.
    if (S.playing || S.modal) { setTimeout(ask, 20000); return; }
    asked = true;
    const n = pendingAsk;
    openModal({
      title: 'Steam Input for every game',
      html: `<p>${n} ${n === 1 ? 'game is' : 'games are'} new to Steam. Bladedeck starts games through Steam so Steam Input works with every controller, and Steam only takes new games while it is closed.</p>
        <p class="note">Steam closes and opens again in the background (about 10 seconds). Your own non-Steam games in Steam stay as they are, and a copy of Steam's list is kept first. Until then, these games start the usual way.</p>`,
      buttons: [
        { label: 'Later', left: true },
        { label: 'Restart Steam', primary: true, onClick: () => {
          toast('Restarting Steam…');
          api.steamlinkRestart().then((r) => toast(r && r.ok ? 'Done: your games start through Steam now, with Steam Input.' : (r && r.error) || 'Steam could not be restarted.', r && r.ok ? 'fun' : 'err'));
        } }
      ]
    });
  }

  function check() {
    if (!on()) return;
    const s = signature(); if (s === sig) return;
    sig = s; clearTimeout(timer); timer = setTimeout(sync, 4000);
  }
  setTimeout(() => { if (S.lib) { sig = signature(); sync(); } }, 8000);
  setInterval(check, 15000);

  return { sync, check, restart: () => { asked = false; pendingAsk = 1; return api.steamlinkRestart(); } };
})();
