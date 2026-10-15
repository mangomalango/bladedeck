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

## Summary
- `npm run check`: **All 128 files pass, 276 channels answered**.
- `npm run test-pool`: **20/20 security assertions pass**.
- Branch: `gemini/2026-10-15-bd024`.

