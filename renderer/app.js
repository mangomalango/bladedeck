'use strict';
/* Bladedeck renderer. One state object (S), two views (console blades, PC grid),
   one input dispatcher that keyboard and gamepad both feed. */

const api = window.bladedeck;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);

const TYPES = {
  steam:  { label: 'Steam',        glyph: 'S' },
  exe:    { label: 'PC game',      glyph: '▶' },
  recomp: { label: 'Native port',  glyph: '⟲' },
  gog:    { label: 'GOG',          glyph: 'G' },
  rom:    { label: 'Emulated',     glyph: '◉' },
  app:    { label: 'App',          glyph: '◆' }
};

const PRESETS = [
  { name: 'RetroArch',   system: 'Multi-system',      args: '-L "C:\\path\\to\\core_libretro.dll" "{rom}" -f', exts: 'zip,7z,nes,sfc,smc,gba,gb,gbc,n64,z64,md,gen,cue,iso,chd' },
  { name: 'Dolphin',     system: 'GameCube / Wii',    args: '-b -e "{rom}"',                  exts: 'iso,gcm,rvz,wbfs,gcz,wad' },
  { name: 'PCSX2',       system: 'PlayStation 2',     args: '-batch -fullscreen -- "{rom}"',  exts: 'iso,chd,cso,gz' },
  { name: 'DuckStation', system: 'PlayStation',       args: '-batch -fullscreen -- "{rom}"',  exts: 'cue,chd,pbp,m3u' },
  { name: 'RPCS3',       system: 'PlayStation 3',     args: '"{rom}"',                        exts: 'iso' },
  { name: 'PPSSPP',      system: 'PSP',               args: '"{rom}"',                        exts: 'iso,cso,pbp' },
  { name: 'Cemu',        system: 'Wii U',             args: '-f -g "{rom}"',                  exts: 'wua,wud,wux,rpx' },
  { name: 'Ryujinx',     system: 'Switch',            args: '"{rom}"',                        exts: 'nsp,xci' },
  { name: 'Xemu',        system: 'Xbox',              args: '-full-screen -dvd_path "{rom}"', exts: 'iso' },
  { name: 'Xenia',       system: 'Xbox 360',          args: '"{rom}"',                        exts: 'iso,xex' },
  { name: 'mGBA',        system: 'Game Boy Advance',  args: '-f "{rom}"',                     exts: 'gba,gb,gbc' },
  { name: 'melonDS',     system: 'Nintendo DS',       args: '"{rom}"',                        exts: 'nds' }
];

const S = {
  lib: null, themes: [], theme: null, defaultBlades: [],
  mode: 'console', blades: [], bi: 0, ii: {}, items: [], sel: null,
  pcNav: 'blade:0', search: '', sort: 'auto', pcItems: [], modal: false, sessions: []
};

/* ---------------------------------------------------------------- helpers */
const fileUrl = (p) => 'file:///' + encodeURI(String(p).replace(/\\/g, '/')).replace(/#/g, '%23').replace(/^\/+/, '');
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const initials = (t) => { const w = String(t).replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/); return ((w[0]?.[0] || '?') + (w[1]?.[0] || '')).toUpperCase(); };
const extList = (em) => String(em?.exts || '').split(',').map((x) => x.trim().replace(/^\./, '').toLowerCase()).filter(Boolean);
const baseName = (p) => String(p).split(/[\\/]/).pop();
// A game by id: the library's, or one played straight from a file without adding it (Roms).
const entryById = (id) => S.lib.entries.find((x) => x.id === id) || (S.oneOff || []).find((x) => x.id === id) || null;
const cleanTitle = (p) => {
  const b = baseName(p).replace(/\.[^.]+$/, '');
  const c = b.replace(/\(.*?\)|\[.*?\]/g, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return c || b;
};
function fmtPlay(sec) {
  if (!sec) return 'Not played yet';
  if (sec < 60) return 'Played less than a minute';
  if (sec < 3600) return `Played ${Math.round(sec / 60)} min`;
  return `Played ${(sec / 3600).toFixed(1)} h`;
}

let saveTimer;
// Player 2's menu (multi-screen) never writes the library; Player 1's does.
function save() { if (Players.isP2()) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => api.save(S.lib), 250); }

// Little blob-faced notifications. While a game has the screen they wait, so nothing pops over it.
const toastQueue = [];
function toast(msg, kind = 'ok') {
  // Every message is kept in the notification center too.
  if (typeof Notify !== 'undefined') Notify.add(msg, kind);
  if (document.hidden) { toastQueue.push([msg, kind]); return; }
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.innerHTML = `<i class="blob"><b></b><b></b></i><span></span>`;
  $('span', t).textContent = msg;
  $('#toasts').appendChild(t);
  Sound.play(kind === 'err' ? 'error' : 'toast');
  while ($('#toasts').children.length > 4) $('#toasts').firstElementChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, kind === 'err' ? 6000 : 3400);
}
function flushToasts() { toastQueue.splice(0).forEach(([m, k], i) => setTimeout(() => toast(m, k), i * 500)); }

/* ---------------------------------------------------------------- sound (see sound.js) */
const sndTick = () => Sound.play('tick');
const sndBlade = () => Sound.play('blade');
const sndBack = () => Sound.play('back');

/* ---------------------------------------------------------------- theme + background */
function applyTheme(id) {
  const t = S.themes.find((x) => x.id === id) || S.themes[0];
  if (!t) return;
  const root = document.documentElement;
  (S.appliedVars || []).forEach((k) => root.style.removeProperty(k));
  S.appliedVars = Object.keys(t.vars || {});
  for (const [k, v] of Object.entries(t.vars || {})) root.style.setProperty(k, v);
  $('#theme-css').textContent = t.css || '';
  document.body.dataset.theme = t.id;
  Scenes.set(t.scene === 'drive' ? null : t.scene);
  Drive.set(t.scene === 'drive' && !Wallpaper.on());
  S.theme = t; S.lib.settings.theme = t.id;
  document.dispatchEvent(new CustomEvent('theme-changed'));
}
function cycleTheme() {
  const i = S.themes.findIndex((t) => t.id === S.theme.id);
  applyTheme(S.themes[(i + 1) % S.themes.length].id);
  save(); sndBlade(); refresh();
}

function rgba(hex, a) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function startBg() {
  const c = $('#bg'); const x = c.getContext('2d'); let w = 0, h = 0, last = 0;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let drawn = null, running = false;
  const size = () => { w = c.width = Math.max(1, innerWidth >> 1); h = c.height = Math.max(1, innerHeight >> 1); drawn = null; ensureLoop(); };
  size(); addEventListener('resize', size);

  function draw(t) {
    const R = S.theme?.ribbon || {};
    const cols = R.colors || ['#9fe23c', '#ffffff'];
    const n = R.count ?? 5, alpha = R.alpha ?? 0.3, speed = (R.speed ?? 0.3) * (still ? 0 : 1);
    const thick = (R.width || 100) / 2;
    x.clearRect(0, 0, w, h);
    x.globalCompositeOperation = R.blend || 'source-over';
    for (let i = 0; i < n; i++) {
      const col = cols[i % cols.length];
      const base = h * (0.18 + 0.64 * ((i * 0.381966) % 1));
      const amp = h * (0.05 + 0.07 * ((i * 0.618) % 1));
      const f = (1.1 + i * 0.37) * Math.PI * 2 / w;
      const th = Math.max(1, thick * (0.55 + ((i * 0.41) % 1)));
      const ph = i * 1.7, s = t * speed;
      const yAt = (px) => base + Math.sin(px * f + s + ph) * amp + Math.sin(px * f * 0.47 - s * 0.7 + i) * amp * 0.6;
      const g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.3, rgba(col, alpha)); g.addColorStop(0.7, rgba(col, alpha)); g.addColorStop(1, rgba(col, 0));
      x.fillStyle = g; x.beginPath();
      for (let px = 0; px <= w; px += 8) { const y = yAt(px) - th * (0.7 + 0.3 * Math.sin(px * 0.01 + i)); px ? x.lineTo(px, y) : x.moveTo(px, y); }
      for (let px = w; px >= 0; px -= 8) x.lineTo(px, yAt(px) + th * (0.7 + 0.3 * Math.cos(px * 0.012 + i)));
      x.closePath(); x.fill();
    }
  }
  function frame(ts) {
    if (document.hidden || away || (still && drawn === S.theme?.id)) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
    if (ts - last < 33) return; // a game has the screen: no drawing
    drawn = S.theme?.id; last = ts; draw(ts / 1000);
  }
  function ensureLoop() {
    if (running || document.hidden || away || (still && drawn === S.theme?.id)) return;
    running = true;
    last = 0;
    requestAnimationFrame(frame);
  }
  document.addEventListener('deck-away', (ev) => { if (!ev.detail) ensureLoop(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ensureLoop(); });
  document.addEventListener('theme-changed', () => { drawn = null; ensureLoop(); });
  ensureLoop();
}

function startClock() {
  const tick = () => { $('#clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  tick(); setInterval(tick, 15000);
}

/* The system at a glance, in the top bar: processor, memory and the hottest sensor. Click it (or
   press I) for This PC. Refreshes every 3 seconds while the menu is on screen, never during a game. */
const openThisPc = () => Panels.show({ kind: 'system', key: 'system', title: 'This PC', icon: '🖥' });
function startSysChip() {
  const chip = $('#sys-chip'); if (!chip || Players.isP2()) return;
  const gbs = (n) => (n / 1073741824).toFixed(1);
  const tick = async () => {
    const on = S.lib.settings.showStats !== false;
    chip.hidden = !on;
    if (!on || document.body.classList.contains('away')) return;
    const m = await api.sysMini().catch(() => null); if (!m) return;
    chip.querySelector('.sc-cpu').textContent = m.cpu != null ? `CPU ${m.cpu}%` : '';
    chip.querySelector('.sc-mem').textContent = `RAM ${gbs(m.used)}/${gbs(m.total)} GB`;
    chip.querySelector('.sc-temp').textContent = m.temp != null ? `${m.temp}°C` : '';
    chip.classList.toggle('hot', (m.cpu ?? 0) > 85 || (m.temp ?? 0) > 85 || m.used / m.total > 0.9);
  };
  chip.addEventListener('click', openThisPc);
  tick(); setInterval(tick, 3000);
}

/* ---------------------------------------------------------------- cover art */
function genCover(title, type) {
  const h1 = hash(title) % 360, h2 = (h1 + 40 + (hash(title + 'x') % 80)) % 360;
  return `<div class="art gen" style="--h1:${h1};--h2:${h2}"><span>${esc(initials(title))}</span><em>${esc(TYPES[type]?.glyph || '')}</em></div>`;
}
function cover(e) {
  if (e.glyph) return `<div class="art sys"><span>${esc(e.glyph)}</span></div>`;
  // An emulator's tile: its icon on a glow, with the systems it plays.
  if (e.emuApp && !e.cover) return `<div class="art emuart">${e.icon ? `<img src="${fileUrl(e.icon)}" alt="">` : `<i>${esc(initials(e.title))}</i>`}<b>${esc(e.system || 'Emulator')}</b></div>`;
  if (e.cover) return `<img loading="lazy" src="${fileUrl(e.cover)}" data-t="${esc(e.title)}" data-ty="${esc(e.type)}" alt="">`;
  return genCover(e.title, e.type);
}
// A broken image path quietly falls back to generated art.
document.addEventListener('error', (ev) => {
  const im = ev.target;
  if (im && im.tagName === 'IMG' && im.dataset.t) im.parentElement.innerHTML = genCover(im.dataset.t, im.dataset.ty);
}, true);

/* ---------------------------------------------------------------- library queries */
const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });

/* Home, Switch-style: not everything you own, just what you are likely to want now.
   Continue (the last few), then a few picks with a reason each: your big game lately, something
   short for tonight, a goal you set, something not played yet, a favorite or two. The picks
   change once a day, not every time you move. "All your games" is the way to the whole library. */
function homePicks(list) {
  const games = list.filter((e) => e.type !== 'app' && !e.emuApp);
  const out = [], tags = new Map(), used = new Set();
  const add = (e, tag) => { if (!e || used.has(e.id)) return false; used.add(e.id); out.push(e); tags.set(e.id, tag); return true; };
  // Today's pick among several: steady through the day, different tomorrow.
  const day = hash(new Date().toDateString());
  const pickOf = (arr) => (arr.length ? arr[(day + arr.length) % arr.length] : null);
  const played = games.filter((e) => e.lastPlayed).sort((a, c) => c.lastPlayed - a.lastPlayed);
  if (S.playing) add(games.find((e) => e.id === S.playing.id), 'Playing now');
  for (const e of played.slice(0, 4)) add(e, out.length ? 'Continue' : 'Last played');
  const recentDays = (e) => (e.days || []).filter((d) => Date.now() - new Date(d) < 14 * 86400000).length;
  const big = played.filter((e) => !used.has(e.id)).sort((a, c) => recentDays(c) * 3600 + (c.playtime || 0) / 10 - (recentDays(a) * 3600 + (a.playtime || 0) / 10))[0];
  if (!add(big, 'Your big game')) { const top = played.slice().sort((a, c) => recentDays(c) - recentDays(a) || (c.playtime || 0) - (a.playtime || 0))[0]; if (top && tags.has(top.id) && !/Playing/.test(tags.get(top.id))) tags.set(top.id, 'Your big game'); }
  add(pickOf(games.filter((e) => !used.has(e.id) && e.goal)), null) && (() => { const e = out[out.length - 1]; tags.set(e.id, `🎯 ${e.goal}`); })();
  add(pickOf(games.filter((e) => !used.has(e.id) && ((e.bestSession && e.bestSession <= 1800) || e.type === 'rom'))), 'Something short tonight');
  add(pickOf(games.filter((e) => !used.has(e.id) && !e.lastPlayed && e.favorite)) || pickOf(games.filter((e) => !used.has(e.id) && !e.lastPlayed)), 'Not played yet');
  for (const e of games.filter((x) => x.favorite && !used.has(x.id)).slice(0, 2)) add(e, '★ Favorite');
  S.homeTags = tags;
  const gi = S.blades.findIndex((b) => b.id === 'games' || (b.filter && !Object.keys(b.filter).length));
  out.push({ id: 'home-all', title: 'All your games', sub: `${games.length} games, on the Games blade`, glyph: '▦', run: () => { if (gi < 0) return; if (S.mode === 'pc') { S.pcNav = 'blade:' + gi; S.sel = null; renderPc(); } else setBlade(gi); } });
  return out;
}

/* Home in sections: what is running, your Favorites, then Recently played, then (with picks on)
   a few picks for today. Section titles are not stops: the cursor goes from game to game. */
