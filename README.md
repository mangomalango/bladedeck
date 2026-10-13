# Bladedeck

One launcher for Steam, emulators, recompiled ports and any program. Two modes:

- **Console mode**: fullscreen, controller-driven, glossy vertical blades over animated ribbons.
- **PC mode**: windowed library manager with a sidebar, cover grid, search, sorting and a details drawer.

## Run it

Needs Node 18+.

```
npm install
npm start
```

Package an installer with `npm run dist`.

## Controls

| Action | Keyboard | Controller |
| --- | --- | --- |
| Move between blades | Left / Right | D-pad or stick, LB / RB |
| Move in a list | Up / Down | D-pad or stick |
| Launch | Enter | A |
| Back to the Home blade | Esc | B |
| Favorite | F | X |
| Edit | E | Y |
| Jump to System blade | S | Start |
| Switch Console / PC mode | F10 | Back / View |

PC mode: arrows move through the grid, double-click launches, `/` or Ctrl+F searches.

## Adding things

- **Steam**: System blade, Scan Steam. Reads your Steam libraries and launches through `steam://rungameid/`.
- **Emulators**: System blade, Emulators, Add. Pick a preset (Dolphin, PCSX2, DuckStation, RPCS3, PPSSPP, Cemu, Ryujinx, Xemu, Xenia, mGBA, melonDS, RetroArch), choose the emulator's program, add game folders, and every game is listed automatically. Launch arguments use `{rom}`, `{romdir}` and `{title}`. Emulator flags change between versions, so check the emulator's own command line help if a game does not start.
- **Any program**: drag an .exe, .lnk, .bat or AppImage onto the window, or use Add a game. Type "Native port" is for recompiled games such as N64 or PS1 recomps: point it at the port's executable.
- **Covers**: Steam covers are picked up from Steam's local cache. For anything else, set a cover image in Edit. With no image, a generated cover is used.

Bladedeck launches what you already built. It does not run recompilation toolchains itself.

## Customizing

Your data lives in the app's user data folder (Settings has shortcuts):

- `library.json`: all settings, emulators and entries. Plain JSON, safe to back up or edit.
- `themes/*.json`: your own themes. A file with the same `id` as a built-in replaces it.
- `custom.css`: loaded after the theme, wins over everything.

### Blades

Blades are defined in Settings as JSON. Each one is a filter:

```json
[
  { "name": "Home",  "filter": { "home": true } },
  { "name": "Favorites", "filter": { "favorite": true } },
  { "name": "PlayStation 2", "filter": { "system": "PlayStation 2" } },
  { "name": "Ports", "color": "#ff7a1a", "filter": { "types": ["recomp"] } },
  { "name": "System", "special": "system" }
]
```

Filter keys: `types` (steam, exe, recomp, rom, app), `system`, `emulator` (emulator id), `favorite`, `recent` (number), `home`. `color` tints that blade's highlight.

### Themes

Copy `themes/pearl.json`, change the `id` and `name`, edit the `vars`, and drop it in your `themes` folder. Every colour, radius and the font are variables. `ribbon` controls the animated background: `colors`, `alpha`, `blend` (`source-over` or `lighter`), `width`, `count`, `speed`. An optional `css` string in the theme adds extra rules.

## Notes

- Minimize-while-playing restores the launcher when a tracked program exits. Steam games are started through Steam, so they are not tracked and no playtime is recorded for them.
- If a program that hands off to another process exits within a few seconds, the launcher stays minimized so it does not cover the game.
- ROM scans go six folders deep and skip nothing, so choose file types carefully (for example `cue` rather than both `cue` and `bin`).
