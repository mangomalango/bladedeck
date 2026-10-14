# SPEC: Bladedeck's shared interface

This is the contract Linux and Windows builds share, and what the auditor (Gemini) checks changes
against. If a change breaks a line here, that is **interface drift**: it needs the auditor's note
and the lead's yes before it reaches `master`. `npm run check` checks the channel table at the
bottom against the code by itself (`scripts/spec.js`).

## 1. The page and the main process

- The page (`renderer/`) reaches the system only through `window.bladedeck.*` in `preload.js`.
  Each of those names is one channel, answered by one `ipcMain.handle`/`on` in the main process.
- **Do not rename a channel or change what it takes or returns** on one platform only. A
  platform difference lives inside the handler (`process.platform === 'win32'`), never in the
  page's call.
- Adding a channel: add the handler, the preload line, then `npm run spec -- --write`, and say so
  in HANDOFF.md.
- Calls that fail answer with something the page already handles (`null`, `false`, or
  `{ ok: false, error: '<plain words for the player>' }`); they never throw into the page.

## 2. The library (`library.json`)

Linux: `~/.config/bladedeck/`. Windows: `%APPDATA%\bladedeck\`. Same file on both; a library
copied between PCs must load on either.

- `entries[]`: `{ id, type, title, added, playtime (seconds), lastPlayed?, favorite?, hidden?, cover?, logo? }` plus, by `type`:
  - `steam`: `appid` · `exe`, `recomp`, `app`: `exe`, `args?`, `cwd?` · `gog`: `gogId`, `heroicId?`, `exe?`
  - `rom`: `rom` (file), `emulatorId`, `system` · `stream`: `streamKey`, `system` (host), `exe`, `args`
- `emulators[]`: `{ id, name, exe, args, exts, system, romDirs?, onlyNames? }`
- `settings{}`: anything missing takes its default (main.js `DEFAULT_LIB`). New keys default to
  "on, as before" or "off" so that an older library behaves as it did. Keys added 2026-10-14:
  `gameInfo`, `dlDir`, `gamesDir`, `romTidy`, `dock.addedOwn`.
- Never rename or remove a key without a one-time tidy that converts old libraries, and never
  touch played games in a tidy.

## 3. Behavior both platforms must match

Linux leads; Windows matches it or says plainly that it cannot (WINDOWS.md's table).
- Console mode and PC mode look and move the same, with the same controller buttons.
- Launching any game type returns to the menu when the game closes, and counts playtime.
- Downloads land in the chosen folder, archives extract with 7-Zip, and games from Browse join
  the library. Files only sees Bladedeck's folder and folders the player allowed.
- Nearby, phone pairing and file sending speak the same protocol (UDP 47617, TCP 47618-47628):
  a Linux Bladedeck and a Windows one must see each other and send files both ways.
- ROM sync (romsync.js): pairing over Nearby (`sync-ask` / `sync-yes` / `sync-no` /
  `sync-please` messages), files over HTTP on TCP 47628 with the pair's secret in `x-bd-sync`.
  Same rules on both: single-file ROMs and cue/m3u sets only; the home drive keeps
  max(20 GB, 10%) free; other drives get `<drive>/Bladedeck ROMs`.
- Online lookups (clips, music, game info) send only a game's title or Steam id.

## 4. Test copies

`npm run test-copy` (`BLADEDECK_TEST=<folder>`): its own userData, no controller, no window
helper, and the outward channels (launching, power, sound, screens, Steam, Bluetooth, Nearby,
opening other apps) answer `null`. Every new channel that reaches outside Bladedeck is added to
that list in main.js.

## 5. Channels (generated: `npm run spec -- --write`)

<!-- spec:channels -->
| Page calls | Channel | Kind | Answered in |
|---|---|---|---|
| `load()` | `load` | call | main.js |
| `save(lib)` | `save` | call | main.js |
| `launch(payload)` | `launch` | call | main.js |
| `pick(opts)` | `pick` | call | main.js |
| `scanSteam(p)` | `scan-steam` | call | main.js |
| `scanRoms(opts)` | `scan-roms` | call | main.js |
| `setMode(m)` | `set-mode` | call | main.js |
| `quit()` | `quit` | call | main.js |
| `openThemes()` | `open-themes` | call | main.js |
| `openCss()` | `open-css` | call | main.js |
| `scanGog(dirs)` | `scan-gog` | call | main.js |
| `moonlightScan()` | `moonlight-scan` | call | moonlight.js |
| `moonlightOpen()` | `moonlight-open` | call | moonlight.js |
| `downloads()` | `downloads` | call | main.js |
| `minimize()` | `minimize` | call | main.js |
| `findLaunchers()` | `find-launchers` | call | main.js |
| `clipOpen(id)` | `clip-open` | call | main.js |
| `clipOpenVideos(name)` | `clip-open-videos` | call | main.js |
| `clipChunk(key, buf)` | `clip-chunk` | call | main.js |
| `clipClose(key)` | `clip-close` | call | main.js |
| `steamShots(appid)` | `steam-shots` | call | main.js |
| `copy(t)` | `copy` | call | main.js |
| `openLink(u)` | `open-link` | call | main.js |
| `peekBack()` | `peek-back` | call | main.js |
| `peekToggle()` | `peek-toggle` | call | main.js |
| `winAct(id, act, pid)` | `win-act` | call | main.js |
| `dockOpen(spec)` | `dock-open` | call | main.js |
| `dockDetect(list)` | `dock-detect` | call | main.js |
| `storeFree()` | `store-free` | call | store.js |
| `storeHomebrew(o)` | `store-homebrew` | call | store.js |
| `storeGetRom(g)` | `store-get-rom` | call | store.js |
| `storePaths()` | `store-paths` | call | store.js |
| `emuInstalled(ids, wins)` | `emu-installed` | call | store.js |
| `emuInstallWin(w)` | `emu-install-win` | call | store.js |
| `emuGhInstalled(id)` | `emu-gh-installed` | call | store.js |
| `emuGhInstall(id)` | `emu-gh-install` | call | store.js |
| `emuInstall(id)` | `emu-install` | call | store.js |
| `onEmuProgress(fn)` | `emu-progress` | event | main process sends it |
| `retroArt(o)` | `retro-art` | call | store.js |
| `itchBrowse(o)` | `itch-browse` | call | store.js |
| `itchExpect(g)` | `itch-expect` | call | store.js |
| `classicGet(id, title)` | `classic-get` | call | store.js |
| `watchSet(dirs)` | `watch-set` | call | store.js |
| `watchDefaults()` | `watch-defaults` | call | store.js |
| `onWatchFound(fn)` | `watch-found` | event | main process sends it |
| `procFreeze(pid, on)` | `proc-freeze` | call | main.js |
| `procFrozen()` | `proc-frozen` | call | main.js |
| `pidInfo(pid)` | `pid-info` | call | main.js |
| `webappOpen(spec)` | `webapp-open` | call | webapps.js |
| `webappList()` | `webapp-list` | call | webapps.js |
| `onWebapps(fn)` | `webapps` | event | main process sends it |
| `pipToggle(o)` | `pip-toggle` | call | webapps.js |
| `pipTake()` | `pip-take` | call | webapps.js |
| `deckFocus()` | `deck-focus` | call | main.js |
| `keepOnTop(on)` | `keep-on-top` | call | main.js |
| `focusPid(pid)` | `focus-pid` | call | main.js |
| `companionInfo()` | `companion-info` | call | companion.js |
| `companionEnable(on)` | `companion-enable` | call | companion.js |
| `companionCode()` | `companion-code` | call | companion.js |
| `companionForget(id)` | `companion-forget` | call | companion.js |
| `companionCheck()` | `companion-check` | call | companion.js |
| `onCompanionCmd(fn)` | `companion-cmd` | event | main process sends it |
| `onCompanionPaired(fn)` | `companion-paired` | event | main process sends it |
| `companionReply(id, value)` | `companion-reply` | send | companion.js |
| `companionListening()` | `companion-listening` | call | companion.js |
| `companionState(s)` | `companion-state` | send | companion.js |
| `onDeckFocus(fn)` | `deck-focus` | event | main.js |
| `splitStatus()` | `split-status` | call | main.js |
| `splitLaunch(o)` | `split-launch` | call | main.js |
| `splitHandlers()` | `split-handlers` | call | main.js |
| `sysStats()` | `sys-stats` | call | system.js |
| `sysMini()` | `sys-mini` | call | system.js |
| `sysWifi()` | `sys-wifi` | call | system.js |
| `sysWifiConnect(o)` | `sys-wifi-connect` | call | system.js |
| `sysWifiOff()` | `sys-wifi-off` | call | system.js |
| `sysBrightness(p)` | `sys-brightness` | call | system.js |
| `sysPower(w)` | `sys-power` | call | system.js |
| `modDirs(em)` | `mod-dirs` | call | main.js |
| `modMkdir(d)` | `mod-mkdir` | call | main.js |
| `modAdd(d, f)` | `mod-add` | call | main.js |
| `lanSet(o)` | `lan-set` | call | lan.js |
| `lanPeers()` | `lan-peers` | call | lan.js |
| `lanFirewall()` | `lan-firewall` | call | lan.js |
| `lanSend(id, m)` | `lan-send` | call | lan.js |
| `lanOffer(id, file)` | `lan-offer` | call | lan.js |
| `lanAccept(oid, yes)` | `lan-accept` | call | lan.js |
| `xferToPhone(f)` | `xfer-to-phone` | call | fsaccess.js |
| `xferPhoneList()` | `xfer-phone-list` | call | fsaccess.js |
| `xferUnshare(n)` | `xfer-unshare` | call | fsaccess.js |
| `onLanPeers(fn)` | `lan-peers` | event | lan.js |
| `onLanEvent(fn)` | `lan-event` | event | main process sends it |
| `fsList(d)` | `fs-list` | call | fsaccess.js |
| `fsOpen(p)` | `fs-open` | call | fsaccess.js |
| `fsReveal(p)` | `fs-reveal` | call | fsaccess.js |
| `fsPlaces()` | `fs-places` | call | fsaccess.js |
| `fsGrant()` | `fs-grant` | call | fsaccess.js |
| `wallList()` | `wall-list` | call | wallpaper.js |
| `wallAdd(f)` | `wall-add` | call | wallpaper.js |
| `wallRemove(id)` | `wall-remove` | call | wallpaper.js |
| `companionAlarms(list)` | `companion-alarms` | send | companion.js |
| `companionRing(r)` | `companion-ring` | send | companion.js |
| `onCompanionReceived(fn)` | `companion-received` | event | main process sends it |
| `voiceStatus()` | `voice-status` | call | voice.js |
| `voiceDownload()` | `voice-download` | call | voice.js |
| `voiceWarm()` | `voice-warm` | call | voice.js |
| `voiceHear(samples)` | `voice-hear` | call | voice.js |
| `onVoiceProgress(fn)` | `voice-progress` | event | main process sends it |
| `weather(place)` | `weather` | call | voice.js |
| `fsRevoke(p)` | `fs-revoke` | call | fsaccess.js |
| `fsRoot()` | `fs-root` | call | fsaccess.js |
| `soundState()` | `sound-state` | call | store.js |
| `soundSet(o)` | `sound-set` | call | store.js |
| `soundFollow(screen)` | `sound-follow` | call | store.js |
| `soundPlayerSink(o)` | `sound-player-sink` | call | store.js |
| `msMyScreen()` | `ms-my-screen` | call | players.js |
| `msReport(r)` | `ms-report` | call | players.js |
| `onP2Session(cb)` | `p2-session` | event | main process sends it |
| `webAllow(origin)` | `web-allow` | call | main.js |
| `webDlList()` | `web-dl-list` | call | webdl.js |
| `webDlStart(o)` | `web-dl-start` | call | webdl.js |
| `webDlExpect(o)` | `web-dl-expect` | call | webdl.js |
| `webDlAct(id, a)` | `web-dl-act` | call | webdl.js |
| `webDlRoms()` | `web-dl-roms` | call | webdl.js |
| `webDlFolders()` | `web-dl-folders` | call | webdl.js |
| `webDlPick(which)` | `web-dl-pick` | call | webdl.js |
| `webDlAllow(which)` | `web-dl-allow` | call | webdl.js |
| `archiveTool()` | `archive-tool` | call | archive.js |
| `archiveRun(o)` | `archive-run` | call | archive.js |
| `onArchiveProgress(cb)` | `archive-progress` | event | main process sends it |
| `onWebDl(cb)` | `web-dl` | event | main process sends it |
| `onWebDlStart(cb)` | `web-dl-start` | event | webdl.js |
| `onWebDlDone(cb)` | `web-dl-done` | event | main process sends it |
| `finderIa(o)` | `finder-ia` | call | finder.js |
| `mcStatus()` | `mc-status` | call | minecraft.js |
| `mcInstances()` | `mc-instances` | call | minecraft.js |
| `mcControllers(id)` | `mc-controllers` | call | minecraft.js |
| `mcPacks(o)` | `mc-packs` | call | minecraft.js |
| `mcPackGet(o)` | `mc-pack-get` | call | minecraft.js |
| `mcOpen(w)` | `mc-open` | call | minecraft.js |
| `backupList()` | `backup-list` | call | backup.js |
| `backupMake(note)` | `backup-make` | call | backup.js |
| `backupRestore(id)` | `backup-restore` | call | backup.js |
| `backupExport()` | `backup-export` | call | backup.js |
| `backupImport()` | `backup-import` | call | backup.js |
| `backupFolder()` | `backup-folder` | call | backup.js |
| `liveAvailable()` | `live-available` | call | livecap.js |
| `liveStart(o)` | `live-start` | call | livecap.js |
| `liveStop()` | `live-stop` | call | livecap.js |
| `livePause(on)` | `live-pause` | call | livecap.js |
| `liveHas(key)` | `live-has` | call | livecap.js |
| `liveForget(key)` | `live-forget` | call | livecap.js |
| `onLiveFrame(cb)` | `live-frame` | event | main process sends it |
| `onLiveEnded(cb)` | `live-ended` | event | main process sends it |
| `msPinSound(o)` | `ms-pin-sound` | call | players.js |
| `padsList()` | `pads-list` | call | players.js |
| `extrasStatus()` | `extras-status` | call | extras.js |
| `dnsStatus()` | `dns-status` | call | extras.js |
| `dnsApp(on)` | `dns-app` | call | extras.js |
| `dnsSystem(on)` | `dns-system` | call | extras.js |
| `biosList()` | `bios-list` | call | roms.js |
| `steamAch(appid)` | `steam-ach` | call | achievements.js |
| `gameMusic(e)` | `game-music` | call | gamemusic.js |
| `onlineMedia(e, kind)` | `online-media` | call | onlinemedia.js |
| `gameInfo(e)` | `game-info` | call | gameinfo.js |
| `romsyncState()` | `romsync-state` | call | romsync.js |
| `romsyncPair(id)` | `romsync-pair` | call | romsync.js |
| `romsyncAnswer(id, yes)` | `romsync-answer` | call | romsync.js |
| `romsyncSync(id)` | `romsync-sync` | call | romsync.js |
| `romsyncSet(id, o)` | `romsync-set` | call | romsync.js |
| `onRomsync(cb)` | `romsync-event` | event | main process sends it |
| `onlineMediaAnother(e, kind)` | `online-media-another` | call | onlinemedia.js |
| `onlineMediaInfo(id)` | `online-media-info` | call | onlinemedia.js |
| `onlineMediaStats()` | `online-media-stats` | call | onlinemedia.js |
| `onlineMediaAll(entries)` | `online-media-all` | call | onlinemedia.js |
| `onlineMediaPause(on)` | `online-media-pause` | call | onlinemedia.js |
| `onlineMediaClear()` | `online-media-clear` | call | onlinemedia.js |
| `steamSleepScan()` | `steam-sleep-scan` | call | steaminput.js |
| `steamSleepFix()` | `steam-sleep-fix` | call | steaminput.js |
| `btStatus()` | `bt-status` | call | bluetooth.js |
| `btPower(on)` | `bt-power` | call | bluetooth.js |
| `btConnect(mac, on)` | `bt-connect` | call | bluetooth.js |
| `btScan()` | `bt-scan` | call | bluetooth.js |
| `btPair(mac)` | `bt-pair` | call | bluetooth.js |
| `btSettings()` | `bt-settings` | call | bluetooth.js |
| `steamlinkSync()` | `steamlink-sync` | call | steamlink.js |
| `steamlinkRestart()` | `steamlink-restart` | call | steamlink.js |
| `saveStates(e)` | `save-states` | call | savestates.js |
| `rdAccount()` | `rd-account` | call | realdebrid.js |
| `rdList()` | `rd-list` | call | realdebrid.js |
| `rdFiles(id)` | `rd-files` | call | realdebrid.js |
| `rdGet(url, name)` | `rd-get` | call | realdebrid.js |
| `rdFolder()` | `rd-folder` | call | realdebrid.js |
| `rdDavList(p)` | `rd-dav-list` | call | realdebrid.js |
| `rdDavGet(p)` | `rd-dav-get` | call | realdebrid.js |
| `onRdProgress(fn)` | `rd-progress` | event | main process sends it |
| `gameMusicForget(id)` | `game-music-forget` | call | gamemusic.js |
| `steamAchWatch(appid)` | `steam-ach-watch` | call | achievements.js |
| `achClipTrim(o)` | `ach-clip-trim` | call | achievements.js |
| `onAchievement(fn)` | `achievement` | event | main process sends it |
| `biosAdd(id)` | `bios-add` | call | roms.js |
| `biosOpen(id)` | `bios-open` | call | roms.js |
| `onOpenFile(fn)` | `open-file` | event | main process sends it |
| `onOpenFile(fn)` | `ready-for-files` | send | roms.js |
| `extrasBackup()` | `extras-backup` | call | extras.js |
| `extrasUpdate(repo)` | `extras-update` | call | extras.js |
| `padsClaim()` | `pads-claim` | call | players.js |
| `dsStatus()` | `ds-status` | call | players.js |
| `stadiaStatus()` | `stadia-status` | call | players.js |
| `dsOutputs(mode, vol)` | `ds-outputs` | call | players.js |
| `dsSet(o)` | `ds-set` | call | players.js |
| `msDisplays()` | `ms-displays` | call | players.js |
| `msOpen(displayId)` | `ms-open` | call | players.js |
| `msClose()` | `ms-close` | call | players.js |
| `msMirrored()` | `ms-mirrored` | call | players.js |
| `msExtend(on)` | `ms-extend` | call | players.js |
| `msPlaceMain(displayId)` | `ms-place-main` | call | players.js |
| `msMenu()` | `ms-menu` | call | players.js |
| `onMsClosed(fn)` | `ms-closed` | event | main process sends it |
| `guideSearch(q, game)` | `guide-search` | call | online.js |
| `guidePage(src, title)` | `guide-page` | call | online.js |
| `fonts()` | `fonts` | call | main.js |
| `sgdb(p)` | `sgdb` | call | online.js |
| `ra(method, params, fresh)` | `ra` | call | online.js |
| `artSave(id, url, kind)` | `art-save` | call | online.js |
| `steamArt(appid)` | `steam-art` | call | online.js |
| `palette(p)` | `palette` | call | main.js |
| `peekConfig(o)` | `peek-config` | call | main.js |
| `peekMode()` | `peek-mode` | call | main.js |
| `captureWant(caption, types, ask, audio)` | `capture-want` | call | main.js |
| `captureStatus()` | `capture-status` | call | capture.js |
| `captureGame(g)` | `capture-game` | call | capture.js |
| `captureReplay(o)` | `capture-replay` | call | capture.js |
| `captureRecord(o)` | `capture-record` | call | capture.js |
| `captureSave()` | `capture-save` | call | capture.js |
| `captureStop()` | `capture-stop` | call | capture.js |
| `captureList()` | `capture-list` | call | capture.js |
| `captureDelete(f)` | `capture-delete` | call | capture.js |
| `captureDir()` | `capture-dir` | call | capture.js |
| `captureOpen(f)` | `capture-open` | call | capture.js |
| `captureWrite(o)` | `capture-write` | call | capture.js |
| `onCaptureSaved(fn)` | `capture-saved` | event | main process sends it |
| `onCaptureStatus(fn)` | `capture-status` | event | capture.js |
| `snap()` | `snap` | call | main.js |
| `musicDefault()` | `music-default` | call | main.js |
| `musicScan(dir)` | `music-scan` | call | main.js |
| `onPeek(cb)` | `peek` | event | main process sends it |
| `discordSet(info)` | `discord-set` | call | discord.js |
| `discordClear()` | `discord-clear` | call | discord.js |
| `presence(p)` | `presence` | call | main.js |
| `netInfo()` | `net-info` | call | main.js |
| `netPeers()` | `net-peers` | call | main.js |
| `netHello(host)` | `net-hello` | call | main.js |
| `netPoke(host, body)` | `net-poke` | call | main.js |
| `onPoked(cb)` | `poked` | event | main process sends it |
| `onEnded(cb)` | `launch-ended` | event | main process sends it |
| `onDownloads(cb)` | `downloads` | event | main.js |
| `onReturned(cb)` | `returned` | event | main process sends it |
<!-- /spec:channels -->