const header = (id, title) => ({ id: `h-${id}`, header: true, title });
function homeSections(list) {
  const games = list.filter((e) => e.type !== 'app' && !e.emuApp);
  const used = new Set(), out = [];
  const tags = new Map();
  const take = (arr, max) => arr.filter((e) => !used.has(e.id)).slice(0, max).map((e) => { used.add(e.id); return e; });
  const playing = S.playing && games.find((e) => e.id === S.playing.id);
  if (playing) { out.push(header('now', 'Playing now'), ...take([playing], 1)); tags.set(playing.id, 'Playing now'); }
  const fav = take(games.filter((e) => e.favorite).sort((a, c) => (c.lastPlayed || 0) - (a.lastPlayed || 0) || byTitle(a, c)), 24);
  out.push(header('fav', 'Favorites'));
  if (fav.length) out.push(...fav); else out.push({ id: 'h-fav-none', header: true, note: true, title: 'Press X on any game to put it here' });
  const rec = take(games.filter((e) => e.lastPlayed).sort((a, c) => c.lastPlayed - a.lastPlayed), 12);
  if (rec.length) out.push(header('rec', 'Recently played'), ...rec);
  if (S.lib.settings.curatedHome !== false) {
    const picks = homePicks(games.filter((e) => !used.has(e.id))).filter((e) => !e.run).slice(0, 4);
    for (const e of picks) tags.set(e.id, S.homeTags.get(e.id));
    if (picks.length) { out.push(header('pick', 'Picked for today'), ...picks); picks.forEach((e) => used.add(e.id)); }
  }
  S.homeTags = tags;
  const gi = S.blades.findIndex((b) => b.id === 'games' || (b.filter && !Object.keys(b.filter).length));
  out.push({ id: 'home-all', title: 'All your games', sub: `${games.length} games, on the Games blade`, glyph: '▦', run: () => { if (gi < 0) return; if (S.mode === 'pc') { S.pcNav = 'blade:' + gi; S.sel = null; renderPc(); } else setBlade(gi); } });
  return out;
}

