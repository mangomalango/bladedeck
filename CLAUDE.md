# Bladedeck: rules for Claude

Start with TEAM.md ("Owner's rule"), then HANDOFF.md (newest Log entries at the top). WINDOWS.md on Windows.

## Style
- Terse and direct, no preamble. Plain words for the owner; say what was and wasn't tested.
- End each update to the owner with a "Model:" line (the model and effort for the next step).

## Workflow
- Before editing more than 1 file, give a short numbered plan: file, then the change.
  - For a task the owner gives in chat: wait for his OK.
  - For a task already on a HANDOFF.md card, or sent by the lead session: show the plan and go.
- After a change: `npm run check`; `npm run sweep` for UI changes; a test copy (`npm run test-copy`) to see it work.
- Commit on your own branch (Windows lead: bladedeck-nightly) and add a dated HANDOFF.md Log entry.
- No GitHub release, no install on a PC, without the owner's explicit yes.

## Context hygiene
- Use targeted grep and line-range reads. Never dump a whole file over 300 lines into context
  (renderer/app.js, main.js, style.css, HANDOFF.md are long).
- Never read lockfiles or build folders (node_modules/, dist/, release/, out/, build/).
- Read HANDOFF.md from the top down to the entries you need, not the whole file.

## Architecture
- Strict Electron boundaries: main process (*.js at the root) <-> preload.js / bubble-preload.js <-> renderer/.
  The renderer reaches the system only through preload channels; a new channel goes in SPEC.md (`npm run spec` checks it).
- Linux is the lead build. Windows fixes go behind `process.platform === 'win32'` or in the win*.js helpers.
- Keep Linux/Windows parity on every path (path.join, no hard-coded separators) and every spawn
  (`windowsHide: true`, an 'error' handler, helpers that stop when Bladedeck stops).

## Surgical edits
- Touch only the lines the task needs. Don't reformat unrelated code. Match the nearby comment voice.
- Don't install or upgrade packages without asking.

## Safety
- Work on the program only: never drivers, devices, services, the firewall, the registry, power, installs or passwords.
- Back up %APPDATA%\bladedeck (Windows) or ~/.config/bladedeck (Linux) before running against the real library.
- A controller is live even in a background test copy: never start games or power actions from one.
