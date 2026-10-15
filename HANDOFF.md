# Handoff between Claude and Gemini

**Read `TEAM.md` first**: who does what (Claude on Linux leads, Claude on Windows,
Gemini in Antigravity), branches, safety, and the owner's test list.

Read this first. Newest entries at the top of the log. Mark a task "in progress: <name>" before
starting it, and move it to the log when done. One assistant edits code at a time.

## Open tasks

Task IDs and cards: see TEAM.md (next free ID: BD-029 (BD-011..BD-018 are in ROADMAP.md)).

- **BD-001** (done) · windows · Claude (Windows) · The Downloads window, Files' Y menu (Extract, Compress
  .zip/.7z, Show in Explorer) and game info work in a Windows test copy.
  Contract: SPEC §1 (web-dl-*, archive-*, fs-reveal, game-info), §3 downloads. Verify:
  `npm run check`, `npm run test-copy -- --real`, then in DevTools (port 9333):
  `WebDl.open()`, and `api.archiveRun({op:'compress', file:'<an allowed folder>', fmt:'7z'})`.
  **Done, Windows (Claude Windows), no code change:** test copy with --real, scripted over port
  9333. webDlFolders: dl `C:\Users\natha\Downloads`, games `...\Games\ROMs\Downloaded`, 7-Zip
  found. Compress .7z and .zip and Extract (into "Some Game (2)", no overwrite) all ok in
  ~\Bladedeck; a path outside (C:\Windows\win.ini) is refused. gameInfo(L4D2) returns kind,
  story, play, multi, split. errors.log empty. Not checked: Show in Explorer (the test copy
  blocks fs-reveal by design) and the Downloads window's look (WebDl.open() ran without error,
  but the scripted text read the guide behind it); both need the owner's eyes.
- **BD-002** (done) · windows · Claude (Windows) · ROM tidy and naming on Windows paths: `Watch.romTitle`
  and `Watch.fits` with backslash paths (`C:\Games\Crackdown.1.EUR.X360-ZTM\default.xex`,
  a `.bin` under `...\pfx\drive_c\...`). Contract: SPEC §2 (romTidy).
  **Done, Windows (Claude Windows), no code change:** the real fits/romTitle/junk code run in node
  on Windows paths: Crackdown.1.EUR.X360-ZTM\default.xex -> "Crackdown 1"; PS3_GAME\USRDIR\EBOOT.BIN
  -> its folder's name; .bin under pfx\drive_c and compatdata skipped; a plain PSX .bin kept. Note
  only: the extension regex `/\.([^./]+)$/` lets a backslash in, so an extension-less file under
  a dotted folder gets a junk "extension" (it never matches a list, so it is harmless).
- **BD-003** (done) · both · Gemini · Audit master `53c2aac..c05dbbc` (Nearby hint, clip scoring, game
  info, Downloads, archive.js, test-copy mode, ROM tidy, SPEC check) with `/bladedeck-audit`.
  **BD-003 done (Gemini): PASS.** All 261 channels match SPEC.md. ROM tidy preserves played games.
  Linux/Windows parity intact. Fixed unhandled `null` in `renderer/extras.js` (lines 100, 127, 135)
  when outward channels are blocked in test copies; `node scripts/sweep.js --empty` passes clean
  (48 items, 0 page errors, 16 outward calls blocked). On branch `gemini/2026-10-14-audit-bd003`.
- **BD-008** (done: 1 ms status, router id, rules in ~1 s, Help draws) · windows · Claude (Windows) · Settings, Network & sharing on Windows: the network
  name and category (your Ethernet is Public), the firewall rules listed, home marking. Do not press
  "Match the firewall" yourself; the owner does (UAC). Also ❓ Help, F1, the Quick start.
- **BD-009** · windows · owner · Run scripts/windows/firewall-private.ps1 -HomePrivate (as admin) if
  you want Private-only; or press "Match the firewall to my choice" in Settings, Network & sharing.
- **BD-005** (done) · windows · Claude (Windows) · Bring the newest Linux build to Windows: merge master,
  `npm run check`, `npm run sweep` (a test copy walks every System item, blade, game, Settings tab
  and PC window and prints errors). Fix Windows-only breakage behind win32; report the sweep's output.