function bladeItems(b) {
  if (b.special === 'system') return systemActions();
  let list = S.lib.entries.filter((e) => !e.hidden);
  const f = b.filter || {};
  // Emulators themselves live with the games they play.
  if (f.types) list = list.filter((e) => (e.emuApp ? f.types.includes('rom') : f.types.includes(e.type)));
  if (f.system) list = list.filter((e) => (e.system || '') === f.system);
  if (f.emulator) list = list.filter((e) => e.emulatorId === f.emulator);
  if (f.favorite) list = list.filter((e) => e.favorite);
  if (f.home) return homeSections(list);
  if (f.recent) return list.filter((e) => e.lastPlayed).sort((a, c) => c.lastPlayed - a.lastPlayed).slice(0, +f.recent || 12);
  return list.sort((a, c) => (c.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || (a.system || '').localeCompare(c.system || '') || byTitle(a, c));
}

/* The System blade, in groups: A opens one, B (or "‹ Back") comes out again. Settings, Backup,
   PC mode and Exit stay at the top, since they are what people look for first. */
let sysGroup = null;
function systemGroups() {
  const sec = [
    ...(Secrets.any() ? [{ id: 'sys-sec', title: 'Secret options', sub: 'Hidden settings you have unlocked', glyph: '✧', run: () => Secrets.openOptions() }] : []),
    ...(Secrets.has('drive') ? [{ id: 'sys-drive', title: 'Take the wheel', sub: 'Drive the Night Drive car', glyph: '🏎', run: () => Drive.start() }] : []),
    ...(Secrets.has('toolbox') ? [{ id: 'sys-tool', title: "Rivet's Toolbox", sub: 'Secrets you have found', glyph: '⚒', run: () => Secrets.openToolbox() }] : [])
  ];
  return [
    { id: 'grp-lib', title: 'Games and library', sub: 'Add, scan, find art, get games, sources', glyph: '▦', children: [
      { id: 'sys-quick', title: 'Find everything', sub: 'Steam, GOG, Heroic and store launchers in one go', glyph: '✦', run: findEverything },
      { id: 'sys-add', title: 'Add a game or app', sub: 'Pick a program, Steam ID or game file', glyph: '+', run: () => editEntry() },
      { id: 'sys-romfile', title: 'Open a game file', sub: 'Play any ROM or disc image right away, full screen', glyph: '💿', run: () => Roms.pickAndPlay() },
      { id: 'sys-get', title: 'Get games', sub: 'Free games, homebrew and emulators', glyph: '⬇', run: () => Shop.open() },
      { id: 'sys-browse', title: 'Browse your sources', sub: 'Search your sites, see what they have, install', glyph: '🔎', run: () => Finder.open() },
      { id: 'sys-sources', title: 'Sources', sub: 'Your places for ROMs, emulators and BIOS files', glyph: '🧭', run: () => Roms.sources() },
      { id: 'sys-steam', title: 'Scan Steam library', sub: 'Find installed Steam games', glyph: 'S', run: () => scanSteam() },
      { id: 'sys-gog', title: 'Scan GOG games', sub: 'Find GOG installs and Heroic games', glyph: 'G', run: () => scanGog() },
      { id: 'sys-art', title: 'Find missing art', sub: 'Covers and backgrounds from Steam and SteamGridDB', glyph: '🖼', run: () => Art.fillAll() },
      { id: 'sys-dl', title: 'Downloads', sub: 'What is downloading, and what finished', glyph: '⬇', run: () => Notify.open() }] },
    { id: 'grp-soft', title: 'Gaming software', sub: 'Emulators, launchers, Minecraft and extras', glyph: '◉', children: [
      { id: 'sys-emu', title: 'Emulators', sub: 'Add, edit and scan game folders', glyph: '◉', run: manageEmulators },
      { id: 'sys-emuget', title: 'Install emulators', sub: 'One press each, official builds', glyph: '⇩', run: () => Shop.open('emus') },
      { id: 'sys-mc', title: 'Minecraft', sub: 'Prism Launcher, your instances, controller support', glyph: '⛏', run: () => Minecraft.open() },
      { id: 'sys-cf', title: 'CurseForge and Modrinth', sub: 'Modpacks, into Prism Launcher', glyph: '🔥', run: () => Minecraft.packs() },
      { id: 'sys-store', title: 'Add store launchers', sub: 'Steam, Heroic and Lutris as apps', glyph: '⇪', run: addLaunchers },
      { id: 'sys-extras', title: 'Suggested extras', sub: 'Tailscale, Discord, achievements, save backups, updates', glyph: '✚', run: () => Extras.open() },
      { id: 'sys-softset', title: 'Gaming software settings', sub: 'Launching, emulators, Steam, Windows games', glyph: '⚙', run: () => openSettingsAt('games') }] },
    { id: 'grp-play', title: 'Play together', sub: 'Split screen, multi-screen, Nearby, friends', glyph: '👥', children: [
      { id: 'sys-split', title: 'Split screen', sub: 'Up to 4 players on this screen (PartyDeck)', glyph: '👥', run: () => SplitScreen.open() },
      { id: 'sys-multi', title: 'Multi-screen', sub: 'Two players, two screens, each their own menu and sound', glyph: '🖥', run: () => openSettingsAt('multi') },
      { id: 'sys-pads', title: 'Controllers', sub: 'Who is which player, rumble, DualSense sound', glyph: '🎮', run: () => openSettingsAt('pads') },
      { id: 'sys-near', title: 'Nearby', sub: `${Nearby.peers().length || 'No'} Bladedecks on your network · invite to play`, glyph: '📡', run: () => Nearby.open() },
      { id: 'sys-fr', title: 'Friends', sub: `${(S.lib.settings.friends || []).length || 'No'} friends to poke`, glyph: '👉', run: () => Friends.manage() }] },
    { id: 'grp-cap', title: 'Capture', sub: 'Recordings, clips and the live view', glyph: '🎬', children: [
      { id: 'sys-cap', title: 'Captures', sub: 'Your recordings and saved clips', glyph: '🎬', run: () => Capture.gallery() },
      { id: 'sys-rec', title: 'Record', sub: 'Start or stop recording (View + X)', glyph: '⏺', run: () => Capture.toggleRecord() },
      { id: 'sys-recset', title: 'Recording and live view settings', sub: 'Replay length, quality, live view', glyph: '⚙', run: () => openSettingsAt('rec') }] },
    { id: 'grp-pc', title: 'This PC', sub: 'System, sound, notifications, phone, files', glyph: '🖥', children: [
      { id: 'sys-pc2', title: 'This PC', sub: 'Processor, graphics, memory, battery, Wi-Fi, brightness, power', glyph: '🖥', run: () => Panels.show({ kind: 'system', key: 'system', title: 'This PC', icon: '🖥' }) },
      { id: 'sys-vol', title: 'Sound', sub: 'Volume, outputs, mic and every app', glyph: '🔊', run: () => Volume.open() },
      { id: 'sys-qr', title: 'Quick Resume', sub: 'Switch between running games and apps, or freeze them', glyph: '▣', run: () => Resume.open() },
      { id: 'sys-nc', title: 'Notifications', sub: 'Everything Bladedeck told you, and downloads', glyph: '🔔', run: () => Notify.open() },
      { id: 'sys-phone', title: 'Phone app', sub: 'Control Bladedeck from your phone', glyph: '📱', run: () => Companion.open() },
      { id: 'sys-xfer', title: 'Send files', sub: 'To your phone, or to a friend nearby', glyph: '📤', run: () => Transfer.open() },
      { id: 'sys-voice', title: 'Voice commands', sub: S.lib.settings.voice ? 'Say “open…”, “weather”, “timer for 5 minutes” (View + LB)' : 'Turn on talking to Bladedeck', glyph: '🎤', run: () => (S.lib.settings.voice ? Voice.listen() : Voice.setup()) }] },
    { id: 'grp-look', title: 'Personalize', sub: `${S.theme.name} · wallpaper, menus, aquarium, profile`, glyph: '🎨', children: [
      { id: 'sys-theme', title: 'Next theme', sub: S.theme.name, glyph: '◐', run: cycleTheme },
      { id: 'sys-wall', title: 'Wallpaper', sub: 'Wallpaper Engine or your own picture or video behind the menus', glyph: '🏞', run: () => Wallpaper.open() },
      { id: 'sys-look', title: 'Look and menus', sub: 'Font, letters, size and tab icons', glyph: 'Aa', run: () => Look.open() },
      { id: 'sys-mu', title: 'Music', sub: 'Play songs from your music folder', glyph: '♪', run: () => Music.open() },
      { id: 'sys-aq', title: 'Aquarium', sub: `${(S.lib.settings.aquarium?.flakes ?? 5)} fish flakes to feed your fish`, glyph: '🐟', run: () => Scenes.openTank() },
      { id: 'sys-me', title: 'Your profile', sub: `Level ${Player.levelOf(S.lib.settings.player?.xp || 0)}${Player.streak() > 1 ? ` · ${Player.streak()}-day streak` : ''} · goals and journal`, glyph: '⭐', run: () => Player.profile() }, ...sec] },
    { id: 'grp-help', title: 'Help', sub: 'Tour, controls, guide, walkthroughs', glyph: '🧭', children: [
      { id: 'sys-tour', title: 'Tour', sub: 'Every feature, one card at a time', glyph: '🧭', run: () => Tour.open() },
      { id: 'sys-ctl', title: 'Controls', sub: 'Every button and key', glyph: '⌨', run: openControls },
      { id: 'sys-guide', title: 'Guide', sub: 'Quick questions about a game, or Bladedeck (hold LT and pull)', glyph: '?', run: () => Guide.open('pad') },
      { id: 'sys-pip', title: 'Walkthrough window', sub: 'A small YouTube that floats over your game', glyph: '📺', run: () => walkthrough() }] },
    { id: 'sys-set', title: 'Settings', sub: 'Name, look, gaming software, controllers, accounts', glyph: '⚙', run: openSettings },
    { id: 'sys-backup', title: 'Backup and restore', sub: 'Every choice and place you set, saved and brought back', glyph: '💾', run: () => Backup.open() },
    { id: 'sys-pc', title: 'Switch to PC mode', sub: 'Windowed library manager', glyph: '▣', run: () => setMode('pc') },
    { id: 'sys-exit', title: 'Exit Bladedeck', sub: 'Close the launcher', glyph: '⏻', run: () => api.quit() }
  ];
}
function systemActions() {
  const groups = systemGroups();
  const g = sysGroup && groups.find((x) => x.id === sysGroup);
  if (g) return [{ id: 'sys-up', title: '‹ Back', sub: 'To the System menu (B)', glyph: '‹', run: () => sysOpen(null) }, ...g.children];
  sysGroup = null;
  return groups.map((x) => (x.children ? { ...x, sub: `${x.sub} ›`, run: () => sysOpen(x.id) } : x));
}
// Into a group (its first item highlighted), or back out to the group you were in.
function sysOpen(id) {
  const was = sysGroup; sysGroup = id;
  const i = S.blades.findIndex((b) => b.special === 'system');
  if (i < 0) return;
  if (id) S.ii[i] = 1;
  fillBlade(i, id ? null : was);
  Sound.play(id ? 'blade' : 'back');
}
// Every action, wherever it is, for things that look one up by name (voice commands, the phone).
const allSystemActions = () => systemGroups().flatMap((x) => x.children || [x]);

function subline(e) {
  if (e.sub) return e.sub;
  if (e.emuApp) return `Emulator · ${e.system || ''}`.replace(/ · $/, '');
  return e.type === 'rom' && e.system ? e.system : TYPES[e.type]?.label || '';
}

/* ---------------------------------------------------------------- launching */
const selEl = () => $(S.mode === 'console' ? '.blade.active .item.sel' : '.tile.sel .cv');

// The game is started straight away; the tracers and ripple play while it boots and never delay it.
let launching = false;
async function launch(e) {
  const el = selEl();
  // Open the thing first, so the splash ripples the dialog it opens instead of an old picture.
  if (e.run) { Sound.play('blade'); const r = e.run(); FX.ripple(el, { dom: false }); return r; }
  if (launching) return;
  // An emulated game with save states: continue from one, or start fresh.
  if (e.type === 'rom' && e.__state === undefined && S.lib.settings.askStates !== false) {
    const pick = await Roms.chooseState(e);
    if (pick === false) return;
    e.__state = pick || '';
    try { return await launch(e); } finally { delete e.__state; }
  }
  launching = true;
  const emulator = S.lib.emulators.find((x) => x.id === e.emulatorId);
  if ((S.lib.settings.rippleStyle || 'water') !== 'classic') Water.prepare();
  NowPlaying.reset();
  launchedAt = Date.now(); opened = null;
  Sound.play('go');
  el?.classList.add('charging');
  // Steam and Heroic show their own "launching" pop-ups; stay on top of them until the game arrives.
  const cover = e.type === 'steam' || (e.type === 'gog' && !e.exe);
  if (cover) { api.keepOnTop(true); guardSteam(); }
  const player = await Players.launchOpts();
  if (player && (e.type === 'steam' || (e.type === 'gog' && !e.exe))) toast(`${e.title} starts through ${e.type === 'steam' ? 'Steam' : 'Heroic'}, so it sees every controller.`);
  const { __state, ...plain } = e;
  const pending = api.launch({ entry: __state ? { ...plain, stateFile: __state } : plain, emulator, settings: S.lib.settings, player });
  const arrived = FX.tracers(el);
  const r = await pending;
  if (!r.ok) { el?.classList.remove('charging'); FX.fizzle(el); toast(r.error, 'err'); launching = false; if (cover) { api.keepOnTop(false); steamGuard = null; } return; }
  await arrived;
  el?.classList.remove('charging');
  FX.ripple(el); Sound.play('ripple');
  Intro.play(e);
  e.lastPlayed = Date.now(); markDay(e); save();
  S.playing = { id: e.id, t: Date.now(), pid: r.pid, tracked: !(e.type === 'steam' || (e.type === 'gog' && !e.exe)), covered: cover };
  if (opened) { const p0 = S.playing, o = opened; isGameWindow(p0, o).then((ok) => { if (ok && !p0.winPid) { p0.winPid = o.pid; uncoverSteam(p0); } }); }
  // Every game started this run, so several can run at once (see Quick Resume).
  S.sessions = [...S.sessions.filter((x) => x.id !== e.id), S.playing];
  Players.launched(S.playing, e, player); Roms.launched(S.playing, e); AchClips.session(S.playing, e);
  if (S.playing.covered) {
    const p0 = S.playing;
    setTimeout(() => {
      if (!p0.covered) return;
      // Still no game: Steam is probably asking something. Show it.
      const asked = steamGuard && steamGuard.hidden.size;
      if (!p0.winPid && asked) { revealSteam(); toast('Steam seems to need you. Bladedeck will wait for the game.'); }
      uncoverSteam(p0);
    }, 25000);
  }
  Tasks.sync(e);
  if (e.recordNext) { e.recordNext = false; save(); Capture.recordFor(e, 300); }
  Capture.sessionStarted();
  setTimeout(() => {
    launching = false;
    syncAway();
    const p = S.playing;
    // On KDE we see the game's window arrive, so stay up until it does instead of dropping to the
    // desktop while Steam is still getting the game ready.
    if (p && !p.winPid && NowPlaying.mode() === 'kwin') {
      p.waiting = true; toast(cover ? `Starting ${e.title}… Press X if Steam needs you.` : `Starting ${e.title}…`);
      setTimeout(() => { if (p.waiting) { p.waiting = false; uncoverSteam(p); } }, 180000);
      return;
    }
    // Without KDE we cannot see the game's window arrive; a few seconds covers Steam's pop-up.
    if (p?.covered) setTimeout(() => uncoverSteam(p), 7000);
    // Let the intro finish before tucking Bladedeck away.
    if (S.lib.settings.hideOnLaunch && !Players.on()) setTimeout(() => { Sound.duck(true); api.minimize(); }, Intro.playing() ? 3000 : 0);
  }, fxOn() ? 1500 : 0);
}

/* Is this window really the game a session is for? Steam games: the window's class names the
   Steam app (steam_app_N), or its process was started by Steam for that app id. Other games:
   the window's process came from the program Bladedeck started. Last of all, its title. A
   Discord pop-up or a browser opening during a launch is never taken for the game. */
const normTitle = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
async function isGameWindow(p, ev) {
  const e = p && S.lib.entries.find((x) => x.id === p.id);
  if (!e || !ev || !ev.pid || steamWin(ev.cls)) return false;
  if (p.winPid && ev.pid === p.winPid) return true;
  const app = String(ev.cls || '').match(/^steam_app_(\d+)$/i);
  if (app) return e.type === 'steam' && String(e.appid) === app[1];
  const info = await api.pidInfo(ev.pid).catch(() => null);
  if (info?.appId) return e.type === 'steam' && String(e.appid) === String(info.appId);
  if (p.pid && (ev.pid === p.pid || info?.ancestors?.includes(p.pid))) return true;
  const c = normTitle(ev.caption), t = normTitle(e.title);
  return t.length > 3 && c.length > 3 && (c.includes(t) || t.includes(c));
}
// Stop covering Steam's windows: the game is here, the player went somewhere else, or they want to
// see what Steam is asking. Staying on top never lasts long, so it can never trap focus.
function uncoverSteam(p) { if (p && p.covered) { p.covered = false; api.keepOnTop(false); } steamGuard = null; }

/* Steam guard: while a Steam (or Heroic) game starts, any Steam window that shows up or comes to
   the front is minimized at once and Bladedeck takes focus back, so Steam's "launching" pop-up
   and its library window never cover the start. It ends when the game's window is here. If
   Steam needs an answer (a cloud conflict, "Processing Vulkan shaders"), X shows its windows,
   and so does waiting 25 seconds without the game appearing. Works wherever Bladedeck can see
   windows: KDE, Windows, and X11 desktops with wmctrl. */
let steamGuard = null;
const launcherWin = (cls) => steamWin(cls) || /^heroic$/i.test(cls || '');
function guardSteam() { steamGuard = { since: Date.now(), hidden: new Map() }; }
function revealSteam() {
  const g = steamGuard; steamGuard = null;
  if (g) for (const id of g.hidden.keys()) api.winAct(id, 'show');
}
api.onPeek((ev) => {
  if (ev.kind !== 'windows' || !steamGuard) return;
  if (Date.now() - steamGuard.since > 60000) { steamGuard = null; return; }
  let l; try { l = JSON.parse(ev.caption) || []; } catch { return; }
  for (const w of l) {
    if (!launcherWin(w.cls) || w.min) continue;
    // New Steam windows, and ones Steam brings to the front, go away while the game starts.
    if (!steamGuard.hidden.has(w.id) || w.active) {
      steamGuard.hidden.set(w.id, w.caption);
      api.winAct(w.id, 'min');
      if (w.active) api.deckFocus();
    }
  }
});
// Losing focus to Steam during a start does not count; losing it to anything else ends the cover.
addEventListener('blur', () => setTimeout(() => {
  if (!S.playing?.covered || document.hasFocus()) return;
  const active = Dock.windows().find((w) => w.active);
  if (active && launcherWin(active.cls) && steamGuard) { api.winAct(active.id, 'min'); steamGuard.hidden.set(active.id, active.caption); api.deckFocus(); return; }
  uncoverSteam(S.playing);
}, 400));
/* Sound follows the game's screen: moving a game (or emulator) to the TV switches the sound to
   the TV, and back to the laptop's screen switches it back. Only a move counts, not where a game
   starts, so a game started on the TV with sound on the speakers stays that way. */
let followAt = { pid: 0, out: '' };
api.onPeek(async (ev) => {
  if (ev.kind !== 'windows' || S.lib.settings.soundFollow === false) return;
  const p = S.playing; if (!p?.winPid) { followAt = { pid: 0, out: '' }; return; }
  let l; try { l = JSON.parse(ev.caption) || []; } catch { return; }
  const w = l.find((x) => x.pid === p.winPid); if (!w?.out) return;
  const was = followAt; followAt = { pid: p.winPid, out: w.out };
  if (was.pid !== p.winPid || was.out === w.out || !was.out) return;
  const r = await api.soundFollow(w.out);
  if (r.ok && r.data) toast(`Sound moved with the game: ${r.data}.`);
});
// The first real window to open after a launch is the game (Steam's own windows don't count).
let launchedAt = 0, opened = null;
const steamWin = (cls) => /^steam(webhelper)?$/i.test(cls || '');
api.onPeek(async (ev) => {
  if (ev.kind !== 'opened' || steamWin(ev.cls) || !launchedAt) return;
  const p = S.playing;
  if (!p) { if (launching) opened = ev; return; }
  if (p.winPid) return;
  // Only the game's own window ends the wait; anything else opening meanwhile is ignored.
  if (!(await isGameWindow(p, ev))) return;
  p.winPid = ev.pid;
  uncoverSteam(p);
  if (p.waiting) {
    p.waiting = false;
    if (S.lib.settings.hideOnLaunch) { Sound.duck(true); api.minimize(); }
  }
});
// The walkthrough window: a small YouTube over the game, searching for whatever is being played.
/* In the menu it is a pinned mini player inside Bladedeck (a window of its own would sit behind the
   full-screen menu and never show); while a game has the screen it is the window over the game,
   and a pinned mini player playing a video follows you there by itself (panels.js). */
function walkthrough(q) {
  const e = (S.playing && entryById(S.playing.id)) || (S.sel && !S.sel.run && S.sel.title ? S.sel : null);
  const query = q || (e ? `${e.title} walkthrough` : '');
  if (deckFocused() && !away) return Panels.walkthroughPanel(q || (Panels.has('walkthrough') ? '' : query));
  // A video playing in a panel goes over the game, rather than a search.
  const vp = !q && Panels.video(); if (vp) return Panels.overGames(vp);
  return api.pipToggle({ query });
}
api.onPeek((ev) => { if (ev.kind === 'pip') walkthrough(); });
// A game running in the background (not the one in the now-playing panel) closed: its session ends.
api.onPeek((ev) => {
  if (ev.kind !== 'gone' || !ev.pid) return;
  for (const ses of S.sessions.filter((x) => x.winPid === ev.pid)) {
    S.sessions = S.sessions.filter((x) => x !== ses); Capture.sessionsChanged();
    if (Players.on() && !S.sessions.length) Players.ended();
    if (!S.sessions.length) api.discordClear?.();
    if (ses === S.playing || ses.tracked) continue; // the panel, or the main process, handles those
    const e = S.lib.entries.find((x) => x.id === ses.id);
    if (e) sessionOver(e, Math.round((Date.now() - ses.t) / 1000));
  }
});
/* A game has the screen. Linux desktops often never mark a minimized or covered window hidden,
   so losing focus while a game runs counts too. Music, the sea and the live view listen for 'deck-away'. */
let away = false;
// Whether Bladedeck has the screen: the window's own focus (from the main process), because a
// panel's page holding the keyboard makes document.hasFocus() say no while Bladedeck is in front.
let osFocus = true;
const deckFocused = () => osFocus || document.hasFocus();
api.onDeckFocus((on) => { osFocus = on; syncAway(); });
function syncAway() {
  const on = document.hidden || (!!(S.playing || launching) && !deckFocused());
  if (on === away) return;
  away = on;
  // CSS animations (glows, shimmer, the orb) stop too: nobody is looking at them.
  document.body.classList.toggle('away', on);
  document.dispatchEvent(new CustomEvent('deck-away', { detail: on }));
}
document.addEventListener('visibilitychange', syncAway);
addEventListener('blur', syncAway);
addEventListener('focus', syncAway);

function markDay(e) {
  const d = new Date().toDateString();
  e.days = e.days || [];
  if (!e.days.includes(d)) { e.days.push(d); if (e.days.length > 30) e.days.shift(); }
}
function sessionOver(e, seconds) {
  e.playtime = (e.playtime || 0) + seconds;
  e.bestSession = Math.max(e.bestSession || 0, seconds);
  Scenes.earn(seconds);
  save();
  if (seconds >= 60) toast(`Welcome back! ${Math.round(seconds / 60)} more minutes in ${e.title}.`, 'fun');
  Tasks.sync(e); refreshQuiet();
  Player.sessionOver(e, seconds);
}
api.onEnded(({ id, seconds }) => {
  const e = S.lib.entries.find((x) => x.id === id);
  // The game that had the screen ended: take it back, so the controller drives Bladedeck again.
  if (S.playing?.id === id) AchClips.session(null);
  if (Players.on()) Players.ended();
  else if (S.playing?.id === id && !deckFocused()) setTimeout(() => api.deckFocus(), 300);
  if (S.playing?.id === id) { S.playing = null; NowPlaying.end(); }
  S.sessions = S.sessions.filter((x) => x.id !== id);
  Capture.sessionsChanged();
  if (!S.sessions.length) api.discordClear?.();
  if (Recorder.busy()) Recorder.stop();
  if (e) sessionOver(e, seconds);
});
// Steam and Heroic games run outside our process, so their session lasts until the player comes back.
api.onReturned(() => {
  Sound.duck(false); setTimeout(flushToasts, 400);
  // With the KDE peek helper, coming back can be a quick peek, so sessions end when the game window closes.
  if (NowPlaying.mode() === 'kwin') return;
  if (Recorder.busy() && Recorder.since() > 20000) Recorder.stop();
  const p = S.playing;
  if (p && !p.tracked && Date.now() - p.t > 15000) {
    S.playing = null; S.sessions = S.sessions.filter((x) => x !== p); Capture.sessionsChanged();
    const e = S.lib.entries.find((x) => x.id === p.id);
    if (e) sessionOver(e, Math.round((Date.now() - p.t) / 1000));
  }
});
function toggleFav(e) { e.favorite = !e.favorite; save(); refresh(e.id); }

/* ---------------------------------------------------------------- console view */
function renderConsole() {
  S.blades = S.lib.settings.blades;
  $('#blades').innerHTML = S.blades.map((b, i) => `
    <section class="blade" data-i="${i}"${b.color ? ` style="--accent:${esc(b.color)};--accent-hi:${esc(b.color)}"` : ''}>
      <div class="tab-v">${Look.tab(b)}</div>
      <div class="inner"><h2 class="title-h">${esc(b.name)}</h2><div class="body"></div></div>
    </section>`).join('');
  S.bi = Math.min(S.bi, S.blades.length - 1);
  setBlade(S.bi, true);
}

function setBlade(i, force) {
  if (!force && (i < 0 || i >= S.blades.length)) Atmos.bump($('#blades'), i < 0 ? 1 : -1, 'x');
  i = Math.max(0, Math.min(S.blades.length - 1, i));
  if (i === S.bi && !force) return;
  if (i !== S.bi && S.blades[S.bi]?.special === 'system') sysGroup = null;
  const prev = S.bi; S.bi = i;
  const els = $$('.blade');
  els.forEach((el, k) => el.classList.toggle('active', k === i));
  fillBlade(i);
  if (prev !== i) {
    sndBlade();
    setTimeout(() => { if (S.bi !== prev && els[prev]) $('.body', els[prev]).innerHTML = ''; }, 450);
  }
}

function fillBlade(i, keepId) {
  const b = S.blades[i]; const items = bladeItems(b);
  S.items = items;
  S.renderHome = !!b.filter?.home;
  const body = $('.body', $$('.blade')[i]);
  body.innerHTML = `<div class="list">${items.length ? items.map(itemHtml).join('') : `<p class="empty">${emptyText(b)}</p>`}</div><div class="detail"></div>`;
  let idx = keepId ? items.findIndex((x) => x.id === keepId) : -1;
  // Each blade comes back to the game you were on, even after a restart (fixed anchors).
  if (idx < 0 && S.ii[i] == null && !b.special) idx = items.findIndex((x) => x.id === Atmos.anchorOf(b));
  if (idx < 0) idx = S.ii[i] || 0;
  setItem(idx, true);
}
function emptyText(b) {
  if (b.special) return '';
  return 'Nothing here yet. Open the System blade to add a game or scan Steam, or drop a program or game file onto this window.';
}
function itemHtml(e, i) {
  if (e.header) return `<div class="sec-h ${e.note ? 'note' : ''}" data-h="${i}">${esc(e.title)}</div>`;
  const tag = S.renderHome && S.homeTags?.get(e.id);
  return `<div class="item" data-i="${i}"><div class="thumb">${cover(e)}</div><div class="meta"><b>${esc(e.title)}</b><span>${tag ? `<em class="htag">${esc(tag)}</em> ` : ''}${esc(subline(e))}</span></div>${e.favorite ? '<i class="star">★</i>' : ''}</div>`;
}

function setItem(j, quiet) {
  const n = S.items.length;
  if (!n || S.items.every((x) => x.header)) { S.sel = null; updateDetail(); Showcase.show(null); return; }
  if (!quiet && (j < 0 || j >= n || (j < (S.ii[S.bi] || 0) && S.items.slice(0, j + 1).every((x) => x.header)))) Atmos.bump($('.blade.active .list'), j < (S.ii[S.bi] || 0) ? 1 : -1);
  j = Math.max(0, Math.min(n - 1, j));
  // Section titles are skipped, in the way you were going (and never left as the last stop).
  const dir = j < (S.ii[S.bi] || 0) ? -1 : 1;
  while (S.items[j]?.header) j += dir;
  if (j < 0 || j >= n) { j = Math.max(0, Math.min(n - 1, j)); while (S.items[j]?.header) j -= dir; }
  const moved = S.ii[S.bi] !== j;
  S.ii[S.bi] = j;
  const list = $('.blade.active .list');
  $$('.item', list).forEach((x) => x.classList.toggle('sel', +x.dataset.i === j));
  const it = $('.item.sel', list);
  if (it) list.scrollTo({ top: it.offsetTop - list.clientHeight / 2 + it.offsetHeight / 2, behavior: quiet ? 'auto' : 'smooth' });
  S.sel = S.items[j];
  Atmos.remember(S.blades[S.bi], S.sel);
  updateDetail();
  if (!quiet && moved) sndTick();
}

function updateDetail() {
  const d = $('.blade.active .detail'); if (!d) return;
  const e = S.sel;
  if (!e) { d.innerHTML = ''; return; }
  const stats = e.run ? '' : `<p class="stat">${esc(fmtPlay(e.playtime))}</p>${e.lastPlayed ? `<p class="stat">Last played ${esc(new Date(e.lastPlayed).toLocaleDateString())}</p>` : ''}`;
  d.innerHTML = `<div class="poster">${cover(e)}</div><div class="info">${GameTheme.on() && e.logo ? `<img class="logo" src="${fileUrl(e.logo)}" alt="${esc(e.title)}">` : `<h3>${esc(e.title)}</h3>`}
    <p class="sub">${esc(e.run ? e.sub : TYPES[e.type].label + (e.system ? ' on ' + e.system : ''))}</p>${stats}${e.run ? '' : Player.detailHtml(e)}
    ${e.run ? '' : `<span class="task-pill">${Tasks.count(e)} of ${TASKS.length} tasks. Start for more</span>`}
    ${Ach.fits(e) && (Ach.on() || e.type === 'steam') ? '<p class="stat ach"></p>' : ''}
    <p class="cta">${e.run ? 'Press A to open' : 'Press A to launch'}</p></div>`;
  Showcase.show(e); GameTheme.show(e); Ach.fill(e, $('.ach', d)); Atmos.preview(e, $('.poster', d));
}
// Re-draws the selected game's panel after its tasks or media change, without moving anything.
function refreshQuiet() {
  if (S.modal) return;
  if (S.mode === 'console') updateDetail(); else if ($('#drawer')) renderDrawer();
}

/* ---------------------------------------------------------------- PC view */
function pcNavs() {
  const navs = S.lib.settings.blades.map((b, i) => ({ key: 'blade:' + i, label: b.name, blade: b, items: () => bladeItems(b).filter((e) => !e.header), special: !!b.special }))
    .filter((n) => !n.special);
  navs.push({ key: 'hidden', label: 'Hidden', items: () => S.lib.entries.filter((e) => e.hidden).sort(byTitle) });
  navs.forEach((n) => { n.count = n.items().length; });
  return navs;
}
function pcItems() {
  const nav = S.pcNav;
  let list;
  if (nav.startsWith('emu:')) list = S.lib.entries.filter((e) => !e.hidden && e.emulatorId === nav.slice(4)).sort(byTitle);
  else list = (pcNavs().find((n) => n.key === nav) || pcNavs()[0]).items();
  const q = S.search.trim().toLowerCase();
  if (q) list = list.filter((e) => e.title.toLowerCase().includes(q));
  const sorts = {
    title: byTitle,
    played: (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0),
    most: (a, b) => (b.playtime || 0) - (a.playtime || 0),
    added: (a, b) => (b.added || 0) - (a.added || 0)
  };
  return S.sort === 'auto' ? list : [...list].sort(sorts[S.sort]);
}

function renderPc() {
  const navs = pcNavs();
  if (!S.pcNav.startsWith('emu:') && !navs.find((n) => n.key === S.pcNav)) S.pcNav = navs[0].key;
  const st = S.lib.settings;
  $('#pc').innerHTML = `
    <aside class="side">
      <div class="side-h">Library</div>
      ${navs.map((n) => `<button class="nav ${n.key === S.pcNav ? 'on' : ''}" data-nav="${n.key}"><span>${n.blade ? Look.tab(n.blade) : esc(n.label)}</span><i>${n.count}</i></button>`).join('')}
      <div class="side-h">Emulators</div>
      ${S.lib.emulators.map((em) => `<button class="nav ${S.pcNav === 'emu:' + em.id ? 'on' : ''}" data-nav="emu:${em.id}"><span>${esc(em.name)}</span><i>${S.lib.entries.filter((e) => e.emulatorId === em.id).length}</i></button>`).join('')}
      <button class="nav ghost" data-act="getgames"><span>Get games</span></button>
      <button class="nav ghost" data-act="emulators"><span>Manage emulators</span></button>
    </aside>
    <section class="main">
      <div class="bar">
        <input id="q" type="search" placeholder="Search library" value="${esc(S.search)}">
        <select id="sort">${[['auto', 'Default order'], ['title', 'Title'], ['played', 'Recently played'], ['most', 'Most played'], ['added', 'Recently added']].map(([v, l]) => `<option value="${v}" ${S.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label class="size">Size <input id="size" type="range" min="120" max="260" value="${st.tileSize}"></label>
        <span class="grow"></span>
        <button data-act="add">Add game</button>
        <button data-act="steam">Scan Steam</button>
        <button data-act="gog">Scan GOG</button>
        <button data-act="settings">Settings</button>
        <button class="primary" data-act="console">Console mode</button>
      </div>
      <div class="grid" id="grid" style="--tile:${st.tileSize}px"></div>
    </section>
    <aside class="drawer" id="drawer"></aside>`;
  renderGrid();
}

function renderGrid() {
  S.pcItems = pcItems();
  if (!S.sel || !S.pcItems.includes(S.sel)) S.sel = S.pcItems[0] || null;
  $('#grid').innerHTML = S.pcItems.length
    ? S.pcItems.map((e) => `<div class="tile ${e === S.sel ? 'sel' : ''}" data-id="${e.id}"><div class="cv">${cover(e)}</div><div class="cap"><b>${esc(e.title)}</b><span>${esc(subline(e))}</span></div></div>`).join('')
    : '<p class="drawer none" style="grid-column:1/-1;border:0;box-shadow:none;background:none">Nothing here yet. Use Add game, scan Steam, or drop a program or game file onto this window.</p>';
  renderDrawer();
}

function renderDrawer() {
  const d = $('#drawer'); const e = S.sel;
  Showcase.show(e); GameTheme.show(e);
  if (!e) { d.innerHTML = '<p class="none">Select a game to see its details, or drop a program or game file anywhere on this window to add it.</p>'; return; }
  const where = e.type === 'steam' ? `Steam app ${e.appid}` : e.type === 'rom' ? e.rom : e.exe;
  d.innerHTML = `<div class="cv">${cover(e)}</div><h3>${esc(e.title)}</h3>
    <div class="dim">${esc(TYPES[e.type].label)}${e.system ? ' on ' + esc(e.system) : ''}</div>
    <div class="dim">${esc(fmtPlay(e.playtime))}${e.lastPlayed ? `, last played ${esc(new Date(e.lastPlayed).toLocaleDateString())}` : ''}</div>
    <div class="dim">${esc(where || '')}</div>
    <div class="dim" style="color:var(--accent);font-size:16px">${Tasks.stars(e)}</div>
    <div class="btns"><button class="primary" data-act="launch">Launch</button><button data-act="tasks">Tasks</button><button data-act="poke">Poke a friend</button><button data-act="fav">${e.favorite ? 'Unfavorite' : 'Favorite'}</button><button data-act="edit">Edit</button><button data-act="art">Artwork</button>${['steam', 'exe', 'gog', 'recomp'].includes(e.type) ? '<button data-act="split">👥 Split screen</button>' : ''}${e.type === 'rom' ? '<button data-act="mods">🧩 Cheats & mods</button>' : ''}${Ach.fits(e) ? '<button data-act="ach">Achievements</button>' : ''}<button data-act="hide">${e.hidden ? 'Unhide' : 'Hide'}</button></div>`;
}

function pcSelect(e) {
  S.sel = e;
  $$('.tile').forEach((t) => t.classList.toggle('sel', t.dataset.id === e?.id));
  renderDrawer();
  const t = $('.tile.sel'); const g = $('#grid');
  if (t && g) {
    if (t.offsetTop < g.scrollTop) g.scrollTop = t.offsetTop - 12;
    else if (t.offsetTop + t.offsetHeight > g.scrollTop + g.clientHeight) g.scrollTop = t.offsetTop + t.offsetHeight - g.clientHeight + 12;
  }
}

/* ---------------------------------------------------------------- modes + refresh */
function setMode(m, boot) {
  S.mode = m; S.lib.settings.mode = m; document.body.dataset.mode = m;
  if (!boot) { api.setMode(m); save(); sndBlade(); }
  if (m === 'console') renderConsole(); else renderPc();
}
function refresh(keepId) {
  if (S.mode === 'console') fillBlade(S.bi, keepId || S.sel?.id);
  else renderPc();
}

/* ---------------------------------------------------------------- modal helper */
function openModal({ title, html, wide, className = '', buttons = [], onOpen }) {
  closeModal();
  S.modal = true;
  const root = $('#modal');
  root.innerHTML = `<div class="dlg ${wide ? 'wide' : ''} ${className}" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><div class="dlg-body">${html}</div>
    <div class="dlg-foot">${buttons.map((b, i) => `<button data-btn="${i}" class="${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''} ${b.left ? 'left' : ''}">${esc(b.label)}</button>`).join('')}</div></div>`;
  root.classList.add('open');
  root.onclick = async (ev) => {
    const bt = ev.target.closest('[data-btn]');
    if (bt) { const b = buttons[+bt.dataset.btn]; bt.dataset.label = bt.textContent; const r = await b.onClick?.(root, bt); if (r !== false) closeModal(); return; }
    const br = ev.target.closest('[data-browse]');
    if (br) {
      const [kind, target] = br.dataset.browse.split(':');
      const p = await api.pick({ kind });
      if (!p) return;
      const inp = $(`[name="${target}"]`, root);
      inp.value = br.dataset.append ? (inp.value ? inp.value.replace(/\s*$/, '\n') : '') + p : p;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (ev.target === root) closeModal();
  };
  onOpen?.(root);
  // With a keyboard, start typing in the first box. With a controller, highlight without focusing,
  // so Steam does not pop up its keyboard; A on a text box opens Bladedeck's own.
  if (S.pad) PadNav.start(root); else $('input[type=text],select,textarea', root)?.focus();
  return root;
}
/* Each dialog gets a fresh #modal element, so the listeners its onOpen added go with it. Keeping
   one element meant every dialog's click handlers piled up: a dialog that redraws itself (Sources)
   then ran "Add a folder" once per redraw, opening folder pickers without end. */
function closeModal() {
  OSK.close(); PadNav.clear();
  const old = $('#modal'), r = old.cloneNode(false);
  r.classList.remove('open'); old.replaceWith(r);
  S.modal = false; const f = S.modalGone; S.modalGone = null; f?.();
}
// A yes-or-no question. True only when the yes button is pressed; B, Cancel or clicking away is no.
// With a controller the yes button starts highlighted, so it takes a deliberate second press (A).
function confirmAsk({ title, text, yes = 'OK', no = 'Cancel', danger = false }) {
  return new Promise((res) => {
    let done = false; const end = (v) => { if (!done) { done = true; res(v); } };
    const root = openModal({ title, html: `<p>${esc(text)}</p>`, buttons: [{ label: no, left: true, onClick: () => end(false) }, { label: yes, primary: !danger, danger, onClick: () => end(true) }] });
    S.modalGone = () => end(false);
    if (S.pad) PadNav.mark($('[data-btn="1"]', root));
  });
}
const val = (root, n) => $(`[name="${n}"]`, root)?.value.trim() ?? '';
const chk = (root, n) => !!$(`[name="${n}"]`, root)?.checked;
const row = (name, kind, v = '', ph = '') => `<div class="row"><input type="text" name="${name}" value="${esc(v)}" placeholder="${esc(ph)}"><button type="button" data-browse="${kind}:${name}">Browse</button></div>`;

/* ---------------------------------------------------------------- entry editor */
function editEntry(existing, preset = {}) {
  if (Players.isP2()) { toast('Games are edited on Player 1\'s screen.'); return; }
  const e = existing ? { ...existing } : { id: uid(), type: 'exe', title: '', added: Date.now(), playtime: 0, ...preset };
  const emus = S.lib.emulators;
  let armed = false;
  const m = openModal({
    title: existing ? 'Edit game' : 'Add a game or app',
    html: `
      <label>Name<input type="text" name="title" value="${esc(e.title)}"></label>
      <label>Type<select name="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${e.type === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <div data-for="steam"><label>Steam app ID<input type="text" name="appid" value="${esc(e.appid || '')}" placeholder="Found in the store page URL, for example 620"></label></div>
      <div data-for="exe recomp app gog" style="display:flex;flex-direction:column;gap:12px">
        <label>Program${row('exe', 'exe', e.exe)}</label>
        <label>Arguments<input type="text" name="args" value="${esc(e.args || '')}"></label>
        <label>Start in folder${row('cwd', 'dir', e.cwd, "Defaults to the program's folder")}</label>
        <label>Environment (optional), one KEY=value per line<textarea name="env" rows="2" placeholder="WINEDLLOVERRIDES=dxgi=n,b">${esc(e.env || '')}</textarea></label>
      </div>
      <div data-for="rom" style="display:flex;flex-direction:column;gap:12px">
        <label>Emulator<select name="emulatorId">${emus.length ? emus.map((x) => `<option value="${x.id}" ${e.emulatorId === x.id ? 'selected' : ''}>${esc(x.name)}${x.system ? ' (' + esc(x.system) + ')' : ''}</option>`).join('') : '<option value="">No emulators yet. Add one first.</option>'}</select></label>
        <label>Game file${row('rom', 'rom', e.rom)}</label>
      </div>
      <label>Cover image (optional)${row('cover', 'image', e.cover, 'Generated art is used if empty')}</label>
      <label>Music when it is highlighted (optional)${row('music', 'audio', e.music, 'Found by itself when the game has music files')}</label>
      <div class="checks"><label><input type="checkbox" name="favorite" ${e.favorite ? 'checked' : ''}> Favorite</label><label><input type="checkbox" name="hidden" ${e.hidden ? 'checked' : ''}> Hide from lists</label></div>
      <p class="note">Arguments support {rom}, {romdir} and {title}. For recompiled ports, point Program at the port's executable.</p>`,
    buttons: [
      ...(existing ? [{ label: 'Artwork', left: true, onClick: () => { setTimeout(() => Art.open(existing), 0); } }] : []),
      ...(existing ? [{ label: 'Remove', danger: true, left: true, onClick: (_r, btn) => {
        if (!armed) { armed = true; btn.textContent = 'Click again to remove'; return false; }
        S.lib.entries = S.lib.entries.filter((x) => x.id !== existing.id); S.sel = null; save(); refresh(); } }] : []),
      { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: (root) => {
        const o = { ...e, title: val(root, 'title'), type: val(root, 'type'), cover: val(root, 'cover'), music: val(root, 'music'), favorite: chk(root, 'favorite'), hidden: chk(root, 'hidden') };
        if (e.id && (o.music || '') !== (e.music || '')) { api.gameMusicForget(e.id); HoverMusic.forget(e.id); }
        if (!o.title) { toast('Give it a name first.', 'err'); return false; }
        if (o.type === 'steam') { o.appid = val(root, 'appid'); if (!/^\d+$/.test(o.appid)) { toast('Steam app ID must be a number.', 'err'); return false; } }
        else if (o.type === 'rom') {
          o.emulatorId = val(root, 'emulatorId'); o.rom = val(root, 'rom');
          const em = emus.find((x) => x.id === o.emulatorId);
          if (!em || !o.rom) { toast('Pick an emulator and a game file.', 'err'); return false; }
          o.system = em.system || em.name;
        } else {
          o.exe = val(root, 'exe'); o.args = val(root, 'args'); o.cwd = val(root, 'cwd'); o.env = val(root, 'env');
          if (!o.exe && !(o.type === 'gog' && o.heroicId)) { toast('Pick a program to run.', 'err'); return false; }
        }
        if (existing) Object.assign(existing, o); else S.lib.entries.push(o);
        save(); refresh(o.id); if (S.mode === 'pc') { S.sel = existing || o; renderPc(); } } }
    ],
    onOpen: (root) => {
      const sync = () => { const t = val(root, 'type'); $$('[data-for]', root).forEach((d) => { d.style.display = d.dataset.for.split(' ').includes(t) ? (d.style.flexDirection ? 'flex' : '') : 'none'; }); };
      $('[name=type]', root).addEventListener('change', sync); sync();
    }
  });
  return m;
}

