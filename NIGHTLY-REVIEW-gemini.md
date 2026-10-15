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
- All 129 files pass `npm run check`, 276 channels answered.
- 21/21 assertions pass `npm run test-replies`, 20/20 pass `npm run test-pool`.
- Full test copy sweep (`npm run sweep`) opened 54 System items with 0 page errors and 19 blocked outward calls.
- Release notes verified accurate against code; open findings BD-031 #2, #7, #8, #9 evaluated as harmless notes.

---

## 11. BD-034: Reproducing Linux Feedback on Windows (Extract While Downloading & "Hey Blade")
**Result: Reproductions Conclusive & Audited**

### A. Extract While Downloading (Reproduced on Windows with Scratch Directory)
Reproduced using a local HTTP server streaming a 20 MB archive slowly (`640 KB/s`) into an isolated test copy (`settings.dlDir` in temporary scratch folder).
1. **Downloads Window (`web-dl-act` with `act: 'extract'`):**
   - **What happens:** The action returns `{ res: true }` over IPC, but **nothing is unpacked**.
   - **Root Cause:** In `webdl.js:129`, extraction is guarded by `rec.state === 'completed'`. While the file is downloading (`rec.state === 'progressing'`), the condition evaluates to false, silently ignoring the extraction request.
   - **UI Glitch:** In `renderer/finder.js:39`, the "Extract" button is rendered whenever `d.archive && !d.unpacked`, regardless of `d.state`. As a result, users see an interactive "Extract" button on in-progress downloads, but clicking it produces no feedback and does nothing.
   - **Fix Recommendation:** Guard button rendering in `renderer/finder.js:39` with `d.state === 'completed'`, and let `web-dl-act` return an explanatory error (e.g. `"Wait for the download to finish first."`) if invoked while downloading.
2. **Files Panel (`archive-run` with `op: 'extract'`):**
   - **What happens:** Fails with `{ ok: false, error: 'It did not finish. The original is untouched.' }`.
   - **Root Cause:** In `archive.js:85`, `archive-run` immediately spawns `7z.exe x -y -o<dest> <file>`. Because Chromium is actively streaming and writing bytes into `<file>`, 7-Zip encounters an unexpected end-of-file / incomplete header, exiting with return code 2. `archive.js:56` deletes the temporary destination directory and maps the non-zero exit code to the user-facing error message `"It did not finish. The original is untouched."`.
   - **Fix Recommendation (from Linux patch):** Have `archive-run` check active download records in `webdl` and immediately refuse with `"That file is still downloading. Wait for it to finish."`.

### B. "Hey Blade" Voice Wake Word Audit on Windows (`renderer/voice.js` after `15f8bd5`)
1. **Model Requirement:**
   - `startWake()` checks `const st = await api.voiceStatus(); if (!st?.ready) return;`.
   - On a fresh install or before Voice setup is completed, the sherpa-onnx model (~30 MB) is not present. Without it, `startWake()` silently exits. The user must click "Turn on voice" in Settings/Voice once to trigger `api.voiceDownload()`.
2. **Windows Microphone Privacy Permission:**
   - `navigator.mediaDevices.getUserMedia(...)` requires microphone permission.
   - On Windows 10/11, if Windows Settings -> Privacy & security -> Microphone has "Let desktop apps access your microphone" toggled OFF, `getUserMedia` throws a `NotAllowedError`.
   - In `voice.js:110`, the `catch { stopWake(); }` block is silent. If permission is denied at the OS level, wake word listening silently halts with no toast or console feedback.
3. **AudioContext Sample Rate & Suspension:**
   - `wakeCtx = new AudioContext({ sampleRate: 16000 });`
   - While Chromium handles 16 kHz downsampling, if the AudioContext is created while the document or window is not in an active user-gesture state, Chromium may initialize the AudioContext in `'suspended'` state.
   - If `wakeCtx.state === 'suspended'`, `onaudioprocess` will never trigger. Adding `if (wakeCtx.state === 'suspended') wakeCtx.resume();` guarantees processing begins immediately.
4. **Pad Microphone Selection (`padMic`):**
   - When `settings.padMic` is enabled, line 65 queries devices matching `/dualsense|wireless controller|sony|stadia/i`. On Windows, DualSense enumeration can yield virtual audio endpoints that carry no microphone stream unless configured as the default recording device.

---

## 14. BD-044: Windows Bug Hunt (Whole App, Real & Isolated Test Copies)
**Result: 4 problems found and fixed on branch `gemini/2026-10-16-bd044`**

Drove all System items, Settings tabs, PC mode, Files, Downloads (local HTTP archive on 127.0.0.1), Updates, Feedback, Help, Guide, Storage Map, Companion notification bubbles, Multiplayer menu, and themes over DevTools CDP and manual automated suites.

