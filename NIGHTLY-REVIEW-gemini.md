# Nightly Code Review: Windows Subsystems (BD-010)
**Reviewer:** Gemini (in Antigravity)  
**Date:** 2026-10-14  
**Branch:** `gemini/2026-10-14-bd010` (tracks `gemini/2026-10-14-storage-debug` and `origin/master`)

---

## 1. Summary of Scope
Audited all Windows-specific subsystems and modules:
- `wincapture.js` (FFmpeg screen capture, loopback audio helper, replay ring joiner)
- `winaudio.js` (Core Audio COM interop via persistent PowerShell process, volume/mute/endpoints)
- `winpad.js` (XInput controller chord/combo listener via background PowerShell)
- `winlist.js` (EnumWindows / DwmGetWindowAttribute top-level window manager and screen placement)
- `procs.js` (Process tree suspension, WMI ancestor lookup, Steam appid detection)
- `system.js` (Windows power states, Wi-Fi profile generation, WMI brightness)
- `steaminput.js` (VDF parser and host_suspend controller binding cleaner)
- `steamlink.js` (Shortcuts.vdf generator and launch wrapper scripts)
- `netshare.js` & `romsync.js` (Network category, firewall rules, multi-drive space planning)
- `main.js` (`prewarmSteam`, `command()`, `launch` handler, process cleanup hooks)

---

## 2. Verified Issues & Fixed in this Branch

### 1. Prewarm Steam: Missing `windowsHide: true` on `tasklist` (`main.js:347`)
- **Issue:** 3 seconds after Bladedeck startup, `prewarmSteam()` called `child_process.execFile('tasklist', ...)` without `{ windowsHide: true }`. On Windows, this caused a momentary black console window flash on launch.
- **Fix:** Added `{ windowsHide: true }` to `execFile('tasklist', ...)`.
- **Status:** Fixed and verified clean in `main.js`.

### 2. FFmpeg Replay Ring Concat: Windows Backslash Escaping (`wincapture.js:180`)
- **Issue:** `saveRing()` wrote ring segment paths into `join.txt` with raw Windows backslashes (`C:\Users\...`). In FFmpeg's concat demuxer file format, backslashes act as escape characters unless escaped (`\\`) or converted to forward slashes. A username starting with letters like `n`, `r`, or `t` can result in escape sequence corruption (e.g. `\n` parsed as a newline).
- **Fix:** Replaced backslashes with forward slashes: `p.f.replace(/\\/g, '/').replace(/'/g, "'\\''")`. FFmpeg on Windows handles forward slashes cleanly across all versions.
- **Status:** Fixed and verified in `wincapture.js`.

---

## 3. High-Priority Findings for Claude Night-Shift / Lead Review

### 3. Persistent Helper Process Crash Recovery (`winlist.js`, `winpad.js`)
- **Issue:** Both `winlist.js` and `winpad.js` spawn a persistent PowerShell background process on startup. If that PowerShell process terminates (e.g. due to system sleep/resume, transient OOM, or unhandled exception), `proc` is set to `null` by the exit handler, but is **never restarted**.
- **Impact:** 
  - `winlist.js`: `ask('list')` returns `'[]'` indefinitely. The dock, Quick Resume, and game window focus tracking stop functioning silently for the rest of the session.
  - `winpad.js`: In-game controller chord detection (View+Menu, View+X recording, View+RB clip) permanently ceases.
- **Recommendation:** Implement lazy auto-restart on query (similar to `winaudio.js:ask()` which calls `start()` before dispatching commands), or a restart counter with exponential backoff on unexpected exit.

### 4. Process ID Reuse in Window Listing Cache (`winlist.js:35, 41-45`)
- **Issue:** `BDWin.Name(int pid)` caches process names in a static `Dictionary<int, string> names`. Windows frequently reuses process IDs. When an application closes and a new process inherits its PID, `winlist.js` continues reporting the old process's name.
- **Impact:** Can cause window matching, Steam guard, or process categorization to misattribute windows.
- **Recommendation:** Clear `names.Clear()` on each poll enumeration in `List()`, or cache with process start time verification (`p.StartTime`).

### 5. Console Window Stays Open for Non-Steam Games Launched via Steam (`steamlink.js:102-108`)
- **Issue:** When Steam launches a non-Steam game that has custom environment variables, `steamlink.js` generates a `.cmd` batch script. On Windows 10/11, launching a `.cmd` file triggers `cmd.exe` (or Windows Terminal) in an interactive console window that stays open for the entire duration of the game.
- **Cause:** `command()` in `main.js` unconditionally attaches `SHADER_ENV` and `SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS`, meaning `c.env` is never empty.
- **Recommendation:**
  1. Guard `SHADER_ENV` on Windows (`process.platform !== 'win32'`), as Mesa/DXVK environment variables are not utilized by native Windows games.
  2. For games requiring environment variables, launch via a hidden Windows Script Host (`wscript.exe` / `.vbs`) or PowerShell runner using `-WindowStyle Hidden`.

### 6. Single-Core Affinity on Windows (`main.js:401`)
- **Issue:** `entry.oneCore` currently checks `process.platform === 'linux' && onPath('taskset')`. On Windows, older retro PC titles that lock up or crash on multi-core processors (e.g. early 2000s Direct3D titles) have no core-affinity enforcement.
- **Recommendation:** When `entry.oneCore` is active on Windows, set affinity post-spawn via PowerShell `(Get-Process -Id $pid).ProcessorAffinity = 1` or a lightweight `kernel32.dll!SetProcessAffinityMask` call in `procs.js`.

### 7. Synchronous Disk I/O Thrashing in `procs.steamInstallDirs()` (`procs.js:181-194`)
- **Issue:** On Windows, `infoWin(pid)` calls `steamInstallDirs()` on every invocation. `steamInstallDirs()` reads `libraryfolders.vdf` and re-reads every `appmanifest_<appid>.acf` file across all mounted drives synchronously.
- **Impact:** On systems with multiple libraries and hundreds of installed Steam titles, this creates unnecessary continuous disk and file descriptor churn.
- **Recommendation:** Cache the `installdir -> appid` map with a TTL (e.g. 30 seconds), invalidated only when library size or directory timestamp changes.

---

## 4. Verification & Health
- `npm run check`: **PASS** (119 files verified, 264 channels answered).
- `node scripts/sweep.js --empty`: **PASS** (50 system items opened, 0 errors, 16 test-copy outward channels blocked).
- Git state: Committed on `gemini/2026-10-14-bd010`.
