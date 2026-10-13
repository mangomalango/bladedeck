'use strict';
/* Tour: every feature, one card at a time, with the buttons for a controller and a keyboard,
   and a "Show me" that opens the real thing. It runs once on its own after an update that adds
   it, and is always in System, Tour, in the Guide flap and on the Controls screen.
   Controller: left and right (or A) move, X shows me, B closes. Uses S, save, esc, Sound and
   the feature modules at call time. */

const TOUR = [
  { icon: '👋', title: 'Welcome to Bladedeck', text: 'Your games, apps and emulators in one console-style menu that works from the couch with just a controller or a TV remote, or from the desk with a mouse and keyboard. This tour covers everything, a card at a time.', keys: [['Next card', 'right or A', '→ or Enter'], ['Close the tour', 'B', 'Esc']] },
  { icon: '🗂️', title: 'Blades and games', text: 'Blades are the tall tabs: Home, Games, Steam, Emulation, PC, Apps and System. Move between them and pick a game. Home keeps your favorites and what you played last.', keys: [['Next or previous blade', 'left / right, or LB / RB', '← → or Page Up / Down'], ['Pick a game', 'up / down', '↑ ↓'], ['Play it', 'A', 'Enter'], ['Favorite it', 'X', 'F'], ['Edit it (art, name, launch options)', 'Y', 'E'], ['Tasks and looks for it', 'Start', 'T']] },
  { icon: '🖥️', title: 'Console mode and PC mode', text: 'Console mode is the big-screen menu. PC mode is a library manager with a grid, search and buttons for everything. Switch any time.', keys: [['Switch modes', 'tap View', 'F10'], ['Search the library (PC mode)', 'RB', 'Ctrl+F or /']], show: () => setMode(S.mode === 'console' ? 'pc' : 'console') },
  { icon: '🚀', title: 'Starting a game', text: 'A blade sweeps in with the game and a random sponsor (an angry monkey, a goat that screams…), then goes up in steam. Bladedeck stays over Steam\'s "launching" pop-ups until the game is ready. Turn the intro off in Settings.', keys: [['Skip the intro', 'any button', 'any key or click'], ['See what Steam is asking', 'X', 'X']], show: () => { const e = S.lib.entries.find((x) => x.type !== 'app' && (x.cover || x.hero)) || S.lib.entries[0]; if (e) Intro.play(e); } },
  { icon: '↩️', title: 'Jump out of a game and back', text: 'While playing, jump to Bladedeck: the game shrinks into a panel on the left. Jump back and it fills the screen again. Highlight the panel and press X to watch it live.', keys: [['Out to Bladedeck, and back', 'View + Menu together', 'Ctrl+M'], ['Back into the game', 'left onto the panel, then A', 'click the panel'], ['Live view of the game', 'X on the panel', 'Show live view']] },
  { icon: '▣', title: 'Quick Resume', text: 'Run several games and apps at once and hop between them. The first card is always the last thing you were in, so going back and forth is one press. Freeze a game to stop it exactly where it is: it keeps its place but uses no processor or graphics until you thaw it. Turn on "Freeze games when I switch away" to do that by itself.', keys: [['Open Quick Resume', 'hold View', 'Q, or ▣ at the top'], ['Switch to it', 'A', 'click it'], ['Freeze or thaw', 'X', 'right-click it'], ['Close it', 'Y', '']], show: () => Resume.open() },
  { icon: '📌', title: 'The dock', text: 'The round buttons on the left are your everyday apps: YouTube, music, chat and files. One press opens an app, brings it up, or tucks it away. Pick any apps with the ⋯ button: Spotify, Apple Music, Discord, Twitch and more. Websites open as clean app windows; YouTube opens in its TV mode, made for controllers.', keys: [['Go to the dock', 'push left past the first blade', 'point at it'], ['Open, bring up, or tuck away', 'A', 'click'], ['Minimize or close', 'X or Y', '– and ✕ on its card'], ['In a web app: back to Bladedeck', 'View', '']], show: () => Dock.edge() },
  { icon: '🔊', title: 'The sound card', text: 'Like a console\'s: the main volume, where sound plays (speakers, HDMI, headphones), your microphone, a slider for every app making sound, and Bladedeck\'s own music and ambience.', keys: [['Open it', 'Home button (Stadia, PS, Xbox)', 'V, or 🔊 at the top'], ['Choose and change', 'up/down, then left/right', 'arrows, or drag'], ['Mute', 'A', 'click the icon'], ['Volume down / up anywhere', '', '- and =']], show: () => Volume.open() },
  { icon: '❓', title: 'The guide flap', text: 'Stuck on a boss? Pull out the guide flap and ask. It answers from the game\'s own wikis, StrategyWiki and PCGamingWiki, shows how well it runs on Linux, and links YouTube, Reddit and Steam guides. It also explains Bladedeck. Pick which edge it opens from in Settings.', keys: [['Pull it out', 'hold LT, push the stick the way it opens', 'G, or drag the tab'], ['Push it shut', 'hold LT, push it back', 'drag the tab back'], ['Back, then away', 'B', 'Esc']], show: () => Guide.open('pad') },
  { icon: '⌨️', title: 'Typing with a controller', text: 'Every text box works from the controller. Bladedeck uses its own keyboard, so Steam\'s keyboard no longer pops up over things.', keys: [['Open the keyboard', 'A on a text box', 'just type'], ['Type / delete / space', 'A / X / Y', ''], ['Move the cursor', 'LB / RB', ''], ['Done', 'Start', 'Enter']] },
  { icon: '⬇️', title: 'Get games', text: 'Free and legal: this week\'s Epic giveaways, free Steam and GOG games, thousands of free indie games on itch.io, classics their makers gave away (Beneath a Steel Sky, Daggerfall…), and new Game Boy homebrew that downloads straight into your library.', keys: [['Open it', 'System, Get games', 'Get games in PC mode']], show: () => Shop.open('free') },
  { icon: '👾', title: 'Emulators and ROMs', text: 'One press installs an emulator (Flathub on Linux, winget on Windows) and sets it up; it gets its own tile on the Emulation blade. Put your own game dumps in Games/ROMs/<system> and they appear with box art.', keys: [['Install emulators', 'Get games, Emulators', 'System, Emulators'], ['Open an emulator', 'its tile on the Emulation blade', ''], ['Scan for games', 'System, Emulators, Scan', '']], show: () => Shop.open('emus') },
  { icon: '👀', title: 'Watched folders', text: 'Bladedeck watches your Games and Downloads folders. A ROM, an AppImage or a game folder dropped there joins the library by itself, with art. itch.io downloads are unpacked and added. Installers in Downloads are left alone.', keys: [['Change the folders', 'Settings, Watched folders', '']] },
  { icon: '🖼️', title: 'Artwork and achievements', text: 'Covers, backgrounds and logos come from Steam, libretro (for ROMs) and SteamGridDB. RetroAchievements shows your progress in emulated games. Both keys are free: Settings, Accounts.', keys: [['Pick art for a game', 'Y (Edit), then Artwork', 'Artwork in PC mode'], ['Fill in all missing art', 'System, Find missing art', ''], ['Achievements', 'left stick click', 'R']] },
  { icon: '🎨', title: 'Themes', text: 'Sky Bubbles lets you pop bubbles. Aero Aquarium has fish that eat the flakes you earn by playing, grow up and have babies you name. Game takes its colors and background from whatever game is highlighted. Plus Look and menus for fonts, letters, size and tab icons.', keys: [['Next theme', 'System, Next theme', ''], ['Feed the fish', 'System, Aquarium, Feed', 'click the water'], ['Look and menus', 'System, Look and menus', '']] },
  { icon: '🎵', title: 'Music', text: 'Your own music folder plays behind the menus and stops when a game starts (or keeps going, if you like).', keys: [['Play or pause', 'right stick click', 'M'], ['Previous / next song', 'tap LT / RT', '[ / ]'], ['Song list', 'System, Music', '☰ at the top']] },
  { icon: '⚡', title: 'Faster starts', text: 'Bladedeck starts Steam quietly when it opens, gives games a big shader cache, and can use GameMode. In Steam, turn on Shader Pre-Caching so games stop compiling shaders while you wait.', keys: [['Settings', 'Settings, Faster starts', '']] },
  { icon: '🤫', title: 'Secrets', text: 'Some things are not on any list. Try doing things you are not supposed to, like slamming from one end of the menu to the other. A small mechanic may need to hammer it back together.', keys: [['Break the menu', 'slam end to end', 'slam end to end'], ['Fix it', 'mash A', 'mash Enter']] },
  { icon: '🏁', title: 'That\'s everything', text: 'Find this tour again any time in System, Tour, or from the Guide flap. F1 (or System, Controls) lists every button.', keys: [['Every button', 'System, Controls', 'F1 or ?']] }
];

