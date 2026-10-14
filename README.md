# Bladedeck

One launcher for Steam, emulators, native ports and any program. Two modes:

- **Console mode**: fullscreen, controller-first, vertical blades over animated ribbons.
- **PC mode**: windowed library manager with a sidebar, cover grid, search and details drawer.

Switch between modes at any time with **View** (controller) or **F10** (keyboard).

## Run it

Needs Node 18+.

```bash
npm install
npm start
```

Build an installer with `npm run dist`.

## Controls

| Action | Controller | Keyboard |
| --- | --- | --- |
| Move between blades | D-pad or stick, LB / RB | Left / Right, Page Up / Down |
| Move in a list or grid | D-pad or stick | Up / Down / Left / Right |
| Launch | A | Enter |
| Back to Home blade | B | Esc |
| Favorite | X | F |
| Edit | Y | E |
| Jump to System blade | Start | S |
| Switch Console / PC mode | View | F10 |
| Quick menu (music, alerts, clips) | Hold RT and pull | C |
| Guide flap (walkthroughs, tips) | Hold LT and pull | G |
| Walkthrough window | View + Y | Ctrl+Alt+Y |
| Quick Resume | Hold View | Q |
| Record gameplay | View + X | Ctrl+Alt+R |
| Save last 30s replay | View + RB | Ctrl+Alt+S |
| Sound card | Guide / Home button | V |

## The System Menu

The System blade organizes tools and settings into seven clean groups:

- **Games and library**: Find everything (Steam, GOG, Heroic), add games, open ROM files, free games on Epic/GOG/itch.io, scan library, find missing box art, and Browse your sources.
- **Gaming software**: Manage and install emulators, Minecraft via Prism Launcher, CurseForge/Modrinth modpacks, store launchers, and suggested extras (Tailscale, Discord).
- **Play together**: Split-screen play with PartyDeck, multi-screen gaming, controller assignments and rumble, and Nearby players on your network.
- **Capture**: Recorded videos, saved gameplay clips, manual recording, and live game view settings.
- **This PC**: Hardware stats, screen brightness, Wi-Fi, sound card volume and outputs, Quick Resume manager, notifications, phone companion app, file transfers, and voice commands.
- **Personalize**: Theme selection, Wallpaper Engine and video backgrounds, look and menu fonts, background music, the aquarium, and your player profile with goals and journal.
- **Help**: Step-by-step interactive tour, button controls reference, guide flap, and floating walkthrough window.

Root actions at the bottom provide **Settings** (8 organized pages), **Backup and restore**, **Switch to PC mode**, and **Exit Bladedeck**.

## Key Features

### Browse your sources
Search for games and software directly from your sources. The Internet Archive is built in; you can also add your favorite websites in Sources. Bladedeck navigates the sites, displays catalog cards, and lets you install games with one press: archives are unpacked into `~/Games/ROMs/Downloaded` and join your library automatically.

### Minecraft
Plays Minecraft: Java Edition through Prism Launcher. Java Minecraft lacks native controller support, so Bladedeck downloads and installs the Controlify mod (matched to your version and Fabric/Quilt/NeoForge loader) with one click—giving you full controller navigation, vibration, and an on-screen keyboard. You can also search Modrinth modpacks and import them straight to Prism.

### Multi-screen
Two players, two screens, two games running side by side. Player 1 stays on the main display while Player 2 gets their own fullscreen Bladedeck on the second display. Each player's game receives only their assigned controller, routes sound to their own audio output (TV, headphones, or controller speaker), and runs simultaneously.

### Companion phone app
Control Bladedeck from your phone across your local network or Tailscale. Browse your library, launch games, use an on-screen touchpad and keyboard, transfer files, and receive synced game timers and alarms.

### Backup and restore
Bladedeck automatically backs up your entire configuration (library, emulators, sources, blades, custom CSS, themes, and artwork) every day it is used and every half hour while making changes. Backups live in `~/Bladedeck/Backups` so they survive app reinstalls. You can restore any backup with one click or export a single `.bladedeck` backup file for another PC.

## Adding Games

- **Steam**: System, Games and library, Scan Steam library.
- **Emulators**: System, Gaming software, Emulators, Add. Choose a preset or custom command with `{rom}`, `{romdir}`, and `{title}` placeholders.
- **Any program**: Drag an `.exe`, `.lnk`, `.bat`, or `.AppImage` into the window, or use Add a game.
- **Watched folders**: Drop files into `~/Games` or `~/Downloads`; ROMs, AppImages, and unpacked archives join your library automatically.

## Customizing

Your settings and personal files live in the app's user data directory (`~/.config/bladedeck` on Linux, `%APPDATA%\bladedeck` on Windows):

- `library.json`: All settings, emulators, and library entries.
- `themes/*.json`: Custom themes. Variables control colors, radius, fonts, and ribbon background animations.
- `custom.css`: Custom stylesheet loaded on top of every theme.
