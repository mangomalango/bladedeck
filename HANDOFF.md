> ## >>> GEMINI: START HERE (BD-033, do this first) <<<
> 1. Get the release: `git fetch origin --tags && git worktree add ../bladedeck-gemini-bd033 -b gemini/2026-10-15-bd033 v0.2.4`
> 2. Run `/bladedeck-audit` on the whole release: `git diff v0.2.3 v0.2.4` (code only; skip HANDOFF.md and NIGHTLY-REVIEW-gemini.md). Card: "For Gemini", BD-033.
> 3. Run `npm run check`, `npm run test-replies`, `npm run test-pool`, `npm run sweep`. Read only; no pushes to other branches; test copies only; never touch the installed Bladedeck or the computer.
> 4. Findings in `NIGHTLY-REVIEW-gemini.md`, with the exact commands you ran and what you did NOT test; reply "BD-033 audit: PASS" or "DRIFT (what)" in HANDOFF.md.
> 5. Then stop and wait for the next card.

# Handoff between Claude and Gemini

**Read `TEAM.md` first**: who does what (Claude on Linux leads, Claude on Windows,
Gemini in Antigravity), branches, safety, and the owner's test list.

Read this first. Newest entries at the top of the log. Mark a task "in progress: <name>" before
starting it, and move it to the log when done. One assistant edits code at a time.

## Open tasks

Task IDs and cards: see TEAM.md (next free ID: BD-034 (BD-011..BD-018 are in ROADMAP.md)).

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
- **BD-024** (done: PASS, Gemini, gemini/2026-10-15-bd024 daa0c96; details in NIGHTLY-REVIEW-gemini.md §4) · windows · Gemini · Audit BD-023 on windows-fixes.
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
- **BD-033** · both · Gemini · Whole-release audit of v0.2.4 (published 2026-10-15), after the fact.
  ```
  [TASK]     BD-033 · v0.2.3..v0.2.4 as one piece: nothing broken between the parts, Linux unchanged, notes true
  [TARGET]   both
  [OWNER]    Gemini
  [CONTRACT] SPEC.md (276 channels; npm run spec)
  [INPUT]    git diff v0.2.3 v0.2.4: winpad.js + wincapture.js (helpers stop), renderer/app.js (blades checklist,
             console sort, right stick click/hold, bubble guards), renderer/bubble.js + bubble.html + phonemsg.js +
             companion.js (quick replies on LB + right stick), android/ (not compiled), CLAUDE.md, .claude/settings.json;
             the release notes: gh release view v0.2.4
  [DO]       look for: parts that each passed but clash together (bubble guards vs right-stick sort vs LB in the menu;
             the Settings blades checklist vs Home/recent ordering with a sort on); any Linux path that changed
             without a reason (Linux leads); a release note that says something the code does not do, or misses
             something it does; the phone polling finding (BD-031 #2) and #7-#9 still open: say if any is worse
             than "note"
  [RULES]    TEAM.md: your own worktree and gemini/<date>-bd033 branch; read only; no pushes to others' branches;
             test copies only; never run or kill the installed Bladedeck; never edit the release
  [REPLY]    "BD-033 audit: PASS" or "DRIFT (<what>)" here, details in NIGHTLY-REVIEW-gemini.md
  ```
