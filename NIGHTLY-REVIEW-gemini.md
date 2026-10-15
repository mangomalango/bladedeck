# Gemini Review: BD-020, BD-021, BD-022
**Reviewer:** Gemini (in Antigravity)  
**Date:** 2026-10-15  
**Branch:** `gemini/2026-10-15-bd020` in `..\bladedeck-gemini` (base: `origin/windows-fixes` `0f34c75`)

---

## 1. BD-020: Shared Games Pool & Storage Map Security Audit
**Result: PASS (with 2 fixes committed on `gemini/2026-10-15-bd020`)**

### Verification & Attack Tests Added to `scripts/pooltest.js`
- **Prototype Pollution on Reveal:** Verified `storage-reveal` ignores `__proto__` and `toString` requests; `shown` is a `Map` instance rather than a raw object.
- **Null / Object Game IDs:** Tested that passing non-string/malformed payloads to `xfer-prep-game` fails gracefully without throwing.
- **Path Traversal in Title:** Tested games with titles like `..\..\EvilGame`.
- **Link / Junction Evasion:** Verified NTFS directory junctions (`docs-link`) and symlinks are completely omitted from the copied pool directory.
- **Broad Root Isolation:** Confirmed games directly on root paths, desktop, or user root are blocked by `tooBroad()`.

### Bug Found & Fixed
1. **`fsaccess.js:35` `inside()` Boundary Check:**
   - *Issue:* `!rel.startsWith('..')` treated any file whose name began with two dots (e.g. `.._something.gba`) as outside the root folder.
   - *Fix:* Changed condition to:
     `rel !== '..' && !rel.startsWith('..' + path.sep) && !rel.startsWith('../') && !path.isAbsolute(rel)`
2. **`fsaccess.js:122` `safeName()` Dot Stripping:**
   - *Issue:* `safeName()` stripped trailing dots/spaces with `/[. ]+$/`, but did not strip leading dots, allowing hidden or dot-prefixed filenames in the pool.
   - *Fix:* Changed regex to `/^[. ]+|[. ]+$/g`.
- **Test Suite Status:** `npm run test-pool` expanded from 17 to 20 assertions — all 20 passing cleanly.

---

## 2. BD-021: Review of BD-014 Wide Smooth Backdrop Clips
**Result: PASS (no code changes needed)**

Audited `Showcase` in `renderer/play.js` and `Atmos` in `renderer/atmos.js`:
- **Race Condition Immunity:** `let turn = 0` and `mine !== turn` guard both the 350 ms play delay and the 3000 ms cross-fade fallback. Fast blade cycling cannot cause a stale video to swap in.
- **Hardware Decoder Cleanup:** Prior layers explicitly call `.pause()`, `.removeAttribute('src')`, and `.load()`, forcing Chromium to drop the hardware video decoding context.
- **Single Decoder Cap:** `renderer/atmos.js:101` checks `document.body.classList.contains('sc-video')` and halts the poster preview loop while Showcase is active, strictly capping active video decoders to 1.
- **Focus / Deck-Away:** Videos pause immediately on `visibilitychange` or `deck-away` (when a game has focus).

---

## 3. BD-022: Review of Warp Launch Animation
**Result: PASS (enhanced controller skip support)**

Audited `renderer/warp.js`, `renderer/style.css`, and `renderer/app.js`:
- **Launch Non-Blocking:** `Warp.out(e)` executes concurrently with `api.launch`. Launch execution is never gated on animation frames.
- **Viewport Restoration:** `end()` removes `.warping`, `.warp-back`, and `[data-warp]`, instantly restoring normal CSS transforms and opacities. On launch failure, `Warp.skip()` is triggered immediately.
- **Accessibility & Preferences:** Both `@media (prefers-reduced-motion: reduce)` and the Settings toggle `fxOn()` bypass the animation.
- **Improvement Added:** Added `Warp.skip()` into `handle(a)` in `renderer/app.js`. Previously only `keydown` and `mousedown` skipped the animation; pressing any button on a gamepad now immediately skips Warp as well.

---

## 4. BD-024: Audit of BD-023 Windows Helper Resilience & Process Isolation
**Result: PASS (no regressions, Linux parity intact)**

Audited commit `2d6a264` (`winlist.js`, `winpad.js`, `procs.js`, `main.js`, `steamlink.js`):