- **BD-006** (done) · windows · Claude (Windows) · ROM sync on Windows: `require('./romsync').plan()` lists
  the drives from PowerShell (C:\ as home, other fixed and USB drives), `pick()` honours the
  keep-free rule. Windows Firewall must let TCP 47628 in (Private only; ask the owner before any
  rule change). Contract: SPEC §3 ROM sync.
  **BD-005 and BD-006 done, Windows, no code change:** master 067c791 merged; check and spec OK
  (257 channels); `npm run sweep` opened 48 System items, blades, games, Settings and PC windows
  with no errors (16 outward calls blocked). romsync.plan() lists C:\ (home, 16.7 GB free, spare 0)
  and D:..I:\ (D: and E: are 64 MB drives, spare 0); pick(list, 1 GB) and pick(list, 300 GB) choose
  G:\ (most spare), and pick(list, 10 TB) gives null. pick() creates "<drive>\Bladedeck ROMs" when
  it tests a drive (writable()). Firewall: no rule changed by an assistant. The owner runs
  scripts/windows/firewall-private.ps1 (admin): it backs up, then makes the Bladedeck, dist and dev
  Electron rules Private-only. NOTE: this PC's Ethernet is NetworkCategory **Public** (only
  Tailscale is Private), so Private-only rules would cut Nearby/ROM sync at home unless the owner
  also passes -HomePrivate. TCP 47628 is covered by the existing all-ports rules.
- **BD-007** · both · owner + both Claudes · A real ROM sync Linux <-> Windows once both firewalls
  allow it: pair from ROM sync (System, Games and library), Sync now, the games join the library.
- **BD-004** · both · owner + Claude (Linux) · Nearby both ways once the Linux firewall line is run:
  each PC lists the other, a file goes each way with Accept. Contract: SPEC §3 Nearby.

- **BD-019** · both · Claude (Linux) lead · Review Claude (Windows)'s fix for 88b1b22 on windows-fixes before
  it reaches master (see the Log entry "Shared games pool"). Run `npm run test-pool` and `npm run check`.
- **BD-020** (done: PASS, merged by lead) · both · Gemini · Overnight audit of the Shared games pool and storage map (fsaccess.js, storage.js,
  renderer/transfer.js, renderer/storagemap.js): try to make the page share or unlock anything outside
  Bladedeck/Shared games without the desktop confirmation. Add each attack you try to scripts/pooltest.js.
  Findings in NIGHTLY-REVIEW-gemini.md; fixes only on gemini/<date>-bd020. Read only otherwise; no pushes.
- **BD-021** (done: PASS) · both · Gemini · Review BD-014 (wide, smooth clips) on windows-fixes: renderer/play.js Showcase
  (online clip as the full-screen backdrop when a game has no media; the new layer waits for "playing"
  before cross-fading, 3 s fallback; old videos unloaded) and renderer/atmos.js (no poster preview while
  body.sc-video). Look for: a stale clip winning a race when moving fast between games, videos left
  decoding, Linux behaviour changes. In your own worktree; findings in NIGHTLY-REVIEW-gemini.md.
- **BD-022** (done: PASS, pad skip merged) · both · Gemini · Review the Warp launch animation (renderer/warp.js, the Warp block at the end of
  renderer/style.css, the stretch/pop sounds in renderer/sound.js, launch() and syncAway() in renderer/app.js):
  never delays or blocks a launch, a failed launch ends it (Warp.skip), any key or click cuts it short, body is
  always restored (no menu left scaled or hidden), prefers-reduced-motion and the Animations switch turn it off,
  and Linux (KWin focus) still returns cleanly. In your own worktree; findings in NIGHTLY-REVIEW-gemini.md.
- **BD-023** (done, see Log) · windows · Claude (Windows) · Gemini's BD-010 findings 3-7: winlist/winpad
  helpers restart after dying; winlist name cache cleared each list (pid reuse); no lingering console window for
  Steam-launched games with their own environment (hidden wscript runner; Mesa/DXVK shader env not set on Windows);
  "one core" on Windows (processor affinity); procs.steamInstallDirs cached. Audit: Gemini (BD-024).
- **BD-024** · windows · Gemini · Audit BD-023 on windows-fixes.
  ```
  [TASK]     BD-024 · BD-023's five fixes do what BD-010 asked, and nothing else changed
  [TARGET]   windows (main.js and steamlink.js are shared: Linux must behave exactly as before)
  [OWNER]    Gemini
  [CONTRACT] none (no channel or library key changed; npm run spec: 267 channels OK)
  [INPUT]    winlist.js (names.Clear in List; ask() restarts startWin at most every 10 s; stop() ends it),
             winpad.js (restart after exit, 2 s doubling to 60 s; stop() cancels), procs.js (steamInstallDirs
             cached 30 s; oneCoreWin sets ProcessorAffinity = 1 after 1.5 s), main.js (oneCoreWin after spawn on
             win32; SHADER_ENV not set on win32), steamlink.js (Windows games with their own environment: a .vbs
             run by wscript //B instead of a .cmd; the old .cmd is removed)
  [DO]       /bladedeck-review on those hunks. Look for: a restart loop when PowerShell cannot start at all, a
             known=null reset firing false "opened" events, a .vbs quoting hole (quotes, %, & in paths or values),
             Steam tracking the game through wscript (does the session end when the game closes?), any Linux change
  [RULES]    TEAM.md: your own worktree and gemini/<date>-bd024 branch; read only on windows-fixes; no pushes to
             others' branches; test copies only
  [REPLY]    "BD-024 audit: PASS" or "DRIFT (<what>)" here in HANDOFF.md, details in NIGHTLY-REVIEW-gemini.md
  ```
