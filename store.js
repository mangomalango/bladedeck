'use strict';
/* Get games, emulators and sound.
   - Free games: what Epic gives away this week, free games on GOG, and Steam's top free-to-play
     games. Each opens in its own store or launcher to claim or install; nothing is downloaded here.
   - Homebrew: Homebrew Hub (hh.gbdev.io), new games made for the Game Boy, Game Boy Color and
     Game Boy Advance, free to download and share. They go into ~/Games/ROMs.
   - Emulators: installed from Flathub for this user (no password), and set up in the library.
   - Retro art: box art, title screens and screenshots from the libretro thumbnail collection.
   - itch.io: free indie games from its public feeds and search. Download pages open in the
     browser; when the file lands in a watched folder, Bladedeck unpacks it and adds the game.
   - Classics: old games their owners have released for free (ScummVM adventures, Bethesda's
     early Elder Scrolls, OpenTTD).
   - Watched folders: new games and ROMs dropped into chosen folders are noticed straight away.
   - Sound: the system's volume, outputs, microphone and per-app volume through pactl
     (PipeWire or PulseAudio). */
const { ipcMain, app } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const UA = { 'User-Agent': 'Bladedeck/0.1' };
const getJson = async (url) => {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`The server said ${r.status}.`);
  return r.json();
};
const wrap = (fn) => async (...a) => { try { return { ok: true, data: await fn(...a) }; } catch (err) { return { ok: false, error: String(err && err.message || err) }; } };
const run = (cmd, args, timeout = 8000) => new Promise((res, rej) => execFile(cmd, args, { timeout, maxBuffer: 8 << 20, windowsHide: true }, (err, out, errOut) => (err ? rej(new Error(String(errOut || err.message).trim())) : res(out))));

