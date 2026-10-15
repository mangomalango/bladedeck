# Bladedeck roadmap (owner's list, 2026-10-14)

The owner asked for: more online and local features (a friend list and the like), better
stability, less power use, a choice and an editor for every game's video and music, wider and
smoother video playback, more polished text and Settings, and the team working on it together.
This is the brainstorm and how it is split into task cards (HANDOFF.md, template in TEAM.md).
Nothing here changes the core idea: the blades, controller-first, everything inside Bladedeck,
local first and safe by default (see the Security principles in the tracker).

## Friends and playing together (brainstorm)

Already there: Nearby (LAN: who is on, their game, invite, poke, file send), Discord presence,
Tailscale card, ROM sync, the phone app.

- **Friends list.** Keep the Bladedecks you have met: name, avatar, last seen, what they play.
  Friends come from Nearby (press Add on someone in the room) or from a short friend code
  (8 characters) typed once, reached over Tailscale. No accounts, no server of ours; each PC
  keeps its own list, and removing a friend forgets them on this PC.
- **Presence.** Online, In a game (which), Away, Do not disturb, Invisible. Shown on the friends
  blade and in the top bar; Do not disturb also silences pokes and invites.
- **Invites that join.** "Join" starts the same game when both have it; for Steam games it
  hands off to Steam's own join; otherwise it says what is missing.
- **Party.** 2-4 friends in a party: shared "what we are playing next" pick, a party chat line
  in the guide, and a ready check before launching.
- **Messages.** Short text and quick replies ("brb", "one more?") between friends, local only,
  kept 7 days.
- **Shared clips.** Send a saved replay to a friend (it goes through the same accept-first file
  send as Nearby).
- **Activity feed.** Friends' recent achievements, finished goals and new games, on the Home
  blade, off by default.
- **Couch features (local).** Player profiles per controller (each with their own playtime,
  favourites and theme), a "pass the controller" turn timer, and a local leaderboard for tasks.
- Safety for all of these: only friends you added can reach you, everything else is dropped;
  every new network-facing part gets the code-level audit before it is "done".

## Video and music for each game (brainstorm)

Today a game's clip and music are picked automatically, and "another" swaps them.
- **Choose:** a picker that lists the candidates (online clips, your own recordings, your own
  music, none) with a preview, and remembers the choice per game.
- **Edit:** set start and end points (trim), volume, loop or play once, and mute the clip's
  own sound. Saved as numbers on the game; the file is never changed.
- **Make:** turn one of your replays or recordings into the game's clip (trim it, pick a
  thumbnail), or a song file into its music.
- **Wider, smoother playback:** the clip fills the width behind the menu (cover, not letterbox),
  cross-fades in and out, and starts only after the blade's animation finishes so the two never
  compete for frames.

## Stability and power (brainstorm)

- Measure first, on both PCs: idle menu CPU, GPU and RAM; a game open; the menu over a game.
- Stop work nobody sees: timers, PowerShell helpers and canvas drawing while the window is
  hidden, minimised or behind a game.
- A "Low power" setting (and automatic on battery): 30 fps ribbon or a still wallpaper, no clip
  previews, slower stat polling.
- Every helper process started by Bladedeck ends when it quits; a watchdog restarts a helper that
  dies instead of leaving the feature broken.

Measured on Windows (installed 0.2.3-dev = ce9f9e1, menu idle 20 s, 2026-10-14): 29.6% of one
core in all (GPU process 19.1%, renderer 8.2%, main 2.1%), 756 MB. That was 111-120% before the
glass and replay fixes. Both PowerShell helpers and every Bladedeck process end within 8 s of
closing the window. The biggest remaining cost is the GPU process drawing the moving ribbon and
the glass, which BD-018 (a still wallpaper and 30 fps in Low power) would cut most.

## Polish

- Text: one voice everywhere (short, plain, friendly), sentence case, no jargon; a pass over every
  toast, label and Settings line.
- Settings: grouped headings, one line of help per switch, defaults clearly marked, a
  "Reset this page" button.

## Task cards

| ID | Target | Owner | Card |
|---|---|---|---|
| BD-011 | both | Claude (Linux) lead | Friends list: add from Nearby or friend code, presence states, friends blade. Network parts audited (Gemini) |
| BD-012 | both | Claude (Linux) | Invites that join, party and ready check, quick messages |
| BD-013 | both | Claude (Linux) | Game video and music: picker, per-game choice, trim/volume/loop, make from a replay |
| BD-014 | both | Claude (Linux) | Wider, smoother clip playback: cover, cross-fade, start after the blade animation |
| BD-015 | windows | Claude (Windows) | Power and stability on Windows: measure idle, stop hidden work, helpers end on quit |
| BD-016 | both | Gemini | Text and Settings polish pass (one voice, sentence case, help line per switch) |
| BD-017 | both | Gemini | Audit BD-011/012 network code before they count as done |
| BD-018 | both | Claude (Linux) | Low power setting, automatic on battery |
| BD-035 | both | Claude (Windows) | (owner idea a) Feedback and ideas easy to find: a button in the top bar and in the Guide, not only System |
| BD-036 | both | Claude (Windows) | (owner idea b) Downloads sorted into folders by kind (Games, Apps, Videos, Music, Archives, Other), with a setting to turn it off |
| BD-037 | both | owner decides scope | (owner idea c) More apps (e.g. MovieBox) on the Apps blade, and a floating window over a game for a show or a walkthrough (builds on the walkthrough window) |
| BD-038 | both | Claude (Linux) | (owner idea d) Hover video: the box grows to 4:3 with a smooth animation, the video plays properly, gentler sound or a volume setting |
| BD-039 | both | Claude (Windows) | (owner idea e) Mouse over a button shows its keyboard key (and controller button) as a small hint |
| BD-040 | both | Claude (Windows) | (owner idea g) One-button update: it exists (System, Updates; Windows installer, Linux AppImage swap). Make it findable: "Update ready" in the notification bar with Install now; test a real update on both |
| BD-041 | both | Claude (Windows) | (owner idea h) Actions on each notification for its task: Downloads (Extract, Show in folder, Cancel), Updates (Install now), phone messages (Reply) |
| BD-042 | both | owner's yes first | (owner idea i) Feedback to GitHub issues (bug = bug label, idea = enhancement), status read back. Sends the owner's text off the PC and needs a token or another posting route: the owner picks how before anything is built |
