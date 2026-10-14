# Bladedeck on Windows: test and fix list

For a Claude Code session on the owner's Windows PC. Bladedeck is built and used on CachyOS
Linux. A Windows installer is made with every release, but until now it has never run on a
real Windows PC. Your job: run it, go down the checklist, fix what breaks, and write down what
you found.

Read `HANDOFF.md` too. It has the history and how work is shared between assistants.

## Read this first: context from the Linux session (2026-10-14)

You don't have the conversation this came from. This section is the part of it that matters
here.

### Working with the owner
- The owner tests by using Bladedeck, not by reading code, and writes short, quick messages,
  often with typos. Read for intent. When a request could mean two different jobs, ask one short
  question. Otherwise just do it.
- Finish the job: build, check it works, and say plainly what was and wasn't tested. Explain in
  plain words, without jargon.
- "Update the GitHub" means commit and push. Here, push `windows-fixes`; the Linux session
  merges it.
- Always tell the owner what is committed but not pushed, and what is installed versus only
  built.
- Ask before anything outward-facing or hard to undo: releases, firewall changes, changing repo
  visibility, deleting files.

### Safety habits that came from real accidents
- A test copy once really launched a game from the owner's controller, because the Gamepad API
  reads the controller even when the window is in the background. Never leave a test copy
  running unattended, and never press anything in it that starts games or uses power actions.
- Back up `%APPDATA%\bladedeck` before running Bladedeck against the real library. Edits made to
  `library.json` while Bladedeck is open get overwritten by its next save.
- Steam's desktop controller layout can sleep the PC from a button: hold Menu on Steam
  Deck-style controllers, press Share on Xbox ones. `steaminput.js` turns that off (Steam must be
  closed). Turn it off on this PC too before playing with controllers.

### Where things stand
- Newest release: v0.2.1. `master` has more since then, none of it released yet:
  - Moonlight streaming (`moonlight.js`)
  - online clips and music (`onlinemedia.js`)
  - the Steam sleep fix and controller filter (`steaminput.js`, `renderer/players.js`)
  - Windows hardening: spawn error handlers and `errors.log`
- Not yet tried live on Linux either: a Moonlight stream, and the menu side of online clips and
  music. If they misbehave here, check whether they also do on Linux before calling it a Windows
  bug.
- The owner's Moonlight host is a PC called **micromango** (apps: Desktop, Steam Big Picture).
  The owner may want Windows to be the streaming host (Sunshine) later; nothing is built for
  that yet.