const Tour = (() => {
  const el = document.createElement('div');
  el.id = 'tour'; el.hidden = true;
  document.body.appendChild(el);
  let i = 0, on = false;

  function draw() {
    const t = TOUR[i];
    el.innerHTML = `<div class="tr-card">
      <div class="tr-top"><span>${i + 1} of ${TOUR.length}</span><button type="button" class="tr-x" data-t="close" aria-label="Close">✕</button></div>
      <div class="tr-ic">${t.icon}</div>
      <h2>${esc(t.title)}</h2>
      <p>${esc(t.text)}</p>
      ${t.keys?.length ? `<table class="ctl tr-keys"><thead><tr><th></th><th>Controller</th><th>Keyboard</th></tr></thead><tbody>${t.keys.map(([w, p, k]) => `<tr><td>${esc(w)}</td><td>${p ? esc(p) : '<span class="dim">—</span>'}</td><td>${k ? esc(k) : '<span class="dim">—</span>'}</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="tr-dots">${TOUR.map((_, j) => `<i class="${j === i ? 'on' : ''}" data-j="${j}"></i>`).join('')}</div>
      <div class="tr-foot">
        <button type="button" data-t="prev" ${i ? '' : 'disabled'}>‹ Back</button>
        ${t.show ? '<button type="button" data-t="show"><i class="pad x">X</i> Show me</button>' : ''}
        <button type="button" class="primary" data-t="next">${i === TOUR.length - 1 ? 'Done' : 'Next ›'}</button>
      </div></div>`;
  }

  function open(at = 0) {
    i = Math.max(0, Math.min(TOUR.length - 1, at)); on = true;
    el.hidden = false; draw(); requestAnimationFrame(() => el.classList.add('open'));
    Sound.play('pop');
  }
  function close() {
    if (!on) return;
    on = false; el.classList.remove('open'); setTimeout(() => { if (!on) el.hidden = true; }, 250);
    S.lib.settings.tourSeen = TOUR.length; save();
  }
  function go(d) { const n = i + d; if (n < 0) return; if (n >= TOUR.length) { close(); return; } i = n; Sound.play('tick'); draw(); }
  // Show the real thing; the tour steps aside and comes back where it was when that closes.
  function show() {
    const t = TOUR[i]; if (!t.show) return;
    const at = i; close();
    setTimeout(() => {
      t.show();
      const back = setInterval(() => {
        const busy = S.modal || Resume.isOpen() || Volume.isOpen() || Guide.isOpen() || Intro.playing() || Dock.active();
        if (!busy) { clearInterval(back); setTimeout(() => open(at), 400); }
      }, 500);
      setTimeout(() => clearInterval(back), 120000);
    }, 260);
  }

  function handle(a) {
    if (!on) return false;
    if (a === 'right' || a === 'a' || a === 'rb') go(1);
    else if (a === 'left' || a === 'lb') go(-1);
    else if (a === 'x') show();
    else if (a === 'b' || a === 'start' || a === 'back') close();
    return true;
  }
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-t]'), d = ev.target.closest('[data-j]');
    if (d) { i = +d.dataset.j; draw(); return; }
    if (!b) return;
    ({ close, prev: () => go(-1), next: () => go(1), show })[b.dataset.t]?.();
  });
  addEventListener('keydown', (ev) => {
    if (!on) return;
    const a = { ArrowRight: 'right', ArrowLeft: 'left', Enter: 'a', Escape: 'b', x: 'x' }[ev.key];
    if (a) { ev.preventDefault(); ev.stopImmediatePropagation(); handle(a); }
  }, true);

  // New features since the last time it was seen: offer it once.
  function maybeOffer() { if ((S.lib.settings.tourSeen || 0) < TOUR.length) setTimeout(() => { if (!S.modal) open(0); }, 1800); }

  return { open, close, handle, maybeOffer, isOpen: () => on };
})();
