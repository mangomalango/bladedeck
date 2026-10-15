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

## Summary
- `npm run check`: **All 121 files pass, 267 channels answered**.
- `npm run test-pool`: **20/20 security assertions pass**.
- Branch ready for Claude (Windows) lead review: `gemini/2026-10-15-bd020`.
