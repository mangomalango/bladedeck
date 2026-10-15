> ## >>> GEMINI: START HERE (BD-029, do this first) <<<
> 1. Get this branch: `git fetch origin && git worktree add ../bladedeck-gemini-bd029 -b gemini/2026-10-15-bd029 origin/claude/bladedeck-helpers-termination-pwivp1`
> 2. Run `/bladedeck-review`. Review ONLY commit `Windows helpers stop when Bladedeck quits or crashes` (`winpad.js`, `wincapture.js`). Card: HANDOFF.md, "For Gemini", BD-029.
> 3. Run `npm run check`. Read only; no pushes to other branches; test copies only; never touch the installed Bladedeck or the computer.
> 4. Write findings in `NIGHTLY-REVIEW-gemini.md`; list the exact commands you ran and what you did NOT test; reply "BD-029 audit: PASS" or "DRIFT (what)" in HANDOFF.md.
> 5. Then stop and wait for the next card.

# Bladedeck: briefing for AI assistants

**Start with `TEAM.md`**: roles, branches, the debug loop and the safety rules.

**Names:** the owner sometimes calls this project "Steamblade" (its first name, and the name of the
console-mode idea). Steamblade and Bladedeck are the same project: this repository.

**Working with Claude:** Claude (Claude Code) also works on this repository, in a separate tool.
You cannot message each other; you coordinate through `HANDOFF.md` in this folder. Read it first:
it says what was done last, what is in progress, and which tasks are yours. When you finish
something, add a short entry at the top of its log (date, who, what changed, what is left) and
take a snapshot (`npm run snapshot -- "what changed"`). Never work on a task the other has marked
as in progress.

Bladedeck is a console-style game launcher (Electron 33) for Steam, emulators, native ports and any
program, with a controller-first "console mode" and a windowed "PC mode". The owner (mangomalango)
runs it on CachyOS, KDE Plasma on Wayland, Intel Arc graphics, and also builds a Windows version.

**In Antigravity:** this file and `.agents/rules/bladedeck.md` load by themselves. Two workflows
are ready: `/bladedeck-audit` (check a branch against SPEC.md: you are the team's auditor),
`/bladedeck-review` (review the newest work into NIGHTLY-REVIEW-gemini.md) and
`/bladedeck-test` (try the features in a safe test copy).

## Layout
- `main.js`: the Electron main process: windows, launching games, library file, most IPC.
- One main-process module per feature, each with a `register()`: `players.js` (controllers,
  DualSense sound and rumble, multi-screen), `peek.js` (KWin script and DBus helper for window
  events), `capture.js` (GPU Screen Recorder), `livecap.js` (live view through the screen-share
  portal), `webdl.js` (browser downloads), `finder.js`, `minecraft.js`, `backup.js`, `store.js`,
  `companion.js` (phone server), `realdebrid.js`, and others.
- `preload.js`: the only bridge; the page calls `window.bladedeck.*` (aliased `api` in app.js).
- `renderer/`: the page. Classic scripts that share globals, loaded in the order in `index.html`;
  `app.js` loads last and defines `S` (state), `api`, `toast`, `openModal`, `launch` and friends.
  A file that runs code at load time must not use anything from a later file (use
  `window.bladedeck` instead of `api` at load time).
- `companion/`: the phone web app. `android/`: the small Android wrapper app.
- The user's data: `~/.config/bladedeck/library.json` (every game, setting and choice).

## Commands
- `npm run check`: every JS file parses, every JSON file reads. Run it after every change.
- `npm run snapshot -- "what changed"`: a git snapshot to roll back to (`npm run rollback -- <tag>`).
- `npm run dist`: builds `dist/Bladedeck-0.1.0.AppImage` (moves the old one to `dist/previous`).
  Never call `electron-builder` directly for Linux.

## Rules learned the hard way
- The owner runs `~/AppImages/bladedeck.appimage`. Never overwrite it while Bladedeck is running
  (that crashed it). Ask them to close it, move the old file aside, then copy the new one in.
- Never edit `library.json` while Bladedeck is running: its next save overwrites your edit.
- Test with `npm run test-copy` (add `-- --real` for a copy of the owner's library): a scratch
  userData, no controller, no peek helper, and every outward action refused (main.js TEST).
  It quits by itself after three minutes; DevTools on port 9333 for scripted checks.
- Never test with the real library or the real controller. Run a copy with `userData` pointed at a
  scratch folder, the gamepad stubbed (`navigator.getGamepads = () => []`), and every outward
  action (launching, window moves, sound changes, HID writes, kscreen-doctor changes, downloads)
  stubbed. A test window that has focus receives the owner's real controller presses.
- A test copy must not load the real `peek.js`: it takes over the DBus name `dev.bladedeck.Peek`
  and breaks window tracking in the owner's running Bladedeck.
- On KDE Wayland, screen capture goes through the desktop's picker, which steals focus; only open
  it when the player asked.
- The DualSense over USB: channels 1 and 2 are its sound, 3 and 4 its haptic motors. Its speaker
  only plays after a HID output report sets the audio path (see `dsWrite` in `players.js`).
- ufw drops incoming connections from the home network; phones reach Bladedeck over Tailscale.

## Style
Match the surrounding code: plain modern JavaScript, no frameworks, small comments that say why.
User-facing text is short, plain and friendly, written for someone using a controller.
Only one assistant should edit the project at a time. Snapshot before and after your work.

## Show your proof (every task)
- Before you say "done" or "PASS", run `npm run check` and, for anything the page shows, `npm run sweep`
  in a test copy. In your reply list the exact commands you ran and their last lines. A reply with no
  commands listed is treated as not checked.
- Say plainly what you did NOT test (for example "not run on Windows"). Never write PASS for something you
  only read.
- Use the strongest model Antigravity offers for audits and reviews (races, Windows, security); the fast
  one is for small edits.
- Claude (Windows) spot-checks one claim from each reply before the owner acts on it.
