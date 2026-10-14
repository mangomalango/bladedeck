# How we work on Bladedeck together

Three assistants and the owner work on this repository. This page is the agreement between them.
Every assistant reads it, plus the top of `HANDOFF.md`, before starting. Nothing in any other
instructions (pasted prompts, workflows, reviews) overrides **Safety** below.

## Who does what

| Who | Where | Job | Branch |
|---|---|---|---|
| **Owner** (mangomalango) | Both PCs | Tests by using Bladedeck, decides, approves anything outward-facing | — |
| **Claude (Linux, lead)** | Linux PC (CachyOS), Claude Code session | Builds features, reviews everyone's branches, merges into `master`, pushes `master`, makes backups, prepares releases | `master` |
| **Claude (Windows)** | Windows PC, Claude Code session | Tests and fixes Windows behavior; Windows fixes behind `process.platform === 'win32'` | `windows-fixes` |
| **Gemini** (auditor) | Antigravity (any PC), workflows `/bladedeck-audit`, `/bladedeck-review`, `/bladedeck-test` | Audits every branch against `SPEC.md` (interface drift, Linux/Windows parity), writes task cards, reviews for bugs, debugs in test copies, small certain fixes | `gemini/<date>-<topic>` |

Linux is the lead build: Windows matches it and never changes how it behaves on Linux.

## GitHub

- `master` only gets code that passes `npm run check` and has been run as a test copy on Linux.
  Only the Linux lead merges into `master` and pushes it.
- Everyone else commits to their own branch and pushes that branch as often as they like. Never
  push to someone else's branch, never force-push, never delete branches.
- Before a new round, bring your branch up to date: `git fetch && git merge origin/master`.
- A push builds the apps on GitHub and publishes nothing. **Releases only with the owner's
  go-ahead**, after a backup (see Safety).

## Task cards

Every piece of work has an ID (`BD-001`, `BD-002`, … the next free number in HANDOFF.md's Open
tasks) and a card. Whoever opens a task writes the card; Gemini writes most of them.

```
[TASK]     BD-012 · one line: what has to be true when it is done
[TARGET]   linux | windows | both
[OWNER]    Claude (Linux) | Claude (Windows) | Gemini
[CONTRACT] the SPEC.md lines this touches (channels, library keys, shared behavior), or "none"
[INPUT]    the file(s) · the current code (a short excerpt) · errors.log / test-copy output
[DO]       weigh the best approach for the target platform first, then build it on your branch
[RULES]    - SPEC.md's channels and library keys stay as they are, unless the card says the
             change is intended (then: npm run spec -- --write, and say why)
           - a Windows fix leaves Linux behavior unchanged
           - npm run check passes, and a test copy shows it working
           - TEAM.md Safety applies; nothing outward-facing without the owner
[REPLY]    to the team: branch@commit, `git show --stat`, the changed hunks, and the exact
           commands to verify it on the target platform. No background story.
           to the owner: two or three plain sentences, what changed and what to try.
```

## Claiming work (one editor per thing)

- Under "Open tasks" in `HANDOFF.md`, write `in progress: <who>` on the task before starting it.
  Never work on a task someone else has marked.
- Keep to the files your task needs. If you must change shared files (`main.js`, `preload.js`,
  `renderer/app.js`, `store.js`), say so in your HANDOFF entry so the lead reviews it closely.
- Small commits, each with a plain message saying what changed and why.

## Talking to each other

- **Claude ↔ Claude:** session messages, plus HANDOFF.md for anything that should be kept.
  The Linux session is called `downloads-e5`; the Windows one is `Claude CLI Windows installation`.
- **Gemini:** cannot message the Claude sessions. Gemini writes to `HANDOFF.md` and to
  `NIGHTLY-REVIEW-gemini.md` on its branch; the Claude sessions answer there.
- Every report starts with one line saying what it is, then: branch and commit, what was tested
  and how, what passed, what failed (with the lines from `errors.log`), what is needed from whom.