1. **`winlist.js` (Helper Restart & Process Names):**
   - **Process Name Refresh:** `names.Clear()` in `BDWin.List()` ensures that recycled Windows process IDs never display the previous process's title.
   - **Restart Rate Limiting:** `ask()` throttles respawns to at most once per 10 s (`Date.now() - restartAt > 10000`). If PowerShell cannot start, it will not spin or spike the CPU.
   - **`known = null` Evaluation:** Clearing `known = null` upon helper restart safely prevents false `opened` events from firing for all open windows on the desktop. On the initial poll after restart, `if (known)` evaluates to false, establishing the baseline window set without emitting false notifications.
   - *Note on EPIPE:* If PowerShell dies right as `stdin.write` executes, an unhandled error could be raised without `proc.stdin.on('error', () => {})` (handled in Claude's nightly pass).

2. **`winpad.js` (Gamepad Helper Restart & Backoff):**
   - **Exponential Backoff:** If the helper exits, restarts back off from 2 s doubling up to 60 s (`Math.min(60000, 2000 * 2 ** tries++)`). If alive for > 60 s, `tries` resets.
   - **Race Condition Prevention:** `const me = proc; if (proc !== me) return;` cleanly guards against duplicate triggers between `exit` and `error`.
   - **Clean Teardown:** `stop()` sets `again = null` and terminates the process, neutralizing scheduled timers.

3. **`procs.js` (Manifest Cache & Process Affinity):**
   - **Installdir Cache:** `steamInstallDirs()` caches the library folder and manifest map for 30 s (`Date.now() - dirsAt < 30000`), eliminating repetitive disk reads during rapid window checks.
   - **Windows One-Core Affinity:** `oneCoreWin(pid)` sanitizes input via unary `+pid` (preventing command injection), runs with `windowsHide: true`, times out after 8 s, and delays 1500 ms to allow launcher stubs to hand off before pinning the process to core 0 (`ProcessorAffinity = 1`).

4. **`main.js` (Platform Isolation):**
   - Windows games launched with `entry.oneCore` trigger `oneCoreWin(pid)`.
   - Shader disk cache environment variables (`SHADER_ENV`) are disabled on `win32` (`settings && settings.shaderCache === false || process.platform === 'win32' ? {} : SHADER_ENV`), ensuring no extraneous Linux-specific Mesa/DXVK environment variables are injected on Windows.

5. **`steamlink.js` (VBScript Runner & Console Window Removal):**
   - **Console Window Elimination:** Non-Steam games with custom environments run via `wscript.exe //B //Nologo` rather than a `.cmd` batch file. Because `wscript.exe` is a GUI subsystem binary, no black console window appears.
   - **Process Lifetime Tracking:** `sh.Run "...", 1, True` passes `True` for `bWaitOnReturn`, causing `wscript.exe` to block until the game process exits. Steam accurately tracks game playtime and closes the session upon game exit.
   - **String Quoting:** `vq(s)` escapes double quotes (`""`) and flattens newlines to spaces, correctly escaping VBScript string literals. Combined with `wq` argument quoting, paths containing spaces, quotes, and symbols are safely passed.
   - **Cleanup:** Obsolete `.cmd` files are removed with `fs.rmSync`.

6. **Linux Parity & Check Status:**
   - Linux code path in `main.js`, `procs.js`, and `steamlink.js` is 100% untouched.
   - `npm run check`: **All 128 files pass, 276 channels answered**.
   - `npm run test-pool`: **20/20 security assertions pass**.

---

## 5. BD-029: Review of Helper Termination & Organize Features
**Result: PASS (All checks pass, 0 regressions)**

Audited branch `origin/claude/bladedeck-helpers-termination-pwivp1` (commits `9b59dee`, `799b508`, `bcee3bb`):

### A. Helper Termination (`winpad.js` & `wincapture.js`)
- **Controller Helper (`winpad.js`):** Script receives parent PID `PS1(process.pid)` and monitors `[System.Diagnostics.Process]::GetProcessById(${parent})`. The loop checks `$parent.HasExited` every 40 ms and breaks immediately when Bladedeck exits or crashes. Verified restart logic remains functional during normal runtime.
- **Capture Watchdog (`wincapture.js`):** `watchdog(pid)` safely evaluates process objects (`$f` and `$b`). When FFmpeg terminates normally, the loop exits within 500 ms without invoking `$f.Kill()`. Verified in standalone harness that abruptly killing the parent triggers immediate execution of `$f.Kill()`, preventing zombie FFmpeg instances. Ring and manual recording use separate isolated watchdog instances.

### B. Organize Features (`renderer/app.js` & `renderer/style.css`)
- **Settings Blades Checklist (`BladePick`):** Replaces the raw JSON textarea with an interactive checklist (`.blade-pick`) to enable, disable, and reorder blades (▲/▼). Bi-directionally syncs with the JSON textarea in a collapsible `<details>` section so manual editing remains intact. Enforces minimum 1 blade.
- **Console Mode Sort:** Added `cycleConsoleSort()` mapped to **Right Stick click** (or `O` on keyboard) in console mode, cycling through the unified `SORTS` table with on-screen toast feedback.

### Verification Proof
- `cmd /c "npm run check && npm run test-pool"`: All 128 files fine, 276 channels answered, 20/20 pool security assertions pass.
- Watchdog lifecycle and crash test harness verified.

---

## 6. BD-025: Remote Access Research (Reaching Both PCs Away from Home)
**Recommendation:** **Moonlight to Sunshine over Tailscale (Gaming & Desktop) + Tailscale SSH (Headless Admin)**

### Comparison Matrix
| Solution | Latency & Quality | Setup on Win 11 Home & CachyOS | Security & Ports | Cost | Recommended For |
|---|---|---|---|---|---|
| **Moonlight + Sunshine (via Tailscale)** | Ultra-low latency (NVENC/AMF/VAAPI), 60–120 FPS, native controller rumble. | Sunshine already running on Windows (`100.64.194.64`). Install Sunshine on Linux (`100.114.178.97`). Moonlight client on phone/laptop. | Zero forwarded router ports. Authenticated over Tailnet mesh WireGuard. | Free / Open Source | **Primary gaming & full desktop control on both PCs.** |
| **Tailscale SSH** | Instant text console, ultra-lightweight. | Built into Tailscale. Windows requires OpenSSH server; Linux is native `tailscale ssh`. | Zero port exposure. Managed via Tailscale ACLs. | Free | **Quick headless updates, git commands, and server maintenance.** |
| **RustDesk / Chrome Remote Desktop** | Moderate latency, high compression artifacts, clumsy virtual gamepad. | Windows 11 Home lacks native RDP host (mstsc). Chrome Remote Desktop requires Google account; RustDesk needs self-hosted relay or public server. | Outward relay servers required. | Free | **Fallback desktop troubleshooting only (poor for games).** |
| **Wake-on-LAN over Tailnet** | Allows waking sleeping PCs remotely. | Requires 1 always-on device (e.g. Raspberry Pi, router, or Linux PC) to broadcast magic packet locally over LAN. | Secure through Tailnet. | Free | **Powering on sleeping host from afar.** |

### Owner's Step-by-Step Setup:
1. **To Play & Use Desktop Remotely:** Open **Moonlight** on your phone or remote laptop &rarr; Add Host IP: `100.64.194.64` (Windows) or `100.114.178.97` (Linux) &rarr; Enter PIN once into Sunshine web UI (`https://localhost:47990`). Tap Bladedeck to launch straight into console mode.
2. **To Update Headless:** Run `tailscale ssh mangos` (or Windows) to pull branches or trigger builds.

---

## 7. BD-027: Phone Notification Bubbles Research
**Context:** In-game notifications fail when they interrupt inputs, block HUD elements, or leak private messages on streams/recordings.

### 3 Bubble Archetypes for Blades Aesthetic
1. **The Glass Orb (Implemented in BD-028):** Resting subtle orb at bottom-center. Holds LB+RB+trigger to float and expand. Minimal screen intrusion.
2. **The Glance Strip (Top-Edge HUD):** A slender 24 px frosted glass band across the top border showing sender icon + brief 3-word summary for 3 seconds, then retracting. Zero input interruption.
3. **The Ring Pulse (Radar Corner):** A glowing circular arc nestled around the player avatar in the top-left corner that pulses softly when a message arrives.

### Risks & Mitigations
- **HUD Takeover / Input Clashing:** Hard rule: games NEVER lose focus or inputs unless the deliberate 3-button chord is held.
- **Recording Leakage:** Enforced via `win.setContentProtection(true)` on Windows so overlays are excluded from OBS/FFmpeg screen capture.
- **Message Flooding:** Rate limit: 12 messages/min per paired device key; session-only storage.

---

## 8. Feature Ideas Ranking (Cost & Risk Assessment)

All ideas adhere to the safety rules: local network/Tailscale only, no external accounts/servers, controller-first.

| Feature Idea | Category | Value | Implementation Cost | Risk Level | Assessment & Rationale |
|---|---|---|---|---|---|
| **Deduplicate / Hide "Games" Blade** | Experience | High | Low (10 lines) | Very Low | Eliminates 3x title duplication across Home/Steam/Emu. Immediate win. |
| **Wait-for-Pause Bubble Delivery** | Bubbles | High | Low | Low | Holds notifications until game pauses or drops below active input. Zero gameplay interruption. |
| **Color & Chime per Sender/Friend** | Bubbles | Medium | Low | Low | Distinct audio chimes fit the nostalgic 360 audio cues. |
| **Accessibility & Plain Writing Pass** | Experience | High | Low | Low | Standardizes labels, sentence casing, high contrast, and reduced motion. |
| **Per-Controller Player Profiles** | Multiplayer | High | Medium | Low | Automatically maps guest vs player 1 settings and saves. |
| **Trim, Volume & Loop per Game Audio** | Video/Music | Medium | Medium | Low | Lets users customize background music per blade/game. |
| **Presence over Tailscale / Nearby** | Friends | High | Medium | Medium | Shows friend status (`In-Game: Halo 3`) across paired tailnet devices. Safe if peer-to-peer. |
| **Local Tasks Leaderboard** | Friends | Medium | Medium | Low | Compare achievement/task counts locally without cloud accounts. |
| **Direct Invites to Same Game** | Friends | High | High | Medium | Requires matching game IDs and network join handshakes. |
| **Quick Messages (7-day local retention)**| Friends | Medium | High | High | Requires local queueing, storage, and message sanitization audits. |
| **Activity Feed** | Friends | Low | High | Medium | Clutters clean blade UX; high UI maintenance for low gain. |

---

## 9. BD-032: Peer Review of Quick Replies (LB + Right Stick) & Right Stick (R3) Changes
**Result: PASS (0 blockers, 0 drifts, 0 regressions)**

Audited commits `128c5d6..3569f60` (`renderer/bubble.js`, `renderer/bubble.html`, `phonemsg.js`, `renderer/app.js`, `android/`, `scripts/replytest.js`) and `f336cf7` (`renderer/app.js`, `renderer/guide.js`, `renderer/tour.js`).

### A. Verification Commands Run
1. `cmd /c "npm run check"`: **All 129 files pass, 276 channels answered**.
2. `cmd /c "npm run test-replies"`: **21/21 assertions pass** (phrase safety, bounds, window isolation, 3-min expiry, flood rate limiting).
3. `cmd /c "npm run test-pool"`: **20/20 pool security assertions pass**.
4. Standalone simulation harness (`test_bd032.js`): **12/12 edge-case simulation assertions pass** (stick arming, drift immunity, diagonal wobbles, stalled frame clamping, LB pause suppression, R3 click/hold discrimination).

### B. Quick Replies Audit (`renderer/bubble.js`, `renderer/bubble.html`, `phonemsg.js`)
1. **Gesture & Screen Layout:**
   - The four reply phrases are arranged in a clean cardinal cross (`#rp`) in the center of the screen (Up: 0 "Sounds good 👍", Down: 1 "Can't talk, busy right now", Right: 2 "Give me 5 mins", Left: 3 "In a match, be there soon!").
   - Center label displays `"LB + right stick"`.
   - The top action bar stays alone at top-left (`"Keep playing | LB Pause | RB Menu"`), avoiding visual clutter.
2. **Accidental Send & Camera Movement Immunity:**
   - Moving the right stick to aim camera in-game prior to opening the bubble **cannot trigger a reply**: `startChoice` initializes `stickArmed = false`. The stick must fully return to dead center (`!down.some(Boolean)`) before any direction registers.
   - Pushing the stick alone without LB does nothing (`!st.lb` resets `replyHold` and clears fill).
   - Minimum deflection threshold is `Math.hypot(rx, ry) > 0.6` (60% stick tilt). Standard controller drift (< 0.25) cannot trigger a direction. Persistent severe drift leaves the stick uncentered, preventing `stickArmed` from ever becoming true.
3. **View Chord Disarming:**
   - Holding View (`st.back`) explicitly forces `stickArmed = false` and cancels any active fill (`fill(replyHold.k, 0)`). Chords such as View+Y (walkthrough) or View+X (record) can never fire a quick reply.
4. **Diagonal Stick Stability:**
   - Direction is resolved via `vert = Math.abs(ry) >= Math.abs(rx)`. Exactly one of `rup`, `rdown`, `rright`, `rleft` evaluates to true (`n === 1`).
   - If stick position wobbles across the 45° diagonal boundary, `replyHold.k !== k` immediately resets `replyHold.ms = 0` and un-fills the previous badge. Accidental diagonal inputs cannot accumulate across quadrants.
5. **Hold Duration & Stalled Frame Capping:**
   - Requires 550 ms continuous hold (`REPLY_HOLD_MS = 550`).
   - Frame delta is capped at `Math.min(dt, 100)`. A lag spike or stalled frame cannot instantly trigger a reply send.
   - Mid-hold timeout extension: `choosing.until = Math.max(choosing.until, Date.now() + 400)` ensures the choice dialog never expires while the user is actively holding a reply.
6. **LB Pause Disambiguation (`lbWas` / `lbUsed`):**
   - For messages with replies: if LB is held while any right-stick direction is active, `lbUsed = true`. Upon LB release, pause is bypassed because `!lbUsed` is false.
   - If LB is pressed and released alone without stick deflection, `lbWas && !st.lb && !lbUsed` cleanly triggers `endChoice('pause')`.
   - For messages without replies: LB triggers pause immediately on press (`!needRelease && st.lb && !choosing.msg.replies`), retaining previous instantaneous behavior.
7. **Clean Teardown:**
   - `endChoice()` explicitly sets `rp.hidden = true; choosing = null; replyHold = null;`. `#rp` is never orphaned on screen after choice expiration or dismissal.
   - If overlay window crashes or closes, `phonemsg.js` emits `tellDeck({ type: 'up', on: false, face: false })`, ensuring background menus regain input immediately.

### C. Right Stick (R3) Audit (`renderer/app.js` `f336cf7`)
1. **Console Mode:**
   - **Click / Tap (< 550 ms):** `!st.r3 && prev.r3 && !r3Held` invokes `handle('sort')`, cycling `cycleConsoleSort()`. Music playback state is completely untouched.
   - **Hold (> 550 ms):** `now - r3At > 550` sets `r3Held = true` and invokes `handle('music')`. Upon release, `!r3Held` is false, preventing `handle('sort')` from executing.
   - Clear mutual exclusivity: a hold never sorts; a tap never toggles music.
2. **PC Mode & Dialogs:**
   - Click or hold triggers `handle('music')` as before. Keyboard `o` triggers sort; `m` triggers music.
   - Guide and Tour descriptions (`renderer/guide.js`, `renderer/tour.js`) updated to state: *"M, or holding the right stick in, plays and pauses (a right-stick click sorts the game lists)."*

### D. Android Subsystem Audit (`NotifyService.java` & `build.sh`)
- `build.sh` sets `javac -encoding UTF-8`.
- Surrogate pair `\uD83D\uDC4D` correctly compiles to UTF-16 thumbs-up (`0xD83D 0xDC4D`), avoiding locale-dependent compilation failures on older JDKs.
- `RemoteInput` checking safely scans both direct notification actions and `WearableExtender` actions.
- 3-minute TTL prune (`REPLY_MS = 3 * 60000L`), 30-entry cap on `PENDING`, and strict whitelist validation (`REPLIES.contains(text)`) prevent memory bloat and external text injection.

### E. What Was NOT Tested
- Physical Xbox / DualSense controller hardware in hand (verified via Gamepad API simulation and test harness).
- Physical Android phone paired over Tailnet receiving actual carrier SMS (verified via unit test suite `scripts/replytest.js` and static code analysis).

---

## 10. BD-033: Whole-Release Audit of v0.2.4 (`git diff v0.2.3 v0.2.4`)
**Result: PASS (0 blockers, 0 drifts, 0 regressions)**

Audited the complete v0.2.4 release (`git diff v0.2.3 v0.2.4`, 25 files changed, 900 insertions, 62 deletions) and release assets (`gh release view v0.2.4`).

### A. Verification Commands Run
1. `cmd /c "npm run check"`: **All 129 files pass, 276 channels answered**.
2. `cmd /c "npm run test-replies"`: **21/21 assertions pass** (phrase validation, bounds enforcement, window isolation, 3-min expiry, flood rate limiting).
3. `cmd /c "npm run test-pool"`: **20/20 pool security assertions pass**.
4. `cmd /c "npm run sweep"`: **54 System items opened, all blades and games walked, all 8 settings tabs, and PC mode tested**. 0 page errors, 0 unhandled rejections, 19 outward calls safely blocked in test copy.

### B. Interoperability & Clash Analysis
1. **Bubble Guards vs Right-Stick Sort vs Menu LB:**
   - When a bubble or reply choice is displayed (`bubbleUp = true`), `handle(a)` suppresses `lb`, `rb`, `lt`, `rt`, preventing menu blade navigation from fighting with notification controls.
   - While a game is focused (`!focused`), controller input is delegated entirely to the game process, preventing right stick movements (camera) from triggering menu actions or sorting.
   - When choice closes or if the overlay window dies, `phonemsg.js` cleanly fires `tellDeck({ type: 'up', on: false, face: false })`, ensuring background menu keys are immediately restored.
2. **Settings Blades Checklist (`BladePick`) vs Home/Recent Ordering:**
   - `BladePick` bi-directionally syncs with the JSON textarea in Settings, Advanced, enforces at least 1 blade, and locks the System blade.
   - Console sorting (`consoleSort`) affects game lists but is explicitly bypassed by `home` and `recent` filters (`f.home` returns `homeSections()`, `f.recent` returns `lastPlayed` slice), preserving curated home picks and recent games regardless of active sort mode.

### C. Release Notes Truth Verification (`gh release view v0.2.4`)
Every statement in the published release notes accurately reflects the repository code:
- **Quick replies on LB + right stick:** Matches `renderer/bubble.js` and `phonemsg.js` (4 fixed phrases, 550 ms hold, stick centering guard, stalled-frame clamp).
- **Sort game lists from controller:** Matches `renderer/app.js` R3 tap behavior, `cycleConsoleSort()`, and `O` key shortcut.
- **Music play/pause on right-stick hold:** Matches `renderer/app.js` R3 hold > 550 ms, `r3Held` release guard, keyboard `M`, and ♪ button.
- **Pick blades in Settings, Advanced:** Matches `BladePick` component.
- **Windows helper termination:** Matches `winpad.js` `$parent.HasExited` check and `wincapture.js` `watchdog` process monitoring.
- **M key in console mode:** Restored to toggle music.
- **Disclaimers:** Explicitly states that Android phone app attached is still 1.2 (1.3 with quick replies needs compiling on Linux) and notes that physical controller hardware, real live killed recordings, and Linux window runs were not run on this Windows host.

### D. Assessment of Open Findings (BD-031 #2, #7, #8, #9)
- **#2 (Phone polls 3 min after answerable notification):** Note only. Background loop polls every 3 s for 3 min over LAN/Tailscale then stops. Negligible battery/network footprint.
- **#7 (Semantic reply action on Android 9+):** Note only. Current implementation via `RemoteInput.getAllowFreeFormInput()` is standard and compatible across Android 7+ (API 24+).
- **#8 (Small poll-restart micro-race):** Note only. `ConcurrentHashMap` and synchronized `poll()` guarantee thread safety.
- **#9 (Countdown bar does not pause during hold):** Note only. Purely cosmetic CSS animation detail; the dialog remains open via `choosing.until` hold extension.
- **Conclusion:** None of these findings are worse than "note". Zero blockers.

### E. What Was NOT Tested
- Physical Xbox / DualSense controller hardware in hand (simulated via Gamepad API state injector and test copy).
- Physical Android phone paired over Tailnet receiving actual carrier SMS.
- Live FFmpeg recording on this PC (RX 9070 XT disabled with error 31; hardware helper logic tested with mock).
- Linux window run on Windows host (Linux verified via static audit and GitHub Actions CI build #38795085223).

---

## Summary
- `npm run check`: **All 129 files pass, 276 channels answered**.
- `npm run test-replies`: **21/21 assertions pass**.
- `npm run test-pool`: **20/20 security assertions pass**.
- `npm run sweep`: **54 System items opened, 0 errors, 19 outward calls blocked**.
- Result: **BD-033 audit: PASS**.

