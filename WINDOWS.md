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

## Linux-only on purpose (should say so, not crash)

These should show a clear message or be hidden on Windows. A crash or error box is a bug.

- Split screen with PartyDeck (the Nucleus Co-op note is expected)
- Recording and instant replay (`capture.js` uses GPU Screen Recorder)
- The live view of a game (`livecap.js`, Wayland/PipeWire)
- KDE window tracking and Ctrl+M through KWin (`peek.js`); Windows uses `winpad.js` and `winlist.js`
- Multi-screen screen arrangement (`kscreen-doctor`)
- DualSense speaker and headphone jack routing (`pactl`)
- Installing emulators with Flatpak (Windows uses winget)
- DNS settings through NetworkManager (`extras.js`)
- Moonlight scanning: Windows keeps Moonlight's settings in the registry, which isn't read yet
  (see the checklist)

## Checklist

Tick each item when it works or is fixed. Add a short note when something needed a fix.

### Start and basics
- [ ] The installer installs and Bladedeck starts with no error box
- [ ] Console mode and PC mode both draw; View swaps between them
- [ ] An Xbox controller moves around the menus; A, B, and holding View (Quick Resume) work
- [ ] Settings opens, every tab draws, and Save keeps the changes after a restart
- [ ] `errors.log` stays empty during normal use

### Library and games
- [ ] Find everything finds Steam games (Steam in `C:\Program Files (x86)\Steam`) and launchers
- [ ] A Steam game starts, and Bladedeck comes back when it closes
- [ ] A plain .exe game added by hand starts (no Wine involved), and its playtime is saved
- [ ] An emulator added by hand plays a ROM
- [ ] Install emulators: one winget install goes through and lands in the library
- [ ] Get games, Browse and downloads: a .zip unpacks

### Windows helpers
- [ ] The sound card: volume, mute, switching output, per-app volume (`winaudio.js`)
- [ ] View + Menu during a game brings Bladedeck up, and again goes back (`winpad.js`)
- [ ] Running list and Quick Resume show open windows and switch between them (`winlist.js`)
- [ ] Freezing and resuming a game (`procs.js`)
- [ ] This PC shows battery, Wi-Fi networks and brightness. Don't press the power buttons.

### Newer features
- [ ] Phone app: the PC serves the page and a phone on the same Wi-Fi can pair. Windows
      Firewall will ask the first time; allow private networks only.
- [ ] Nearby: two Bladedecks on the same Wi-Fi see each other (UDP 47617)
- [ ] Online clips and music: with yt-dlp installed, a highlighted game gets a clip and music
- [ ] Settings, Controllers: the Steam sleep section appears when Steam's desktop layout has a
      sleep binding (the owner's Steam account has one)
- [ ] Moonlight: **to build.** Read paired PCs from the registry
      (`HKCU\Software\Moonlight Game Streaming Project\Moonlight`, keys `hosts\N\hostname`,
      `hosts\N\uuid`, `hosts\N\apps\M\name`, `hosts\N\apps\M\id`, for example with
      `reg query ... /s`) in `moonlight.js` `scan()`, using `C:\Program Files\Moonlight Game
      Streaming\Moonlight.exe`. Box art is probably under
      `%LOCALAPPDATA%\Moonlight Game Streaming Project\Moonlight\boxart`; check.

## When you finish

1. Push `windows-fixes`.
2. Add a dated entry at the top of the Log in `HANDOFF.md`: what you tested, what you fixed,
   what still fails (with lines from `errors.log`).
3. Update the ticks above in the same commit.