### Problems Found & Fixed (worst first):
1. **On-Screen Keyboard (`OSK`) Close Race Condition (`renderer/pad.js:123`, `127`)**:
   - *What happened*: Tapping any controller button or d-pad direction while the on-screen keyboard is dismissing threw floods of `Cannot read properties of null (reading 'value')`.
   - *Cause*: `close()` immediately set `target = null;`, but left `el.hidden = false` for 200 ms while the closing fade animation completed. `isOpen()` checked `!el.hidden` (still true), allowing `handle()` to run and `draw()` to attempt reading `target.value`.
   - *Fix*: Updated `isOpen` to `() => !el.hidden && target != null;` and added null guards in `draw()`, `put()`, and `del()`.
2. **Unhandled Launch Rejection on Null (`renderer/app.js:441`)**:
   - *What happened*: When a game launch was blocked, refused, or returned null, line 441 ran `if (r.ok ...)` without optional chaining, throwing an unhandled promise rejection.
   - *Fix*: Changed to `if (r?.ok && r.viaSteam && !cover)` and `if (!r?.ok)`.
3. **`hovermusic.js` Startup Race (`renderer/hovermusic.js:54`)**:
   - *What happened*: Threw `Uncaught ReferenceError: S is not defined at hovermusic.js:54` in page console during initial page load.
   - *Cause*: `hovermusic.js` is loaded at line 118 in `index.html`, before `app.js` (line 134) declares `S`. If the 250 ms highlight watcher fired before `app.js` finished executing, `S.sel` evaluation threw a ReferenceError.
   - *Fix*: Added `if (typeof S === 'undefined') return;` at the top of the watcher interval.
4. **`web-dl-start` IPC Handler Destructuring Crash on Null (`webdl.js:129`)**:
   - *What happened*: Calling `api.webDlStart(null)` threw `TypeError: Cannot destructure property 'url' ... as it is null`.
   - *Cause*: Default parameter `= {}` only catches `undefined`, not `null`.
   - *Fix*: Changed signature to `(_e, opts = {}) => { const { url, kind = '', title = '' } = opts || {};`.
## 13. BD-043: Release-Candidate Audit for 0.2.5 (`git diff v0.2.4 origin/bladedeck-nightly`)
**Result: PASS (0 blockers, 0 regressions, safe to ship as 0.2.5)**

Audited all 15 commits since v0.2.4 (31 files changed, 433 insertions, 75 deletions):
1. **Voice Wake Listener Focus & Resource Tracking (`renderer/voice.js`)**:
   - `startWake()` guards against duplicate invocation with `wakeActive`. Idempotent.
   - `stopWake()` explicitly stops MediaStream tracks (`wakeStream.getTracks().forEach(t => t.stop())`) and closes the AudioContext (`wakeCtx.close()`).
   - `focus`, `blur`, and `deck-away` event listeners reliably sync state; when the launcher is blurred or away during gameplay, `syncWake()` triggers `stopWake()`.
   - `onaudioprocess` verifies `!wakeActive || listening || away()`, halting audio chunk gathering immediately if focus is lost mid-speech.
   - Microphone is never left streaming or decoding while a game runs.
2. **Delayed Archive Extraction (`extractWhenDone` in `webdl.js` & `archive.js`)**:
   - Two Extract clicks: once `d.extractWhenDone` is set, the button is suppressed in UI; subsequent IPC calls set the boolean idempotently.
   - Cancel mid-way: `item.once('done')` resets `rec.extractWhenDone = false` and `rec.note = ''` when `state !== 'completed'`, cleanly preventing post-cancel extraction.
   - Game downloads: `!x.rec.unpack` guard in `extractWhenDone` and `!d.game` in `finder.js:40` ensure game downloads follow standard automated unpack without conflicting triggers.
3. **Responsive 4:3 Poster Aspect Ratio (`renderer/style.css`)**:
   - Poster transitions from 2:3 (`--pw` width, `1.5 * --pw` height) to 4:3 (`2 * --pw` width, `1.5 * --pw` height) smoothly on `.pv-on`.
   - In narrow windows or when Now Playing / Running panels are extended, `body.np-on .detail .poster, body.run-on .detail .poster` overrides `--pw: clamp(150px, 12vw, 220px)`, preserving exact 4:3 geometry without overflowing the flex `.info` container.
4. **Android Java Audit (`android/src/dev/bladedeck/app/NotifyService.java`)**:
   - Verified compilation readiness: all imports present (`ByteArrayOutputStream`, `InputStream`, `OutputStream`, `HttpURLConnection`, `URL`, `JSONObject`, `JSONArray`).
   - Lambda thread capture: `json`, `url`, `auth`, `mine` are declared `final`.
   - Exception handling: inner polling loop wraps response parsing in `try-catch` so malformed responses don't abort background polling; `InterruptedException` handled cleanly; `SEMANTIC_ACTION_REPLY` guarded by `SDK_INT >= 28`.

---

## Summary
- `npm run check`: **All 129 files pass, 276 channels answered**.
- `npm run test-replies`: **21/21 assertions pass**.
- `npm run test-pool`: **20/20 security assertions pass**.
- Result: **BD-044 done: 4 problems found and fixed**.
- `node scripts/sweep.js`: **54 items opened, 0 errors**.
- Result: **BD-043 audit: PASS**.