/* ---------------------------------------------------------------- emulators */
// Every emulator also gets a tile of its own on the Emulation blade, to open it (for settings,
// controllers, or games it finds itself). Tiles for removed emulators go.
function ensureEmuApps() {
  const ids = new Set(S.lib.emulators.map((em) => em.id));
  const before = S.lib.entries.length;
  S.lib.entries = S.lib.entries.filter((e) => !e.emuApp || ids.has(e.emuApp));
  let changed = S.lib.entries.length !== before;
  for (const em of S.lib.emulators) {
    let e = S.lib.entries.find((x) => x.emuApp === em.id);
    const args = em.flatpak ? `run ${em.flatpak}` : '';
    if (!e) { e = { id: uid(), type: 'app', emuApp: em.id, title: em.name, added: Date.now(), playtime: 0 }; S.lib.entries.push(e); changed = true; }
    if (e.exe !== em.exe || e.args !== args || e.system !== em.system || e.title !== em.name) { Object.assign(e, { exe: em.exe, args, system: em.system, title: em.name }); changed = true; }
    if (em.flatpak && !e.icon && !e.iconTried) {
      e.iconTried = true;
      api.artSave(e.id, `https://dl.flathub.org/repo/appstream/x86_64/icons/128x128/${em.flatpak}.png`, 'icon').then((r) => { if (r.ok) { e.icon = r.data; save(); refreshQuiet(); } });
    }
  }
  if (changed) { save(); refreshQuiet(); }
}