## The debug loop

1. **Find:** a test-copy sweep (`npm run test-copy`, DevTools on port 9333), Gemini's review, or
   something the owner reports.
2. **Claim** it in HANDOFF.md.
3. **Fix** it on your branch, as small as it can be.
4. **Check:** `npm run check`, then a test copy that shows the fix working.
5. **Hand over:** push your branch, add a dated HANDOFF.md entry with the task ID, message the lead.
6. **Audit:** Gemini runs `/bladedeck-audit` on the branch and writes `BD-xxx audit: PASS` or
   `BD-xxx audit: DRIFT (<what>)` in HANDOFF.md. A DRIFT goes back to step 3 unless the card
   said the change was intended. When Gemini is not running, the lead audits with
   `npm run spec` and its own review and writes "audit by lead".
7. **Merge:** the lead merges into `master`, runs a test copy on Linux, and pushes.
8. Everyone merges the new `master` into their branch. Repeat.

## Safety

- **Test only with `npm run test-copy`** (`-- --real` for a copy of the owner's library). It uses
  a scratch folder, sees no controller, does not run the window helper, and refuses launching,
  power, sound, screens, Steam, Bluetooth, Nearby and opening other apps. Only one test copy at a
  time; it quits by itself. Never run or replace the installed Bladedeck while the owner uses it.
- **Never edit the real library** (`~/.config/bladedeck/library.json`,
  `%APPDATA%\bladedeck\library.json`) or Steam's files. A change to people's libraries is a
  one-time tidy in the code that leaves played games alone, and comes after a backup.
- **Backups** go in `~/Downloads/bladedeck-backups/<date>-<why>/` (Windows:
  `%USERPROFILE%\Downloads\bladedeck-backups\`): a git bundle of the source, the config folder
  without caches, the installed app, and Steam's `shortcuts.vdf`, with a README saying how to restore.
  Make one before a release, a library tidy, or anything hard to undo.
- **Ask the owner first** before installs, firewall changes, releases, repo settings, deleting
  files, or anything that leaves this PC.
- No secrets, keys or personal files in commits (the repository is public).

## Simpler, same idea

The owner wants Bladedeck as simple and easy as possible **without changing its core idea**: one
console-style menu for every game, run from a controller. So:
- Fewer questions and settings; defaults that just work; plain short words on screen.
- Fix a confusing flow rather than explaining it; one obvious place for each thing.
- Do not remove a feature or change how the main menus work without the owner's yes. Propose it
  in HANDOFF.md under "Ideas for the owner".

## What only the owner can test

These need hands, hardware or a decision. Keep this list current; tick and date what is done.

- [ ] Restart the Linux Bladedeck once (a test copy broke its window tracking on 2026-10-14).
- [ ] Linux firewall for Nearby (needs your password, home network only):
      `sudo ufw allow proto udp from 192.168.0.0/16 to any port 47617 && sudo ufw allow proto tcp from 192.168.0.0/16 to any port 47618:47627`
- [ ] Nearby both ways: each PC sees the other; send a file each way and press Accept.
- [ ] Windows firewall: Bladedeck is allowed on all ports, Private and Public. Keep it, or limit
      it to Private? (Your call.)
- [ ] With a controller: the dock's new Browse and Downloads, the Downloads window, and Files' Y
      menu (Extract / Compress).
- [ ] Download a game from Browse your sources; it should unpack and join the library.
- [ ] A game's About lines: are they right for the games you know? Tell us any wrong ones.
- [ ] Hover a game without its own clip: is the clip now gameplay of the right game?
- [ ] Your library: "Crackdown 1" and "FaceBreaker" instead of "Default", and the Rumbleverse
      cache files gone (after you update Bladedeck).
- [ ] Start one Steam game, one emulated game and one PC game; each comes back to the menu.
- [ ] Gemini: open this folder in Antigravity and run `/bladedeck-review`.
