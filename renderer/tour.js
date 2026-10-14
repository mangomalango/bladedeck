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
  { icon: '📋', title: 'What is running', text: 'The Running list on the left always shows what you have going: your games with their art and whether each is Playing (green), Running behind, Paused (❄, frozen) or Minimized, then your open dock and web apps. Turn it off in Settings if you prefer.', keys: [['Go to it', 'push left past the first blade', 'point at it'], ['Switch to it', 'A', 'click it, or ▶'], ['Pause or resume a game', 'X', '❄ / ⏵'], ['Close it', 'Y', '✕']], show: () => Running.edge() },
  { icon: '📌', title: 'The dock', text: 'The round buttons on the left are your everyday apps: YouTube, music, chat and files. One press opens an app, brings it up, or tucks it away. Pick any apps with the ⋯ button: Spotify, Apple Music, Discord, Twitch and more. Websites open as clean app windows; YouTube opens in its TV mode, made for controllers.', keys: [['Go to the dock', 'push left past the first blade', 'point at it'], ['Open, bring up, or tuck away', 'A', 'click'], ['Minimize or close', 'X or Y', '– and ✕ on its card'], ['In a web app: back to Bladedeck', 'View', '']], show: () => Dock.edge() },
  { icon: '🪟', title: 'Floating panels', text: 'YouTube, the browser and Files open inside Bladedeck as floating panels: rounded, a little see-through, and yours to arrange. Move them, resize them, snap them to a half or a corner, and pin the ones you want to stay out while you use the menu. Where each sits is remembered.', keys: [['Use the panel', 'd-pad, A, B back, X play/pause', 'mouse and keys'], ['Arrange it', 'Menu, then ✛ move, LB/RB size, LT/RT snap, X pin, Y close', 'drag the bar, pull the corner'], ['Back to the menu', 'View', 'click the menu'], ['Type an address (browser)', 'Y', 'click the address']], show: () => Panels.show({ kind: 'files', key: 'files', title: 'Files', icon: '🗂' }) },
  { icon: '🔊', title: 'The sound card', text: 'Like a console\'s: the main volume, where sound plays (speakers, HDMI, headphones), your microphone, a slider for every app making sound, and Bladedeck\'s own music and ambience.', keys: [['Open it', 'Home button (Stadia, PS, Xbox)', 'V, or 🔊 at the top'], ['Choose and change', 'up/down, then left/right', 'arrows, or drag'], ['Mute', 'A', 'click the icon'], ['Volume down / up anywhere', '', '- and =']], show: () => Volume.open() },
  { icon: '❓', title: 'The guide flap', text: 'Stuck on a boss? Pull out the guide flap and ask. It answers from the game\'s own wikis, StrategyWiki and PCGamingWiki, shows how well it runs on Linux, and links YouTube, Reddit and Steam guides. It also explains Bladedeck. Pick which edge it opens from in Settings.', keys: [['Pull it out', 'hold LT, push the stick the way it opens', 'G, or drag the tab'], ['Push it shut', 'hold LT, push it back', 'drag the tab back'], ['Back, then away', 'B', 'Esc']], show: () => Guide.open('pad') },
  { icon: '♪', title: 'The quick menu', text: 'Pull out the quick menu for music, alerts and recordings without leaving what you are doing. Move between tabs with LB and RB, pause or skip songs, check recent notices, and see your clips. The other trigger pulls out the guide flap.', keys: [['Pull it out', 'hold RT, push the stick the way it opens', 'C, or drag the ♪ tab'], ['Next or previous tab', 'LB / RB', 'click a tab'], ['Back, then away', 'B', 'Esc']], show: () => Guide.open('pad', 'quick') },
  { icon: '📺', title: 'The walkthrough window', text: 'A small YouTube that floats over your game, searching for a walkthrough of whatever you are playing. It pops up without taking the controls from your game, and tucks away again (pausing the video) with the same button. The guide flap can open it for any question too.', keys: [['Pop it up or away (works in games)', 'View + Y', 'Ctrl+Alt+Y'], ['From a question', 'Guide flap, Watch in the walkthrough window', 'same']], show: () => walkthrough() },
  { icon: '⌨️', title: 'Typing with a controller', text: 'Every text box works from the controller. Bladedeck uses its own keyboard, so Steam\'s keyboard no longer pops up over things.', keys: [['Open the keyboard', 'A on a text box', 'just type'], ['Type / delete / space', 'A / X / Y', ''], ['Move the cursor', 'LB / RB', ''], ['Done', 'Start', 'Enter']] },
  { icon: '👥', title: 'Split screen', text: 'Play a PC game split screen with up to 4 people on one screen, even games without split screen, using PartyDeck (installed with one press). Each player gets their own part of the screen, controller and saves; the copies link up as if on a network, so the game needs online or LAN co-op. One Steam account is enough. Games with anti-cheat will not run this way.', keys: [['Play split screen', 'Start on a game, Split screen', 'Split screen in PC mode'], ['Pick a game', 'System, Split screen', '']], show: () => SplitScreen.open() },
  { icon: '🎬', title: 'Recording, clips and save states', text: 'Record any game, even from inside it, and keep the last moments ready: when something amazing happens, save the 30 seconds before it. On Linux this runs on the graphics card (GPU Screen Recorder, one press to install in Settings, Recording), so games keep their speed. Clips go to Videos/Bladedeck, show in Captures, and play behind the game in the menu. Emulated games have save states: the live panel shows the emulator\'s save and load keys.', keys: [['Record or stop (in games too)', 'View + X', 'Ctrl+Alt+R'], ['Save the last moments', 'View + RB', 'Ctrl+Alt+S'], ['Your clips', 'System, Captures', '']], show: () => Capture.gallery() },
  { icon: '⬇️', title: 'Get games', text: 'Free and legal: this week\'s Epic giveaways, free Steam and GOG games, thousands of free indie games on itch.io, classics their makers gave away (Beneath a Steel Sky, Daggerfall…), and new Game Boy homebrew that downloads straight into your library.', keys: [['Open it', 'System, Get games', 'Get games in PC mode']], show: () => Shop.open('free') },
  { icon: '🔎', title: 'Browse your sources', text: 'A clean catalogue of games and software from your sources. The Internet Archive is built in; add your favorite websites in Sources and Bladedeck searches them automatically. Pick an item to see its files and press Install: archives are unpacked into your library.', keys: [['Open', 'System, Games and library, Browse your sources', 'same'], ['Search', 'Y to type, A to search', 'click Search or press Enter'], ['Install a game', 'A on Install', 'click Install']], show: () => Finder.open() },
  { icon: '👾', title: 'Emulators and ROMs', text: 'One press installs an emulator (Flathub on Linux, winget on Windows) and sets it up; it gets its own tile on the Emulation blade. Put your own game dumps in Games/ROMs/<system> and they appear with box art.', keys: [['Install emulators', 'Get games, Emulators', 'System, Emulators'], ['Open an emulator', 'its tile on the Emulation blade', ''], ['Scan for games', 'System, Emulators, Scan', '']], show: () => Shop.open('emus') },
  { icon: '⛏', title: 'Minecraft', text: 'Play Minecraft: Java Edition through Prism Launcher. Every version and modpack is supported. Java Minecraft has no controller support on its own, so Bladedeck adds the Controlify mod with one press: buttons, rumble and the on-screen keyboard work immediately. Add your instances to the library to launch from your couch.', keys: [['Open', 'System, Gaming software, Minecraft', 'same'], ['Add controller support', 'A on Controller support', 'click Controller support'], ['Add to library', 'A on Add to library', 'click Add to library']], show: () => Minecraft.open() },
  { icon: '👀', title: 'Watched folders', text: 'Bladedeck watches your Games and Downloads folders. A ROM, an AppImage or a game folder dropped there joins the library by itself, with art. itch.io downloads are unpacked and added. Installers in Downloads are left alone.', keys: [['Change the folders', 'Settings, Watched folders', '']] },
  { icon: '🖼️', title: 'Artwork and achievements', text: 'Covers, backgrounds and logos come from Steam, libretro (for ROMs) and SteamGridDB. RetroAchievements shows your progress in emulated games. Both keys are free: Settings, Accounts.', keys: [['Pick art for a game', 'Y (Edit), then Artwork', 'Artwork in PC mode'], ['Fill in all missing art', 'System, Find missing art', ''], ['Achievements', 'left stick click', 'R']] },
  { icon: '⭐', title: 'Your profile, goals and journal', text: 'Playing earns XP and levels (see the bar under your name), and playing on days in a row builds a streak. When a game closes after 5 minutes or more, Bladedeck asks how it went: did you reach your goal, how did it feel, where are you up to, and what do you want to do next time. Your goal and note show when you pick the game, in the launch intro, and in the live panel, which also counts down to the next bonus.', keys: [['Your profile', 'System, Your profile', 'click your name'], ['Turn the check-in off', 'Your profile', '']], show: () => Player.profile() },
  { icon: '🖥', title: 'This PC', text: 'Processor, graphics, memory, temperatures, battery, storage and network at a glance, plus Wi-Fi, screen brightness, and sleep, restart, shut down and lock (press twice to be sure), all without leaving Bladedeck. It floats like the other panels.', keys: [['Open it', 'System, This PC', '']] },
  { icon: '🔔', title: 'Notifications and downloads', text: 'Every message Bladedeck shows is kept, so one that popped up mid-game is still there afterwards. Steam downloads and Bladedeck\'s own installs sit at the top with their progress.', keys: [['Open', 'System, Notifications', 'N or the bell'], ['Clear all', 'X', '']], show: () => Notify.open() },
  { icon: '🧩', title: 'Cheats and mods', text: 'Each emulated game gets its own folders for cheats, patches, texture packs and mods, in the place its emulator looks. Open them in Files, copy in something you downloaded, and keep notes on what you added.', keys: [['Open', 'Start on a game, Cheats & mods', 'Cheats & mods on the game']] },
  { icon: '🏠', title: 'Home picks', text: 'Home shows a few picks instead of everything: what you were playing, your big game, one with a goal, something short for tonight, one you have not tried, a favorite. They change each day. The last item takes you to all your games. Turn it off in Settings.', keys: [['All your games', 'last item on Home', '']] },
  { icon: '📡', title: 'Nearby', text: 'Other Bladedecks on the same Wi-Fi show up by themselves: who it is, their level, what they are playing, and the games you both have. Invite them to a game (it pops up on their screen with Join) or poke them. Nothing leaves your home network. Turn it off, or keep your game list private, in Settings.', keys: [['See who is around', 'System, Nearby', '']], show: () => Nearby.open() },
  { icon: '🌧', title: 'Night Drive', text: 'A theme with a car lapping a rainy figure-eight while the camera slowly cuts between shots: high above, down by the tyres, straight down, the driver\'s seat. Rain sounds play with Deep-sea ambience on. There may be a way to take the wheel.', keys: [['Choose it', 'Settings, Theme', '']] },
  { icon: '🎤', title: 'Voice commands', text: 'Tap 🎤, press View + LB, or Space (Ctrl+Alt+V works even in a game) and say something short: "open Hades", "open YouTube", "what\'s the weather", "set a timer for 10 minutes", "wake me up at 7:30", "next song", "go to the menu". It is worked out on this PC by a small speech model, never sent anywhere, and only listens after you press. Timers and alarms also ring on your phone.', keys: [['Talk', 'View + LB', 'Space, Ctrl+Alt+V or 🎤'], ['Turn it on', 'System, Voice commands', '']], show: () => Voice.setup() },
  { icon: '📤', title: 'Send files', text: 'Send a file to your phone (it shows in the phone app\'s Files tab), or to a friend\'s Bladedeck nearby (they are asked first). What your phone sends lands in Bladedeck/From phone, and friends\' files in Bladedeck/From friends. Every send asks you to confirm.', keys: [['Send a file', 'X on a file in Files', 'right-click a file'], ['Send files', 'System, Send files', '']], show: () => Transfer.open() },
  { icon: '🔒', title: 'Your files stay yours', text: 'Bladedeck only looks inside its own folder (Bladedeck in your home folder). To let it see another folder, press "Allow a folder…" in Files: the system asks you to confirm, and ✕ takes it back. Phones and friends only ever get the one file you send.', keys: [['Allow a folder', 'Files, Allow a folder…', '']] },
  { icon: '💾', title: 'Backup and restore', text: 'Everything you set in Bladedeck is backed up automatically each day you use it and every half hour while you change things. Backups are kept in your Bladedeck/Backups folder so they survive reinstalls. Go back to any point with one press, or export a single backup file for another PC.', keys: [['Open', 'System, Backup and restore', 'same'], ['Back up now', 'A on Back up now', 'click Back up now'], ['Restore a backup', 'A on Go back to this', 'click Go back to this']], show: () => Backup.open() },
  { icon: '🏞', title: 'Wallpaper', text: 'Put a wallpaper behind the menus: Wallpaper Engine\'s from Steam (video and web wallpapers play; scene wallpapers show their preview), or your own picture, GIF or video. Dim and blur keep the menus easy to read, and it stops while you play.', keys: [['Choose one', 'System, Wallpaper', '']], show: () => Wallpaper.open() },
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
    // Then, once: the optional extras worth turning on.
    if (!S.lib.settings.extrasSeen) setTimeout(() => { if (!S.modal) Extras.open(); }, 700);
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
  function maybeOffer() { if ((S.lib.settings.tourSeen || 0) < TOUR.length) setTimeout(() => { if (!S.modal) open(0); }, 3800); }

  return { open, close, handle, maybeOffer, isOpen: () => on };
})();