function manageEmulators() {
  const emus = S.lib.emulators;
  openModal({
    title: 'Emulators', wide: true,
    html: emus.length
      ? emus.map((em) => `<div class="emu"><b>${esc(em.name)}</b><span>${esc(em.system || '')}</span><button data-em-scan="${em.id}">Scan</button><button data-em-edit="${em.id}">Edit</button></div>`).join('')
      : '<p class="note">No emulators yet. Add one, choose its program, and Bladedeck will scan your game folders and list every game it finds.</p>',
    buttons: [{ label: 'Install emulators', left: true, onClick: () => { setTimeout(() => Shop.open('emus'), 0); } }, { label: 'Close' }, { label: 'Add emulator', primary: true, onClick: () => { setTimeout(() => editEmulator(), 0); } }],
    onOpen: (root) => root.addEventListener('click', (ev) => {
      const sc = ev.target.closest('[data-em-scan]'), ed = ev.target.closest('[data-em-edit]');
      if (sc) { closeModal(); scanRoms(emus.find((x) => x.id === sc.dataset.emScan)); }
      if (ed) { const em = emus.find((x) => x.id === ed.dataset.emEdit); closeModal(); editEmulator(em); }
    })
  });
}

function editEmulator(existing) {
  const em = existing ? { ...existing } : { id: uid(), name: '', exe: '', args: '"{rom}"', exts: '', system: '', romDirs: [] };
  let armed = false;
  openModal({
    title: existing ? 'Edit emulator' : 'Add an emulator', wide: true,
    html: `
      ${existing ? '' : `<label>Start from a preset<select name="preset"><option value="">Custom</option>${PRESETS.map((p, i) => `<option value="${i}">${esc(p.name)} (${esc(p.system)})</option>`).join('')}</select></label>`}
      <label>Name<input type="text" name="name" value="${esc(em.name)}"></label>
      <label>Emulator program${row('exe', 'exe', em.exe)}</label>
      <label>Launch arguments<input type="text" name="args" value="${esc(em.args)}"></label>
      <label>System shown in the library<input type="text" name="system" value="${esc(em.system)}" placeholder="For example PlayStation 2"></label>
      <label>Game file types, comma separated<input type="text" name="exts" value="${esc(em.exts)}" placeholder="iso, chd, cue"></label>
      <label>Game folders, one per line<textarea name="romDirs" rows="3">${esc((em.romDirs || []).join('\n'))}</textarea></label>
      <div><button type="button" data-browse="dir:romDirs" data-append="1">Add folder</button></div>
      <div class="checks"><label><input type="checkbox" name="scan" checked> Scan game folders after saving</label></div>
      <p class="note">{rom} is replaced with the game's full path. Flags differ between emulator versions, so check your emulator's command line help if a game does not start.</p>`,
    buttons: [
      ...(existing ? [{ label: 'Remove', danger: true, left: true, onClick: (_r, btn) => {
        if (!armed) { armed = true; btn.textContent = 'Click again to remove'; return false; }
        S.lib.emulators = S.lib.emulators.filter((x) => x.id !== existing.id);
        S.lib.entries = S.lib.entries.filter((x) => x.emulatorId !== existing.id); save(); ensureEmuApps(); refresh(); } }] : []),
      { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: (root) => {
        const o = { ...em, name: val(root, 'name'), exe: val(root, 'exe'), args: val(root, 'args'), system: val(root, 'system'), exts: val(root, 'exts'),
          romDirs: val(root, 'romDirs').split('\n').map((x) => x.trim()).filter(Boolean) };
        if (!o.name || !o.exe) { toast('An emulator needs a name and a program.', 'err'); return false; }
        if (existing) { Object.assign(existing, o); S.lib.entries.filter((x) => x.emulatorId === o.id).forEach((x) => { x.system = o.system || o.name; }); }
        else S.lib.emulators.push(o);
        save(); ensureEmuApps(); refresh();
        if (chk(root, 'scan') && o.romDirs.length) setTimeout(() => scanRoms(existing || o), 0);
      } }
    ],
    onOpen: (root) => {
      const p = $('[name=preset]', root);
      p?.addEventListener('change', () => {
        const pr = PRESETS[+p.value]; if (!pr) return;
        $('[name=name]', root).value = pr.name; $('[name=args]', root).value = pr.args;
        $('[name=exts]', root).value = pr.exts; $('[name=system]', root).value = pr.system;
      });
    }
  });
}

/* ---------------------------------------------------------------- scanning + importing */
async function scanSteam(quiet) {
  if (!quiet) toast('Scanning Steam');
  const r = await api.scanSteam(S.lib.settings.steamPath);
  if (r.error) { if (!quiet) toast(r.error, 'err'); return r; }
  let added = 0;
  for (const g of r.games) {
    const ex = S.lib.entries.find((e) => e.type === 'steam' && String(e.appid) === String(g.appid));
    if (ex) { if (!ex.cover && g.cover) ex.cover = g.cover; continue; }
    S.lib.entries.push({ id: uid(), type: 'steam', title: g.title, appid: g.appid, cover: g.cover, added: Date.now(), playtime: 0 });
    added++;
  }
  save(); refresh();
  if (!quiet) toast(added ? `Added ${added} Steam game${added > 1 ? 's' : ''}` : 'Steam library is already up to date');
  r.added = added;
  return r;
}

async function scanGog(quiet) {
  if (!quiet) toast('Looking for GOG games');
  const r = await api.scanGog(S.lib.settings.gogDirs || []);
  let added = 0;
  const same = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();
  for (const g of r.games) {
    // A game added by hand before the scan keeps its name and stats and just becomes a GOG entry.
    const ex = S.lib.entries.find((e) => (e.gogId && e.gogId === g.gogId) || same(e.exe, g.exe));
    if (ex) {
      Object.assign(ex, { type: 'gog', gogId: g.gogId, heroicId: g.heroicId || ex.heroicId });
      if (!ex.cover && g.cover) ex.cover = g.cover;
      continue;
    }
    S.lib.entries.push({ id: uid(), type: 'gog', title: g.title, gogId: g.gogId, heroicId: g.heroicId, exe: g.exe, args: g.args, cwd: g.cwd, cover: g.cover, added: Date.now(), playtime: 0 });
    added++;
  }
  save(); refresh();
  if (!quiet) toast(added ? `Added ${added} GOG game${added > 1 ? 's' : ''}` : r.games.length ? 'GOG games are already up to date' : 'No GOG games found. Add their folders in Settings.');
  return added;
}

async function addLaunchers(quiet) {
  const found = await api.findLaunchers();
  let added = 0;
  for (const l of found) {
    if (S.lib.entries.some((e) => e.exe === l.exe && (e.args || '') === l.args)) continue;
    S.lib.entries.push({ id: uid(), type: 'app', title: l.title, exe: l.exe, args: l.args, added: Date.now(), playtime: 0 });
    added++;
  }
  save(); refresh();
  if (!quiet) toast(added ? `Added ${added} launcher${added > 1 ? 's' : ''} to Apps` : found.length ? 'Your store launchers are already in Apps' : 'No store launchers found');
  return added;
}

async function findEverything() {
  toast('Looking for games and launchers');
  const st = await scanSteam(true), gog = await scanGog(true), la = await addLaunchers(true);
  const parts = [st?.added && `${st.added} Steam`, gog && `${gog} GOG`, la && `${la} launcher${la > 1 ? 's' : ''}`].filter(Boolean);
  toast(parts.length ? `Found ${parts.join(', ')}. All set!` : 'Everything is already here.', 'fun');
  if (parts.length) { FX.ripple(null); Sound.play('ripple'); }
}

async function scanRoms(em) {
  if (!em) return;
  const exts = extList(em);
  if (!exts.length || !em.romDirs?.length) { toast(`Set game folders and file types for ${em.name} first.`, 'err'); return; }
  toast(`Scanning ${em.name} folders`);
  let files = await api.scanRoms({ exts, dirs: em.romDirs });
  // PS4 games are folders: only their eboot.bin counts.
  if (em.onlyNames) files = files.filter((f) => em.onlyNames.includes(baseName(f).toLowerCase()));
  const have = new Set(S.lib.entries.filter((e) => e.type === 'rom').map((e) => e.rom));
  let added = 0;
  for (const f of files) {
    if (have.has(f)) continue;
    S.lib.entries.push({ id: uid(), type: 'rom', title: em.onlyNames ? cleanTitle(f.replace(/[\\/][^\\/]*$/, '')) : cleanTitle(f), rom: f, emulatorId: em.id, system: em.system || em.name, added: Date.now(), playtime: 0 });
    added++;
  }
  save(); refresh();
  toast(added ? `Added ${added} game${added > 1 ? 's' : ''} for ${em.name}` : `No new games found for ${em.name}`);
}

function handleDrop(paths) {
  const prog = ['exe', 'lnk', 'bat', 'cmd', 'sh', 'appimage', 'app', 'x86_64', 'url'];
  const made = [];
  for (const p of paths) {
    const ext = (p.match(/\.([^./\\]+)$/) || [, ''])[1].toLowerCase();
    const em = S.lib.emulators.find((x) => extList(x).includes(ext));
    if (em) made.push({ id: uid(), type: 'rom', title: cleanTitle(p), rom: p, emulatorId: em.id, system: em.system || em.name, added: Date.now(), playtime: 0 });
    else if (prog.includes(ext) || !ext) made.push({ id: uid(), type: 'exe', title: cleanTitle(p), exe: p, added: Date.now(), playtime: 0 });
  }
  if (!made.length) { toast('That file type is not a program or a known emulator game.', 'err'); return; }
  if (made.length === 1 && made[0].type === 'exe') { editEntry(null, made[0]); return; }
  S.lib.entries.push(...made); save(); refresh();
  toast(`Added ${made.length} item${made.length > 1 ? 's' : ''}`);
}

