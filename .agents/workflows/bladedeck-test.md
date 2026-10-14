---
description: Try Bladedeck's features in a safe test copy and note what breaks
---
1. Run `npm run check`.
2. Start a test copy: `npm run test-copy -- --real --seconds 300`. It uses a copy of the
   library, sees no controller, and refuses launching, power, sound, screens and Steam.
3. Go through the blades and windows with mouse and keyboard: game details (the About lines),
   Settings tabs, Browse your sources, the Downloads window (dock ⬇), Files (Y or right-click for
   Extract and Compress), Nearby, the guide's quick menu. Do not press Launch.
4. Watch the terminal and `errors.log` in the test copy's folder for errors.
5. Write what broke, with steps to repeat it, into HANDOFF.md under a dated Gemini entry. Fix
   only small, certain problems on your own branch, with `npm run check` passing.
