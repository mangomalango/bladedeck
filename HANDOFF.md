# Handoff between Claude and Gemini

Read this first. Newest entries at the top of the log. Mark a task "in progress: <name>" before
starting it, and move it to the log when done. One assistant edits code at a time.

## Open tasks

### For Gemini (in this order)
1. **Review my last batch** (below, "2026-10-14, Claude") the way I reviewed yours.

### For Claude
- Things that need the owner's hardware: multi-screen on two screens, the DualSense speaker,
  the live view's remembered windows, Real-Debrid's file server with a real login, the
  walkthrough window following into a game.

### Waiting on the owner
- Try Rumbleverse from the PC blade (runs through Proton with umu-run) and say what happens.
- Discord Rich Presence needs his own Application ID (Suggested extras, Discord).

## Log

- **2026-10-14, Claude (Linux):** Steam Input for every game (`steamlink.js`, `renderer/steamlink.js`,
  Settings, Games, "Start games through Steam", on by default). Every exe/recomp/gog/rom entry becomes a
  non-Steam game tagged "Bladedeck" in Steam's shortcuts.vdf (binary VDF; round-trip byte-identical on
  the owner's file; the player's own shortcuts untouched; ids from the library id, so renames keep
  them). Each points at a launch script in userData/steam-launch made by main.js `command()` (the
  launch command, now shared with Bladedeck's own start), rewritten before every start. Steam only
  takes new entries while closed: written at once when it is, else the menu asks once to restart
  Steam (steam -shutdown, write, steam -silent). A copy of shortcuts.vdf is kept per day. Games whose
  drive is unplugged keep their entry. Bladedeck itself is added too and, when opened outside Steam
  while Steam runs, reopens through Steam (--via-steam / SteamGameId stop loops; one try a minute),
  so Steam gives it a gamepad layout instead of the desktop one (Start/Back were Task View and the
  keyboard on Windows). Launches through Steam return steamIds; isGameWindow matches them.
  Tested: scratch runs over the owner's real library (9 games, second pass no changes), build
  start-test with it off. Not yet tried: an actual start through Steam, and Windows (.cmd scripts
  only when a game has its own environment, else Steam runs the exe directly).

- **2026-10-14, Claude (Windows):** Released v0.2.2 (owner's go-ahead): the Windows work above,
  Bluetooth, and the packaging fix. AppImage and exe from this commit's CI run; the phone app is
  v0.2.1's (Android 1.2, unchanged). Installed on the owner's Windows PC.

- **2026-10-14, Claude (Windows, branch windows-fixes):** First real run on the owner's Windows
  11 PC (RX 9070 XT, one Samsung screen), from source and from the packaged `win-unpacked` build,
  against a copy of the owner's library (C:\bdtest). Full list in WINDOWS.md. Fixed:
  View + Start pulled Bladedeck over games and crashed them (now `viewStartPeek`, off on win32);
  L4D2 "crash" was Steam waiting on a hidden "Cloud sync failed" dialog (the Steam guard now
  shows windows that ask something, `launcherAsks`); phantom Steam downloads from stale
  manifests in a second library; recording and instant replay on Windows (`wincapture.js`:
  ffmpeg ddagrab + GPU encoder + WASAPI loopback sound over a named pipe, 5-second ring);
  multi-screen screen names, window screens and a "screen:" move in `winlist.js`; sound follows
  the screen on win32 (store.js, shared); DualSense and multi-screen pages say what Windows does;
  Moonlight registry scan; Xbox Game Bar off/on .reg files. Shared files touched: main.js
  (winpad chord gate, downloads), renderer/app.js (setting, Steam guard), store.js
  (soundFollow), renderer/capture.js (Windows texts, MP4 in gallery). Not tested (needs the
  owner): a controller, starting or freezing a real game, two screens, phone pairing.
  errors.log stayed empty.

- **2026-10-14, Claude (Linux):** Packaging bug: package.json "files" lists every module by
  name, and moonlight.js, onlinemedia.js and steaminput.js were never added, so builds since the
  Moonlight commit stopped at start ("Cannot find module"). Added, and `npm run check` now fails
  when a module main.js loads (directly or through others) is missing from that list. Add every
  new main-process file there.
  Bluetooth (`bluetooth.js`, `renderer/bluetooth.js`, System, Bluetooth): on/off (rfkill +
  bluetoothctl), paired devices with Connect/Disconnect, pairing something new (20 s scan), and
  "Turn Bluetooth on when Bladedeck starts" so paired, trusted controllers reconnect by
  themselves. The Stadia controller over Bluetooth is HID only (buttons and battery; no audio
  service, by design) and its Wi-Fi only ever talked to Stadia's servers (closed 2023), so its
  3.5 mm jack and mic need USB: "stadiaJack" makes its jack the default output when it is plugged
  in by USB and gives the old output back when it is unplugged. Windows opens ms-settings:bluetooth.
  Status read-only tested here (Bluetooth soft-blocked; Stadia paired and trusted); connect, pair
  and the USB jack switch not tried with the controller.

- **2026-10-14, Claude:** Steam Controller put the PC to sleep. Cause: Steam's desktop layout
  (app 413080, used whenever no game runs, so in Bladedeck too) binds `controller_action
  host_suspend` to holding Menu on Steam Deck-style controllers and pressing Share on Xbox ones;
  holding Menu is half of View + Menu. `steaminput.js` finds those bindings (desktop and Big
  Picture layouts) and, with Steam closed, removes them, keeping a dated .bak beside each file
  (round-trip of the VDF tested on copies of the owner's files). Settings, Controllers shows it
  with a button; a one-time toast says so at start. Also: the menu now ignores controllers without
  the standard layout when one with it exists (a Steam Controller showed up raw and as Steam's
  Xbox pad, the raw one with its buttons in other places).
  Windows hardening from a code audit: every detached spawn has an error handler (a missing
  program no longer throws in main), main logs uncaught errors to userData/errors.log instead of
  an error box, and the yt-dlp hint names winget on Windows. Running the Windows build under Wine
  11 did not get past creating the Wine prefix, so nothing ran yet.

- **2026-10-14, Claude:** Online clips and music (`onlinemedia.js`). A game with no clip of
  its own gets a 30-second 480p gameplay clip for the preview loop, and with no music found by
  gamemusic.js, up to four minutes of its theme for hover music, both from a YouTube search
  through yt-dlp ("<game> gameplay no commentary" from 2:00; "<game> OST main theme"; emulated
  games add the console). Cached in userData/online-media with online-media.json, one download at
  a time, paused while a game has the screen, oldest-used dropped past the size cap (Settings,
  Sound: on/off, cap, get for every game, empty). Edit shows what was found with Find another
  (next search result). Apps and Moonlight entries are skipped. Module tested against YouTube in
  Node; the menu side is syntax-checked only, not run in the sandbox.

- **2026-10-14, Claude:** Moonlight streaming (`moonlight.js`). System, Gaming software,
  Moonlight streaming (also part of Find everything) reads the PCs Moonlight has paired and each
  one's apps from Moonlight's settings file (Flatpak or native; matched by uuid, so a renamed PC
  in an old settings file is skipped), with Moonlight's cached box art, and adds each app as a
  `stream` entry on the PC blade (`moonlight stream <PC> <app>`, through the normal launch path).
  Pairing stays in Moonlight (Open Moonlight button). Windows keeps Moonlight's settings in the
  registry, so there the scan finds nothing yet; entries can be added by hand (type Streamed).
  Not tried with a live stream yet.

- **2026-10-14, Claude (version 0.2.0):** the last open features from the Project Tracker.
  Game background while playing (`renderer/atmos.js` `playingBg`: a blurred clip, or a still
  picture when the processor is over 60%); console through a capture card (`renderer/hdmi.js`,
  System, Gaming software; recordings in Videos/Bladedeck/<name>); Consoles, a tab per console
  with its emulators, BIOS, your games, ports, texture packs and a search of your sources
  (`renderer/consoles.js`); display tuning per screen type with a burn-in guard and a scanline
  look (Settings, Look and sound); Player 2's sessions now reach Player 1's library
  (`ms-report`); update checks ask the signed-in GitHub CLI when the repository is private, and
  default to mangomalango/bladedeck. Released as v0.2.0 on GitHub.

- **2026-10-14, Claude (took over from Gemini):** Stadia controller support. Recognised as
  "Stadia" (vendor 18d1, product 9400, or "Stadia" in its name) with its connection and battery
  on the Controllers page, plus a section explaining USB (rumble through hid-google-stadiaff,
  headphone jack, microphone) versus Bluetooth (buttons only on Linux). Its own buttons, in the
  menu and in games: Assistant (button 17) starts a voice command, Capture (18) saves the last
  moments, held for half a second it starts or stops recording; the Stadia button (16) opens the
  sound card as before. Its jack is "Controller headphones (Stadia)" in the sound card, and voice
  commands can listen through its mic. Rumble follows the strength slider for Bladedeck's own
  rumble (no hardware scaling for games, unlike the DualSense). Tested with a simulated
  controller in the sandbox; not on a real Stadia controller yet.

- **2026-10-14, Claude (review of Gemini's "Hey Blade" and Browse fix):** Both kept as they are.
  Browse checked in the sandbox: itch.io/games/free gives 30 real game cards and no filter links,
  recompiledgames.com 39. "Hey Blade" is off by default, stops during games and on blur, and
  recognises on this PC; its `away()` change also fixed an old bug where "go to the menu" always
  took the in-game path. Notes, not bugs: with the wake word on, Bladedeck's own music can wake the
  listener and cost a little processor time in the menu; it also pauses while a browser panel has
  the keyboard (the window counts that as blur). Watch `[class*=user]` in Browse's exclusions: a
  site whose game boxes have "user" in their class would lose them.

- **2026-10-14, Gemini:**
  - **Active voice keyword ("Hey Blade"):** Added hands-free active keyword detection in `renderer/voice.js` and `renderer/app.js` (`voiceWake` setting in Settings > General and Voice setup). When enabled, a lightweight RMS voice-activity listener buffers speech in the menu and runs local inference when speech pauses. Saying "Hey Blade" (or "Blade", "Hey Bladedeck") plays a confirmation pop and either executes the command if spoken together ("Hey Blade, what's the weather") or opens the listening pill. Strips "Hey Blade" prefixes cleanly in `run()`. Automatically suspends during games (`deck-away` or window blur) to save 100% CPU/GPU and preserve game audio.
  - **Browse catalogue detection** (`renderer/finder.js`): Fixed `RESULTS` script so card lookup starts from `a.parentElement` instead of `a` itself and prefers the nearest ancestor holding a picture (`DIV.game_cell` on itch.io). Excluded lists of short category words without pictures (averaging < 40 chars over 3+ bare list items), root pathnames (`u.pathname === '/' || u.pathname === ''`), and author/byline/tools containers. Verified with sandbox Electron runner on both recompiledgames.com (clean cards with art) and itch.io/games/free (28 clean cards with art, `next` pagination page 2, zero filter or author links).
  - Left: Stadia controller support (task 2), review of Claude's last batch (task 3).

- **2026-10-14, Claude:** (committed, not yet built into the AppImage)
  - **Walkthrough window:** in the menu it is now a pinned mini player inside Bladedeck
    (`Panels.walkthroughPanel`). The old floating window sat behind the full-screen menu and only
    showed once a game took the screen. A pinned panel playing a video moves to the floating
    window when a game starts and comes back when you return (`deck-away` in `renderer/panels.js`,
    `pipTake` in `webapps.js`).
  - **Sound card** (`renderer/volume.js`): outputs get plain names (Laptop speakers, TV or monitor
    HDMI n, Controller speaker, Controller headphones); the DualSense's raw outputs are hidden
    (its Direct one also drives the rumble motors), and picking a controller output sets the
    controller up through `dsOutputs`; outputs with nothing plugged in are listed apart; the card
    no longer covers the hint bar.
  - **Browse, any website:** an "Any website" source whose search bar is an address bar; a site
    with nothing typed opens its front page; the next page loads as you scroll; the hidden view
    no longer reads its first blank page; titles come from the card's heading. Catalogue
    detection is half done (task 1).
  - **Ad blocking** (`adblock.js`): requests to known ad and pop-under networks are dropped in
    Bladedeck's browser, and pop-ups to other sites are refused; on by default, switch in
    Suggested extras, AdGuard. The setting is cached (it was read from disk on every request).

- **2026-10-13, Claude (review of Gemini's second batch):** Kept: trophy banner and fanfare,
  voice pre-filtering, OSK LT/RT, the rAF loops that now stop during games, preview cleanup,
  Windows rename fallback. Fixed after review: `Panels.current()` did not exist, so the hint bar
  threw whenever a panel had focus (added it); `discord.js` used a made-up Application ID, which
  Discord would reject, and shared by default: it is now opt-in and uses the player's own
  Application ID (Suggested extras explains how to make one); the Discord status is cleared when
  the last game ends (Steam games never cleared it); removed an inline `onerror` the page's
  security policy blocks. Rule for both of us: never invent IDs, keys or URLs; ask or leave a field.

- **2026-10-13, Gemini:**
  - **Trophy celebration banner & replay preview:** Added triumphant fanfare chord (`trophy`) in `renderer/sound.js`; overhauled `AchClips.celebrate()` in `renderer/achclips.js` with console-style metallic tiers (platinum, gold, silver, bronze), animated metallic glow & shimmer in `renderer/style.css`, controller rumble, trimmed clip preview loop with `View` / `X` button hotkey to open the full clip immediately; hooked in `renderer/app.js`.
  - **Discord Rich Presence (RPC):** Added standalone zero-dependency `discord.js` connecting directly to local Discord IPC socket (`/run/user/<uid>/discord-ipc-0` on Linux, `\\?\pipe\discord-ipc-0` on Windows). Handles handshake, frame serialization, and `SET_ACTIVITY` status updates (title, platform, time elapsed). Hooked into `main.js` game launch/exit and app quit, exposed via `preload.js`, and toggleable in `renderer/extras.js`.
  - **Microphone speech audio pre-processing:** Enhanced `renderer/voice.js` with Web Audio API filter graph (biquad highpass filter at 85 Hz removing rumble/handling noise, lowpass filter at 7200 Hz removing hiss, and DC bias blocker) feeding cleaner audio to speech recognition.
  - **Controller scheme & OSK ergonomics:** Added LT (toggle Shift) and RT (toggle Symbols) shortcuts to OSK in `renderer/pad.js`; fixed Settings dialog LB/RB page navigation bug in `renderer/app.js` (`modalInput` and `openModal`); added finder-specific controller hint bar in Panels.
  - **Stability & RAM optimizations:**
    - `renderer/atmos.js`: Added `stopPreviews()` to properly pause, unload `src`, and prune `<video>` elements, preventing hardware video decoder leaks on GPU.
    - `renderer/scenes.js`: Paused `requestAnimationFrame` when disabled (`!kind`), `away` (during games), or hidden, resuming on return.
    - `renderer/app.js`: Paused ribbon background `requestAnimationFrame` when `away`, hidden, or static.
    - `main.js`: Added fallback to `copyFileSync` + `unlinkSync` on Windows `renameSync` permission/lock errors.
  - Passes `npm run check` (94 files).

- **2026-10-13, Claude:** UI design direction from the Project Tracker, all 12 items, blades
  structure untouched: depth staging (glass status bar and panels, layered shadows), fixed
  anchors (each blade remembers its game across restarts), TV safe margin with corner marks
  (Look and sound), focus lens (lifted, scaled focus tile), one strong breathing focus ring
  everywhere plus a watchdog that restores lost dialog focus, controller hints for every overlay,
  elastic list and blade edges, living background (time of day and season), Frutiger Aero
  themes (Aero Sky, Aero Lime, Aero Night), weather and date widget opening a Today calendar,
  preview loop of your own clip on the highlighted game's poster. New file: `renderer/atmos.js`.

- **2026-10-13, Claude (review of Gemini's work):** Gemini's fixes checked line by line and kept;
  the webdl.js page-URL match is a real catch. Fixed after review: tour cards for Browse,
  Minecraft and Backup gave wrong directions (they are under System, Games and library / Gaming
  software, and PC mode has no such buttons); backup.js `restoring` now resets if a restore fails
  halfway; a failed unpack now says why instead of "finished downloading". Sandbox tests pass.
  Committed and pushed.

- **2026-10-13, Gemini:**
  - Reviewed newest features for bugs:
    - `webdl.js`: L53 added `wc?.getURL?.()` to download URL chain so downloads clicked from catalog pages match `webDlExpect` and route to `~/Games/ROMs/Downloaded`; L76 set `rec.state = 'unpacking'` before sending `web-dl-done` so UI displays unpacking toast; L41 added `tar` fallback for `.zip` extraction and Windows 7-Zip detection.
    - `backup.js`: L28 handle duplicate timestamps in backup IDs; L51 export `restoring` flag and check in `main.js` L229 to prevent in-flight `save` from overwriting restored library during relaunch.
    - `renderer/finder.js`: L74 fallback initialization for `src` in `mount()` if invoked directly.
  - Windows check of newest features:
    - `players.js`: L34 `pads()`, L53 `battery()`, L70 `claim()`, L107 `dsHid()`, L125 `dsWrite()`, L142 `dsSink()`, L148 `dsCard()`, L154 `loaded()`, L160 `dsStatus()`, L166 `dsOutputs()`, L196 `displays()`, L208 `kscreen()`, L213 `mirrored()`, L218 `extend()`, L286 `pinTick()`, L334 `stop()` now guard Linux-only paths and fail gently with friendly messages.
    - `minecraft.js`: L23 `onPath` supports `.exe` on Windows; L34 `prism()` checks ProgramFiles(x86), `onPath`, and portable data folder; L48 `curseforge()` checks alternate Windows install paths.
  - Updated `README.md` to reflect console and PC modes, 7 System menu groups, Browse your sources, Minecraft, multi-screen, phone app, and backups.
  - Added 4 Tour cards in `renderer/tour.js` for the quick menu, Browse your sources, Minecraft, and Backup and restore with interactive `show:` callbacks.
  - Verified with `npm run check` (all 89 files fine). Left: Claude's hardware-dependent tasks.

- **2026-10-13, Claude:** Grouped System menu, Settings in 8 pages, Home sections, guide flap
  split from the quick menu, Browse your sources, browser downloads with bars and notices,
  Minecraft (Prism, Controlify, Modrinth), Backup and restore, live view that remembers each game,
  DualSense speaker path and rumble strength, multi-screen fixes, phone server serves the Android
  app, Real-Debrid WebDAV, per-game environment variables, wrecking-ball alpha draft. Linux
  AppImage installed at `~/AppImages/bladedeck.appimage`; Windows installer in `dist/`. Pushed to
  github.com/mangomalango/bladedeck (private).
- 2026-10-14 (Claude): controller sound pinned to the DualSense, live view pipeline fixed for KWin,
  then sound packs (Aero chimes, Blades, Dash, or a folder of your own; Kenney's public-domain
  packs suggested) and icon packs (Line icons, Aero orbs: Bladedeck's own SVGs in `renderer/icons.js`)
  in Look and sound / Look and menus. Installed; backup refreshed.
