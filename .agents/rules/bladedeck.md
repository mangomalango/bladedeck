# Bladedeck: rules for Gemini in Antigravity

- Read `TEAM.md` (how the team works: your role, your branch, safety), then `GEMINI.md` (the project briefing) and the top of `HANDOFF.md` before anything else.
  Claude works on this repository too; HANDOFF.md is how you two coordinate. Mark a task
  "in progress: Gemini" there before you start it, and add a dated log entry when you finish.
- Linux (CachyOS) is the lead build. Windows fixes go behind `process.platform === 'win32'`.
- Work on a branch of your own (`gemini/<date>-<topic>`), never on master. Never push master,
  never release, never change repo settings. The Linux Claude session reviews and merges.
- Run `npm run check` after every change.
- Test only with `npm run test-copy` (`-- --real` for a copy of the owner's library). Never run
  the installed Bladedeck, never edit `~/.config/bladedeck`, never touch Steam's files, and never
  press anything in a test copy that would start a game or use power actions.
- Ask the owner before anything outward-facing or hard to undo (firewall, installs, deleting).
- Match the code style: plain JavaScript, short comments that say why, friendly plain UI text.
