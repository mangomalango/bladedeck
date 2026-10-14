'use strict';
/* Get games: one place to find more to play, all of it free and legal.
   Free now: this week's Epic giveaways, free games on GOG and Steam's top free-to-play games.
   Homebrew: new Game Boy, Game Boy Color and Game Boy Advance games from Homebrew Hub, downloaded
   straight into the library with their art, ready to play in mGBA.
   Emulators: one press installs an emulator from Flathub and sets it up in Bladedeck.
   Uses S, api, esc, save, toast, openModal, closeModal, refresh, uid, Dock, Art and $ at call time. */

// Emulators Bladedeck can install and set up. Arguments match the Flathub builds.
const EMU_CATALOG = [
  { id: 'io.mgba.mGBA', win: { id: 'JeffreyPfau.mGBA', hint: 'mgba', exe: '^mgba\\.exe$' }, name: 'mGBA', system: 'Game Boy Advance', also: 'Game Boy, Game Boy Color', args: '-f "{rom}"', exts: 'gba,gb,gbc,sgb', site: 'https://mgba.io' },
  { id: 'com.snes9x.Snes9x', name: 'Snes9x', system: 'Super Nintendo', args: '"{rom}"', exts: 'sfc,smc,zip', site: 'https://www.snes9x.com' },
  { id: 'com.github.Rosalie241.RMG', name: 'Rosalie\'s Mupen GUI', system: 'Nintendo 64', args: '--fullscreen "{rom}"', exts: 'n64,z64,v64', site: 'https://github.com/Rosalie241/RMG' },
  { id: 'org.DolphinEmu.dolphin-emu', name: 'Dolphin', system: 'GameCube / Wii', args: '-b -C Dolphin.Display.Fullscreen=True -e "{rom}"', exts: 'iso,gcm,rvz,wbfs,gcz,ciso,wad', site: 'https://dolphin-emu.org' },
  { id: 'info.cemu.Cemu', win: { id: 'Cemu.Cemu', hint: 'cemu', exe: '^cemu\\.exe$' }, name: 'Cemu', system: 'Wii U', args: '-f -g "{rom}"', exts: 'wua,wud,wux,rpx', site: 'https://cemu.info' },
  { id: 'net.kuribo64.melonDS', win: { id: 'melonDS.melonDS', hint: 'melonds', exe: '^melonds\\.exe$' }, name: 'melonDS', system: 'Nintendo DS', args: '-f "{rom}"', exts: 'nds', site: 'https://melonds.kuribo64.net' },
  { id: 'org.azahar_emu.Azahar', win: { id: 'AzaharEmu.Azahar', hint: 'azahar', exe: '^azahar(-qt)?\\.exe$' }, name: 'Azahar', system: 'Nintendo 3DS', args: '-f "{rom}"', exts: '3ds,cci,cxi,3dsx', site: 'https://azahar-emu.org' },
  { id: 'io.github.ryubing.Ryujinx', name: 'Ryujinx', system: 'Switch', args: '--fullscreen "{rom}"', exts: 'nsp,xci', site: 'https://ryujinx.app' },
  { id: 'net.pcsx2.PCSX2', win: { id: 'PCSX2Team.PCSX2', hint: 'pcsx2', exe: '^pcsx2(-qt)?\\.exe$' }, name: 'PCSX2', system: 'PlayStation 2', args: '-batch -fullscreen -- "{rom}"', exts: 'iso,chd,cso,gz', site: 'https://pcsx2.net' },
  { id: '', win: { id: 'Stenzek.DuckStation', hint: 'duckstation', exe: '^duckstation-qt-x64.*\\.exe$' }, name: 'DuckStation', system: 'PlayStation', args: '-batch -fullscreen -- "{rom}"', exts: 'cue,chd,pbp,m3u', site: 'https://www.duckstation.org', linuxNote: 'Not on Flathub. Get the AppImage from its website, then add it in Emulators.' },
  { id: 'org.ppsspp.PPSSPP', win: { id: 'PPSSPPTeam.PPSSPP', hint: 'ppsspp', exe: '^ppssppwindows64\\.exe$' }, name: 'PPSSPP', system: 'PSP', args: '--fullscreen "{rom}"', exts: 'iso,cso,pbp,chd', site: 'https://www.ppsspp.org' },
  { id: 'net.rpcs3.RPCS3', gh: 'rpcs3', name: 'RPCS3', system: 'PlayStation 3', args: '--no-gui "{rom}"', exts: 'iso,bin', site: 'https://rpcs3.net', note: 'The official build from the RPCS3 team. Replaces a Flathub RPCS3, keeping its firmware, games and saves.' },
  { id: '', gh: 'shadps4', name: 'shadPS4', system: 'PlayStation 4', args: '"{rom}"', exts: 'bin', onlyNames: ['eboot.bin'], site: 'https://shadps4.net', note: 'PS4 games are folders: point it at your own dumps. Bloodborne runs; online play is not available yet.' },
  { id: '', gh: 'xenia', name: 'Xenia Canary', system: 'Xbox 360', args: '--fullscreen=true "{rom}"', exts: 'iso,xex,zar', site: 'https://xenia.jp', note: 'Downloaded from its GitHub releases. The Linux build is newer and still experimental.' },
  { id: 'org.flycast.Flycast', name: 'Flycast', system: 'Dreamcast', args: '"{rom}"', exts: 'cdi,gdi,chd', site: 'https://github.com/flyinghead/flycast' },
  { id: 'app.xemu.xemu', win: { id: 'xemu-project.xemu', hint: 'xemu', exe: '^xemu\\.exe$' }, name: 'xemu', system: 'Xbox', args: '-full-screen -dvd_path "{rom}"', exts: 'iso,xiso', site: 'https://xemu.app' },
  { id: 'org.libretro.RetroArch', win: { id: 'Libretro.RetroArch', hint: 'retroarch', exe: '^retroarch\\.exe$' }, name: 'RetroArch', system: 'Many systems', args: '"{rom}"', exts: '', site: 'https://www.retroarch.com', note: 'Pick a core inside RetroArch for each system; Bladedeck adds it as an app.' }
];
// Old games whose owners have released them for free. ScummVM hosts the adventure games with permission.
const CLASSICS = [
  { id: 'bass', title: 'Beneath a Steel Sky', year: 1994, how: 'scummvm', blurb: 'A cyberpunk adventure in a city that has swallowed the sky.' },
  { id: 'fotaq', title: 'Flight of the Amazon Queen', year: 1995, how: 'scummvm', blurb: 'A pulp adventure: a pilot, a movie star and a jungle full of trouble.' },
  { id: 'lure', title: 'Lure of the Temptress', year: 1992, how: 'scummvm', blurb: 'Escape a dungeon and free a town from a sorceress.' },
  { id: 'dreamweb', title: 'Dreamweb', year: 1994, how: 'scummvm', blurb: 'A dark, top-down cyberpunk thriller.' },
  { id: 'arena', title: 'The Elder Scrolls: Arena', year: 1994, how: 'steam', appid: '1812290', blurb: 'The first Elder Scrolls, given away free by Bethesda.' },
  { id: 'daggerfall', title: 'The Elder Scrolls II: Daggerfall', year: 1996, how: 'steam', appid: '1812390', blurb: 'A world the size of Britain, free from Bethesda.' },
  { id: 'openttd', title: 'OpenTTD', year: 2004, how: 'flatpak', flat: 'org.openttd.OpenTTD', win: { id: 'OpenTTD.OpenTTD', hint: 'openttd', exe: '^openttd\\.exe$' }, artApp: '1536610', blurb: 'Transport Tycoon Deluxe rebuilt as free, open-source software.' }
];
const ITCH_FEEDS = [['popular', 'Popular', ''], ['top', 'Top rated', 'top-rated'], ['new', 'New', 'newest'], ['action', 'Action', 'genre-action'], ['platformer', 'Platformer', 'genre-platformer'],
  ['rpg', 'RPG', 'genre-rpg'], ['puzzle', 'Puzzle', 'genre-puzzle'], ['horror', 'Horror', 'tag-horror'], ['adventure', 'Adventure', 'genre-adventure'], ['shooter', 'Shooter', 'genre-shooter'], ['strategy', 'Strategy', 'genre-strategy']];
