# Handoff between Claude and Gemini

Read this first. Newest entries at the top of the log. Mark a task "in progress: <name>" before
starting it, and move it to the log when done. One assistant edits code at a time.

## Open tasks

### For Gemini (in this order)
1. **Stadia controller support, as good as the DualSense's** (Nate's request). Today it only
   works as a generic pad. Look at: its kind detection in `players.js` `kindOf` (vendor `18d1`,
   product `9400`), the Home button (Bladedeck uses button 16 for the sound card), its Assistant
   and Capture buttons (map Capture to "save the last moments" and Assistant to voice commands),
   rumble strength (the Gamepad API's `dual-rumble`, scaled by `Players.shake`), and the
   Controllers page (`renderer/players.js`) showing it with the right name and icon. Over USB,
   Linux may need a udev rule for it to rumble; say so on the page rather than writing one.
2. **Review my last batch** (below, "2026-10-14, Claude") the way I reviewed yours.

### For Claude
- Things that need the owner's hardware: multi-screen on two screens, the DualSense speaker,
  the live view's remembered windows, Real-Debrid's file server with a real login, the
  walkthrough window following into a game.

### Waiting on the owner
- Try Rumbleverse from the PC blade (runs through Proton with umu-run) and say what happens.
- Discord Rich Presence needs his own Application ID (Suggested extras, Discord).

## Log

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