### For Gemini (in Antigravity)
- **From the owner (2026-10-15): Claude (Windows) is in charge; you take only the small cards written for you here,
  in your own worktree. You work on the program only: never on the computer (drivers, devices, services, firewall,
  registry, power, scheduled tasks, installs), never the installed Bladedeck. See TEAM.md, "Owner's rule".**
  Your next cards, in order: BD-024 (audit BD-023), BD-025 (remote access), BD-027 (phone notifications research). Nothing else until Claude (Windows) writes the next one.
- **BD-025** · both · Gemini · Research only, no changes to any computer.
  ```
  [TASK]     BD-025 · the owner, away from home, can reach both PCs: see and use the desktop, play, and start
             Bladedeck updates
  [TARGET]   both (Windows 11 Home PC "micromango": Tailscale up at 100.64.194.64, Sunshine running; CachyOS
             laptop "mangos": Tailscale at 100.114.178.97; phone: Pixel on the same tailnet)
  [OWNER]    Gemini
  [CONTRACT] none
  [DO]       compare the ways that fit what is already installed: Moonlight to Sunshine over Tailscale (games and
             desktop), Tailscale SSH (Linux), RustDesk / Chrome Remote Desktop (Windows 11 Home has no RDP host),
             waking a sleeping PC from afar (Wake-on-LAN through a tailnet device), and what Bladedeck's own phone
             app already does over Tailscale (companion.js). For each: what the owner taps, what is safe, what it
             costs. Pick one setup to recommend and write the owner's steps in plain words.
  [RULES]    research and writing only: install nothing, change no settings, open no ports, on any PC
  [REPLY]    "BD-025 done" here with the recommendation; the full comparison in NIGHTLY-REVIEW-gemini.md on
             gemini/<date>-bd025. Claude (Windows) reviews it before the owner acts on it.
  ```
- BD-003 complete, reviewed and merged by the lead (557049f). Next audit: what lands on master after it (`/bladedeck-audit`).
- **BD-010** (done) · windows · Gemini · `/bladedeck-review` of the Windows-only code.
  Review complete, documented in `NIGHTLY-REVIEW-gemini.md`. Fixed `tasklist` windowsHide in `prewarmSteam` (`main.js:347`) and FFmpeg concat backslash normalization (`wincapture.js:180`). Documented helper process restart, process name caching, and non-Steam game console window findings. Branch: `gemini/2026-10-14-bd010`. Claude (Windows) verifies findings.

- **BD-027** · both · Gemini · Research only, no changes to any computer. Phone notifications in Bladedeck (owner's
  idea; full brief in the owner's words: bubbles at the screen edge that stay small and fade, held LB + RB + a trigger
  opens one to read, letting go drops it into the notification bar).
  ```
  [TASK]     BD-027 · a short ranked list the lead can build from
  [TARGET]   both
  [OWNER]    Gemini
  [CONTRACT] none (research)
  [DO]       compare how console and streaming UIs show in-game notifications and why people turn them off;
             propose 3 bubble designs (look, motion, timing) that fit the blades look; rank the ideas: pop into the
             bar, a ring that fills while held, a colour and chime per sender, do-not-disturb per game,
             wait-for-pause, a glance strip, quick replies; name the risks (accidental opens, messages in screen
             recordings and clips, a phone flooding the PC)
  [RULES]    balance first: nothing takes over a game's screen (a quiet dot unless the owner allows a sender),
             do-not-disturb levels (off, friends, alarms only, all off), opt-in per phone app, local network only,
             kept for the session only; research and writing only
  [REPLY]    "BD-027 done" here with the ranked list (one screen, no essay); details in NIGHTLY-REVIEW-gemini.md
  ```
- **BD-028** · both · Claude (Windows) · After BD-024 and BD-027: build phone notifications. Phone side: forward an
  opt-in set of notifications over the existing companion channel (sender and text capped). PC side: the bubble,
  the hold-to-read gesture, the bar, do-not-disturb levels. Test copy with fake messages; nothing opens while a game
  has the screen. Network-facing, so Gemini audits it before merge.
### For Claude
- Things that need the owner's hardware: multi-screen on two screens, the DualSense speaker,
  the live view's remembered windows, Real-Debrid's file server with a real login, the
  walkthrough window following into a game.

### Waiting on the owner
- Try Rumbleverse from the PC blade (runs through Proton with umu-run) and say what happens.
- Discord Rich Presence needs his own Application ID (Suggested extras, Discord).

## Log