/* PC ports made by taking console games apart (decompilation) or translating their code to run
   natively (recompilation). They need your own copy of the original game; each asks for its files
   the first time it starts. Ones with a download install with one press; the rest link to the
   project. */
const PORTS = [
  ['Xbox 360 and PS3 era (7th generation)', [
    { gh: 'unleashed', title: 'Sonic Unleashed', port: 'Unleashed Recompiled', console: 'Xbox 360', status: 'Playable', need: 'your own Xbox 360 copy of the game (and its update and DLC, if you have them)', site: 'https://github.com/hedge-dev/UnleashedRecomp' },
    { title: 'Sonic the Hedgehog (2006)', port: 'Marathon Recompiled', console: 'Xbox 360', status: 'No download yet: build it yourself', site: 'https://github.com/sonicnext-dev/MarathonRecomp' },
    { title: 'Grand Theft Auto IV', port: 'Liberty Recompiled', console: 'Xbox 360', status: 'Early development', site: 'https://github.com/UnknownLITE/LibertyRecomp' },
    { title: 'Blue Dragon, Ninja Gaiden 2, Dragon Ball Z: Budokai HD and more', port: 'ReXGlue recompiler ports', console: 'Xbox 360', status: 'Alpha builds', site: 'https://github.com/rexglue/rexglue-sdk' }
  ]],
  ['PS2, GameCube and Wii era (6th generation)', [
    { gh: 'opengoal', title: 'Jak and Daxter series', port: 'OpenGOAL', console: 'PlayStation 2', status: 'Playable (more games in progress)', need: 'your own PS2 disc image', site: 'https://opengoal.dev' },
    { gh: 'dusklight', title: 'The Legend of Zelda: Twilight Princess', port: 'Dusklight', console: 'GameCube', status: 'Playable', need: 'your own GameCube disc image', site: 'https://github.com/TwilitRealm/dusklight' },
    { title: 'Super Mario Galaxy', port: 'Petari decompilation (AstroCore port announced)', console: 'Wii', status: 'Decompiled; port announced', site: 'https://github.com/SMGCommunity/Petari' },
    { title: 'Super Smash Bros. Melee', port: 'Melee decompilation', console: 'GameCube', status: 'Decompiled; no PC port yet', site: 'https://github.com/doldecomp/melee' },
    { title: 'Sly Cooper and the Thievius Raccoonus', port: 'sly1 decompilation', console: 'PlayStation 2', status: 'In progress', site: 'https://github.com/theonlyzac/sly1' }
  ]],
  ['PS4 and Xbox One era (8th generation)', [
    { emu: 'shadps4', title: 'PlayStation 4 games, including Bloodborne', port: 'shadPS4 (an emulator, no ports yet)', console: 'PlayStation 4', status: 'Many games playable; online play not yet', site: 'https://shadps4.net' }
  ]],
  ['Also great: Nintendo 64', [
    { gh: 'soh', title: 'The Legend of Zelda: Ocarina of Time', port: 'Ship of Harkinian', console: 'Nintendo 64', status: 'Playable', need: 'your own N64 ROM', site: 'https://github.com/HarbourMasters/Shipwright' },
    { gh: 'twoship', title: 'The Legend of Zelda: Majora\'s Mask', port: '2 Ship 2 Harkinian', console: 'Nintendo 64', status: 'Playable', need: 'your own N64 ROM', site: 'https://github.com/2ship2harkinian/2ship2harkinian' },
    { gh: 'zelda64', title: 'The Legend of Zelda: Majora\'s Mask', port: 'Zelda 64 Recompiled', console: 'Nintendo 64', status: 'Playable', need: 'your own N64 ROM', site: 'https://github.com/Zelda64Recomp/Zelda64Recomp' }
  ]]
];
const SCUMMVM = { id: 'org.scummvm.ScummVM', win: { id: 'ScummVM.ScummVM', hint: 'scummvm', exe: '^scummvm\\.exe$' }, name: 'ScummVM' };
const HB_SYSTEM = { GB: 'Game Boy', GBC: 'Game Boy Color', GBA: 'Game Boy Advance' };