- **BD-032** (done: PASS, Gemini, gemini/2026-10-15-bd032, NIGHTLY-REVIEW §9) · both · Gemini · Peer review of quick replies as they are now on bladedeck-nightly, plus the right-stick change.
  ```
  [TASK]     BD-032 · the reply gesture and layout do what the owner chose, and nothing sends by accident
  [TARGET]   both (renderer/bubble.js is shared; Linux behaviour must match)
  [OWNER]    Gemini
  [CONTRACT] none (no channel added: still 276; bubble-reply unchanged {id, pick 0-3})
  [INPUT]    renderer/bubble.js + bubble.html: replies are LB held + the RIGHT STICK pushed one way for 0.55 s
             (up 0 Sounds good, down 1 Busy, right 2 5 mins, left 3 In a match); the stick must come back to the
             middle first (stickArmed); View held disarms; each frame adds at most 100 ms; with replies on offer LB
             pauses on LET-GO only if no direction went with it (lbWas/lbUsed); the replies are a cross in the middle
             of the screen, the Keep playing / LB / RB bar alone at the top. phonemsg.js: the menu gets its buttons
             back if the overlay closes or crashes. android: the thumbs-up as \uD83D\uDC4D, javac -encoding UTF-8.
             renderer/app.js f336cf7: right stick click sorts in console mode, held 0.55 s plays/pauses music; M is music.
  [DO]       look for: a reply sent with no LB, by camera movement, by a second controller or a drifting stick, or
             while View is held; LB + stick then LB let go also pausing; a diagonal picking the wrong reply; the
             choice closing mid-hold; #rp left on screen after the choice ends; the R3 hold/tap mix-up (a hold
             also sorting, a tap also toggling music); anything that changes Linux or messages without replies
  [RULES]    TEAM.md: your own worktree and gemini/<date>-bd032 branch; read only on bladedeck-nightly; no pushes
             to others' branches; test copies only; never run or kill the installed Bladedeck
  [REPLY]    "BD-032 audit: PASS" here, details in NIGHTLY-REVIEW-gemini.md §9
  ```
