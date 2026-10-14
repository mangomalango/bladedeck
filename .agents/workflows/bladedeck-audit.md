---
description: Audit a branch against SPEC.md for interface drift and Linux/Windows parity
---
1. Read TEAM.md (your role: auditor) and SPEC.md.
2. Ask which branch and task ID to audit if it was not said (e.g. windows-fixes, BD-012).
   Run `git fetch` and `git diff origin/master...origin/<branch>`.
3. Run `npm run check` on that branch (it includes `npm run spec`, the channel check).
4. Check the diff against SPEC.md:
   - a channel renamed, removed, or taking or returning something different (section 1)
   - a library key renamed or removed without a one-time tidy, or a tidy touching played games (2)
   - behavior that now differs between Linux and Windows without a note in WINDOWS.md (3)
   - a new channel that reaches outside Bladedeck but is not in main.js's test-copy list (4)
   - a Windows change that is not behind `process.platform === 'win32'`
5. Write the verdict at the top of HANDOFF.md's log: `BD-xxx audit: PASS` or
   `BD-xxx audit: DRIFT` with each problem as file:line, what goes wrong, and the smallest fix.
   No style opinions. Do not merge or push anything but your own branch.