- **2026-10-15, Claude (Windows), lead: Gemini's BD-020/021/022 review (b8624bf) reviewed and merged.** Kept as written:
  fsaccess.js inside() no longer reads a folder named "..foo" as a parent; safeName() strips leading dots and spaces;
  scripts/pooltest.js has three more attacks (prototype keys on storage-reveal, null/{} ids, a "..\..\EvilGame"
  title); renderer/app.js handle() calls Warp.skip() so a controller button skips the Warp animation (merged by hand
  into the Calm handle()). npm run check and npm run test-pool: all passed. BD-021 had no code change.

- **2026-10-15, Claude (Windows), lead: idle cost measured per effect; Calm; downloads.** Test copy with the owner's
  library, CPU of the renderer and GPU processes over 12 s per step. Finding: ANY motion (ribbon, the wallpaper's
  Ken Burns zoom, even the 16 px downloads ring) kept the GPU process at ~99% of a core; nothing moving: 10%.
  Blur, the tint filter and frame rate barely mattered. So: Calm (renderer/app.js calm(), scenes.js, style.css
  body.calm): a minute without input and everything holds still until the next input; measured 24% -> 3%
  renderer, 100% -> 10% GPU. Also: the phantom "3 downloads" (Outlast, Huntdown, Blasphemous: installed on C:,
  "update required" leftovers on F:) came from 1662c5e building the installed-elsewhere set and never using it;
  fixed. Steam download manifests are read every 3 s only while Bladedeck is in front, every 20 s otherwise.
  CAVEAT: this PC is rendering in software right now (WebGL: "SwiftShader") because the RX 9070 XT is disabled,
  so every frame costs a core; in-use numbers need re-measuring with the card on. Linux: same code, please run a
  test copy and confirm Calm wakes on the controller. Shared files: main.js, renderer/app.js, scenes.js, style.css.