const Shop = (() => {
  let itch = { feed: 'popular', q: '', all: false, games: null }, classicArt = {};
  let tab = 'free', free = null, hb = { platform: '', q: '', page: 1, games: [], total: 0, pages: 1 }, have = {}, busy = {}, paths = null;
  const st = () => S.lib.settings;
  // The install key for this computer: a Flathub ID on Linux, a winget ID on Windows.
  const key = (e) => (e.gh ? `gh:${e.gh}` : (paths?.win ? e.win?.id : (paths?.flatpak ? e.id : ''))) || '';
  // Install one app (Flathub or winget) and say how to start it: { exe, pre } or null.
  async function install(e) {
    const k = key(e); if (!k) return null;
    if (!have[k]) {
      busy[k] = 0; draw();
      toast(`Installing ${e.name}…${paths.win ? ' Windows may ask for permission.' : ' This can take a few minutes.'}`);
      const r = e.gh ? await api.emuGhInstall(e.gh) : paths.win ? await api.emuInstallWin(e.win) : await api.emuInstall(e.id);
      delete busy[k]; draw();
      if (!r.ok) { toast(`${e.name} did not install: ${r.error}`, 'err'); return null; }
      have[k] = e.gh || paths.win ? r.data.exe : true;
    }
    return e.gh || paths.win ? { exe: have[k], pre: '' } : { exe: paths.flatpak, pre: `run --filesystem=home ${e.id} ` };
  }
  async function refreshHave(list) {
    const wins = paths.win ? list.map((e) => e.win || null) : [];
    const got = await api.emuInstalled(paths.win ? [] : list.map((e) => e.id || ''), wins);
    list.forEach((e, i) => { const k = key(e); if (k && !e.gh) have[k] = got[i]; });
    for (const e of list.filter((x) => x.gh)) have[key(e)] = await api.emuGhInstalled(e.gh);
  }

  function web(url) { api.dockOpen({ url, web: true, browser: Dock.browser() }); toast('Opened in your browser.'); }

  async function open(start) {
    tab = start || tab;
    paths = paths || await api.storePaths();
    openModal({ title: 'Get games', wide: true, html: '<div class="shop"></div>', buttons: [{ label: 'Close' }] });
    draw();
    kick();
  }
  function kick() {
    if (tab === 'free' && !free) loadFree();
    if (tab === 'itch' && !itch.games) loadItch();
    if (tab === 'classics') loadClassics();
    if (tab === 'homebrew' && !hb.games.length) loadHb();
    if (tab === 'emus') loadEmus();
    if (tab === 'ports') draw();
  }
  const root = () => document.querySelector('#modal .shop');

  async function loadFree() { const r = await api.storeFree(); free = r.ok ? r.data : { err: r.error }; draw(); }
  async function loadHb(more) {
    hb.loading = true; draw();
    const r = await api.storeHomebrew({ platform: hb.platform, q: hb.q, page: hb.page });
    hb.loading = false;
    if (r.ok) { hb.games = more ? [...hb.games, ...r.data.games] : r.data.games; hb.total = r.data.total; hb.pages = r.data.pages; hb.err = ''; }
    else hb.err = r.error;
    draw();
  }
  async function loadItch() {
    itch.games = null; draw();
    const f = ITCH_FEEDS.find((x) => x[0] === itch.feed) || ITCH_FEEDS[0];
    // games[/top-rated]/free[/genre-x]/platform-linux; tags go after the platform.
    const sort = ['top-rated', 'newest'].includes(f[2]) ? `/${f[2]}` : '', genre = /^genre-/.test(f[2]) ? `/${f[2]}` : '', tag = /^tag-/.test(f[2]) ? `/${f[2]}` : '';
    const feed = `games${sort}/free${genre}${itch.all ? '' : '/platform-linux'}${tag}`;
    const r = await api.itchBrowse(itch.q ? { q: itch.q } : { feed });
    itch.games = r.ok ? r.data : []; itch.err = r.ok ? '' : r.error;
    draw();
  }
  async function loadClassics() {
    await refreshHave([SCUMMVM, ...CLASSICS.filter((c) => c.flat).map((c) => ({ id: c.flat, win: c.win, name: c.title }))]);
    draw();
    for (const c of CLASSICS) {
      if (classicArt[c.id]) continue;
      if (c.appid || c.artApp) classicArt[c.id] = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${c.appid || c.artApp}/library_600x900.jpg`;
      else if (c.how === 'scummvm') { const r = await api.retroArt({ system: 'ScummVM', title: c.title }); classicArt[c.id] = r.ok ? r.data.cover[0] || '' : ''; }
      draw();
    }
  }
  async function loadEmus() {
    await refreshHave(EMU_CATALOG);
    draw();
  }

  const card = (img, title, sub, btn, data, wide, alt) => `<div class="sh-card ${wide ? 'wide' : ''}">
      <div class="sh-art">${img ? `<img src="${esc(img)}" ${alt ? `data-alt="${esc(alt)}"` : ''} loading="lazy" alt="">` : ''}<span>${esc(title.slice(0, 2))}</span></div>
      <b>${esc(title)}</b><small>${esc(sub)}</small>
      <button type="button" ${data}>${esc(btn)}</button></div>`;

  function draw() {
    const el = root(); if (!el) return;
    const tabs = [['free', 'Free now'], ['itch', 'itch.io'], ['classics', 'Free classics'], ['ports', 'PC ports'], ['homebrew', 'Homebrew games'], ['emus', 'Emulators']];
    let body = '';
    if (tab === 'free') {
      if (!free) body = '<p class="note">Asking the stores what is free…</p>';
      else if (free.err) body = `<p class="note">${esc(free.err)}</p>`;
      else {
        const sec = (name, list, hint) => (list.length ? `<h3 class="sh-h">${esc(name)}</h3>${hint ? `<p class="note">${hint}</p>` : ''}<div class="sh-grid">${list.map((g, i) => card(g.cover, g.title, g.note, g.store === 'Steam' ? 'Install' : g.soon ? 'See it' : 'Claim', `data-free="${g.store}:${i}"`, false, g.wide)).join('')}</div>` : '');
        body = sec('Free this week on Epic', free.epic, 'Claim it once and it is yours to keep. Heroic Games Launcher installs Epic games on Linux, and Find everything adds them here.')
          + sec('Free on Steam', free.steam, 'Install opens Steam\'s install box. Once it is installed, Scan Steam library adds it.')
          + sec('Free on GOG', free.gog, 'Add it to your GOG account; install it with Heroic or GOG Galaxy.');
      }
    } else if (tab === 'itch') {
      const watching = Watch.watchesDownloads();
      body = `<p class="note">Free indie games on itch.io. Get opens the game's page: download it there, and when the file lands in Downloads Bladedeck unpacks it into Games/itch and adds it to your library with its cover.${watching ? '' : ' <b>Turn on watching Downloads in Settings, Watched folders for that.</b>'}</p>
        <div class="sh-bar"><div class="sh-chips">${ITCH_FEEDS.map(([k, n]) => `<button type="button" data-itch="${k}" class="${!itch.q && itch.feed === k ? 'primary' : ''}">${n}</button>`).join('')}</div></div>
        <div class="sh-bar"><input type="search" class="sh-q sh-iq" placeholder="Search free games on itch.io" value="${esc(itch.q)}">
          <label class="sh-chk"><input type="checkbox" class="sh-all" ${itch.all ? 'checked' : ''}> Windows-only games too (they run with Wine or Proton)</label></div>
        ${itch.err ? `<p class="note">${esc(itch.err)}</p>` : ''}
        ${itch.games === null ? '<p class="note">Loading…</p>' : `<div class="sh-grid itch">${itch.games.map((g, i) => {
          const owned = S.lib.entries.some((e) => e.itchUrl === g.url);
          return card(g.cover, g.title, g.blurb || 'Free', owned ? 'In your library' : 'Get', `data-ig="${i}" ${owned ? 'disabled' : ''}`, true);
        }).join('') || '<p class="note">Nothing found.</p>'}</div>`}`;
    } else if (tab === 'classics') {
      body = `<p class="note">Classic games their makers have given away for free. The adventure games play in ScummVM, which Bladedeck installs for you; the Elder Scrolls games come free through Steam.</p>
        <div class="sh-grid">${CLASSICS.map((c, i) => {
          const owned = S.lib.entries.some((e) => e.classic === c.id);
          const how = c.how === 'steam' ? 'Free on Steam' : c.how === 'flatpak' ? 'Open source' : 'Plays in ScummVM';
          return card(classicArt[c.id], c.title, `${c.year} · ${how}`, busy[c.id] ? 'Getting…' : owned ? 'In your library' : c.how === 'steam' ? 'Install' : 'Get', `data-cl="${i}" ${owned || busy[c.id] ? 'disabled' : ''} title="${esc(c.blurb)}"`);
        }).join('')}</div>`;
    } else if (tab === 'ports') {
      body = `<p class="note">Console games rebuilt to run natively on PC, by taking them apart (decompilation) or translating their code (recompilation). Smoother than emulation, often with widescreen, high frame rates and mods. Each needs your own copy of the original game and asks for its files the first time it starts.${paths.win ? '' : ''}</p>`
        + PORTS.map(([g, list]) => `<h3 class="sh-h">${esc(g)}</h3><div class="sh-ports">${list.map((p, i) => {
          const owned = p.gh && S.lib.entries.some((e) => e.port === p.gh);
          const btn = p.emu ? 'Emulators' : p.gh ? (busy['gh:' + p.gh] != null ? 'Getting…' : owned ? 'Play' : 'Get') : 'Project page';
          return `<div class="sh-port"><div><b>${esc(p.title)}</b><span>${esc(p.port)} · ${esc(p.console)}</span><em class="${/Playable/.test(p.status) ? 'ok' : ''}">${esc(p.status)}</em>${p.need ? `<small>Needs ${esc(p.need)}.</small>` : ''}</div>
            <div class="sh-port-b"><button type="button" class="${p.gh && !owned ? 'primary' : ''}" data-port="${esc(g)}|${i}" ${busy['gh:' + p.gh] != null ? 'disabled' : ''}>${btn}</button>${p.gh ? `<button type="button" data-u="${esc(p.site)}">About</button>` : ''}</div></div>`;
        }).join('')}</div>`).join('');
    } else if (tab === 'homebrew') {
      const plats = [['', 'All'], ['GB', 'Game Boy'], ['GBC', 'Game Boy Color'], ['GBA', 'Game Boy Advance']];
      body = `<p class="note">New games made by fans for real Game Boy hardware, free to download and share, from Homebrew Hub. They play in mGBA, which Bladedeck installs for you the first time.</p>
        <div class="sh-bar"><div class="sh-chips">${plats.map(([v, n]) => `<button type="button" data-plat="${v}" class="${hb.platform === v ? 'primary' : ''}">${n}</button>`).join('')}</div>
        <input type="search" class="sh-q" placeholder="Search homebrew" value="${esc(hb.q)}"></div>
        ${hb.err ? `<p class="note">${esc(hb.err)}</p>` : ''}
        <div class="sh-grid">${hb.games.map((g, i) => {
          const owned = S.lib.entries.some((e) => e.hbSlug === g.slug);
          return card(g.cover, g.title, `${HB_SYSTEM[g.platform] || g.platform}${g.developer ? ' · ' + g.developer : ''}`, busy[g.slug] ? 'Getting…' : owned ? 'In your library' : 'Get', `data-hb="${i}" ${owned || busy[g.slug] ? 'disabled' : ''}`, true);
        }).join('')}</div>
        ${hb.loading ? '<p class="note">Loading…</p>' : hb.page < hb.pages ? `<button type="button" data-more="1">More (${hb.total - hb.games.length} left)</button>` : ''}`;
    } else {
      body = `<p class="note">One press installs an emulator (from Flathub on Linux, with winget on Windows) and adds it to Bladedeck. Put your own game dumps in <code>${esc(paths.roms)}${esc(paths.sep)}&lt;system&gt;</code> and press Scan in Emulators.</p>
        <div class="sh-emus">${EMU_CATALOG.map((e, i) => {
          const k = key(e), inLib = k && S.lib.emulators.some((x) => x.installKey === k || x.flatpak === k);
          // Set up from Flathub, but its makers publish their own build: offer to switch.
          const older = e.gh && !inLib && S.lib.emulators.some((x) => x.flatpak === e.id || `${x.exe} ${x.args}`.includes(e.id));
          const note = e.note || (!paths.win && e.linuxNote) || (paths.win && !k ? 'No Windows package to install from. Get it from its website, then add it in Emulators.' : '');
          const state = !k ? 'Website' : busy[k] != null ? `Installing ${busy[k]}%` : inLib ? 'Open' : older ? 'Use the official build' : have[k] ? 'Set up' : 'Install';
          return `<div class="sh-emu"><b>${esc(e.name)}</b><span>${esc(e.system)}${e.also ? `, ${esc(e.also)}` : ''}</span>${note ? `<small>${esc(note)}</small>` : ''}
            <button type="button" data-emu="${i}" ${busy[k] != null ? 'disabled' : ''} class="${state === 'Install' || state === 'Set up' || state === 'Use the official build' ? 'primary' : ''}">${esc(state)}</button></div>`;
        }).join('')}</div>`;
    }
    el.innerHTML = `<div class="sh-tabs">${tabs.map(([k, n]) => `<button type="button" data-tab="${k}" class="${k === tab ? 'primary' : ''}">${n}</button>`).join('')}</div><div class="sh-body">${body}</div>`;
  }

  /* -------------------------------------------------------------- emulators */
  // Install (if needed) and add one emulator to the library. Returns the library's emulator.
  async function setUp(e) {
    const k = key(e);
    let em = S.lib.emulators.find((x) => x.installKey === k || (x.flatpak && x.flatpak === e.id) || (e.gh === 'rpcs3' && /net\.rpcs3\.RPCS3/.test(`${x.exe} ${x.args}`)));
    // An emulator set up from Flathub that now has its makers' own build: switch it over.
    const upgrade = em && e.gh && em.installKey !== k && (em.flatpak === e.id || `${em.exe} ${em.args}`.includes(e.id));
    if (em && !upgrade) return em;
    const run = await install(e); if (!run) return null;
    if (upgrade) {
      Object.assign(em, { exe: run.exe, args: e.args, installKey: k }); delete em.flatpak;
      save(); ensureEmuApps(); refresh(); draw();
      toast(`${e.name} now runs the official build. Your games and saves are where they were.`, 'fun');
      return em;
    }
    const dir = `${paths.roms}${paths.sep}${e.system.split(' / ')[0]}`;
    if (!e.exts) {
      // RetroArch picks its own core per game, so it lives in the library as an app.
      if (!S.lib.entries.some((x) => x.installKey === k)) S.lib.entries.push({ id: uid(), type: 'app', title: e.name, exe: run.exe, args: run.pre.replace('--filesystem=home ', '').trim(), installKey: k, added: Date.now(), playtime: 0 });
      save(); refresh(); draw(); toast(`${e.name} is ready in Apps.`, 'fun'); return null;
    }
    em = { id: uid(), name: e.name, exe: run.exe, args: `${run.pre}${e.args}`, system: e.system, exts: e.exts, romDirs: [dir], installKey: k, ...(e.onlyNames ? { onlyNames: e.onlyNames } : {}), ...(paths.win || e.gh ? {} : { flatpak: e.id }) };
    S.lib.emulators.push(em); save(); ensureEmuApps(); refresh(); draw();
    toast(`${e.name} is ready on the Emulation blade. Put games in ${dir}; they join it by themselves.`, 'fun');
    return em;
  }
  window.bladedeck.onEmuProgress(({ id, pct }) => { if (busy[id] != null) { busy[id] = pct; draw(); } });

  /* -------------------------------------------------------------- homebrew */
  async function getHomebrew(g) {
    busy[g.slug] = true; draw();
    try {
      const mg = EMU_CATALOG[0];
      const em = S.lib.emulators.find((x) => x.installKey === key(mg) || x.flatpak === mg.id) || S.lib.emulators.find((x) => String(x.exts).split(',').map((s) => s.trim()).includes(g.platform === 'GBA' ? 'gba' : 'gb')) || await setUp(mg);
      if (!em) return;
      const r = await api.storeGetRom(g);
      if (!r.ok) { toast(r.error, 'err'); return; }
      const e = { id: uid(), type: 'rom', title: g.title, rom: r.data.file, emulatorId: em.id, system: HB_SYSTEM[g.platform] || em.system, hbSlug: g.slug, added: Date.now(), playtime: 0 };
      if (!em.romDirs.includes(r.data.dir)) em.romDirs.push(r.data.dir);
      S.lib.entries.push(e);
      if (g.cover) { const a = await api.artSave(e.id, g.cover, 'cover'); if (a.ok) e.cover = a.data; }
      save(); refresh(e.id);
      toast(`${g.title} is in your library.`, 'fun');
    } finally { delete busy[g.slug]; draw(); }
  }

  /* -------------------------------------------------------------- classics */
  async function getClassic(c) {
    if (c.how === 'steam') { api.openLink(`steam://install/${c.appid}`); toast(`Steam is opening the install box for ${c.title}. It's free; Scan Steam library adds it once installed.`); return; }
    busy[c.id] = true; draw();
    try {
      const app = c.how === 'scummvm' ? SCUMMVM : { id: c.flat, win: c.win, name: c.title };
      if (!key(app)) { toast(`${c.title} cannot be installed for you here. Get it from its website.`, 'err'); return; }
      const run = await install(app); if (!run) return;
      const e = { id: uid(), type: 'app', title: c.title, exe: run.exe, classic: c.id, added: Date.now(), playtime: 0 };
      if (c.how === 'scummvm') {
        const r = await api.classicGet(c.id, c.title);
        if (!r.ok) { toast(r.error, 'err'); return; }
        Object.assign(e, { type: 'exe', args: `${run.pre}--path="${r.data.dir}" --auto-detect` });
      } else e.args = run.pre.replace('--filesystem=home ', '').trim();
      S.lib.entries.push(e);
      if (classicArt[c.id]) { const a = await api.artSave(e.id, classicArt[c.id], 'cover'); if (a.ok) e.cover = a.data; }
      save(); refresh(e.id);
      toast(`${c.title} is in your library.`, 'fun');
    } finally { delete busy[c.id]; draw(); }
  }

  /* -------------------------------------------------------------- PC ports */
  async function getPort(p) {
    if (p.emu) { tab = 'emus'; draw(); kick(); return; }
    if (!p.gh) { web(p.site); return; }
    const have = S.lib.entries.find((e) => e.port === p.gh);
    if (have) { closeModal(); launch(have); return; }
    if (paths.win === false && !paths.flatpak && p.gh === 'unleashed') { toast('Unleashed Recompiled needs Flatpak on Linux.', 'err'); return; }
    busy['gh:' + p.gh] = 0; draw();
    toast(`Downloading ${p.port}…`);
    const r = await api.emuGhInstall(p.gh);
    delete busy['gh:' + p.gh]; draw();
    if (!r.ok) { toast(`${p.port} did not install: ${r.error}`, 'err'); return; }
    const e = { id: uid(), type: 'recomp', title: p.title, exe: r.data.exe, args: r.data.args || '', cwd: r.data.args ? '' : r.data.exe.replace(/[\\/][^\\/]*$/, ''), port: p.gh, system: `${p.console} port`, added: Date.now(), playtime: 0 };
    S.lib.entries.push(e); save(); refresh(e.id); Art.fillOne(e); draw();
    toast(`${p.port} is in your library (PC blade). The first time it starts it asks for ${p.need || 'the original game\'s files'}.`, 'fun');
  }

  /* -------------------------------------------------------------- input */
  // A cover that fails to load leaves the coloured tile with the game's initials.
  document.addEventListener('error', (ev) => {
    const t = ev.target; if (!t.matches?.('.sh-art img')) return;
    if (t.dataset.alt) { t.src = t.dataset.alt; delete t.dataset.alt; t.classList.add('alt'); } else t.remove();
  }, true);
  let qTimer = 0;
  document.addEventListener('click', async (ev) => {
    const el = root(); if (!el || !el.contains(ev.target)) return;
    const b = ev.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.tab) { tab = b.dataset.tab; draw(); kick(); return; }
    if (b.dataset.itch) { itch.feed = b.dataset.itch; itch.q = ''; loadItch(); return; }
    if (b.dataset.ig) {
      const g = itch.games[+b.dataset.ig];
      await api.itchExpect(g); web(g.url);
      toast(Watch.watchesDownloads() ? `Download ${g.title} from its page. Bladedeck adds it when the file lands in Downloads.` : `Download ${g.title} from its page, then add it with Add a game.`);
      return;
    }
    if (b.dataset.cl) { getClassic(CLASSICS[+b.dataset.cl]); return; }
    if (b.dataset.u) { web(b.dataset.u); return; }
    if (b.dataset.port) { const [g, i] = b.dataset.port.split('|'); getPort(PORTS.find((x) => x[0] === g)[1][+i]); return; }
    if (b.dataset.free) {
      const [store, i] = b.dataset.free.split(':'); const g = free[store.toLowerCase()][+i];
      if (store === 'Steam') { api.openLink(g.url); toast(`Steam is opening the install box for ${g.title}.`); } else web(g.url);
      return;
    }
    if (b.dataset.plat != null) { hb.platform = b.dataset.plat; hb.page = 1; loadHb(); return; }
    if (b.dataset.more) { hb.page++; loadHb(true); return; }
    if (b.dataset.hb) { getHomebrew(hb.games[+b.dataset.hb]); return; }
    if (b.dataset.emu) {
      const e = EMU_CATALOG[+b.dataset.emu]; if (!key(e)) { web(e.site); return; }
      const em = S.lib.emulators.find((x) => x.installKey === key(e) || (x.flatpak && x.flatpak === e.id));
      if (e.gh && S.lib.emulators.some((x) => x.installKey !== key(e) && (x.flatpak === e.id || `${x.exe} ${x.args}`.includes(e.id))) && !S.lib.emulators.some((x) => x.installKey === key(e))) { setUp(e); return; }
      // Already set up: open it, and show where its tile lives.
      const tile = em && S.lib.entries.find((x) => x.emuApp === em.id);
      if (tile) { closeModal(); launch(tile); toast(`${e.name} is on the Emulation blade too.`); return; }
      setUp(e);
    }
  });
  document.addEventListener('change', (ev) => { if (ev.target.classList.contains('sh-all')) { itch.all = ev.target.checked; loadItch(); } });
  document.addEventListener('input', (ev) => {
    if (ev.target.classList.contains('sh-iq')) {
      clearTimeout(qTimer);
      qTimer = setTimeout(() => { itch.q = ev.target.value.trim(); loadItch().then(() => { const q = $('.sh-iq'); if (q && !S.pad) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }); }, 500);
      return;
    }
    if (!ev.target.classList.contains('sh-q')) return;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { hb.q = ev.target.value.trim(); hb.page = 1; loadHb().then(() => { const q = $('.sh-q'); if (q && !S.pad) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }); }, 450);
  });

  return { open };
})();

