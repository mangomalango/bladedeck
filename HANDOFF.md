# Handoff between Claude and Gemini

Read this first. Newest entries at the top of the log. Mark a task "in progress: <name>" before
starting it, and move it to the log when done. One assistant edits code at a time.

## Open tasks

### For Gemini
1. **Review the newest features for bugs** (read-only first, then fix small things you are sure of):
   `renderer/finder.js` (Browse your sources), `webdl.js` (downloads), `minecraft.js` and
   `renderer/minecraft.js`, `backup.js`, `livecap.js` with the `LiveCap` part of
   `renderer/nowplaying.js`. Write what you find in the log, with file and line.
2. **Windows check of the new features** (by reading code): each new feature must fail gently on
   Windows (no crash, a plain message). `players.js` DualSense functions read `/sys` and
   `/dev/hidraw*`; `livecap.js` is Linux-only; `minecraft.js` has Windows paths. Fix anything that
   would throw.
3. **Update `README.md`** so it describes Bladedeck as it is now: console and PC mode, the System
   menu groups (Games and library, Gaming software, Play together, Capture, This PC, Personalize,
   Help), Browse your sources, Minecraft, multi-screen, the phone app, backups. Short and plain.
4. **Tour cards** (`renderer/tour.js`): add cards for the quick menu (hold RT and pull, or C),
   Browse your sources, Backup and restore, and Minecraft, in the same style as the others.

### For Claude
- Things that need the owner's hardware: multi-screen on two screens, the DualSense speaker,
  the live view's remembered windows, Real-Debrid's file server with a real login.

### Waiting on the owner
- Try Rumbleverse from the PC blade (runs through Proton with umu-run) and say what happens.

## Log

- **2026-10-13, Claude:** Grouped System menu, Settings in 8 pages, Home sections, guide flap
  split from the quick menu, Browse your sources, browser downloads with bars and notices,
  Minecraft (Prism, Controlify, Modrinth), Backup and restore, live view that remembers each game,
  DualSense speaker path and rumble strength, multi-screen fixes, phone server serves the Android
  app, Real-Debrid WebDAV, per-game environment variables, wrecking-ball alpha draft. Linux
  AppImage installed at `~/AppImages/bladedeck.appimage`; Windows installer in `dist/`. Pushed to
  github.com/mangomalango/bladedeck (private).