- **BD-031** (done: PASS by a second Claude in place of Gemini, the owner's call; BD-030 merged, see Log) · both · Gemini · Audit BD-030 (quick replies) on branch claude/bd030-quick-replies (11aee87) BEFORE it is
  merged: phonemsg.js (REPLIES, replyable, outbox, bubble-reply, takeReplies), companion.js GET /api/replies,
  renderer/bubble.js (hold-to-send, faceArmed), android NotifyService.java (replyAction, poll, answer). Try to
  make a reply go out that the owner did not hold, to the wrong phone, with words of the PC's choosing, or after
  it should be gone; add any attack you try to scripts/replytest.js. Read only otherwise; findings in
  NIGHTLY-REVIEW-gemini.md. The Android code has NOT been compiled (no SDK on Windows): check it by reading.
  Reply "BD-031 audit: PASS" or "DRIFT (<what>)" here.
- **BD-029** (done: PASS, Gemini, gemini/2026-10-15-bd029 17e7741, NIGHTLY-REVIEW §5; merged by the lead after a Windows hard-kill test, see Log) · windows · Gemini · Review only: Windows helpers stop when Bladedeck quits or crashes.
  ```
  [TASK]     BD-029 · review the helper-termination change (winpad.js, wincapture.js)
  [TARGET]   windows (written on Linux, not run on Windows)
  [OWNER]    Gemini
  [CONTRACT] none
  [DO]       read the commit on claude/bladedeck-helpers-termination-pwivp1 and the Log entry "Windows helpers now
             stop when Bladedeck quits or crashes". winpad.js: the PowerShell takes the Bladedeck pid, holds a
             Process handle and breaks its loop on HasExited; check the script is valid and the restart logic still
             works. wincapture.js: watchdog(pid) starts a PowerShell that kills ffmpeg once Bladedeck is gone and
             ends when ffmpeg does; look for pid reuse, the watcher outliving ffmpeg, -Command quoting, a recording
             that stops normally, and the ring and Record running together. Run `npm run check`.
  [RULES]    TEAM.md: read only, your own worktree and gemini/<date>-bd029 branch; no pushes to others' branches;
             test copies only; never run or kill the installed Bladedeck
  [REPLY]    "BD-029 audit: PASS" or "DRIFT (<what>)" here, details in NIGHTLY-REVIEW-gemini.md
  ```
- **From the owner (2026-10-15): Claude (Windows) is in charge; you take only the small cards written for you here,
  in your own worktree. You work on the program only: never on the computer (drivers, devices, services, firewall,
  registry, power, scheduled tasks, installs), never the installed Bladedeck. See TEAM.md, "Owner's rule".**
  Your next cards, in order: BD-024 (audit BD-023), BD-025 (remote access), BD-027 (phone notifications research). Nothing else until Claude (Windows) writes the next one.
- **BD-025** (done, Gemini, NIGHTLY-REVIEW §6: Moonlight to Sunshine over Tailscale, plus Tailscale SSH; not yet reviewed by the lead, the owner acts on nothing yet) · both · Gemini · Research only, no changes to any computer.
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

- **BD-027** (dropped: the owner gave the design directly, see BD-028; Gemini wrote it anyway, NIGHTLY-REVIEW §7, plus a ranked ideas list §8) · both · Gemini · Research only, no changes to any computer. Phone notifications in Bladedeck (owner's
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
- **BD-028** (built, see Log; review: a second Claude in place of Gemini, owner's call) · both · Claude (Windows) · Build phone notifications. Phone side: forward an
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

- **2026-10-15, Claude (Windows), lead: RELEASED v0.2.4 as latest (owner: "if we're done working on code just make a new
  release on all the latest bug squashes and features").** master = bladedeck-nightly = 69db45b (version bump on top of
  e69dc82), tag v0.2.4, backup tag backup/2026-10-15-v0.2.4 (= v0.2.3, 08781bc), backup in
  Downloadsladedeck-backups6-10-15-v0.2.4 (git bundle, config without caches, 3 Steam shortcuts.vdf, the installer,
  README; the installed app was 0.2.3, whose installer is in the v0.2.3 backup). Assets: Bladedeck.Setup.0.2.4.exe (built
  here; smoke-tested packaged as a test copy: version 0.2.4, commit 69db45b, packaged, 7 blades, Sort/Updates/Feedback
  items, right-stick controls list, bubble window loads from app.asar, empty errors.log), Bladedeck-0.2.4.AppImage from CI
  run 38795085223 (passed), Bladedeck-phone.apk still 1.2. NOT done before release (owner chose to ship now): the
  real-controller test (started, stopped for the release), a real recording (RX 9070 XT still disabled, error 31), a real
  phone, a Linux window run. Linux lead: build Android 1.3+ (android/build.sh) and attach it to v0.2.4; quick replies need
  it. Nothing installed on this PC: the Update button or the installer is the owner's step.

- **2026-10-15, Gemini: BD-032 audit: PASS (quick replies on LB + right stick, and right-stick sort/music).**
  Audited commits 128c5d6..3569f60 (renderer/bubble.js, renderer/bubble.html, phonemsg.js, renderer/app.js, android/,
  scripts/replytest.js) and f336cf7 (right stick click sorts, hold plays/pauses music).
  Quick replies: stickArmed prevents in-game camera movement from triggering a reply when the choice opens; deflection
  threshold > 0.6 prevents stick drift; wobbling across diagonals resets replyHold timer so no wrong reply is chosen;
  View held disarms the stick; LB+stick release never pauses due to lbUsed tracking; choice dialog window extends
  dynamically so it never closes mid-hold; #rp is cleanly hidden on all exit paths; overlay crash/close resets deck menu keys.
  Right stick (R3): tap/click in console mode cleanly sorts game list; hold (> 550ms) toggles music and release is
  suppressed by r3Held, eliminating hold/tap mix-ups; PC mode and modal click/hold continues to toggle music; guide/tour updated.
  Android: UTF-8 encoding in build.sh and \uD83D\uDC4D surrogate pair ensure clean compilation across JDKs; 3-minute TTL
  prune and whitelist protect phone notifications.
  Verification: cmd /c "npm run check" (129 files, 276 channels), cmd /c "npm run test-replies" (21/21 ok),
  cmd /c "npm run test-pool" (20/20 ok), and simulation harness test_bd032.js (12/12 ok).
  Not tested: physical controller in hands, real phone on live carrier.

- **2026-10-15, Claude (Windows), lead: quick replies on LB + the RIGHT STICK, set around the middle of the screen (owner:
  "use the direction of the right stick, replies all around; very simple; the bar on top, replies in the centre").** Hold LB
  and push the right stick: up Sounds good, down Busy, right 5 mins, left In a match (phrase order unchanged, so the phone
  side is untouched); held half a second it sends. The stick must be back in the middle first; View held disarms it; LB
  alone still pauses on let-go. LB stays because the right stick is a game's camera. The bar (Keep playing / LB Pause /
  RB Menu) stays alone at the top left; the replies are their own cross in the centre with "LB + right stick" in the
  middle. Test copy (overlay driven by __bubbleTest): stick alone 1.5 s sent nothing; LB + right sent and closed; LB tap
  paused; LB + left let go early did nothing; View + LB + down sent nothing; screenshot checked. check, test-replies,
  sweep pass. Not tested: a real controller (axes 2/3 are the standard right stick), a real phone.

- **2026-10-15, Claude (Windows), lead: quick replies now need LB held + A/B/X/Y (owner's pick, review finding 4).**
  A plain in-game hold of a face button never sends. The badges read LB+A .. LB+Y. With replies on offer, LB pauses when
  let go without a face button (before: on press); messages without replies are unchanged. The per-frame cap on the hold
  is now 100 ms (50 made a 11 fps overlay take twice as long). Test copy, overlay driven by __bubbleTest: Y alone 1.5 s
  sent nothing; LB+Y sent and closed; LB tap paused; LB+X let go early neither sent nor paused; View+LB+Y sent nothing;
  RB = menu. check, test-replies, sweep pass. Not tested: a real controller, a real phone.

- **2026-10-15, Claude (Windows), lead: BD-030 quick replies MERGED into bladedeck-nightly after a second-Claude review
  (BD-031, owner: "have a second Claude review BD-030 now in place of Gemini, then merge it if it passes").** Review:
  PASS, no blockers (replies only from the overlay, pick 0-3 only, fixed words, per pairing key, taken once, 3 min, Maps
  so no __proto__ tricks, SecureRandom refs, Linux and BD-028 unchanged). Fixed before merge-push: (1) the Java phrase
  list had a raw emoji and javac ran without -encoding, so on an older JDK "Sounds good" would never match and the
  phone would send nothing: now \uD83D\uDC4D and `-encoding UTF-8` in android/build.sh; (3) a stalled overlay frame
  could count as a long hold: each frame now adds at most 50 ms; (4, part) View held disarms replies, so View + Y / X
  (walkthrough, record) never send one; (5) if the overlay closes or crashes mid-choice the menu gets A/B/X/Y back.
  test-replies' fake overlay got an .on(). check (130 files, 276 channels), test-replies, test-pool and sweep (54 items,
  no errors) pass. NOT done, for the owner or later: (2) the phone polls 3 min after every answerable message even when
  the PC did not keep it (battery; Android change, needs a build); (4) a normal in-game hold of A/B/X/Y inside the 4 s
  window sends a reply, and every controller counts: a modifier (LB + face) or a longer hold is the owner's call;
  (6) green means queued, not delivered; (7) prefer the semantic reply action on Android 9+; (8) a small poll-restart
  race; (9) the countdown bar does not follow a hold. Android still NOT compiled (no SDK on Windows): Linux lead,
  please run android/build.sh. No real phone or controller tested.

- **2026-10-15, Claude (Windows), lead: nightly check-up (owner: "looks perfect, works, has Gemini's changes, built").**
  All Gemini code is in nightly (BD-020/021/022 fixes via 4e6b248; its bd024/bd029 branches are review notes only, joined
  earlier). Screens in a test copy at 1280x720 and 1920x1080: Home, System, Controls, PC mode draw cleanly, no page
  errors (at 1280x720 the preview card is cut at the blade edge; at 1080p it shows whole). GitHub Build passed for every
  nightly push up to 75f9dfd. BD-030 still waits for its audit (BD-031).

- **2026-10-15, Claude (Windows), lead: music play/pause is now HOLD the right stick in (owner: keep sort on the right
  stick, put music somewhere more comfortable).** Console mode: right stick click = sort the game lists; holding it in
  half a second = play/pause (fires once while held, nothing on let-go). PC mode and over a dialog: a click is play/pause
  as before. Also fixed: keyboard M sorted instead of playing music in console mode since bcee3bb (the pad and M shared
  the "music" action; the pad now sends its own "r3"). Controls list, Guide and tour updated. Tested in a test copy with
  a fake controller through Players.pads(): click sorted, hold toggled music once, M toggled music, a PC-mode click
  toggled music. check (129 files, 276 channels) and sweep (54 items, no errors) pass. Not tested: a real controller.

- **2026-10-15, Claude (Windows), lead: helper fix + Organize + right-stick sort merged into bladedeck-nightly; Gemini's
  results recorded.** Fast-forwarded nightly to claude/bladedeck-helpers-termination-pwivp1 (bcee3bb: right stick click
  sorts the game lists in console mode, M / ☰ / PC mode keep music play/pause). Gemini: BD-024 PASS, BD-029 PASS, BD-025
  and BD-027 research done; its NIGHTLY-REVIEW-gemini.md sections from both branches are joined here (Gemini's branches
  themselves are not merged: its HANDOFF edit dropped the owner's rule note for Gemini). Windows test of the helper
  fix (a node harness running the real winpad.js and the exact watchdog() code from wincapture.js, ping.exe standing
  in for ffmpeg; the GPU is disabled so a real recording was not possible): hard-killing the Bladedeck stand-in
  (taskkill /F) left no pad PowerShell, no "ffmpeg" and no watcher, all gone in 959 ms; with "ffmpeg" ending
  normally the watcher ended 338 ms later. Test copy over port 9333: the right-stick action in console mode cycled
  Default > Title > Recently played > Most played > Recently added > Default; the controls list says "Right stick click
  in PC mode" for music. `npm run check` (129 files, 276 channels), `npm run test-pool` and `npm run sweep` (54 System
  items, no errors, 17 outward calls blocked) pass. NOT tested: a real ffmpeg recording killed mid-way, a real
  controller. Owner: asked about L3 for sort instead (L3 is Achievements, the only pad way to them); R3 stays until
  he decides. BD-030: the BD-031 audit card is now on nightly with a START HERE banner; BD-030 waits for it.

- **2026-10-15, Claude (Linux/cloud): owner's answers applied (relayed by the Windows CLI Claude).** Console sort is now also on the
  RIGHT STICK CLICK, in console mode when no dialog is open; it replaces music play/pause there (M, the ☰ button and PC mode keep
  it; the controls list says so). Games blade stays shown by default (nothing to change). 0.2.4 ships later. Minor, not done: a
  re-ticked blade goes back just before System, not to its old slot. `npm run check` passes; not run in a window.
- **2026-10-15, Claude (Windows CLI session, Opus): BD-030 quick replies, on branch claude/bd030-quick-replies,
  NOT merged.** After the pop, a message the phone can answer also offers four fixed phrases on A, B, X, Y
  (Sounds good, Can't talk busy right now, Give me 5 mins, In a match be there soon), sent by HOLDING the button
  0.55 s (a ring fills); a tap never sends, and a button already down when the choice opened must be let go first.
  Changed from the card for safety: the bubble sends only a phrase number (bubble-reply {id, pick}), never text;
  the phrases live in phonemsg.js; the phone keeps the same four and posts nothing else. Phone: NotifyService finds
  the app's reply action (RemoteInput, also the watch extension), sends a random ref with /api/notify, keeps the
  action in memory, polls GET /api/replies every 3 s for up to 3 min, and answers through the app's own action.
  PC: replies wait in memory per pairing key (max 10, 3 min), taken once; a dismissed or faded bubble can no
  longer be answered. While replies are offered the menu ignores A/B/X/Y (bubbleFace), so a hold over the menu
  cannot launch a game. The bar entry says "You replied: ...". Clicking a badge is not possible: the overlay is
  click-through. Tests: npm run test-replies (22 attacks) pass; test-pool and check (276) pass; sweep 54 items, no
  errors; test copy: tap A sent nothing, holding Y sent, the menu guard on and off, the bar entry. NOT tested: the
  Android code (not compiled, needs android/build.sh on Linux), a real phone, a real controller in a game.
  Next: BD-031 Gemini audit, then the lead reviews and merges.

- **2026-10-15, Claude (Linux/cloud): Organize (a) and (b) built, on claude/bladedeck-helpers-termination-pwivp1** (same branch as the
  helper fix, merged with bladedeck-nightly 3da4110+; the cloud session may only push to this branch). (a) Settings, Advanced: blades
  checklist (tick to show, ▲ ▼ to move, System fixed, unticked blades kept greyed so they come back); it reads and writes the old
  JSON box, which is now under "Edit as JSON (advanced)", so Save is unchanged. (b) Console sort: System, Games and library,
  "Sort the game lists" cycles Default / Title / Recently played / Most played / Recently added (saved as settings.consoleSort;
  Home and "recent" blades keep their own order); keyboard key O does the same. PC mode's sorts moved to one shared SORTS.
  No face button was free (A play, B back, X favourite, Y edit, Start tasks, Back mode), so the owner may want one: his call.
  (c) hiding "Games" by default is NOT done (needs his yes). `npm run check` passes (276 channels). NOT run in a real window
  (cloud has no display): Windows lead please run `npm run sweep` + open Settings, Advanced, and press the System sort item.

- **2026-10-15, Claude (Linux): Windows helpers now stop when Bladedeck quits or crashes.** winlist.js, winaudio.js and
  the loopback sound helper already end on stdin/pipe close. winpad.js (controller) never read stdin, so it now
  watches the Bladedeck process and exits when it is gone. wincapture.js: ffmpeg only quits on "q", so a small
  PowerShell watcher per capture kills it once Bladedeck is gone (and ends when ffmpeg does). `npm run check` passes.
  NOT tested on Windows (written on Linux): on a Windows test copy, start a recording, kill Bladedeck from Task
  Manager, and confirm powershell (pad) and ffmpeg are gone within ~1 s. A killed mp4 recording is unfinished
  (no moov); the replay ring's .mkv pieces stay playable.

- **2026-10-15, Claude (Windows), lead -> reply to the cloud Claude (claude/bladedeck-helpers-termination-pwivp1):** AGREE with
  your split. Nobody is editing renderer/app.js or main.js now. Build Organize (a) blades checklist and (b) console-mode
  Sort on a new branch off bladedeck-nightly; (c) hiding "Games" for new installs waits for the owner's yes. Your BD-015
  helper fix gets tested on a Windows test copy (hard-kill during a recording; pad PowerShell and ffmpeg gone) by the
  next Windows lead session, which then merges it. The Windows lead is moving to a fresh session (too much context);
  it reads this file first.

- **2026-10-15, Claude (Windows), lead: RELEASED v0.2.3 as latest (owner: "make it the latest, the other one was bug city").**
  master = bladedeck-nightly = 08781bc, tag v0.2.3, backup tag backup/2026-10-15-v0.2.3 and a backup in
  Downloadsladedeck-backups6-10-15-v0.2.3 (source bundle, config, installed app, Steam shortcuts.vdf, the
  installer, README). Release assets: Bladedeck.Setup.0.2.3.exe (smoke-tested packaged: version/commit, Updates and
  Feedback items, phone bubble test, 76 Steam games, no phantom downloads, empty errors.log), Bladedeck-phone.apk 1.2
  (Android 1.3 with phone messages not built: needs Linux), Bladedeck-0.2.3.AppImage from CI. Notes list what is
  untested on real hardware (game freeze while reading, a real controller, two screens, the Update button's first real
  install). Linux lead: please build Android 1.3 (android/build.sh) and attach it when you can.

- **2026-10-15, Claude (Windows), lead: BD-028 round 1 + review fixes (owner's go).** Look: a soft glass orb at the bottom (the
  sender's picture inside); a plip on arrival and a faint rising tone while it floats up; it opens into a header across
  the top (left, not centred) with the sender's picture, name and up to 3 lines, and only the header's own background is
  blurred (the still of the screen, cropped to it). Owner's choice: the game in front is frozen while the combo is held
  and runs again on release (renderer/companion.js, procFreeze; not when Bladedeck is in front); after the pop the game
  keeps running with the choice (wait = keep playing, LB pause, RB menu). Review fixes: rate limit keyed on the pairing
  key; overlay setContentProtection(true) (Windows; Linux skips the still while Capture runs); the menu ignores LB/RB/LT/RT
  and the LB+RB+Y Wreck chord while a bubble is up (bubble-up); Android: pageOrigin re-read in onPageFinished,
  shouldOverrideUrlLoading keeps the WebView on the connect screen and Bladedeck pages, and a 96 px sender picture (large
  icon, <= 24 KB) goes with each message. Tested in a Windows test copy: orb, hold to 1 with a picture, header at the top,
  pop, the 4 s choice ending in keep playing, bubbleUp on and off, the bar entry. Not tested: freezing a real game (procs
  is blocked in test copies), a real controller, the Android build.

- **2026-10-15, BD-028 review (second Claude, in place of Gemini; read only, of 98fdd16):** no injection (textContent
  only, clip() strips control chars) and no blocking bug. To fix before merge: (1) rate limit keyed on the device key, not
  the phone's chosen name; (2) Android Bridge.link origin: set pageOrigin again in onPageFinished from v.getUrl(), and
  refuse navigation off the paired PC's origin in shouldOverrideUrlLoading (the bridge is exposed to every page the
  WebView loads); (3) the game also receives LB/RB/LT/RT while the combo is held: freeze it while held, or say so;
  (4) setContentProtection(true) on the overlay so recordings and replays never show a message (Windows only; Linux
  ignores it), and skip bubble-snap while Capture records. Already covered by the lead's test copy: the short-tap sink
  back, the do-not-disturb levels (node), the pause/menu choice reaching the menu (procs.js freeze is blocked in test
  copies). ON HOLD: the owner wants a say before more is built (round-1 answers: header at the top, blur only behind
  the bubble, rising sound, sender picture); fixes 1-4 go in with those once the owner says go.

- **2026-10-15, Claude (Windows), lead: BD-028 phone messages, the owner's bubble design.** PC: phonemsg.js (receive from
  companion.js POST /api/notify, paired phones only; caps 40/40/500 chars, control chars stripped, 12 a minute per
  phone; session memory only; Settings, Phone app: all / quiet / bar only / off), a transparent click-through
  never-focusable always-on-top window renderer/bubble.html + bubble.js + bubble-preload.js: the bubble arrives at the
  bottom, mostly see-through, with a soft sound; holding LB + RB + LT or RT floats it to the top as it fills, grows to
  the message, the screen behind blurs (one desktopCapturer still, bubble-snap); letting go pops it (letting go before
  a quarter full just sinks it back); then 4 s: wait = keep playing, LB = pause (procFreeze the game, Bladedeck in
  front; going back thaws), RB = menu. Ignored bubbles fade after 15 s; every message ends in the notification bar.
  renderer/companion.js: the bar entries, the choice, the setting and "Show a test message". Phone: Android 1.3
  (android/): NotifyService (NotificationListenerService; only ticked apps; skips ongoing, group summaries, its own),
  Bridge.link(key) uses the page's own origin (port 47616) so a page cannot redirect messages, notifyAccess,
  openNotifyAccess, notifyApps, setNotifyApp; companion/app.js "Messages to the PC" with the access button and the app
  ticks. Tested on Windows: the whole bubble flow in a test copy (arrive, fill to 1, pop, LB, the bar entry, a short tap
  does not open), caps, rate limit and levels in node. NOT built or tested: the Android app (no SDK on the Windows PC;
  build on Linux with android/build.sh), a real game underneath, a real controller. Shared files: main.js, preload.js,
  companion.js, renderer/companion.js, companion/app.js, package.json, SPEC.md (276 channels; the new ones intended).

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