/* ---------------------------------------------------------------- controls */
const CONTROLS = [
  ['Getting around', [
    ['Move', 'D-pad or left stick', 'Arrow keys'],
    ['Next or previous blade', 'LB / RB', 'Page Up / Page Down'],
    ['Launch or open', 'A', 'Enter, or click twice'],
    ['Back to Home', 'B', 'Esc or Backspace'],
    ['Console or PC mode', 'tap View', 'F10'],
    ['Search the library (PC mode)', 'RB', 'Ctrl+F or /'],
    ['Type with a controller', 'A on any text box opens the on-screen keyboard: A types, X deletes, Y space, Start done', 'just type'],
    ['This list', '', 'F1 or ?']
  ]],
  ['Games', [
    ['Favorite', 'X', 'F'],
    ['Edit', 'Y', 'E'],
    ['Tasks and looks', 'Start', 'T or S'],
    ['Poke a friend', '', 'P'],
    ['Add a game', 'drop it on the window', 'drop it on the window']
  ]],
  ['While playing', [
    ['Jump out to Bladedeck (the game shrinks into a live panel)', 'View + Menu together', 'Ctrl+M'],
    ['Jump back in (the game pops back to full screen)', 'View + Menu, or push left onto the panel, then A', 'Ctrl+M, or click the panel'],
    ['Live view of the game', 'X on the panel', 'Show live view']
  ]],
  ['Dock (YouTube, music, Discord, files)', [
    ['Go to the dock', 'push left past the first blade (or down from the panel)', 'point at it'],
    ['Open, bring up, or tuck away an app', 'A', 'click'],
    ['Minimize or close it', 'X or Y', 'the – and ✕ on its card']
  ]],
  ['Guide (quick questions about a game, or Bladedeck)', [
    ['Pull the guide flap out', 'hold LT, then push the stick the way it opens', 'G, or drag the tab on the edge'],
    ['Move and pick', 'D-pad, then A', 'arrows and Enter, or click'],
    ['Back, then put it away', 'B', 'Esc'],
    ['Push it shut', 'hold LT, push the stick back into the edge', 'drag the tab back'],
    ['Quick menu: music, alerts, recordings', 'hold RT, push the stick the way it opens (LB / RB change tab)', 'C, or drag the ♪ tab']
  ]],
  ['Quick Resume (several games and apps at once)', [
    ['Open Quick Resume', 'hold View', 'Q, or ▣ at the top'],
    ['Switch to a game or app (thaws it if frozen)', 'A', 'click it'],
    ['Freeze or thaw a game', 'X', 'right-click it'],
    ['Close it', 'Y', ''],
    ['Show Steam while a game is starting', 'X', 'X']
  ]],
  ['Nearby and Night Drive', [
    ['Other Bladedecks on your network, invites', 'System, Nearby', 'System, Nearby'],
    ['Drive the car (once found)', 'System, Take the wheel', 'System, Take the wheel'],
    ['While driving: steer, go, brake', 'left stick, RT or A, LT', 'arrows or WASD'],
    ['While driving: camera, leave', 'Y, B', 'C, Esc']
  ]],
  ['Split screen (PartyDeck)', [
    ['Play a game split screen, up to 4 players', 'Start on the game, then Split screen', 'Split screen in PC mode'],
    ['Pick a game for it', 'System, Split screen', 'System, Split screen']
  ]],
  ['Recording and clips', [
    ['Start or stop recording (works in games)', 'View + X', 'Ctrl+Alt+R'],
    ['Save the last moments (replay)', 'View + RB', 'Ctrl+Alt+S'],
    ['Your clips', 'System, Captures', 'System, Captures'],
    ['Save state / load state (emulators)', 'the emulator\'s keys, shown on the live panel', 'same']
  ]],
  ['Walkthrough window', [
    ['Pop a walkthrough video up or away (works in games)', 'View + Y', 'Ctrl+Alt+Y'],
    ['Voice command (works in games)', 'View + LB', 'Space, or Ctrl+Alt+V'],
    ['Open it for a question', 'Guide flap, YouTube', 'Guide flap, YouTube']
  ]],
  ['Sound', [
    ['Sound card (volume, where sound plays, mic, every app)', 'Home button (Stadia, PS or Xbox)', 'V, or the 🔊 at the top'],
    ['Choose and change', 'up and down, then left and right (LB / RB for big steps)', 'arrows, or drag'],
    ['Mute what is chosen', 'A', 'Enter, or click its icon'],
    ['Volume down or up from anywhere', '', '- and ='],
    ['Stadia controller: sound card, voice, save the moment (hold: record)', 'Stadia, Assistant, Capture buttons', '']
  ]],
  ['Extras', [
    ['Get games: free games, homebrew and emulators', 'System, Get games', 'Get games in PC mode'],
    ['RetroAchievements for an emulated game', 'Left stick click', 'R'],
    ['Artwork for a game', 'Y (Edit), then Artwork', 'Artwork in PC mode'],
    ['Feed the fish (Aero Aquarium theme)', 'System, Aquarium, Feed', 'click the water'],
    ['Pop bubbles (Sky Bubbles theme)', '', 'click them']
  ]],
  ['Music', [
    ['Play or pause', 'Right stick click', 'M'],
    ['Previous or next song', 'tap LT / RT', '[ / ]'],
    ['Song list', '', 'the ☰ button, or System, Music']
  ]],
  ['Breaking things', [
    ['Break the menu', 'slam from one end to the other', 'slam from one end to the other'],
    ['Hammer it back together', 'mash A', 'mash Enter, Space or click'],
    ['Leave it broken', 'B', 'Esc'],
    ['Wrecking ball: a draft of another interface (alpha)', 'LB + RB + Y together', 'Shift+W']
  ]],
  ['System menu', [
    ['Open a group (Games and library, Gaming software, Play together…)', 'A', 'Enter'],
    ['Back out of a group', 'B', 'Esc'],
    ['Browse your sources: search, install', 'System, Games and library', 'same'],
    ['Back up or restore everything you set', 'System, Backup and restore', 'same']
  ]]
];

function openControls() {
  openModal({
    title: 'Controls', wide: true,
    html: CONTROLS.map(([group, rows]) => `<div class="side-h" style="margin:6px 0 0">${esc(group)}</div>
      <table class="ctl"><tbody>${rows.map(([what, pad, keys]) => `<tr><td>${esc(what)}</td><td>${pad ? esc(pad) : '<span class="dim">—</span>'}</td><td>${esc(keys)}</td></tr>`).join('')}</tbody></table>`).join('')
      + '<p class="note">Controller column first, keyboard second. Secrets are not listed. Some are found by doing things you are not supposed to.</p>',
    buttons: [{ label: 'Take the tour', left: true, onClick: () => { setTimeout(() => Tour.open(), 0); } }, { label: 'Close', primary: true }]
  });
}

