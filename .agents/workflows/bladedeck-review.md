---
description: Review Bladedeck's newest work for real bugs and write NIGHTLY-REVIEW-gemini.md
---
1. Read HANDOFF.md (newest entries at the top) and WINDOWS.md's Ground rules.
2. Run `git log --oneline -15` and `git show --stat` for the newest commits to see what changed.
3. Review the files those commits touched, in this order: crashes in the main process (unhandled
   promises, spawn without an error handler, a require of a file missing from package.json
   "files"), wrong behavior a player would notice, Linux behaving differently because of a
   Windows change, network-facing code exposing more than intended, and anything that keeps the
   CPU busy while the menu sits idle.
4. Write NIGHTLY-REVIEW-gemini.md at the top of the repository: for each finding, the file and
   line, a concrete case that goes wrong, how sure you are (sure / likely / a hunch), and the
   smallest fix. No style opinions, no praise. Three real findings beat thirty guesses.
5. Fix only what is small, certain and inside one file, on your own branch, with `npm run check`
   passing; say in the review which you fixed.
6. End the review file with the line `REVIEW DONE` and add a dated entry to HANDOFF.md.