/* Watched folders: Bladedeck notices new games the moment they land.
   - A ROM anywhere in a watched folder joins the library under the emulator that plays its file
     type (the one whose system matches the folder name, if several can), with box art.
   - An itch.io download Bladedeck was told about is unpacked and added (main does the unpacking).
   - An AppImage, or a game program at the top of a watched folder (not in Downloads, where
     programs are usually installers), is added as a game.
   On start it also catches up on ROMs that arrived while it was closed. */
const Watch = (() => {
  const cfg = () => S.lib.settings.watch || { on: true, dirs: [] };
  let defaults = [];
  const ROMISH = /\.(gb|gbc|gba|nes|sfc|smc|n64|z64|v64|nds|3ds|cia|nsp|xci|gcm|rvz|wbfs|cso|chd|pbp|md|gen|sms|gg|pce|a26)$/i;
  const INSTALLER = /setup|install|unins|redist|vc_redist|dxsetup|update|patch|crack/i;
  const madeDirs = new Set();

  /* Consoles whose game is a folder with a fixed file in it (Xbox 360 default.xex, PS3 EBOOT.BIN
     under PS3_GAME/USRDIR): the folder names the game, without release tags like .EUR.X360-ZTM. */
  const FIXED = /^(default\.(xex|xbe)|eboot\.bin)$/i;
  const up = (p) => p.replace(/[\\/][^\\/]*$/, '');
  const scene = (n) => n.replace(/[._]+/g, ' ').replace(/-[A-Za-z0-9]+$/, '').replace(/\b(EUR|USA|PAL|NTSC|JPN|JP|US|EU|X360|XBOX ?360|XBOX|PS3|MULTi\d*|REPACK|PROPER|iNTERNAL|DLC|RF|XBLA|JTAG|RGH|GOD)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  function romTitle(file, em) {
    if (!em.onlyNames && !FIXED.test(baseName(file))) return cleanTitle(file);
    let d = up(file); while (/^(USRDIR|PS3_GAME)$/i.test(baseName(d))) d = up(d);
    return cleanTitle(scene(baseName(d)) || baseName(d));
  }
  // Libraries from before these rules: junk from Wine prefixes that was never played goes, and
  // games named "default" take their folder's name. Once.
  function tidy() {
    const st = S.lib.settings; if (st.romTidy >= 1) return;
    const before = S.lib.entries.length; let renamed = 0;
    S.lib.entries = S.lib.entries.filter((e) => !(e.type === 'rom' && e.rom && (junk(e.rom) || /NoDeps\.bin$|\.dxvk\.bin$/i.test(e.rom)) && !e.playtime));
    for (const e of S.lib.entries) if (e.type === 'rom' && e.rom && FIXED.test(baseName(e.rom)) && e.title.toLowerCase() === cleanTitle(e.rom).toLowerCase()) {
      const em = S.lib.emulators.find((x) => x.id === e.emulatorId) || {}; e.title = romTitle(e.rom, em); renamed++;
    }
    st.romTidy = 1; save();
    const gone = before - S.lib.entries.length;
    if (gone || renamed) { refresh(); toast(`Tidied your library: ${[gone && `${gone} files that were not games removed`, renamed && `${renamed} games named after their folder`].filter(Boolean).join(', ')}.`); }
  }

  async function start() {
    tidy();
    defaults = await api.watchDefaults();
    if (!S.lib.settings.watch) S.lib.settings.watch = { on: true, dirs: defaults.slice() };
    apply();
    if (cfg().on) setTimeout(catchUp, 4000);
  }
  function apply() { api.watchSet(cfg().on ? cfg().dirs : []); }
  const watchesDownloads = () => cfg().on && cfg().dirs.includes(defaults[1]);

  // Caches inside a Wine or Proton prefix are never games (a .bin there is not a PS3 game).
  const junk = (f) => /[\\/](drive_c|compatdata|shadercache|pfx)[\\/]/i.test(f);
  // A PS3 game's .bin is its EBOOT.BIN; any other .bin belongs to other consoles or to nothing.
  const ps3 = (em) => /playstation 3|\bps3\b|rpcs3/i.test(`${em.system} ${em.name}`);
  const fits = (file, em) => { const ext = (file.match(/\.([^./]+)$/) || [, ''])[1].toLowerCase(); return !junk(file) && extList(em).includes(ext) && (!em.onlyNames || em.onlyNames.includes(baseName(file).toLowerCase())) && !(ext === 'bin' && ps3(em) && !/^eboot\.bin$/i.test(baseName(file))); };
  function emulatorFor(file) {
    const can = S.lib.emulators.filter((em) => fits(file, em));
    if (can.length < 2) return can[0];
    const low = file.toLowerCase();
    return can.find((em) => (em.system || '').split(/\s*\/\s*/).some((sys) => sys && low.includes(sys.toLowerCase()))) || can[0];
  }
  function addRom(file, quiet) {
    if (S.lib.entries.some((e) => e.rom === file)) return null;
    const em = emulatorFor(file); if (!em) return null;
    const e = { id: uid(), type: 'rom', title: romTitle(file, em), rom: file, emulatorId: em.id, system: em.system || em.name, added: Date.now(), playtime: 0 };
    S.lib.entries.push(e); save();
    if (!quiet) { refresh(e.id); toast(`Added ${e.title} for ${em.name}.`, 'fun'); }
    Art.fillOne(e);
    return e;
  }
  async function catchUp() {
    const exts = [...new Set(S.lib.emulators.flatMap(extList))];
    if (!exts.length || !cfg().dirs.length) return;
    const files = await api.scanRoms({ exts, dirs: cfg().dirs });
    // Downloads also holds disc images and archives that are not games; only clear ROM types count there.
    const dl = defaults[1];
    const added = files.filter((f) => !f.startsWith(dl + '/') || ROMISH.test(f)).map((f) => addRom(f, true)).filter(Boolean);
    if (added.length) { refresh(); toast(`Found ${added.length} new game${added.length === 1 ? '' : 's'} in your watched folders.`, 'fun'); }
  }

  window.bladedeck.onWatchFound(async (d) => {
    if (d.kind === 'unpacking') { toast(`Unpacking ${d.title}…`); return; }
    if (d.kind === 'error') { toast(`${d.title} could not be unpacked: ${d.error}`, 'err'); return; }
    if (d.kind === 'game') {
      if (!d.exe) { toast(`${d.title} is unpacked in Games/itch, but Bladedeck could not tell which file starts it. Add it with Add a game.`, 'err'); return; }
      if (S.lib.entries.some((e) => e.exe === d.exe)) return;
      const e = { id: uid(), type: 'exe', title: d.title, exe: d.exe, cwd: d.dir, itchUrl: d.url, added: Date.now(), playtime: 0 };
      S.lib.entries.push(e);
      if (d.cover) { const a = await api.artSave(e.id, d.cover, 'cover'); if (a.ok) e.cover = a.data; }
      save(); refresh(e.id); Sound.play('fixed');
      toast(`${d.title} is unpacked and in your library.`, 'fun');
      return;
    }
    // A plain new file.
    const f = d.file, name = baseName(f);
    if (emulatorFor(f) && (!d.downloads || ROMISH.test(name))) { addRom(f); return; }
    if (/\.appimage$/i.test(f) && d.depth <= 1) {
      if (S.lib.entries.some((e) => e.exe === f)) return;
      const e = { id: uid(), type: 'exe', title: cleanTitle(f).replace(/[-_ ]?(x86_64|amd64|linux)$/i, ''), exe: f, added: Date.now(), playtime: 0 };
      S.lib.entries.push(e); save(); refresh(e.id); toast(`Added ${e.title}.`, 'fun'); Art.fillOne(e);
      return;
    }
    if (/\.(x86_64|exe)$/i.test(f) && !d.downloads && d.depth <= 1 && !INSTALLER.test(name)) {
      // One game per folder: the first program found in it.
      const dir = f.slice(0, f.length - name.length);
      if (d.depth === 1 && madeDirs.has(dir)) return;
      if (S.lib.entries.some((e) => e.exe === f || (d.depth === 1 && e.exe && e.exe.startsWith(dir)))) return;
      madeDirs.add(dir);
      const title = d.depth === 1 ? baseName(dir.replace(/[\\/]$/, '')) : cleanTitle(f);
      const e = { id: uid(), type: 'exe', title, exe: f, cwd: dir, added: Date.now(), playtime: 0 };
      S.lib.entries.push(e); save(); refresh(e.id); toast(`Added ${title}.`, 'fun'); Art.fillOne(e);
      return;
    }
    if (ROMISH.test(name) && !d.downloads) toast(`Found ${name}, but no emulator plays .${name.split('.').pop()} yet. Get one in Get games, Emulators.`);
    else if (ROMISH.test(name)) toast(`${name} landed in Downloads. Get an emulator for it in Get games, Emulators, and it joins your library.`);
  });

  function settingsHtml() {
    const c = cfg();
    return `<div class="checks"><label><input type="checkbox" name="watchOn" ${c.on ? 'checked' : ''}> Watch these folders and add new games straight away</label></div>
      <label>Watched folders, one per line<textarea name="watchDirs" rows="3">${esc(c.dirs.join('\n'))}</textarea></label>
      <div><button type="button" data-browse="dir:watchDirs" data-append="1">Add folder</button></div>
      <p class="note">ROMs anywhere inside join the library under the right emulator, with art. AppImages and game folders are added too. In Downloads only ROMs, AppImages and itch.io games you picked in Get games are added, so installers are left alone.</p>`;
  }
  function readSettings(root) {
    S.lib.settings.watch = { on: $('[name=watchOn]', root).checked, dirs: $('[name=watchDirs]', root).value.split('\n').map((x) => x.trim()).filter(Boolean) };
    apply();
  }

  return { start, apply, catchUp, watchesDownloads, settingsHtml, readSettings, fits, romTitle };
})();