/* ---------------------------------------------------------------- free games */
async function epic() {
  const j = await getJson('https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US');
  const now = Date.now();
  const out = [];
  for (const e of j.data.Catalog.searchStore.elements) {
    const offers = (e.promotions?.promotionalOffers || []).flatMap((o) => o.promotionalOffers);
    const later = (e.promotions?.upcomingPromotionalOffers || []).flatMap((o) => o.promotionalOffers);
    const freeNow = offers.find((o) => o.discountSetting?.discountPercentage === 0 && new Date(o.startDate) <= now && new Date(o.endDate) > now);
    const freeSoon = later.find((o) => o.discountSetting?.discountPercentage === 0);
    if (!freeNow && !freeSoon) continue;
    const slug = e.productSlug || e.catalogNs?.mappings?.[0]?.pageSlug || e.offerMappings?.[0]?.pageSlug || e.urlSlug;
    const img = (t) => e.keyImages.find((k) => k.type === t)?.url;
    out.push({ store: 'Epic', title: e.title, cover: img('OfferImageTall') || img('Thumbnail') || img('OfferImageWide'),
      url: slug ? `https://store.epicgames.com/p/${String(slug).replace(/\/home$/, '')}` : 'https://store.epicgames.com/free-games',
      note: freeNow ? `Free until ${new Date(freeNow.endDate).toLocaleDateString()}` : `Free from ${new Date(freeSoon.startDate).toLocaleDateString()}`, soon: !freeNow });
  }
  return out;
}
async function gog() {
  const j = await getJson('https://catalog.gog.com/v1/catalog?limit=48&price=between:0,0&order=desc:trending&productType=in:game&locale=en-US');
  return j.products.filter((p) => !/\bdemo\b|prologue|soundtrack/i.test(p.title)).slice(0, 24).map((p) => ({
    store: 'GOG', title: p.title, cover: p.coverVertical, url: `https://www.gog.com/en/game/${p.slug}`, note: 'Free to keep' }));
}
async function steamF2P() {
  const j = await getJson('https://store.steampowered.com/search/results/?json=1&genre=Free%20to%20Play&category1=998&filter=topsellers&count=30');
  return j.items.map((i) => {
    const appid = (i.logo.match(/\/apps\/(\d+)\//) || [])[1];
    return appid && { store: 'Steam', title: i.name, appid, cover: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`,
      wide: i.logo, url: `steam://install/${appid}`, page: `https://store.steampowered.com/app/${appid}`, note: 'Free to play' };
  }).filter(Boolean);
}

/* ---------------------------------------------------------------- homebrew */
const HH = 'https://hh3.gbdev.io';
const romsDir = (platform) => path.join(os.homedir(), 'Games', 'ROMs', { GB: 'Game Boy', GBC: 'Game Boy Color', GBA: 'Game Boy Advance' }[platform] || 'Homebrew');
function hhEntry(e) {
  const file = (e.files || []).find((f) => f.default) || (e.files || []).find((f) => f.playable) || (e.files || [])[0];
  const shot = (e.screenshots || [])[0];
  const base = `${HH}/static/${e.basepath}/entries/${encodeURIComponent(e.slug)}`;
  return { slug: e.slug, title: e.title, platform: e.platform, developer: [].concat(e.developer || []).map((d) => (typeof d === 'string' ? d : d.name)).filter(Boolean).join(', '),
    tags: (e.tags || []).filter((t) => !/^event:/.test(t)).slice(0, 4), cover: shot ? `${base}/${shot.split('/').map(encodeURIComponent).join('/')}` : '',
    file: file ? `${base}/${file.filename.split('/').map(encodeURIComponent).join('/')}` : '', fileName: file ? path.basename(file.filename) : '', website: e.website || '' };
}

/* ---------------------------------------------------------------- emulators */
/* On Windows, winget (built into Windows 10 and 11) installs them. Afterwards the program is found
   where its installer puts it: Program Files, the user's Programs folder, or winget's own folder
   for portable apps. `hint` names the folder, `exe` the program inside it. */
function winRoots() {
  const e = process.env, L = e.LOCALAPPDATA || '';
  return [e.ProgramFiles, e['ProgramFiles(x86)'], L && path.join(L, 'Programs'), L && path.join(L, 'Microsoft', 'WinGet', 'Packages'), 'C:\\', e.USERPROFILE && path.join(e.USERPROFILE, 'Documents')].filter(Boolean);
}
function winFind(hint, exe) {
  const want = new RegExp(exe, 'i'), h = String(hint).toLowerCase();
  const walk = (d, depth) => {
    if (depth > 3) return null;
    let items; try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return null; }
    for (const it of items) if (it.isFile() && want.test(it.name) && !/unins/i.test(it.name)) return path.join(d, it.name);
    for (const it of items) if (it.isDirectory()) { const f = walk(path.join(d, it.name), depth + 1); if (f) return f; }
    return null;
  };
  for (const r of winRoots()) {
    let items; try { items = fs.readdirSync(r, { withFileTypes: true }); } catch { continue; }
    for (const it of items) {
      if (!it.isDirectory() || !it.name.toLowerCase().includes(h)) continue;
      const f = walk(path.join(r, it.name), 0); if (f) return f;
    }
  }
  return null;
}
const onPathStore = (cmd) => { for (const dir of (process.env.PATH || '').split(path.delimiter)) { const p = path.join(dir, cmd); try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* next */ } } return null; };
const flatpakHas = (id) => [path.join(os.homedir(), '.local/share/flatpak/app', id), path.join('/var/lib/flatpak/app', id)].some((p) => fs.existsSync(p));

/* ---------------------------------------------------------------- retro art */
const LIBRETRO = 'https://thumbnails.libretro.com';
const indexes = new Map();
// The libretro folders are named by system; their files by the No-Intro name with & * / : ` < > ? \ | replaced by _.
async function libretroIndex(system, kind) {
  const key = `${system}/${kind}`;
  if (indexes.has(key)) return indexes.get(key);
  const cache = path.join(app.getPath('userData'), 'libretro', `${key.replace(/[^\w.-]+/g, '_')}.json`);
  try { const c = JSON.parse(fs.readFileSync(cache, 'utf8')); if (Date.now() - c.t < 14 * 86400000) { indexes.set(key, c.names); return c.names; } } catch { /* fetch it */ }
  const r = await fetch(`${LIBRETRO}/${encodeURIComponent(system)}/${kind}/`, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) { indexes.set(key, []); return []; }
  const html = await r.text();
  const names = [...html.matchAll(/href="([^"?/]+\.png)"/g)].map((m) => decodeURIComponent(m[1]));
  indexes.set(key, names);
  try { fs.mkdirSync(path.dirname(cache), { recursive: true }); fs.writeFileSync(cache, JSON.stringify({ t: Date.now(), names })); } catch { /* cache is optional */ }
  return names;
}
const norm = (s) => String(s).toLowerCase().replace(/\.png$/, '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/^the\s+|,\s*the\b/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
const REGION = /\((USA|World)/;


/* ---------------------------------------------------------------- itch.io */
const ent = (s) => String(s || '').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/​/g, '').trim();
async function itchFeed(feed) {
  const r = await fetch(`https://itch.io/${feed}.xml`, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`itch.io said ${r.status}.`);
  const xml = await r.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const tag = (t) => ent((it.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1]);
    const desc = tag('description').replace(/<!\[CDATA\[|\]\]>/g, '');
    return { title: tag('plainTitle'), url: tag('link'), cover: tag('imageurl'), blurb: ent(desc.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').slice(0, 140) };
  }).filter((g) => g.title && /^https:\/\/[\w-]+\.itch\.io\//.test(g.url));
}
async function itchSearch(q) {
  const r = await fetch(`https://itch.io/search?${new URLSearchParams({ q, classification: 'game' })}`, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`itch.io said ${r.status}.`);
  const html = await r.text();
  return html.split('<div data-game_id=').slice(1).map((cell) => {
    if (/class="price_value"/.test(cell.slice(0, 4000))) return null; // paid
    const url = (cell.match(/href="(https:\/\/[\w-]+\.itch\.io\/[^"]+)"/) || [])[1];
    const title = ent((cell.match(/class="title game_link"[^>]*>([^<]+)</) || [])[1]);
    const cover = (cell.match(/data-lazy_src="([^"]+)"/) || [])[1] || '';
    const blurb = ent((cell.match(/class="game_text"[^>]*>([^<]+)</) || [])[1]);
    return url && title ? { title, url, cover, blurb } : null;
  }).filter(Boolean).slice(0, 36);
}

/* ---------------------------------------------------------------- classics */
// Old games their owners have made free. The ScummVM ones are hosted by ScummVM with permission.
const SCUMM = 'https://downloads.scummvm.org/frs/extras/';
const CLASSIC_ZIPS = {
  bass: `${SCUMM}Beneath%20a%20Steel%20Sky/bass-cd-1.2.zip`,
  fotaq: `${SCUMM}Flight%20of%20the%20Amazon%20Queen/FOTAQ_Talkie-1.1.zip`,
  lure: `${SCUMM}Lure%20of%20the%20Temptress/lure-1.1.zip`,
  dreamweb: `${SCUMM}Dreamweb/dreamweb-cd-uk-1.1.zip`
};

/* ---------------------------------------------------------------- unpacking */
const ARCHIVE = /\.(zip|tar\.gz|tgz|tar\.xz|tar\.bz2|tar|7z)$/i;
async function unpack(file, dest) {
  fs.mkdirSync(dest, { recursive: true });
  if (/\.zip$/i.test(file)) await run('unzip', ['-o', '-q', file, '-d', dest], 300000).catch(() => run('bsdtar', ['-xf', file, '-C', dest], 300000)).catch(() => run('tar', ['-xf', file, '-C', dest], 300000));
  else if (/\.7z$/i.test(file)) await run('7z', ['x', '-y', `-o${dest}`, file], 300000);
  else await run('tar', ['-xf', file, '-C', dest], 300000);
  // One folder inside the archive: use it as the game's folder.
  const items = fs.readdirSync(dest);
  return items.length === 1 && fs.statSync(path.join(dest, items[0])).isDirectory() ? path.join(dest, items[0]) : dest;
}
const isElf = (f) => { try { const b = Buffer.alloc(4); const fd = fs.openSync(f, 'r'); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd); return b.toString('latin1') === '\x7fELF'; } catch { return false; } };
// The file that starts the game: a Linux build first, then a Windows one for Wine or Proton.
function findLauncher(dir) {
  const c = [];
  const walk = (d, depth) => {
    if (depth > 4) return;
    let items; try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      const f = path.join(d, it.name), n = it.name.toLowerCase();
      if (it.isDirectory()) { if (!/^(lib|libs|data|_data|mono|monobleedingedge|plugins|resources|locales)$/i.test(it.name) && !n.endsWith('_data')) walk(f, depth + 1); continue; }
      if (/unins|crashhandler|setup|redist|vc_redist|dxsetup|uninstall|config|launcher\.sh\.bak/i.test(n)) continue;
      let score = 0;
      if (/\.x86_64$/.test(n)) score = 100; else if (/\.appimage$/.test(n)) score = 90;
      else if (!/\.[a-z0-9]{1,5}$/.test(n) && isElf(f)) score = 80; else if (/\.(sh|run)$/.test(n)) score = 60;
      else if (/\.exe$/.test(n)) score = 30;
      if (score) c.push({ f, score: score - depth * 5 });
    }
  };
  walk(dir, 0);
  c.sort((a, b) => b.score - a.score);
  const best = c[0] && c[0].f;
  if (best && !/\.exe$/i.test(best)) { try { fs.chmodSync(best, 0o755); } catch { /* read-only */ } }
  return best || null;
}
const squash = (s) => String(s).toLowerCase().replace(/\.(zip|tar\.gz|tgz|tar\.xz|tar\.bz2|tar|7z)$/, '').replace(/[-_ .]*(linux|windows|win|win64|x64|x86_64|amd64|v?\d+(\.\d+)*)\b/g, '').replace(/[^a-z0-9]/g, '');

const unpackedRoot = (d) => { const i = fs.readdirSync(d); return i.length === 1 && fs.statSync(path.join(d, i[0])).isDirectory() ? path.join(d, i[0]) : d; };

/* ---------------------------------------------------------------- watched folders */
let watchers = [], seen = new Map(), expect = [];
const SKIP = /\.(part|crdownload|tmp|download|!qb|aria2)$|^\.|\/\./i;
function watchFolders(dirs, send) {
  for (const w of watchers) try { w.close(); } catch { /* gone */ }
  watchers = [];
  for (const d of dirs) {
    if (path.resolve(d) === path.resolve(os.homedir()) || path.resolve(d) === '/') continue; // far too much to watch
    if (!fs.existsSync(d)) { try { fs.mkdirSync(d, { recursive: true }); } catch { continue; } }
    try {
      const w = fs.watch(d, { recursive: true }, (_ev, name) => { if (name) settle(path.join(d, String(name)), d, send); });
      w.on('error', () => {});
      watchers.push(w);
    } catch { /* not watchable */ }
  }
}
// A download grows for a while; act once the size stops changing.
// Bladedeck's own unpacked games are already in the library; their files are not news.
// Never the whole home folder, even when the system has no Downloads folder set.
const downloadsDir = () => { const d = app.getPath('downloads'); return d && path.resolve(d) !== path.resolve(os.homedir()) ? d : path.join(os.homedir(), 'Downloads'); };
const MANAGED = () => [path.join(os.homedir(), 'Games', 'itch'), path.join(os.homedir(), 'Games', 'Classics')];
function settle(file, root, send, last = -1) {
  if (SKIP.test(path.basename(file)) || MANAGED().some((m) => file.startsWith(m + path.sep))) return;
  // Inside a Wine or Proton prefix: a Windows game's own files and caches, not news.
  if (/[\\/](drive_c|compatdata|shadercache|pfx)[\\/]/i.test(file)) return;
  const key = file;
  clearTimeout(seen.get(key)?.t);
  const t = setTimeout(async () => {
    let st; try { st = fs.statSync(file); } catch { seen.delete(key); return; }
    if (!st.isFile() || st.size === 0) return;
    if (st.size !== last) { settle(file, root, send, st.size); return; }
    if (seen.get(key)?.done === st.mtimeMs) return;
    seen.set(key, { done: st.mtimeMs });
    const name = path.basename(file);
    // An itch.io download Bladedeck was told about: unpack it into ~/Games/itch and add it.
    const want = ARCHIVE.test(name) && expect.find((x) => Date.now() - x.at < 3 * 3600000 && (squash(name).includes(x.key) || x.key.includes(squash(name)) && squash(name).length > 3));
    if (want) {
      try {
        send('watch-found', { kind: 'unpacking', title: want.title });
        const dir = await unpack(file, path.join(os.homedir(), 'Games', 'itch', want.title.replace(/[^\w .'&!-]+/g, '').trim() || 'Game'));
        const exe = findLauncher(dir);
        expect = expect.filter((x) => x !== want);
        send('watch-found', { kind: 'game', title: want.title, cover: want.cover, url: want.url, exe, dir, from: file });
      } catch (err) { send('watch-found', { kind: 'error', title: want.title, error: String(err.message || err) }); }
      return;
    }
    if (/\.appimage$/i.test(name)) { try { fs.chmodSync(file, 0o755); } catch { /* read-only */ } }
    send('watch-found', { kind: 'file', file, root, depth: path.relative(root, file).split(path.sep).length - 1, downloads: root === downloadsDir() });
  }, 2500);
  seen.set(key, { t });
}

/* ---------------------------------------------------------------- sound */
const pct = (v) => Math.round(((v && Object.values(v)[0]?.value) || 0) / 655.36);
async function pactl(args) { return run('pactl', args); }
async function soundState() {
  const [sinks, inputs, sources, defSink, defSrc, cards] = await Promise.all([
    pactl(['-f', 'json', 'list', 'sinks']).then(JSON.parse), pactl(['-f', 'json', 'list', 'sink-inputs']).then(JSON.parse),
    pactl(['-f', 'json', 'list', 'sources']).then(JSON.parse), pactl(['get-default-sink']), pactl(['get-default-source']),
    pactl(['-f', 'json', 'list', 'cards']).then(JSON.parse).catch(() => [])]);
  const ds = defSink.trim(), dm = defSrc.trim();
  const appName = (p) => p['application.name'] || p['application.process.binary'] || p['media.name'] || 'App';
  const outputs = sinks.map((s) => {
    const port = (s.ports || []).find((p) => p.name === s.active_port);
    return { name: s.name, label: s.description || s.name, volume: pct(s.volume), mute: s.mute, on: s.name === ds,
      port: port?.description || '', unplugged: port?.availability === 'not available' };
  });
  // Outputs the sound card has but cannot play on in its current setup (a laptop's speaker when
  // the card is set up for headphones): picking one switches the card over first.
  for (const c of cards) {
    const shown = new Set(sinks.filter((s) => s.properties?.['device.name'] === c.name).flatMap((s) => (s.ports || []).map((p) => p.name)));
    for (const [pname, p] of Object.entries(c.ports || {})) {
      if (shown.has(pname) || !/^\[Out\]|output/i.test(pname) || p.availability === 'not available') continue;
      const prof = (p.profiles || []).find((n) => n !== 'pro-audio' && c.profiles?.[n]?.available !== false);
      if (prof) outputs.push({ name: `card:${c.name}\n${pname}`, label: p.description || pname, port: p.description || '', volume: 0, mute: false, on: false, unplugged: false, other: true });
    }
  }
  outputs.sort((a, b) => a.unplugged - b.unplugged);
  return {
    outputs,
    apps: inputs.filter((i) => !/^(speech-dispatcher|libcanberra)/i.test(appName(i.properties))).map((i) => ({ id: i.index, label: appName(i.properties),
      what: i.properties['media.name'] || '', icon: i.properties['application.icon_name'] || '', volume: pct(i.volume), mute: i.mute, bin: i.properties['application.process.binary'] || '' })),
    mic: (() => { const m = sources.find((s) => s.name === dm) || sources.find((s) => !/\.monitor$/.test(s.name)); return m && !/\.monitor$/.test(m.name) ? { name: m.name, label: m.description, volume: pct(m.volume), mute: m.mute } : null; })()
  };
}

// Switch a sound card to the setup that has this output, and return the output's name.
async function useCardPort(card, port) {
  const cards = JSON.parse(await pactl(['-f', 'json', 'list', 'cards']));
  const c = cards.find((x) => x.name === card); const p = c?.ports?.[port];
  const prof = p && (p.profiles || []).find((n) => n !== 'pro-audio' && c.profiles?.[n]?.available !== false);
  if (!prof) throw new Error('That output is not there any more.');
  if (c.active_profile !== prof) await pactl(['set-card-profile', card, prof]);
  for (let i = 0; i < 20; i++) {
    const sinks = JSON.parse(await pactl(['-f', 'json', 'list', 'sinks']));
    const s = sinks.find((x) => x.properties?.['device.name'] === card && (x.ports || []).some((q) => q.name === port));
    if (s) { if (s.active_port !== port) await pactl(['set-sink-port', s.name, port]); return s.name; }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('The sound card did not switch over.');
}

function register({ getWin }) {
  const send = (ch, d) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, d); };

  ipcMain.handle('store-free', wrap(async () => {
    const [e, g, s] = await Promise.all([epic().catch(() => []), gog().catch(() => []), steamF2P().catch(() => [])]);
    if (!e.length && !g.length && !s.length) throw new Error('The stores did not answer. Check the internet connection.');
    return { epic: e, gog: g, steam: s };
  }));

  ipcMain.handle('store-homebrew', wrap(async (_e, { platform = '', q = '', page = 1 } = {}) => {
    const p = new URLSearchParams({ page: String(page), order_by: 'stars', sort: 'desc' });
    if (/^(GB|GBC|GBA)$/.test(platform)) p.set('platform', platform);
    if (q) p.set('q', String(q).slice(0, 60));
    const j = await getJson(`${HH}/api/search?${p}`);
    return { total: j.results, pages: j.page_total, page: j.page_current, games: (j.entries || []).map(hhEntry).filter((e) => e.file && /\.(gbc?|gba)$/i.test(e.fileName)) };
  }));

  // Download one homebrew game into ~/Games/ROMs/<system>/ and return where it went.
  ipcMain.handle('store-get-rom', wrap(async (_e, g) => {
    const u = new URL(String(g.file));
    if (u.origin !== HH || !/\.(gbc?|gba)$/i.test(u.pathname)) throw new Error('Bladedeck only downloads from Homebrew Hub.');
    const dir = romsDir(g.platform); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, path.basename(decodeURIComponent(u.pathname)).replace(/[^\w .()'&!+-]/g, '_'));
    if (fs.existsSync(file)) return { file, dir };
    const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`The download failed (${r.status}).`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 64 << 20) throw new Error('That file is too big to be a Game Boy game.');
    fs.writeFileSync(file, buf);
    return { file, dir };
  }));

  ipcMain.handle('store-paths', () => ({ roms: path.join(os.homedir(), 'Games', 'ROMs'), sep: path.sep, win: process.platform === 'win32',
    flatpak: ['/usr/bin/flatpak', '/usr/local/bin/flatpak'].find((p) => fs.existsSync(p)) || '' }));
  /* Emulators published on GitHub (Xenia Canary): the newest build for this system is downloaded
     into ~/Games/Emulators/<name> and unpacked; the program is found and returned. */
  const GH = {
    shadps4: { repo: 'shadps4-emu/shadPS4', name: 'shadPS4', asset: { linux: /linux-sdl.*\.zip$/i, win32: /win64-sdl.*\.zip$/i }, exe: { linux: /^shadps4.*\.appimage$/i, win32: /^shadps4.*\.exe$/i } },
    unleashed: { repo: 'hedge-dev/UnleashedRecomp', name: 'Unleashed Recompiled', asset: { linux: /Flatpak\.zip$/i, win32: /Windows\.zip$/i }, exe: { linux: /\.flatpak$/i, win32: /^UnleashedRecomp\.exe$/i }, bundle: true },
    opengoal: { repo: 'open-goal/launcher', name: 'OpenGOAL', asset: { linux: /amd64\.AppImage$/i }, exe: { linux: /^OpenGOAL.*\.AppImage$/i } },
    dusklight: { repo: 'TwilitRealm/dusklight', name: 'Dusklight', asset: { linux: /linux-x86_64\.AppImage$/i, win32: /win.*\.zip$/i }, exe: { linux: /^Dusklight.*\.AppImage$/i, win32: /^Dusklight.*\.exe$/i } },
    soh: { repo: 'HarbourMasters/Shipwright', name: 'Ship of Harkinian', asset: { linux: /\.appimage$/i, win32: /win.*\.zip$/i }, exe: { linux: /^soh.*\.appimage$/i, win32: /^soh\.exe$/i } },
    twoship: { repo: '2ship2harkinian/2ship2harkinian', name: '2 Ship 2 Harkinian', asset: { linux: /Linux\.zip$/i, win32: /Win64\.zip$/i }, exe: { linux: /^2ship\.appimage$/i, win32: /^2ship\.exe$/i } },
    zelda64: { repo: 'Zelda64Recomp/Zelda64Recomp', name: 'Zelda 64 Recompiled', asset: { linux: /Linux-X64\.zip$/i, win32: /Windows.*\.zip$/i }, exe: { linux: /^Zelda64Recompiled$/, win32: /^Zelda64Recompiled\.exe$/i } },
    partydeck: { repo: 'partydeck/partydeck', name: 'PartyDeck', asset: { linux: /anylinux-x86_64\.AppImage$/i }, exe: { linux: /^partydeck.*\.AppImage$/i } },
    // RPCS3's own Linux build (the Flathub one is not made by the RPCS3 team, which RPCS3 points out).
    rpcs3: { repo: 'RPCS3/rpcs3-binaries-linux', name: 'RPCS3', asset: { linux: /_linux64\.AppImage$/i }, exe: { linux: /^rpcs3.*\.AppImage$/i } },
    xenia: { repo: 'xenia-canary/xenia-canary-releases', name: 'Xenia Canary', asset: { linux: /linux.*\.tar/i, win32: /windows.*\.zip/i }, exe: { linux: /^xenia_canary$/i, win32: /^xenia_canary\.exe$/i } } };
  const ghDir = (g) => path.join(os.homedir(), 'Games', 'Emulators', g.name);
  const ghFind = (g) => { const want = g.exe[process.platform]; if (!want) return null; const walk = (d, n) => { let it; try { it = fs.readdirSync(d, { withFileTypes: true }); } catch { return null; } for (const x of it) { if (x.isFile() && want.test(x.name)) return path.join(d, x.name); } for (const x of it) if (x.isDirectory() && n < 6) { const f = walk(path.join(d, x.name), n + 1); if (f) return f; } return null; }; return walk(ghDir(g), 0); };
  ipcMain.handle('emu-gh-installed', (_e, id) => { const g = GH[id]; if (!g) return null; const f = ghFind(g); if (f && g.bundle && /\.flatpak$/i.test(f)) return flatpakHas(path.basename(f, '.flatpak')) ? f : null; return f; });
  ipcMain.handle('emu-gh-install', wrap(async (_e, id) => {
    const g = GH[id]; if (!g) throw new Error('Bad request.');
    const have = ghFind(g);
    if (have && g.bundle && /\.flatpak$/i.test(have)) { if (flatpakHas(path.basename(have, '.flatpak'))) return { exe: onPathStore('flatpak') || '/usr/bin/flatpak', args: `run ${path.basename(have, '.flatpak')}`, already: true }; }
    else if (have) return { exe: have, already: true };
    const rel = await getJson(`https://api.github.com/repos/${g.repo}/releases/latest`);
    const asset = (rel.assets || []).find((a) => g.asset[process.platform]?.test(a.name));
    if (!asset) throw new Error(`There is no ${g.name} build for this system.`);
    send('emu-progress', { id: `gh:${id}`, pct: 5 });
    const r = await fetch(asset.browser_download_url, { headers: UA, signal: AbortSignal.timeout(600000) });
    if (!r.ok) throw new Error(`The download failed (${r.status}).`);
    const dest = ghDir(g); fs.mkdirSync(dest, { recursive: true });
    // An AppImage is the program itself: no unpacking.
    if (/\.AppImage$/i.test(asset.name)) {
      const f = path.join(dest, asset.name); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); fs.chmodSync(f, 0o755);
      // Moving from the Flathub RPCS3: the official build reads ~/.config/rpcs3, so point that at the
      // Flathub one's folder (firmware, installed games and saves stay where they are).
      if (id === 'rpcs3') {
        const flat = path.join(os.homedir(), '.var/app/net.rpcs3.RPCS3/config/rpcs3'), own = path.join(os.homedir(), '.config', 'rpcs3');
        try { if (fs.existsSync(flat) && !fs.existsSync(own)) fs.symlinkSync(flat, own); } catch { /* it starts fresh */ }
      }
      return { exe: f, already: false, version: rel.tag_name };
    }
    const tmp = path.join(os.tmpdir(), `bladedeck-${id}-${asset.name.replace(/[^\w.-]/g, '')}`);
    fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
    send('emu-progress', { id: `gh:${id}`, pct: 70 });
    try {
      if (/\.zip$/i.test(tmp)) await run('unzip', ['-o', '-q', tmp, '-d', dest], 300000).catch(() => run('tar', ['-xf', tmp, '-C', dest], 300000));
      else await run('tar', ['-xf', tmp, '-C', dest], 300000);
    } finally { fs.rmSync(tmp, { force: true }); }
    // Some downloads hold another archive (a .tar.gz inside a .zip): open those too.
    if (!ghFind(g)) for (const f of fs.readdirSync(dest)) if (/\.(tar\.gz|tgz|tar\.xz|zip)$/i.test(f)) await run('tar', ['-xf', path.join(dest, f), '-C', dest], 300000).catch(() => {});
    const exe = ghFind(g);
    if (!exe) throw new Error(`${g.name} was downloaded, but its program was not found inside.`);
    // A Flatpak bundle installs for this user and runs through flatpak.
    if (g.bundle && /\.flatpak$/i.test(exe)) {
      const out = await run('flatpak', ['install', '--user', '-y', '--noninteractive', '--bundle', exe], 600000).catch((err) => { throw new Error(`It did not install: ${err.message.split('\n').pop()}`); });
      const appId = (String(out).match(/app\/([\w.-]+)\//) || [])[1] || path.basename(exe, '.flatpak');
      return { exe: onPathStore('flatpak') || '/usr/bin/flatpak', args: `run ${appId}`, already: false, version: rel.tag_name };
    }
    if (process.platform !== 'win32') { try { fs.chmodSync(exe, 0o755); } catch { /* read-only */ } }
    return { exe, already: false, version: rel.tag_name };
  }));
  ipcMain.handle('emu-installed', (_e, ids = [], wins = []) => (process.platform === 'win32'
    ? wins.map((w) => (w && w.hint ? winFind(w.hint, w.exe) : null))
    : ids.map((id) => process.platform === 'linux' && flatpakHas(id))));
  // Windows: winget installs it (Windows may ask for permission), then we find the program.
  ipcMain.handle('emu-install-win', wrap(async (_e, w) => {
    if (process.platform !== 'win32') throw new Error('Bad request.');
    if (!/^[\w-]+\.[\w.-]+$/.test(String(w.id))) throw new Error('Bad request.');
    const have = winFind(w.hint, w.exe); if (have) return { exe: have, already: true };
    await new Promise((res, rej) => {
      let p;
      try { p = spawn('winget', ['install', '--id', w.id, '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'], { windowsHide: true }); }
      catch { rej(new Error('winget is missing. Install "App Installer" from the Microsoft Store.')); return; }
      let tail = '';
      const line = (b) => {
        tail = (tail + b).slice(-2000);
        const m = String(b).match(/([\d.]+)\s*[KMG]B\s*\/\s*([\d.]+)\s*[KMG]B/); if (m) send('emu-progress', { id: w.id, pct: Math.min(99, Math.round(100 * m[1] / m[2])) });
        const q = String(b).match(/(\d{1,3})%/); if (q) send('emu-progress', { id: w.id, pct: +q[1] });
      };
      p.stdout.on('data', line); p.stderr.on('data', line);
      p.on('error', () => rej(new Error('winget is missing. Install "App Installer" from the Microsoft Store.')));
      // 0 is done; -1978335189 means it was already installed.
      p.on('close', (code) => (code === 0 || code === -1978335189 || code === 2316632107 || winFind(w.hint, w.exe) ? res() : rej(new Error((tail.trim().split(/\r?\n/).filter(Boolean).pop() || `winget stopped (${code})`).replace(/[^\x20-\x7e]/g, '').trim()))));
    });
    const exe = winFind(w.hint, w.exe);
    if (!exe) throw new Error('It installed, but Bladedeck could not find the program. Add it in Emulators.');
    return { exe, already: false };
  }));
  // Install from Flathub for this user only, so no password is asked. Progress lines go to the page.
  ipcMain.handle('emu-install', wrap(async (_e, id) => {
    if (!/^[\w-]+(\.[\w-]+){2,}$/.test(String(id))) throw new Error('Bad request.');
    if (process.platform !== 'linux') throw new Error('Installing emulators for you works on Linux. On Windows, use the website button.');
    if (flatpakHas(id)) return { already: true };
    await run('flatpak', ['remote-add', '--user', '--if-not-exists', 'flathub', 'https://dl.flathub.org/repo/flathub.flatpakrepo'], 60000);
    await new Promise((res, rej) => {
      const p = spawn('flatpak', ['install', '--user', '-y', '--noninteractive', 'flathub', id], { stdio: ['ignore', 'pipe', 'pipe'] });
      let tail = '';
      const line = (b) => { tail = (tail + b).slice(-2000); const m = String(b).match(/(\d{1,3})%/g); if (m) send('emu-progress', { id, pct: +m[m.length - 1].replace('%', '') }); };
      p.stdout.on('data', line); p.stderr.on('data', line);
      p.on('error', rej);
      p.on('close', (code) => (code === 0 ? res() : rej(new Error(tail.trim().split('\n').pop() || `flatpak stopped (${code})`))));
    });
    return { already: false };
  }));

  ipcMain.handle('retro-art', wrap(async (_e, { system, title, file }) => {
    if (!/^[\w ,'&.+-]{3,80}$/.test(String(system))) throw new Error('Bad request.');
    const want = norm(title), wantFile = file ? norm(path.basename(String(file)).replace(/\.[^.]+$/, '')) : '';
    const out = {};
    for (const [k, kind] of [['cover', 'Named_Boxarts'], ['title', 'Named_Titles'], ['snap', 'Named_Snaps']]) {
      const names = await libretroIndex(system, kind).catch(() => []);
      const hits = names.filter((n) => norm(n) === want || (wantFile && norm(n) === wantFile));
      const loose = hits.length ? hits : names.filter((n) => { const x = norm(n); return want.length > 3 && (x.startsWith(want) || want.startsWith(x)) && Math.abs(x.length - want.length) < 8; });
      out[k] = loose.sort((a, b) => (REGION.test(b) ? 1 : 0) - (REGION.test(a) ? 1 : 0)).slice(0, 6)
        .map((n) => `${LIBRETRO}/${encodeURIComponent(system)}/${kind}/${encodeURIComponent(n)}`);
    }
    return out;
  }));


  ipcMain.handle('itch-browse', wrap(async (_e, { feed = 'games/free/platform-linux', q = '' } = {}) => {
    if (q) return itchSearch(String(q).slice(0, 80));
    if (!/^games(\/[\w-]+){1,4}$/.test(String(feed))) throw new Error('Bad request.');
    return itchFeed(feed);
  }));
  // The player is about to download this from itch.io; watch for its file.
  ipcMain.handle('itch-expect', (_e, g) => {
    const slug = String(g.url || '').split('/').filter(Boolean).pop() || g.title;
    expect = [...expect.filter((x) => x.url !== g.url), { title: String(g.title).slice(0, 100), cover: g.cover, url: g.url, key: squash(slug), at: Date.now() }];
    expect.push({ ...expect[expect.length - 1], key: squash(g.title) });
    return true;
  });
  ipcMain.handle('classic-get', wrap(async (_e, id, title) => {
    const url = CLASSIC_ZIPS[id]; if (!url) throw new Error('Bad request.');
    const dest = path.join(os.homedir(), 'Games', 'Classics', String(title).replace(/[^\w .'&!-]+/g, '').trim());
    if (fs.existsSync(dest) && fs.readdirSync(dest).length) return { dir: unpackedRoot(dest) };
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(600000) });
    if (!r.ok) throw new Error(`The download failed (${r.status}).`);
    const tmp = path.join(os.tmpdir(), `bladedeck-${id}.zip`);
    fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
    try { return { dir: await unpack(tmp, dest) }; } finally { fs.rmSync(tmp, { force: true }); }
  }));
  ipcMain.handle('watch-set', (_e, dirs = []) => { watchFolders(dirs.filter((d) => typeof d === 'string' && path.isAbsolute(d)), send); return true; });
  ipcMain.handle('watch-defaults', () => [path.join(os.homedir(), 'Games'), downloadsDir()]);

  ipcMain.handle('sound-state', wrap(() => soundGet()));
  ipcMain.handle('sound-set', wrap((_e, o) => soundSetFn(o)));
  ipcMain.handle('sound-follow', wrap((_e, screen) => soundFollow(String(screen || ''))));
  ipcMain.handle('sound-player-sink', wrap((_e, o) => playerSink(o || {})));
}

// The sound card, for the page and for the phone app.
async function soundGet() {
  if (process.platform === 'win32') return require('./winaudio').ask('state', app.getPath('userData'));
  if (process.platform !== 'linux') throw new Error('nosys');
  return soundState();
}
async function soundSetFn({ kind, id, volume, mute } = {}) {
    const v = volume == null ? null : `${Math.max(0, Math.min(150, Math.round(+volume)))}%`;
    const m = mute == null ? null : mute ? '1' : '0';
    const ID = String(id).replace(/[^\w.:@+{}#-]/g, '');
    if (process.platform === 'win32') {
      const W = require('./winaudio'), dir = app.getPath('userData'), vv = volume == null ? '-' : String(Math.max(0, Math.min(100, Math.round(+volume))));
      const cmd = kind === 'output' ? `out|${ID}|${vv}|${m ?? '-'}` : kind === 'mic' ? `mic|${ID}|${vv}|${m ?? '-'}` : kind === 'app' ? `app|${parseInt(id, 10)}|${vv}|${m ?? '-'}` : kind === 'default' ? `default|${ID}` : 'state';
      return W.ask(cmd, dir);
    }
    if (kind === 'output') { if (v) await pactl(['set-sink-volume', ID, v]); if (m) await pactl(['set-sink-mute', ID, m]); }
    else if (kind === 'app') { if (v) await pactl(['set-sink-input-volume', ID, v]); if (m) await pactl(['set-sink-input-mute', ID, m]); }
    else if (kind === 'mic') { if (v) await pactl(['set-source-volume', ID, v]); if (m) await pactl(['set-source-mute', ID, m]); }
    else if (kind === 'default') {
      const raw = String(id);
      const name = raw.startsWith('card:') ? await useCardPort(...raw.slice(5).split('\n')) : ID;
      await pactl(['set-default-sink', name]);
      // Move what is playing now, too, like a console does. PipeWire already moves everything that
      // follows the default; moving it by hand would pin each app to this output for good, so it
      // would stay there after switching back.
      if (!/PipeWire/i.test(await pactl(['info']).catch(() => ''))) {
        const ins = JSON.parse(await pactl(['-f', 'json', 'list', 'sink-inputs']));
        await Promise.all(ins.map((i) => pactl(['move-sink-input', String(i.index), name]).catch(() => {})));
      }
    }
    return soundState();
}

/* Sound follows the screen: a game moved to the TV plays on the TV, and back on the laptop's own
   screen it plays on its speaker (or headphones). The screen is KWin's name for it (HDMI-A-1,
   DP-2, eDP-1). Returns the output's label, or '' when nothing needed to change. */
async function soundFollow(screen) {
  // Windows names a screen's HDMI or DisplayPort sound after the monitor ("SAMSUNG (AMD High
  // Definition Audio Device)"); players.js names screens "Screen 2 (SAMSUNG)".
  if (process.platform === 'win32') {
    const mon = (/\(([^)]+)\)\s*$/.exec(String(screen)) || [])[1]; if (!mon) return '';
    const r = await soundGet(); const outs = (r?.data || r)?.outputs || [];
    const pick = outs.find((o) => !o.unplugged && `${o.label} ${o.port}`.toLowerCase().includes(mon.toLowerCase()));
    if (!pick || pick.on) return '';
    await soundSetFn({ kind: 'default', id: pick.name });
    return pick.label;
  }
  if (process.platform !== 'linux') return '';
  const pick = await outputForScreen(screen);
  if (!pick || pick.on) return '';
  await soundSetFn({ kind: 'default', id: pick.name });
  return pick.port || pick.label;
}
// The output that belongs to a screen (see soundFollow), without switching to it.
async function outputForScreen(screen) {
  const st = await soundState();
  // A controller's speaker is never a screen's.
  const ext = (o) => /hdmi|displayport/i.test(`${o.name} ${o.port} ${o.label}`) || o.name.startsWith('bladedeck_');
  const builtIn = /^(eDP|LVDS|DSI)/i.test(String(screen));
  let pick;
  if (builtIn) pick = st.outputs.find((o) => !ext(o) && !o.unplugged && /headphone/i.test(`${o.port} ${o.label}`)) || st.outputs.find((o) => !ext(o) && !o.unplugged);
  else {
    const plugged = st.outputs.filter((o) => ext(o) && !o.unplugged && !o.name.startsWith('bladedeck_'));
    // HDMI-A-2 with HDMI2 among several; otherwise the one that is connected.
    const n = (String(screen).match(/(\d+)$/) || [])[1];
    pick = (plugged.length > 1 && n && plugged.find((o) => new RegExp(`(HDMI|DisplayPort|DP)\\D*${n}\\b`, 'i').test(`${o.name} ${o.port}`))) || (plugged.length === 1 ? plugged[0] : null);
  }
  return pick || null;
}
/* A real output name for a player's sound: one picked by name, or the screen's own. One that is in
   another setup of its sound card (a laptop speaker) switches the card over first; the other
   outputs of the card (HDMI) stay. */
async function playerSink({ output = '', screen = '' } = {}) {
  if (process.platform !== 'linux') return '';
  const o = output ? (await soundState()).outputs.find((x) => x.name === output) : await outputForScreen(screen);
  if (!o) return '';
  return o.name.startsWith('card:') ? useCardPort(...o.name.slice(5).split('\n')) : o.name;
}

module.exports = { register, romsDir, soundGet, soundSetFn, soundFollow, findLauncher };