/* ---------------------------------------------------------------- settings */
// Fewer, plainer pages: everything about running games and emulators is Gaming software, and
// everything about playing with someone else in the room is Local multiplayer.
const SET_TABS = [['general', 'General'], ['look', 'Look and sound'], ['games', 'Gaming software'], ['pads', 'Controllers'], ['multi', 'Local multiplayer'], ['rec', 'Recording and live view'], ['online', 'Accounts'], ['adv', 'Advanced']];
let setTab = 0;
function settingsTab(root, i) {
  setTab = (i + SET_TABS.length) % SET_TABS.length;
  const id = SET_TABS[setTab][0];
  root.querySelectorAll('.set-tabs button').forEach((b, k) => b.classList.toggle('on', k === setTab));
  root.querySelectorAll('.set-sec').forEach((sec) => { sec.hidden = sec.dataset.sec !== id; });
  root.querySelector('.set-pages').scrollTop = 0;
  if (S.pad) PadNav.mark(root.querySelector('.set-tabs button.on'));
}
// Settings, opened on one page (after a dialog of its own closed it).
function openSettingsAt(id) { const i = SET_TABS.findIndex(([t]) => t === id); if (i >= 0) setTab = i; openSettings(); }
function openSettings() {
  if (Players.isP2()) { toast('Settings are on Player 1\'s screen.'); return; }
  const st = S.lib.settings;
  openModal({
    title: 'Settings', wide: true, className: 'settings',
    /* Tabs down the side (LB / RB on a controller); every page's controls stay in the form, so Save
       keeps all of them, whichever page they are on. */
    html: `<div class="set">
      <nav class="set-tabs">${SET_TABS.map(([id, label], i) => `<button type="button" class="${i === setTab ? 'on' : ''}" data-tab="${id}">${label}</button>`).join('')}</nav>
      <div class="set-pages">
      <section class="set-sec" data-sec="general">
        <label>Your name<input type="text" name="playerName" value="${esc(st.playerName)}"></label>
        <label>Your town, for the weather<input type="text" name="town" value="${esc(st.town || '')}"></label>
        <div class="checks"><label><input type="checkbox" name="curatedHome" ${st.curatedHome !== false ? 'checked' : ''}> Home shows a few picks for today under Favorites and Recently played</label><label><input type="checkbox" name="runningList" ${st.runningList !== false ? 'checked' : ''}> Show what's running on the left</label><label><input type="checkbox" name="voice" ${st.voice ? 'checked' : ''}> Voice commands (View + LB, Space or 🎤)</label><label><input type="checkbox" name="voiceWake" ${st.voiceWake ? 'checked' : ''}> Active keyword: listen for "Hey Blade"</label><label><input type="checkbox" name="showStats" ${st.showStats !== false ? 'checked' : ''}> Show processor, memory and temperature at the top (click it, or press I, for This PC)</label></div>
        <h4 class="set-sub">Guide and quick menu</h4>${Guide.settingsHtml()}
      </section>
      <section class="set-sec" data-sec="look">
        <label>Theme<select name="theme">${S.themes.map((t) => `<option value="${t.id}" ${t.id === st.theme ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <div class="checks"><label><input type="checkbox" name="fx" ${st.fx !== false ? 'checked' : ''}> Animations</label><label><input type="checkbox" name="intro" ${st.intro !== false ? 'checked' : ''}> Launch intro</label><label><input type="checkbox" name="bootAnim" ${st.bootAnim !== false ? 'checked' : ''}> Boot animation</label><label><input type="checkbox" name="showcase" ${st.showcase !== false ? 'checked' : ''}> Play clips and pictures behind games</label></div>
        <label class="range-row">Clip and picture strength<input type="range" name="showcaseAlpha" min="0.2" max="1" step="0.05" value="${st.showcaseAlpha ?? 0.6}"></label>
        <div class="checks"><label><input type="checkbox" name="depth" ${st.depth !== false ? 'checked' : ''}> Depth and glass: layered, frosted panels and a lifted focus</label><label><input type="checkbox" name="livingBg" ${st.livingBg !== false ? 'checked' : ''}> Living background: brighter by day, dimmer at night, a hue for each season</label><label><input type="checkbox" name="previewLoop" ${st.previewLoop !== false ? 'checked' : ''}> A highlighted game plays a short loop of your own clip</label><label><input type="checkbox" name="widget" ${st.widget !== false ? 'checked' : ''}> Weather and date at the top (opens a calendar)</label></div>
        <label class="range-row">TV safe margin (overscan) <b class="safe-v">${st.tvSafe || 0}%</b><input type="range" name="tvSafe" min="0" max="10" step="0.5" value="${st.tvSafe || 0}"></label>
        <p class="note">On a TV, CRT or plasma that cuts off the edges, raise it until the corner marks are fully on screen.</p>
        <h4 class="set-sub">Sound</h4>
        <div class="checks"><label><input type="checkbox" name="sounds" ${st.sounds ? 'checked' : ''}> Menu sounds</label><label><input type="checkbox" name="ambient" ${st.ambient ? 'checked' : ''}> Deep-sea ambience</label><label><input type="checkbox" name="soundFollow" ${st.soundFollow !== false ? 'checked' : ''}> Sound follows a game to another screen (the TV's speakers when it moves to the TV)</label><label><input type="checkbox" name="hoverMusic" ${st.hoverMusic !== false ? 'checked' : ''}> Play a game's own music when it stays highlighted for 3 seconds</label></div>
        <label class="range-row">Ambience volume<input type="range" name="ambientVolume" min="0" max="1" step="0.05" value="${st.ambientVolume ?? 0.5}"></label>
        <h4 class="set-sub">Music</h4>
        <label>Music folder (leave empty for your Music folder)${row('musicDir', 'dir', st.musicDir)}</label>
        <div class="checks"><label><input type="checkbox" name="musicDuringGames" ${st.musicDuringGames ? 'checked' : ''}> Keep music playing during games</label></div>
        <div class="btns"><button type="button" data-x="look">Look and menus…</button></div>
      </section>
      <section class="set-sec" data-sec="games">
        <nav class="set-jump">${[['g-run', 'Launching'], ['g-emu', 'Emulators'], ['g-fast', 'Faster starts'], ['g-where', 'Steam, GOG and Windows games'], ['g-watch', 'Watched folders']].map(([id, n]) => `<button type="button" data-jump="${id}">${n}</button>`).join('')}</nav>
        <h4 class="set-sub" id="g-run">Launching</h4>
        <div class="checks"><label><input type="checkbox" name="hideOnLaunch" ${st.hideOnLaunch ? 'checked' : ''}> Minimize Bladedeck while a game runs</label><label><input type="checkbox" name="autoFreeze" ${st.autoFreeze ? 'checked' : ''}> Pause games when I switch away</label><label><input type="checkbox" name="quietWhilePlaying" ${st.quietWhilePlaying ? 'checked' : ''}> Silence desktop pop-ups while playing</label><label><input type="checkbox" name="peekMinimize" ${st.peekMinimize ? 'checked' : ''}> Minimize the game when peeking with Ctrl+M</label><label><input type="checkbox" name="achClips" ${st.achClips !== false ? 'checked' : ''}> Keep a clip of every achievement you unlock (30 seconds before to 5 after), shown behind the game</label></div>
        <h4 class="set-sub" id="g-emu">Emulators</h4>
        <div class="checks"><label><input type="checkbox" name="askStates" ${st.askStates !== false ? 'checked' : ''}> When an emulated game has save states, offer to continue from one</label><label><input type="checkbox" name="romsFullscreen" ${st.romsFullscreen !== false ? 'checked' : ''}> Emulated games always fill the screen (Xenia, PCSX2, Dolphin and the rest)</label></div>
        <div class="btns"><button type="button" data-x="emus">Your emulators…</button><button type="button" data-x="emuget">Install emulators…</button><button type="button" data-x="sources">Sources (ROMs, BIOS, texture packs)…</button><button type="button" data-x="mc">Minecraft…</button></div>
        <p class="note">Ctrl+M (or View + Start) jumps between a game and Bladedeck. On KDE the key is in System Settings, Shortcuts, KWin, "Bladedeck: peek". Minimizing the game can freeze its live view, so that is off by default.</p>
        <h4 class="set-sub" id="g-fast">Faster starts</h4>
        <div class="checks"><label><input type="checkbox" name="prewarmSteam" ${st.prewarmSteam !== false ? 'checked' : ''}> Start Steam quietly when Bladedeck opens, so Steam games launch right away</label><label><input type="checkbox" name="shaderCache" ${st.shaderCache !== false ? 'checked' : ''}> Big shader cache for games Bladedeck starts itself (fewer stutters, faster second starts)</label><label><input type="checkbox" name="gamemode" ${st.gamemode ? 'checked' : ''}> Run games with GameMode, if it is installed</label></div>
        <p class="note">Steam games start through Steam, so set these in Steam too: Settings, Downloads, turn on Shader Pre-Caching and "Allow background processing of Vulkan shaders". For a game that still compiles a lot, put <code>MESA_SHADER_CACHE_MAX_SIZE=10G %command%</code> in its Launch Options.</p>
        <h4 class="set-sub" id="g-where">Steam, GOG and Windows games</h4>
        <label>Steam folder (leave empty to detect)${row('steamPath', 'dir', st.steamPath)}</label>
        <label>GOG game folders, one per line (common places are checked anyway)<textarea name="gogDirs" rows="2">${esc((st.gogDirs || []).join('\n'))}</textarea></label>
        <div><button type="button" data-browse="dir:gogDirs" data-append="1">Add GOG folder</button></div>
        <label>Command for Windows games (leave empty for wine; umu-run uses Proton)<input type="text" name="wineCommand" value="${esc(st.wineCommand || '')}" placeholder="wine"></label>
        <h4 class="set-sub" id="g-watch">Watched folders</h4>${Watch.settingsHtml()}
      </section>
      <section class="set-sec" data-sec="pads">
        <div class="checks"><label><input type="checkbox" name="padBackground" ${st.padBackground ? 'checked' : ''}> Let games and emulators hear the controller while Bladedeck's menu is in front</label></div>
        <div class="pl-box"><p class="note">Looking for controllers…</p></div>
      </section>
      <section class="set-sec" data-sec="multi">
        <h4 class="set-sub">Split screen: one screen</h4>
        <p class="note">Up to four players on one screen, each with a controller, through PartyDeck. For PC games with online or LAN play.</p>
        <div class="btns"><button type="button" data-x="split">Split screen…</button></div>
        <h4 class="set-sub">Multi-screen: a screen each</h4>
        <div class="ms-box"><p class="note">Looking for screens…</p></div>
        <h4 class="set-sub">Nearby: other Bladedecks</h4>
        <div class="checks"><label><input type="checkbox" name="lanOn" ${st.lanOn !== false ? 'checked' : ''}> Show me to other Bladedecks nearby</label><label><input type="checkbox" name="lanShare" ${st.lanShare === true ? 'checked' : ''}> Share my game list with them</label></div>
        <p class="note">Who is which player, and each controller's rumble and sound, are on the Controllers page.</p>
      </section>
      <section class="set-sec" data-sec="rec">${Capture.settingsHtml()}
        <h4 class="set-sub">Live view</h4>
        <div class="checks"><label><input type="checkbox" name="liveAuto" ${st.liveAuto !== false ? 'checked' : ''}> Live view starts by itself: the first time you jump out of a game it asks once, then it is just there</label></div>
        <p class="note">The live view and the recorder each ask the desktop once what to show. In that box, pick the game's <b>window</b> (live view) or your <b>screen</b> (recording). "New virtual output" makes an extra invisible screen and "Region" a rectangle; neither is needed here. Leave "Allow restoring" ticked so it is not asked again.</p>
        <div class="btns"><button type="button" data-x="liveforget">Ask again for every game</button></div>
      </section>
      <section class="set-sec" data-sec="online">
        <label>SteamGridDB API key (free: steamgriddb.com, Preferences, API) for cover art and backgrounds<input type="password" name="sgdbKey" value="${esc(st.sgdbKey || '')}" autocomplete="off"></label>
        <div class="row2"><label>RetroAchievements name<input type="text" name="raUser" value="${esc(st.raUser || '')}" autocomplete="off"></label>
          <label>RetroAchievements web API key (retroachievements.org, Settings, Keys)<input type="password" name="raKey" value="${esc(st.raKey || '')}" autocomplete="off"></label></div>
        <div style="display:flex;gap:8px;align-items:center"><button type="button" data-x="ratest">Check RetroAchievements</button><span class="note ra-res"></span></div>
      </section>
      <section class="set-sec" data-sec="adv">
        <label>Blades (JSON). Rename, reorder, remove, or add filters. Each blade is { "name", "filter": { "types": [...], "system": "...", "emulator": "id", "favorite": true, "recent": 12 } }.<textarea name="blades" rows="9">${esc(JSON.stringify(st.blades, null, 2))}</textarea></label>
        <div class="btns" style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-x="backup">Backup and restore…</button><button type="button" data-x="themes">Open themes folder</button><button type="button" data-x="css">Show custom.css</button><button type="button" data-x="blades">Reset blades</button></div>
        <p class="note">Themes are JSON files in the themes folder. custom.css is loaded last and can restyle anything.</p>
      </section>
      </div></div>`,
    buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: (root) => {
      let blades;
      try { blades = JSON.parse($('[name=blades]', root).value); if (!Array.isArray(blades) || !blades.length || blades.some((b) => !b.name)) throw new Error('shape'); }
      catch { toast('Blades must be a JSON list where every blade has a name.', 'err'); return false; }
      Object.assign(st, { playerName: val(root, 'playerName') || 'Player 1', steamPath: val(root, 'steamPath'), sounds: chk(root, 'sounds'), hideOnLaunch: chk(root, 'hideOnLaunch'), blades,
        ambient: chk(root, 'ambient'), fx: chk(root, 'fx'), intro: chk(root, 'intro'), bootAnim: chk(root, 'bootAnim'), runningList: chk(root, 'runningList'), curatedHome: chk(root, 'curatedHome'), lanOn: chk(root, 'lanOn'), voice: chk(root, 'voice'), voiceWake: chk(root, 'voiceWake'), town: val(root, 'town'), lanShare: chk(root, 'lanShare'), autoFreeze: chk(root, 'autoFreeze'), quietWhilePlaying: chk(root, 'quietWhilePlaying'), showcase: chk(root, 'showcase'),
        ambientVolume: +val(root, 'ambientVolume'), showcaseAlpha: +val(root, 'showcaseAlpha'), wineCommand: val(root, 'wineCommand'),
        gogDirs: val(root, 'gogDirs').split('\n').map((x) => x.trim()).filter(Boolean) });
      const peekWas = st.peekMinimize, dirWas = st.musicDir;
      Object.assign(st, { musicDir: val(root, 'musicDir'), musicDuringGames: chk(root, 'musicDuringGames'), peekMinimize: chk(root, 'peekMinimize'), romsFullscreen: chk(root, 'romsFullscreen'), showStats: chk(root, 'showStats'), hoverMusic: chk(root, 'hoverMusic'), achClips: chk(root, 'achClips'), askStates: chk(root, 'askStates') });
      st.liveAuto = chk(root, 'liveAuto');
      Object.assign(st, { depth: chk(root, 'depth'), livingBg: chk(root, 'livingBg'), previewLoop: chk(root, 'previewLoop'), widget: chk(root, 'widget'), tvSafe: +val(root, 'tvSafe') || 0 });
      document.body.classList.toggle('depth', st.depth !== false); Atmos.apply();
      Object.assign(st, { prewarmSteam: chk(root, 'prewarmSteam'), shaderCache: chk(root, 'shaderCache'), gamemode: chk(root, 'gamemode'), padBackground: chk(root, 'padBackground'), soundFollow: chk(root, 'soundFollow'),
        sgdbKey: val(root, 'sgdbKey'), raUser: val(root, 'raUser'), raKey: val(root, 'raKey') });
      Boot.setOn(st.bootAnim !== false); Guide.readSettings(root); Watch.readSettings(root); Capture.readSettings(root); Players.readControllers(root); Players.readMulti(root); Running.refresh();
      if (peekWas !== st.peekMinimize) api.peekConfig({ minimize: st.peekMinimize });
      if (dirWas !== st.musicDir) Music.load(true).then(Music.draw);
      Sound.sync(); Showcase.reset(); Voice.syncWake?.();
      applyTheme(val(root, 'theme')); $('#who').textContent = st.playerName; Player.header(); S.bi = 0; S.pcNav = 'blade:0'; save();
      if (S.mode === 'console') renderConsole(); else renderPc();
    } }],
    onOpen: (root) => {
      Capture.settingsOpen(root);
      root.addEventListener('input', (ev) => { if (ev.target.name === 'tvSafe') { $('.safe-v', root).textContent = `${ev.target.value}%`; Atmos.calibrate(+ev.target.value); } });
      S.modalGone = () => Atmos.safe();
      root.querySelector('.dlg').classList.add('settings');
      settingsTab(root, setTab);
      Players.wireControllers($('.pl-box', root)); Players.wireMulti($('.ms-box', root), root);
      root.addEventListener('click', (ev) => {
      const t = ev.target.closest('.set-tabs [data-tab]');
      if (t) { settingsTab(root, SET_TABS.findIndex(([id]) => id === t.dataset.tab)); Sound.play('tick'); return; }
      const x = ev.target.closest('[data-x]')?.dataset.x;
      if (x === 'look') { closeModal(); Look.open(); }
      const go = { emus: manageEmulators, emuget: () => Shop.open('emus'), sources: () => Roms.sources(), mc: () => Minecraft.open(), split: () => SplitScreen.open(), backup: () => Backup.open() }[x];
      if (go) { closeModal(); setTimeout(go, 0); return; }
      if (x === 'liveforget') { S.lib.settings.liveAsked = {}; api.liveForget('*'); toast('The live view asks again the next time for each game.'); }
      const j = ev.target.closest('[data-jump]'); if (j) $('#' + j.dataset.jump, root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (x === 'ratest') {
        const out = $('.ra-res', root), keep = { raUser: st.raUser, raKey: st.raKey };
        Object.assign(st, { raUser: val(root, 'raUser'), raKey: val(root, 'raKey') }); save();
        out.textContent = 'Checking…';
        setTimeout(async () => { out.textContent = await Ach.test(); if (!val(root, 'raKey')) Object.assign(st, keep); }, 400);
      }
      if (x === 'themes') api.openThemes();
      if (x === 'css') api.openCss();
      if (x === 'blades') $('[name=blades]', root).value = JSON.stringify(S.defaultBlades, null, 2);
    }); }
  });
}

/* ---------------------------------------------------------------- input (keyboard + gamepad share one dispatcher) */
function activate() { if (S.sel) launch(S.sel); }

function handle(a) { handleInput(a); hints(); if (a === 'up' || a === 'down' || a === 'left' || a === 'right') Players.bump(); }
/* The hint bar says what the buttons do where you are, so Y reads "Close…" in the Running list
   and the dock rather than "Edit". */
let hintsDefault = null, hintsNow = '';
function hints() {
  const bar = $('#hints'); if (!bar) return;
  if (hintsDefault === null) hintsDefault = bar.innerHTML;
  const h = (k, t, cls = k) => `<span class="h"><i class="pad ${cls}">${k.toUpperCase()}</i>${t}</span>`;
  const run = Running.active() && Running.current(), dock = Dock.active() && Dock.current();
  // Every overlay says what its buttons do too: nothing is a hidden gesture.
  const settingsOpen = !!document.querySelector('#modal .set, #modal .dlg.settings');
  const html = Wreck.isOn() ? h('lb', '/ RB pick', 'k') + h('a', 'Play') + h('b', 'Blades back')
    : S.modal ? h('a', 'Choose') + (settingsOpen ? h('lb', '/ RB pages', 'k') : '') + h('b', 'Close')
    : Guide.isOpen() ? (Guide.pane() === 'guide' ? h('a', 'Choose') + h('b', 'Back') : h('lb', '/ RB tabs', 'k') + h('a', 'Choose') + h('b', 'Close'))
    : Panels.active() ? (Panels.current()?.kind === 'finder' ? h('a', 'Choose') + h('y', 'Search') + h('lb', '/ RB source', 'k') + h('b', 'Back') : h('a', 'Press') + h('b', 'Back') + h('start', 'Arrange', 'k') + h('back', 'Menu', 'k'))
    : Resume.isOpen() ? h('a', 'Switch to it') + h('x', 'Freeze / thaw') + h('y', 'Close…') + h('b', 'Back')
    : Notify.isOpen() ? h('x', 'Clear all') + h('b', 'Close')
    : Volume.isOpen() ? h('a', 'Mute') + h('lb', '/ RB big steps', 'k') + h('b', 'Close')
    : sysGroup && S.blades[S.bi]?.special === 'system' && S.mode === 'console' ? h('a', 'Open') + h('b', 'Back to System')
    : run ? h('a', 'Switch to it') + (run.canPause ? h('x', run.paused ? 'Resume' : 'Pause') : '') + (run.canClose ? h('y', 'Close…') : '') + h('b', 'Back')
    : dock ? h('a', dock.open ? 'Show / hide' : dock.edit ? 'Edit dock' : 'Open') + (dock.open ? h('x', 'Minimize') + h('y', 'Close…') : '') + h('b', 'Back')
    : NowPlaying.highlighted() ? h('a', 'Back to the game') + h('x', 'Live view') + h('b', 'Back')
    : hintsDefault;
  if (html !== hintsNow) { hintsNow = html; bar.innerHTML = html; }
}

function handleInput(a) {
  // A press during the boot animation only skips it.
  if (Boot.playing?.()) { Boot.done(); return; }
  if (Drive.handle(a)) return;
  // The water is a picture of the menu; the moment you do anything, let the real menu back.
  Water.cancel();
  if (Intro.handle(a)) return;
  if (OSK.handle(a)) return;
  if (Tour.handle(a)) return;
  if (Crash.handle(a)) return;
  if (Wreck.handle(a)) return;
  if (S.modal) { modalInput(a); return; }
  if (Notify.handle(a)) return;
  if (Resume.handle(a)) return;
  if (Volume.handle(a)) return;
  if (Panels.handle(a)) return;
  if (typeof AchClips !== 'undefined' && AchClips.handleKey?.(a)) return;
  // While a game starts behind Bladedeck, X shows whatever Steam is asking.
  if (a === 'x' && S.playing?.covered) { revealSteam(); uncoverSteam(S.playing); api.minimize(); return; }
  if (a === 'guide') { Guide.toggle('type'); return; }
  if (a === 'quick') { Guide.quick(); return; }
  if (Guide.handle(a)) return;
  if (Running.handle(a)) return;
  if (Dock.handle(a)) return;
  if (NowPlaying.handle(a)) return;
  if (a === 'music') { Music.toggle(); return; }
  if (a === 'help') { openControls(); return; }
  if (a === 'voice') { Voice.listen(); return; }
  if (a === 'pc') { openThisPc(); return; }
  if (a === 'lt') { Music.prev(); return; }
  if (a === 'rt') { Music.next(); return; }
  if (Secrets.feed(a)) return;
  if (a === 'back') { setMode(S.mode === 'console' ? 'pc' : 'console'); return; }
  if (a === 'tasks') { if (S.sel && !S.sel.run) Tasks.open(S.sel); return; }
  if (a === 'poke') { if (S.sel && !S.sel.run) Friends.poke(S.sel); return; }
  if (a === 'ach') { if (S.sel && !S.sel.run) Ach.open(S.sel); return; }
  const before = S.mode === 'console' ? `${S.bi}:${S.ii[S.bi] || 0}` : S.pcItems.indexOf(S.sel);
  if (S.mode === 'console') consoleInput(a); else pcInput(a);
  // Slamming the cursor into one end of the menu and then the other is what breaks it.
  if (['left', 'right', 'up', 'down'].includes(a)) Crash.watch(a, before !== (S.mode === 'console' ? `${S.bi}:${S.ii[S.bi] || 0}` : S.pcItems.indexOf(S.sel)));
}

// Controllers work every dialog: the d-pad moves to whatever is that way on screen, A presses,
// left and right change a list or slider, B closes. See pad.js.
function modalInput(a) {
  if (a === 'b') { closeModal(); return; }
  // Settings: LB and RB go through its pages.
  const sr = $('#modal .set, #modal .dlg.settings');
  if (sr && (a === 'lb' || a === 'rb')) { settingsTab($('#modal'), setTab + (a === 'rb' ? 1 : -1)); Sound.play('tick'); return; }
  PadNav.input($('#modal'), a);
}

function consoleInput(a) {
  const j = S.ii[S.bi] || 0;
  switch (a) {
    case 'left': if (S.bi === 0 && (NowPlaying.edge() || Running.edge() || Dock.edge())) break; setBlade(S.bi - 1); break;
    case 'lb': setBlade(S.bi - 1); break;
    case 'right': case 'rb': setBlade(S.bi + 1); break;
    case 'up': setItem(j - 1); break;
    case 'down': setItem(j + 1); break;
    case 'a': activate(); break;
    case 'b': if (sysGroup && S.blades[S.bi]?.special === 'system') sysOpen(null); else if (S.bi !== 0) { sndBack(); setBlade(0); } break;
    case 'x': if (S.sel && !S.sel.run) toggleFav(S.sel); break;
    case 'y': if (S.sel && !S.sel.run) editEntry(S.sel); break;
    case 'start': if (S.sel && !S.sel.run) Tasks.open(S.sel); else setBlade(S.blades.length - 1); break;
  }
}

function pcInput(a) {
  const g = $('#grid'); const n = S.pcItems.length;
  const cols = g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 1;
  const i = Math.max(0, S.pcItems.indexOf(S.sel));
  const to = (k) => { if (!n) return; if (k < 0 || k >= n) Atmos.bump(g, k < 0 ? 1 : -1); pcSelect(S.pcItems[Math.max(0, Math.min(n - 1, k))]); sndTick(); };
  switch (a) {
    case 'left': if (i % cols === 0 && (NowPlaying.edge() || Running.edge() || Dock.edge())) break; to(i - 1); break;
    case 'right': to(i + 1); break;
    case 'up': to(i - cols); break;
    case 'down': to(i + cols); break;
    case 'a': activate(); break;
    case 'x': if (S.sel) toggleFav(S.sel); break;
    case 'y': if (S.sel) editEntry(S.sel); break;
    case 'b': if (S.search) { S.search = ''; renderPc(); } break;
    case 'start': if (S.sel) Tasks.open(S.sel); break;
    case 'rb': if ($('#q')) OSK.open($('#q')); break;
  }
}

const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'a', Escape: 'b', Backspace: 'b', f: 'x', e: 'y', s: 'start', t: 'tasks', p: 'poke', r: 'ach', m: 'music', g: 'guide', v: 'vol', q: 'resume', n: 'notify', ' ': 'voice', F1: 'help', '?': 'help', c: 'quick', '[': 'lt', ']': 'rt', F10: 'back', PageUp: 'lb', PageDown: 'rb', i: 'pc' };

function bindInput() {
  addEventListener('keydown', (ev) => { if (ev.isTrusted) S.pad = false; }, true);
  addEventListener('pointerdown', (ev) => { if (ev.isTrusted) S.pad = false; }, true);
  addEventListener('keydown', (ev) => {
    Secrets.bump();
    if (!/^(Control|Shift|Alt|Meta)$/.test(ev.key)) Water.cancel();
    if (Crash.busy()) { const a = ev.key === ' ' ? 'a' : KEYS[ev.key]; if (a) { ev.preventDefault(); Crash.handle(a); } return; }
    if (S.modal) { if (ev.key === 'Escape') closeModal(); return; }
    const tag = ev.target.tagName;
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) { if (ev.key === 'Escape') ev.target.blur(); return; }
    if (S.mode === 'pc' && ((ev.ctrlKey && ev.key === 'f') || ev.key === '/')) { ev.preventDefault(); $('#q')?.focus(); return; }
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const a = KEYS[ev.key]; if (!a) return;
    ev.preventDefault(); handle(a);
  });

  // gamepad: first connected pad, d-pad or left stick, with hold-to-repeat.
  // View + Menu together is the controller's Ctrl+M, and works while a game has focus too, so
  // View and Menu on their own act when let go, once it is clear they were not that pair.
  const prev = {}, rep = {}, prevStick = {}, stickLet = {}, stickBounce = {};
  let paired = false, viewAt = 0, viewHeld = false;
  (function poll(now) {
    requestAnimationFrame(poll);
    // Every controller this menu listens to (all of them, or in multi-screen just this player's).
    const ps = Players.pads();
    if (!ps.length) return;
    const p = ps.find((g) => g.buttons.some((x) => x.pressed)) || ps[0];
    const b = (i) => ps.some((g) => !!g.buttons[i]?.pressed);
    const ax = (i) => ps.reduce((m, g) => (Math.abs(g.axes[i] || 0) > Math.abs(m) ? g.axes[i] : m), 0);
    /* The stick, with its spring-back ignored: let go of a stick pushed right and it swings past the
       middle a little to the left. A push the other way within 200 ms of letting go is that swing,
       not a press. The d-pad is never filtered. */
    const sx = ax(0), sy = ax(1);
    const stick = { up: sy < -0.6, down: sy > 0.6, left: sx < -0.6, right: sx > 0.6 };
    const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
    // Let-gos first (a swing can cross the middle within one frame), then new pushes.
    for (const d in OPP) if (prevStick[d] && !stick[d]) stickLet[d] = now;
    for (const d in OPP) {
      if (stick[d] && !prevStick[d] && now - (stickLet[OPP[d]] ?? -1e9) < 200) stickBounce[d] = true;
      if (!stick[d]) stickBounce[d] = false;
    }
    Object.assign(prevStick, stick);
    const sd = (d) => stick[d] && !stickBounce[d];
    const st = { up: b(12) || sd('up'), down: b(13) || sd('down'), left: b(14) || sd('left'), right: b(15) || sd('right'),
      a: b(0), b: b(1), x: b(2), y: b(3), lb: b(4), rb: b(5), lt: b(6), rt: b(7), back: b(8), start: b(9), ach: b(10), music: b(11), vol: b(16) };
    // In multi-screen it is this player's own: pause the game and show their menu, or go back.
    if (st.back && st.start && !paired) { paired = true; if (Players.on()) Players.toggleMenu(); else api.peekToggle(); }
    // View + Y: the walkthrough window. View + X: record. View + RB: save the last moments. In games too.
    if (st.back && st.y && !paired) { paired = true; walkthrough(); }
    if (st.back && st.x && !paired) { paired = true; Capture.toggleRecord(); }
    if (st.back && st.rb && !paired) { paired = true; Capture.saveReplay(); }
    // LB + RB + Y: the wrecking ball (an alpha draft of another interface).
    if (st.lb && st.rb && st.y && !st.back && !paired && (Players.inMenu() ?? deckFocused())) { paired = true; Wreck.start(); }
    // A Stadia controller's own buttons (Chrome maps them to 17 and 18): Assistant asks by voice,
    // Capture saves the last moments, or held for half a second starts or stops recording. In games too.
    const stadia = ps.find((g) => /18d1.*9400|stadia/i.test(g.id));
    if (stadia) {
      const as = !!stadia.buttons[17]?.pressed, cp = !!stadia.buttons[18]?.pressed;
      if (as && !prev.sdAssist) Voice.listen();
      if (cp && !prev.sdCap) prev.sdCapAt = now;
      if (cp && prev.sdCapAt && now - prev.sdCapAt > 550) { prev.sdCapAt = 0; Capture.toggleRecord(); }
      if (!cp && prev.sdCap && prev.sdCapAt) { prev.sdCapAt = 0; Capture.saveReplay(); }
      prev.sdAssist = as; prev.sdCap = cp;
    }
    // View + LB: a voice command.
    if (st.back && st.lb && !paired) { paired = true; Voice.listen(); }
    if (!S.pad && deckFocused()) for (const k in st) if (st[k]) { S.pad = true; break; }
    const focused = Players.inMenu() ?? deckFocused();
    // Holding the guide trigger pulls the flap out with the stick; the stick is not the menu's then.
    const pulling = focused && !S.modal && !Volume.isOpen() && !Resume.isOpen() && Guide.frame(p, now);
    for (const k in st) {
      const dir = k === 'up' || k === 'down' || k === 'left' || k === 'right';
      if (!focused) { /* the game is using the pad */ }
      else if (pulling && (dir || k === 'lt' || k === 'rt')) { /* the flap has it */ }
      else if ((k === 'y' || k === 'x' || k === 'rb' || k === 'lb') && st.back) { /* View + Y / X / RB / LB are chords */ }
      else if (k === 'lt' || k === 'rt') { if (!st[k] && prev[k] && (!Guide.isTrigger(k) || Guide.tapped())) { Secrets.bump(); handle(k); } }
      else if (k === 'back' && st.back && !paired && !viewHeld && viewAt && now - viewAt > 550) { viewHeld = true; handle('resume'); }
      else if (k === 'back' || k === 'start') { if (!st[k] && prev[k] && !paired && !(k === 'back' && viewHeld)) { Secrets.bump(); handle(k); } }
      else if (st[k] && !prev[k]) { Secrets.bump(); handle(k); rep[k] = now + 420; }
      else if (st[k] && dir && now > rep[k]) { handle(k); rep[k] = now + 90; }
      prev[k] = st[k];
    }
    if (!st.back && !st.start && !(st.lb && st.rb)) paired = false;
    // Holding View opens Quick Resume; a quick press still swaps console and PC mode.
    if (st.back && !prev.backHeld) viewAt = now;
    if (!st.back) { viewAt = 0; viewHeld = false; }
    prev.backHeld = st.back;
  })(0);

  // mouse
  $('#blades').addEventListener('click', (ev) => {
    const bl = ev.target.closest('.blade'); if (!bl) return;
    const i = +bl.dataset.i;
    if (i !== S.bi) { setBlade(i); return; }
    const it = ev.target.closest('.item');
    if (it) { const j = +it.dataset.i; if (j === (S.ii[S.bi] || 0)) activate(); else setItem(j); }
  });

  $('.orb').addEventListener('click', () => Secrets.orb());
  addEventListener('pointermove', () => Secrets.bump(), { passive: true });

  document.addEventListener('click', (ev) => {
    const m = ev.target.closest('[data-mode]'); if (m && m.closest('.seg')) { setMode(m.dataset.mode); return; }
  });

  const pc = $('#pc');
  pc.addEventListener('click', (ev) => {
    const nav = ev.target.closest('[data-nav]');
    if (nav) { S.pcNav = nav.dataset.nav; S.sel = null; renderPc(); return; }
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (act) {
      ({ add: () => editEntry(), steam: scanSteam, settings: openSettings, console: () => setMode('console'), emulators: manageEmulators,
        launch: () => S.sel && launch(S.sel), tasks: () => Tasks.open(S.sel), poke: () => Friends.poke(S.sel), gog: scanGog, getgames: () => Shop.open(), split: () => SplitScreen.open(S.sel), mods: () => Mods.open(S.sel), art: () => Art.open(S.sel), ach: () => Ach.open(S.sel), fav: () => S.sel && toggleFav(S.sel), edit: () => S.sel && editEntry(S.sel),
        hide: () => { if (S.sel) { S.sel.hidden = !S.sel.hidden; S.sel = null; save(); renderPc(); } } })[act]?.();
      return;
    }
    const tile = ev.target.closest('.tile');
    if (tile) pcSelect(S.pcItems.find((e) => e.id === tile.dataset.id));
  });
  pc.addEventListener('dblclick', (ev) => { if (ev.target.closest('.tile')) activate(); });
  pc.addEventListener('input', (ev) => {
    if (ev.target.id === 'q') { S.search = ev.target.value; renderGrid(); }
    if (ev.target.id === 'size') { S.lib.settings.tileSize = +ev.target.value; $('#grid').style.setProperty('--tile', ev.target.value + 'px'); save(); }
  });
  pc.addEventListener('change', (ev) => { if (ev.target.id === 'sort') { S.sort = ev.target.value; renderGrid(); } });

  // drag and drop any program or game file onto the window
  addEventListener('dragover', (ev) => ev.preventDefault());
  addEventListener('drop', (ev) => {
    ev.preventDefault();
    const paths = [...ev.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
    if (paths.length) handleDrop(paths);
  });
}

/* ---------------------------------------------------------------- boot */
(async function boot() {
  const b = await api.load();
  S.lib = b.lib; S.themes = b.themes; S.defaultBlades = b.defaultBlades;
  $('#custom-css').textContent = b.customCss || '';
  Secrets.installThemes();
  applyTheme(S.lib.settings.theme);
  Look.apply();
  document.body.classList.toggle('depth', S.lib.settings.depth !== false); Atmos.apply();
  $('#who').textContent = S.lib.settings.playerName;
  { const b = document.querySelector('.bt-sub'); if (b) b.textContent = `Welcome back, ${S.lib.settings.playerName || 'player'}`; }
  Player.header();
  $('.who').addEventListener('click', () => Player.profile());
  startBg(); startClock(); startSysChip(); bindInput();
  setMode(Players.isP2() ? 'console' : S.lib.settings.mode || 'console', true);
  Sound.startAmbient(); Secrets.bump();
  Music.load().then(Music.draw);
  // Player 2's menu (multi-screen) is just a menu: the main one does the watching, music and network.
  if (Players.isP2()) { S.lib.settings.playerName = 'Player 2'; $('#who').textContent = 'Player 2'; Players.applySounds(); Guide.init(); Dock.draw(); Running.refresh(); return; }
  Dock.draw(); Guide.init(); Watch.start(); ensureEmuApps(); Tour.maybeOffer(); Running.refresh();
  Friends.presence(); Players.applySounds(); Players.applyPad(); Extras.boot(); Roms.fixArgs();
  api.onDownloads((list) => Downloads.update(list));
  // First run: go and find everything so the library is never empty.
  if (!S.lib.entries.length) setTimeout(findEverything, 600);
  // Warm the image cache in the background so every blade opens instantly.
  const covers = S.lib.entries.map((e) => e.cover).filter(Boolean);
  const warm = () => { const c = covers.splice(0, 8); c.forEach((p) => { const im = new Image(); im.decoding = 'async'; im.src = fileUrl(p); im.decode?.().catch(() => {}); }); if (covers.length) requestIdleCallback(warm); };
  requestIdleCallback(warm);
})();