- **2026-10-15, Claude (Windows), lead: BD-026, System, Updates and System, Feedback and ideas (owner's ask).**
  New: updater.js (update-info, update-check, update-install, event update-progress), feedback.js (feedback-add,
  feedback-list, feedback-folder), renderer/updates.js (Updates and Feedback screens), scripts/buildinfo.js
  (build-info.json: the commit a build is made from; run by npm run dist and CI). Updates: two channels, Releases
  (GitHub's latest release) and Nightly (bladedeck-nightly); lists every commit between the installed build and the
  new one (merges and housekeeping left out) plus release notes; Update downloads the release's .exe or .AppImage,
  checks size and SHA-256, then the Windows installer runs silently and restarts Bladedeck, or the AppImage is
  swapped in by rename and Bladedeck relaunches. Checked 40 s after start and every 6 h; a toast, a system
  notification, and "Update ready" on the System item. Feedback: Fix or Idea, saved with the build (version,
  commit, OS, PC) and where in Bladedeck, to ~/Bladedeck/Feedback/feedback.md; the assistants read it each round
  (TEAM.md, step 1). Shared files: main.js (two registers; update-check/install blocked in test copies), preload.js,
  renderer/app.js (two System items, Updates.boot), renderer/extras.js (its automatic update check moved to
  Updates), renderer/index.html, renderer/style.css, package.json (files, dist runs buildinfo), CI (buildinfo step),
  SPEC.md (written: 274 channels; the 7 new ones are intended). Tested: check, spec, update checks against GitHub
  (old build on Nightly lists 8 fixes; head shows up to date; Release: v0.2.1 is older than 0.2.3-dev), the real
  v0.2.1 installer downloaded and checksum-checked with the install step stubbed, and both screens plus a saved
  feedback entry in a test copy. Not tested: a real install and restart (needs a newer release). Open: Nightly has
  no download until CI publishes a "nightly" pre-release on each push to bladedeck-nightly; that is outward-facing,
  so it waits for the owner's yes.

- **2026-10-15, Claude (Windows), lead: the shared branch is now `bladedeck-nightly` (owner's call).** The code and
  builds cover Windows and Linux, so "windows-fixes" is retired: `bladedeck-nightly` starts where windows-fixes ended
  and is where everyone's reviewed work collects; `master` is brought up to it after checks. windows-fixes is left on
  GitHub untouched (no branch is deleted without the owner). The overnight helper branches `nightly/<date>-<who>`
  keep their names. Older entries below still say windows-fixes; read it as bladedeck-nightly.

- **2026-10-15, Claude (Windows): BD-023, Gemini's BD-010 findings 3-7 fixed.** winlist.js: the helper starts
  again on the next question after it dies (at most every 10 s), and process names are looked up afresh each list
  (pid reuse). winpad.js: the controller helper restarts after it exits (2 s, doubling to a minute). procs.js: the
  Steam installdir map is cached 30 s; oneCoreWin pins a game to the first core on Windows ("Run on one processor
  core" worked only on Linux). Shared files: main.js (oneCoreWin after spawn, win32 only; the Mesa/NVIDIA/DXVK
  shader-cache variables are not set on win32, so Linux is unchanged) and steamlink.js (Windows games with their
  own environment start through a hidden wscript .vbs runner instead of a .cmd, which kept a console window open
  for the whole game). Tested: npm run check, npm run spec (267 channels), npm run sweep (51 items, no errors), and
  the .vbs runner end to end with a test program (environment, start folder, quotes and spaces in arguments).
  Not tested: a real non-Steam game through Steam (needs the owner's OK to restart Steam), the helper restart after
  a real sleep. Also found: the owner's RX 9070 XT shows as disabled in Device Manager (code 22), so screen capture
  and the AMF encoder fail until the owner re-enables it; the replay recorder test waits for that. Audit: BD-024.

- **2026-10-15 (night), Claude (Windows): Warp, a new way into a game (owner's idea).** Settings, Look and sound,
  "Into the game": Telescope (new default) or Classic. Telescope: the menu is tugged off the screen like a suction
  cup (edges strain, a rubbery stretch sound), lets go with a pop, falls away down a tunnel of frames each a shade
  lighter, becomes a point that twinkles, the black folds up like an accordion over a glow, and the game's art
  comes back slowly then all at once, slams in with a shake and a black to white flash (about 3 s). It runs beside
  the real launch, never delays it, replaces the classic ripple and intro, and any key or click skips it. Coming
  back from a game plays the tunnel in reverse (0.9 s). Transforms and opacity only. Test copy: every stage in
  order, finished, body restored, errors.log empty. Review: BD-022 (Gemini).

- **2026-10-15 (night), Claude (Windows): BD-014 wide, smooth clips.** Every game gets a wide backdrop: with
  no media of its own, Showcase plays the game's online clip full-screen (onlinemedia.js decides if online
  clips are on). The new layer is loaded and starts 350 ms after selection; it only becomes the front when
  "playing" fires (3 s fallback), so no black blink; replaced videos are unloaded; a turn counter stops a slow
  clip from replacing a newer one. body.sc-video makes atmos.js skip the poster preview, so one video decodes,
  not two. Test copy: at 200 ms the clip is loading behind the old picture, at 1.5 s it plays full-screen;
  errors.log empty; check 267. Note: on this PC no game has its own clip and yt-dlp is not installed, so online
  clips (and this backdrop) need yt-dlp (winget install yt-dlp.yt-dlp, owner's OK). Review: BD-021 (Gemini).

- **2026-10-15 (night), Claude (Windows), lead: master merged INTO windows-fixes; NOT yet into master.**
  windows-fixes now = master 5a24aaa + the Shared games pool fix (e95c0ba). Merging it into master needs a
  reviewer other than its author: the owner's OK, or Gemini's BD-020 audit PASS. Gemini's __lbrb change
  kept, plus a fix: openModal clears root.__lbrb, so a dialog opened over the storage map or consoles no
  longer pages the hidden one. Held OUT until reviewed and tested: scripts/nightly/nightly.ps1,
  install-tasks.ps1, claude-prompt-windows.md (still in history, cf4d29f) and the unpushed local commit
  2a5b399 on nightly/2026-10-14-win-night (made when nightly.ps1 was run by hand at 22:27/22:32). Checks:
  check 267 channels, test-pool 17/17, sweep 51 items no errors. Gemini's BD-020 worktree:
  ..ladedeck-gemini on gemini/2026-10-15-bd020. Next: owner steps 3-5, ROADMAP cards.

- **2026-10-14 ~22:45, Claude (Linux): HANDOVER. The laptop is dying; Claude (Windows) is now the lead.**
  State: master bcc8598 = 4944d12 + the 88b1b22 merge (PC port sharing, storage map). That merge
  was made by the Linux Antigravity agent in the main folder, unreviewed, and pushed by my next
  push. The owner chose to KEEP the features but fix them: Windows' BD-019 (windows-fixes e95c0ba)
  is the fix to review and merge (my own smaller fix-forward is in `git stash` on the Linux PC,
  superseded). The live-view webcam fix (4944d12) is on master but not yet in the installed Linux
  AppImage (installed = 557049f; reinstall on Linux when the laptop is back).
  Owner's guided steps: 1 Linux ufw opened (verified), 2 Nearby both ways (verified by the owner);
  next 3 send a file each way, 4 ROM sync pair + Sync now, 5 Windows firewall Private-only (owner).
  For the lead (Windows): review BD-019 incl. Gemini's renderer/app.js __lbrb change (affects
  Linux too), decide on scripts/nightly/*.ps1 and the unpushed nightly commit 2a5b399, merge into
  master, then ROADMAP.md (BD-011..018). Linux leftovers: worktree ~/Downloads/bladedeck-nightly/ag-probe
  (branch nightly/ag-probe) with an Antigravity window on it; a 12 h sleep inhibitor (stopped now).

- **2026-10-14, Claude (Windows): Shared games pool, fixing 88b1b22 (PC port sharing and storage map).**
  The owner chose to keep both features and fix them: games can be seen, but nothing is shared until it
  is moved into a pool. (1) ~/Games is no longer an always-allowed root. (2) xfer-prep-game takes a
  library id, not a path; main reads the game from library.json, refuses Steam games and any folder that
  holds more than one game (home, Desktop, Documents, Downloads, Games, Program Files, a drive root,
  Bladedeck itself), asks with a desktop dialog (dialog.showMessageBox, not a page modal), then copies
  the game into Bladedeck/Shared games: a ROM as its file, a .cue/.m3u with the tracks it names from
  its own folder (basenames only), a PC game as its folder without links. Nothing is unlocked by
  allowForSession any more. (3) xfer-pack-game takes a pool name only and zips with -snl into To phone.
  New: xfer-pool-list, xfer-pool-remove (pool only). (4) storage-map ignores the page's entries,
  reads the library itself, unlocks nothing, and "Show" is storage-reveal by item id. Files lists
  Shared games. ROM sync is untouched (its own folder and rules). Tests: `npm run test-pool`
  (17 attacks: page paths, unknown ids, Desktop games, Cancel, ../ in a .cue, links in a game folder,
  packing or removing outside the pool, the map unlocking nothing) all pass; check 267 channels;
  sweep 51 items, no errors. Needs: BD-019 review (Linux) and BD-020 audit (Gemini) before master.

- **2026-10-14, Gemini (reviewer): BD-010 Windows-only code review.**
  Audited `wincapture.js`, `winaudio.js`, `winpad.js`, `winlist.js`, `procs.js`, `system.js`, `steaminput.js`, `steamlink.js`, `netshare.js`, `romsync.js`, and `main.js` (`prewarmSteam`, `command()`, `launch`).
  - Fixed `tasklist` missing `{ windowsHide: true }` in `prewarmSteam` (`main.js:347`) to prevent startup console flash.
  - Fixed FFmpeg concat file path backslash normalization (`wincapture.js:180`) using forward slashes to avoid escape sequence corruption (`\n`, `\t`, `\r`) with Windows user paths.
  - Documented findings in `NIGHTLY-REVIEW-gemini.md`: PowerShell helper restart recovery on process death (`winlist.js`, `winpad.js`), process name cache PID reuse (`winlist.js`), persistent console window for non-Steam games launched via Steam (`steamlink.js:102`), single-core affinity enforcement on Windows (`main.js:401`), and synchronous Steam appmanifest disk I/O in `procs.steamInstallDirs()`.
  - Verification: `npm run check` clean (119 files, 267 channels); `node scripts/sweep.js --empty` clean (50 items opened, 0 errors, 16 blocked calls). Branch: `gemini/2026-10-14-bd010`.

- **2026-10-14, Gemini (Windows):** Windows Storage Map improvements & test-copy safety.
  Storage map on Windows (`storage.js`, `renderer/storagemap.js`, `renderer/app.js`, `main.js`):
  - Multi-drive support on Windows: `storage.disks()` now discovers drives `D:\` through `Z:\` in addition to C:\ and homedir, enabling the storage bar and item scan to recognize Steam and ROM libraries on secondary disks.
  - Safe session access: Added `fsaccess.allowForSession` for all scanned storage items (superseded the same night by the Shared games pool: the map unlocks nothing and Show goes by id) so clicking "Show" opens files located outside default ROOT/GAMES folders without security denials.
  - Storage Map controller & modal cleanup: `renderer/app.js` now enables `__lbrb` bumper cycling for any modal registering `root.__lbrb` (including Storage Map category filtering). Replaced raw `confirm()` with `confirmAsk()` for TV/controller friendliness. Replaced dummy `fsRevoke` with `api.captureDelete(p)` and hooked `api.onlineMediaClear()` for the cache cleanup action.
  - Test-copy safety: Added `xfer-pack-game` to `BLOCK` regex in `main.js` to prevent 7z game packaging from running in test copies during automated sweeps.
  - Verification: `npm run check` clean (119 files, 264 channels); `node scripts/sweep.js --empty` passed (50 items opened, 0 errors, 16 blocked calls). Branch: `gemini/2026-10-14-storage-debug`.

- **2026-10-14, Gemini (Linux):** PC port sharing & Storage Map.
  PC port sharing (`storage.js`, `fsaccess.js`, `preload.js`, `renderer/transfer.js`, `renderer/app.js`, `renderer/play.js`):
  Added support for sharing PC ports (`recomp`) and ROMs directly to paired phones or nearby friends over LAN.
  `Transfer.openGame(e)` prepares the game file, adds it to allowed roots (including `~/Games`), and if a PC port is a directory with assets, packages it into a .zip. Added "Share game" button to Tasks (console mode) and the PC mode drawer, plus "Choose a game (ROM or PC port)…" directly inside the Send files window.
  Storage map (`storage.js`, `renderer/storagemap.js`, `renderer/style.css`, `renderer/panels.js`, `renderer/voice.js`):
  Interactive storage map and disk breakdown showing how much space games, media, downloads and caches take, ranked from most to least space. Reads Steam game sizes directly from `appmanifest_<appid>.acf` (`SizeOnDisk`), ROM file sizes, PC port executable/folder sizes, captures in `Videos/Bladedeck`, and caches/downloads. Features a proportional multi-segment storage bar, category tabs (All, Steam, PC Ports, Emulation, Other PC, Media, Caches), ranked list with relative size bars and gold/silver/bronze badges for the top 3 items, sort toggles, and direct actions (Play, Show in folder, Share game, Clear cache). Accessible from System menu (Games & library and This PC), This PC panel's disk cards, and voice command ("storage map", "how much space").
  Tested: passes `npm run check` (111 files); storage scan, sorting, and game preparation verified with node test harness.

- **2026-10-14, Gemini (auditor): BD-003 audit: PASS.**
  Audited master `53c2aac..c05dbbc` (and through `51cfe08`).
  - SPEC §1: `npm run check` passed; all 261 channels match SPEC.md interface table.
  - SPEC §2: `romTidy` cleans unplayed Wine prefix clutter while preserving played games (`!e.playtime`).
  - SPEC §3: Network & sharing (`netshare.js`), ROM sync (`romsync.js`), 7-Zip (`archive.js`), and game info (`gameinfo.js`) match protocol and interface across Linux and Windows. Windows-specific code guarded by `process.platform === 'win32'`.
  - SPEC §4: Outward channels properly gated in `BLOCK` in `main.js`.
  - Fix on branch `gemini/2026-10-14-audit-bd003`: In `renderer/extras.js:135`, `extrasUpdate` returned `null` in test copies (`BLOCK`), causing `checkUpdate(false)` to throw `TypeError: Cannot read properties of null (reading 'ok')` 30 s after boot on empty/new profiles (`npm run sweep -- --empty`). Fixed with null-coalescing (`r?.ok`) in `renderer/extras.js` lines 100, 127, 135. Re-sweep verified 48 items clean, 0 page errors, exit code 0.

- **2026-10-14, installed:** Windows runs 0.2.3-dev = master ce9f9e1 (Help with add-ons, Network &
  sharing, ROM sync, tour chapters, readable Settings), installed by Claude (Windows) after a backup
  in Downloads\bladedeck-backups\2026-10-14-before-0.2.3-dev; sweep clean, errors.log empty. Linux
  runs 0.2.3-dev = master e609d1c too (built with npm run dist, start-tested in test mode, old
  app and config backed up in ~/Downloads/bladedeck-backups/2026-10-14-before-linux-0.2.3-dev). No release.

- **2026-10-14, Claude (Linux, lead):** Owner's asks: network privacy, Help, tutorial, readable Settings.
  Network & sharing (`netshare.js`, `renderer/netshare.js`, a Settings tab): Nearby, and ROM sync
  with it, only run on a home network (Windows Private, or a network marked home; the network at
  first run is marked home, so Windows' Public-labelled home Ethernet keeps working), unless "Also
  share on public networks" is on. Windows: the page shows Bladedeck's firewall rules and a
  "Match the firewall to my choice" button (UAC). Linux: the ufw line. Help (`renderer/help.js`,
  ❓ Help in the top bar, F1, System's first item): quick start, controls, guide, browser,
  settings with search, the tour by topic, voice control on/off and what to say, common questions.
  Tour: chapters (TOUR_CHAPTERS); the first run shows the 7-card Quick start only; new cards
  (Help, ROM sync, Network). Settings: switches, bold names with the explanation under them, page
  headers, a search box. romsync's drive check no longer makes folders on drives it only looks at
  (seen on Windows: D:..I:). Merged windows-fixes (scripts/windows/firewall-private.ps1 for the
  owner to run). Sweep: 50 System items, no errors.

- **2026-10-14, Claude (Linux, lead):** Team setup and debug round 2.
  TEAM.md (roles, branches, task cards, the debug loop with Gemini's audit, safety, the owner's
  test list), SPEC.md (shared interface; `npm run spec`, now part of `npm run check`, fails when a
  preload channel has no handler or the table drifts), Antigravity rules and workflows in
  `.agents/` (/bladedeck-audit, /bladedeck-review, /bladedeck-test). `npm run test-copy`
  (main.js TEST): scratch userData, no controller, no peek, outward channels answer null; one at
  a time. Backup before this round: ~/Downloads/bladedeck-backups/2026-10-14-pre-debug-loop/.
  Sweeps in test copies over the real library (48 System items, 7 blades and every game, pad
  input, 8 Settings tabs, every PC drawer window per game type, Browse, Get games, Guide, Settings
  save): fixed the walkthrough panel (loadURL before dom-ready), System > Downloads now opens the
  Downloads window, ROMs from Wine prefixes and default.xex names (one-time romTidy, art looked up
  again), art picks SteamGridDB's exact-name match from the console's years, a site with no search
  says so in Browse. Merged windows-fixes (BD-001/002 done on Windows; e860aa0 AMF replay
  reviewed: Windows-only, fine). Audit by lead (Gemini not running): npm run spec OK.
  Known: FaceBreaker (Xbox 360) gets the Wii K.O. Party cover, SteamGridDB has no other.

- **2026-10-14, Claude (Windows):** Debug round on master 2c7da57 (merged into windows-fixes).
  Replay: AMF encodes straight from ddagrab's GPU frames (e860aa0), ffmpeg 89% -> 5% of a core.
  archive.js: 7z.exe found in Program Files\7-Zip; .zip and .7z made by 7-Zip extract into new
  folders without overwriting, one-folder archives flattened. `npm run test-copy` (empty library,
  45 s) starts, blocks presence and extras-update, quits on time, errors.log empty. Firewall: the
  installed, dist and dev Bladedeck/Electron exes have inbound allow rules for all TCP and UDP
  ports on Private AND Public (Windows' own prompt made them); Nearby works, but WINDOWS.md wants
  Private only. Not changed, waiting on the owner. Not tested: the Downloads window, game info
  lookups and the Files menu in the UI (no scripted UI pass); yt-dlp is not installed.

- **2026-10-14, Claude (Linux):** Owner's list after the Windows run.
  Nearby one-way (Windows saw Linux, Linux never saw Windows, a file sent from Windows never asked):
  ufw on the Linux PC drops everything coming in (DEFAULT_INPUT_POLICY DROP, no rules), so hellos
  and offers never arrived. Not a Bladedeck bug; the owner runs the ufw line once (needs sudo).
  Nearby now says so when ufw is on without our port (`lan.js` firewall(), reads /etc/ufw), and
  the sender hears "they have not answered" after a minute, or "accepted, sending".
  Clips and music (`onlinemedia.js`): the 12 search results are sorted before one is taken
  (score(): the game's name and its sequel number in the title, no trailers, reviews, reactions,
  remixes or covers, long playthroughs start further in); Find another takes the next down the list.
  Checked on L4D2 (no longer the first Left 4 Dead), DBZ Sagas, Celeste. Old cached picks stay
  until Find another or Clear.
  About a game (`gameinfo.js`, `renderer/gameinfo.js`): kind, story, multiplayer and split screen
  under the details (console and PC), from Steam's store (genres, feature list) and Wikipedia
  (info box, Gameplay and Plot sections), cached in game-info.json. Settings toggle "gameInfo".
  Downloads: rows say what kind of file and which folder; a Downloads window (bar's "All
  downloads", or the dock) with Open/Show/Extract, both folders changeable (a folder picked there
  is allowed for Files), "Let Files see it" for one folder (never the whole home), and Show offers
  the system file manager when Files may not look there. 7-Zip (`archive.js`): Extract here and
  Compress to .zip/.7z from Files (Y or right-click) and Extract on finished downloads; one-folder
  archives are not nested twice. Dock: Browse and Downloads presets, added once to docks with room.
  Tested: npm run check; scoring and lookups against live YouTube/Steam/Wikipedia; 7-Zip on a
  scratch folder; the source build on a scratch profile (Steam link and Nearby off): game info in
  both modes, the Downloads window, a real download from a local server and its Extract, Files'
  menu; errors.log empty. Not tried: Windows (7z.exe path, Show in Explorer), the owner's real
  library, a controller in these new windows.

- **2026-10-14, Claude (Linux):** Night shift (`scripts/nightly/`): a systemd user timer runs
  `nightly.sh` at 01:00. Gemini reviews (gemini-prompt.md, NIGHTLY-REVIEW-gemini.md), then Claude
  verifies and fixes in passes until 07:00, its usage limit, or "NOTHING LEFT" (claude-prompt.md,
  NIGHTLY-REPORT.md). Each works in its own worktree under ~/Downloads/bladedeck-nightly on
  nightly/<date>-<who>, based on local master; nothing is pushed. Claude runs with acceptEdits and
  an allow-list (npm run check, node --check, read-only git and file commands, git add/commit);
  push, rm, installs and builds are refused (smoke-tested: check ran, push was denied). Gemini CLI
  0.64 refuses the owner's current sign-in (Code Assist for individuals retired; needs
  GEMINI_API_KEY), so it skips until a key is set. The Linux session reviews the branches in the
  morning. Off: scripts/nightly/install-timer.sh off.
  Also idle CPU: time-of-day tint only on #wall, ribbon 20/10 fps, glass only on the open blade
  (86% -> 40% of a core on Linux, menu idle).

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