- The repo is public. Don't commit secrets, keys or personal files.
- The project tracker is a Claude Doc ("Bladedeck — Project Tracker",
  https://claude.ai/artifact/Lj2M3qDfVMYsYPn9DgePAR). Read it if your session can open it. If
  it can't, this file and `HANDOFF.md` are enough.

## Ground rules

- **Work on a branch:** `git switch -c windows-fixes`, commit as you go, push that branch. Don't
  push to `master`. The Linux session reviews and merges it.
- **Don't break Linux.** Put Windows fixes behind `process.platform === 'win32'`, or in the
  `win*.js` helpers. Leave the Linux code paths alone.
- **Match the code style:** short plain comments that explain why, in the same voice as the
  existing ones.
- **Keep the owner's data safe.** Settings and the library live in `%APPDATA%\bladedeck`
  (`library.json`). Copy that folder before testing anything that writes to it.
- **A controller is live.** Bladedeck reads it even when its window is in the background. Don't
  start games, sleep or shut down the PC from Bladedeck unless the owner asks.
- After each fix, run `npm run check` (a syntax check of every file).

## Setup

```powershell
git clone https://github.com/mangomalango/bladedeck
cd bladedeck
npm install
npm start            # runs from source
npx electron-builder --win   # makes the installer in dist\
```

When something goes wrong, look in `%APPDATA%\bladedeck\errors.log`. The main process writes
uncaught errors there instead of showing an error box. Also check DevTools in the window
(Ctrl+Shift+I) for errors in the renderer.

## What is Windows-specific (most likely to break)

| Area | File | How it works on Windows |
|---|---|---|
| Sound card (volume, outputs, mic, per-app) | `winaudio.js` | One PowerShell process running C# against Core Audio, one JSON line per command |
| View + Menu while a game is in front | `winpad.js` | PowerShell reads XInput and says "chord" |
| Running windows, dock, Quick Resume | `winlist.js` | PowerShell + C# lists top-level windows, raises, minimizes or closes one |
| Pause (freeze) a game | `procs.js` | PowerShell suspends and resumes the process |
| This PC: battery, brightness, Wi-Fi, power | `system.js` | PowerShell and `netsh`; sleep uses `rundll32 powrprof.dll` |
| Installing emulators | `store.js` | `winget install` |
| Unpacking downloads | `webdl.js` | 7-Zip if installed, else `tar` |
| Steam start in the background | `main.js` `prewarmSteam` | `tasklist`, then `steam.exe -silent` |
| Bringing Bladedeck to the front | `main.js` | `WScript.Shell.AppActivate` |
| Fonts list | `main.js` | PowerShell `System.Drawing` |
| Steam Controller sleep fix | `steaminput.js` | Reads `C:\Program Files (x86)\Steam\steamapps\common\Steam Controller Configs` |
| Online clips and music | `onlinemedia.js` | Needs `yt-dlp` on PATH (`winget install yt-dlp.yt-dlp`) |

## Windows feature list (2026-10-14, tested on the owner's PC)

Windows 11, Ryzen 5 9600X, RX 9070 XT, one screen (Samsung TV). "Tested" means run in the app
on this PC (from source and from the packaged `win-unpacked` build), not only read.

| Feature | Windows | How / note |
|---|---|---|
| Menu, blades, Home, Settings | Works (tested) | Every blade fills from the real library |
| Steam library scan, art, achievements, screenshots | Works (tested) | All libraries from `libraryfolders.vdf` |
| Steam downloads bar | Fixed | A game copied to another library no longer shows as downloading |
| Starting a Steam game | Fixed (not re-run with a game) | Steam's questions (Cloud sync failed…) are shown, not hidden |
| GOG, Heroic, launchers (Apps blade) | Works (tested) | Steam and GOG Galaxy found |
| Sound card (volume, outputs, per-app) | Works (tested, read only) | `winaudio.js` |
| Sound follows the game's screen | Built | HDMI sound is named after the monitor |
| Recording and instant replay | Built and tested | ffmpeg on the graphics card (`wincapture.js`), with desktop sound. Needs ffmpeg: Settings, Recording, Install it |
| Live view of a game | Works (tested) | Electron captures the window by title, no picker |
| Running list, dock, Quick Resume window list | Works (tested) | `winlist.js` |
| View + Start from a game | Off by default | It crashed games here; Settings turns it back on |
| Multi-screen: two menus, games on each player's screen | Built (one screen here: moving untested) | Screens named "Screen N (monitor)" |
| Multi-screen: per-game controller and sound | Linux only | Needs bubblewrap and PipeWire |
| DualSense speaker / headphones | Not needed | Over USB Windows shows it as a normal sound device |
| Split screen (PartyDeck) | Linux only | |
| Moonlight (play from another PC) | Built (sample-tested) | Reads Moonlight's registry; not installed on this PC |
| Bluetooth page | Opens Windows' Bluetooth settings | |
| This PC (CPU, memory, disks) | Works (tested) | No GPU or temperatures on Windows yet; no Wi-Fi adapter here |
| Fonts, wallpapers (Wallpaper Engine), backups, phone app info, nearby PCs | Works (tested) | |
| Online clips and music | Needs yt-dlp | `winget install yt-dlp.yt-dlp` |
| Steam sleep-button fix | Works (tested scan) | Found the owner's Menu-hold binding |
| Installing emulators | winget | Flatpak is Linux only |
| DNS through NetworkManager | Linux only | |
| Xbox Game Bar | Off switch | `scripts/windows/disable-game-bar.reg` (and `enable-…`) |

Not tested yet, because they need the owner: a controller in hand, starting and freezing a real
game, two screens, a phone pairing.

## Checklist

Tick each item when it works or is fixed. Add a short note when something needed a fix.

### Start and basics
- [x] The installer builds; the packaged app starts with no error box (`win-unpacked`, after
      adding three modules missing from build.files). Not yet installed over the owner's copy.
      Building needs the winCodeSign cache unpacked by hand once (its Mac symlinks need
      Developer Mode): `7za x winCodeSign-2.6.0.7z -o%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`
- [x] Console mode draws (screenshot); PC mode not checked
- [ ] An Xbox controller moves around the menus; A, B, and holding View (Quick Resume) work
- [ ] Settings opens, every tab draws, and Save keeps the changes after a restart
- [x] `errors.log` stays empty during normal use (source and packaged)

### Library and games
- [x] Find everything finds Steam games (Steam in `C:\Program Files (x86)\Steam`) and launchers
- [ ] A Steam game starts, and Bladedeck comes back when it closes. L4D2 never started: Steam
      waited on "Cloud sync failed" while Bladedeck hid that window. Fixed, not re-run.
- [ ] A plain .exe game added by hand starts (no Wine involved), and its playtime is saved
- [ ] An emulator added by hand plays a ROM
- [ ] Install emulators: one winget install goes through and lands in the library
- [ ] Get games, Browse and downloads: a .zip unpacks

### Windows helpers
- [x] The sound card lists outputs with volumes (`winaudio.js`); changing them not tried
- [x] View + Menu during a game: it crashed games for the owner, so it is now off on Windows
      unless turned on (`viewStartPeek`)
- [x] Running list shows open windows with their screen (`winlist.js`); switching not tried
- [ ] Freezing and resuming a game (`procs.js`)
- [ ] This PC shows battery, Wi-Fi networks and brightness. Don't press the power buttons.

### Newer features
- [ ] Phone app: the PC serves the page and a phone on the same Wi-Fi can pair. Windows
      Firewall will ask the first time; allow private networks only.
- [ ] Nearby: two Bladedecks on the same Wi-Fi see each other (UDP 47617)
- [ ] Online clips and music: with yt-dlp installed, a highlighted game gets a clip and music
- [x] Settings, Controllers: the Steam sleep scan finds the owner's bindings
- [x] Moonlight: reads paired PCs from the registry (`parseReg` in `moonlight.js`), tested on a
      sample; box art looked for under `%LOCALAPPDATA%\Moonlight Game Streaming Project`. This PC
      has no Moonlight (it is the Sunshine host), so no real pairing was read.
- [x] Recording and instant replay (`wincapture.js`): 4K AV1 with sound, packaged build too

## When you finish

1. Push `windows-fixes`.
2. Add a dated entry at the top of the Log in `HANDOFF.md`: what you tested, what you fixed,
   what still fails (with lines from `errors.log`).
3. Update the ticks above in the same commit.
