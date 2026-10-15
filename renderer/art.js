'use strict';
/* Art and achievements.
   Art: pick a cover, background or logo for a game from Steam's store art (Steam games, no key
   needed) and SteamGridDB (any game, with a free key), or fill in every missing cover at once.
   Ach: RetroAchievements progress for emulated games. A game is matched to RetroAchievements by
   its system and title, or by a game ID you set yourself.
   Uses S, api, esc, save, toast, openModal, closeModal, refresh, refreshQuiet, fileUrl, extList and $ at call time. */

const Art = (() => {
  const KINDS = [['cover', 'Covers'], ['hero', 'Backgrounds'], ['logo', 'Logos']];

  // The libretro thumbnail folder for an emulated game, from its system name or its file type.
  const LIBRETRO_SYS = [
    [/super nintendo|snes|super famicom|\.(sfc|smc)$/, 'Nintendo - Super Nintendo Entertainment System'], [/game ?boy advance|\bgba\b|\.gba$/, 'Nintendo - Game Boy Advance'],
    [/game ?boy colou?r|\bgbc\b|\.gbc$/, 'Nintendo - Game Boy Color'], [/game ?boy|\.gb$/, 'Nintendo - Game Boy'], [/nintendo 64|\bn64\b|\.(n64|z64|v64)$/, 'Nintendo - Nintendo 64'],
    [/nintendo ds|\bnds\b|\.nds$/, 'Nintendo - Nintendo DS'], [/3ds|\.(3ds|cci|cxi)$/, 'Nintendo - Nintendo 3DS'], [/gamecube|\.(gcm|rvz|ciso)$/, 'Nintendo - GameCube'], [/\bwii\b(?! u)|\.wbfs$/, 'Nintendo - Wii'],
    [/\bnes\b|famicom|nintendo entertainment|\.nes$/, 'Nintendo - Nintendo Entertainment System'], [/switch|\.(nsp|xci)$/, 'Nintendo - Nintendo Switch'],
    [/playstation 2|\bps2\b/, 'Sony - PlayStation 2'], [/playstation 3|\bps3\b/, 'Sony - PlayStation 3'], [/\bpsp\b|playstation portable/, 'Sony - PlayStation Portable'], [/playstation|\bpsx?\b|\.(cue|pbp)$/, 'Sony - PlayStation'],
    [/genesis|mega ?drive|\.(md|gen)$/, 'Sega - Mega Drive - Genesis'], [/master system|\.sms$/, 'Sega - Master System - Mark III'], [/game ?gear|\.gg$/, 'Sega - Game Gear'],
    [/saturn/, 'Sega - Saturn'], [/dreamcast|\.(cdi|gdi)$/, 'Sega - Dreamcast'], [/sega cd|mega cd/, 'Sega - Mega-CD - Sega CD'], [/32x/, 'Sega - 32X'],
    [/xbox/, 'Microsoft - Xbox'], [/atari 2600|\.a26$/, 'Atari - 2600'], [/pc engine|turbografx|\.pce$/, 'NEC - PC Engine - TurboGrafx 16'], [/neo ?geo/, 'SNK - Neo Geo'], [/arcade|mame/, 'MAME']
  ];
  function retroSystem(e) {
    const em = S.lib.emulators.find((x) => x.id === e.emulatorId);
    // The game's own system first, then its file type, then whatever its emulator plays.
    const hit = (t) => LIBRETRO_SYS.find(([re]) => re.test(String(t || '').toLowerCase()));
    return (hit(e.system) || hit(e.rom) || hit(em?.system) || [])[1];
  }

  /* Of SteamGridDB's matches, the one with exactly this name, from the years its console was
     sold (Crackdown on Xbox 360 is the 2007 game, not the 1989 arcade one). Else its first. */
  const ERA = [[/xbox 360/, 2005, 2017], [/playstation 3|\bps3\b/, 2006, 2018], [/playstation 2|\bps2\b/, 2000, 2014], [/\bwii u\b/, 2012, 2018], [/\bwii\b/, 2006, 2014],
    [/gamecube/, 2001, 2008], [/\bxbox\b/, 2001, 2009], [/playstation 4|\bps4\b/, 2013, 2025], [/\bpsp\b/, 2004, 2015], [/switch/, 2017, 2030], [/nintendo ds|\bnds\b/, 2004, 2014], [/3ds/, 2011, 2020]];
  function bestMatch(e, list) {
    const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const era = e.type === 'rom' && ERA.find(([re]) => re.test(String(e.system || '').toLowerCase()));
    const year = (m) => (m.release_date ? new Date(m.release_date * 1000).getFullYear() : 0);
    const fits = (m) => !era || !year(m) || (year(m) >= era[1] && year(m) <= era[2]);
    const same = list.filter((m) => norm(m.name) === norm(e.title));
    return same.find(fits) || list.find(fits) || same[0] || list[0];
  }
  async function sources(e, game) {
    const out = { cover: [], hero: [], logo: [] }, notes = [];
    if (e.type === 'steam' && e.appid) {
      const r = await api.steamArt(e.appid);
      if (r.ok) for (const a of r.data) if (out[a.kind]) out[a.kind].push({ url: a.url, thumb: a.url, from: 'Steam' });
    }
    if (e.type === 'rom' && retroSystem(e)) {
      const r = await api.retroArt({ system: retroSystem(e), title: e.title, file: e.rom });
      if (r.ok) {
        out.cover.push(...r.data.cover.map((url) => ({ url, thumb: url, from: 'libretro' })));
        out.hero.push(...[...r.data.snap, ...r.data.title].map((url) => ({ url, thumb: url, from: 'libretro' })));
      }
    }
    if (!S.lib.settings.sgdbKey) { notes.push('Add a free SteamGridDB key in Settings, Accounts to see hundreds more.'); return { out, notes, matches: [] }; }
    let base = e.type === 'steam' && e.appid && !game ? `steam/${e.appid}` : null, matches = [];
    if (!base) {
      const r = await api.sgdb(`search/autocomplete/${encodeURIComponent(e.title)}`);
      if (!r.ok) { notes.push(r.error); return { out, notes, matches }; }
      matches = r.data.slice(0, 8);
      const g = game ? matches.find((m) => m.id === game) || { id: game } : bestMatch(e, matches);
      if (!g) { notes.push(`SteamGridDB has nothing called "${e.title}".`); return { out, notes, matches }; }
      base = `game/${g.id}`;
    }
    const [grids, heroes, logos] = await Promise.all([
      api.sgdb(`grids/${base}?dimensions=600x900,342x482,660x930`), api.sgdb(`heroes/${base}`), api.sgdb(`logos/${base}`)]);
    const add = (k, r) => { if (r.ok) out[k].push(...r.data.slice(0, 24).map((a) => ({ url: a.url, thumb: a.thumb || a.url, from: 'SteamGridDB' }))); else notes.push(r.error); };
    add('cover', grids); add('hero', heroes); add('logo', logos);
    return { out, notes: [...new Set(notes)], matches };
  }

  async function open(e) {
    if (!e || e.run) return;
    let game = null, tab = 'cover', found = null;
    const root = openModal({ title: `Artwork for ${e.title}`, wide: true, html: '<div class="art-body"><p class="note">Looking for pictures…</p></div>', buttons: [{ label: 'Done' }] });
    const body = $('.art-body', root);
    async function load() {
      body.innerHTML = '<p class="note">Looking for pictures…</p>';
      found = await sources(e, game);
      if (!S.modal || !body.isConnected) return;
      draw();
    }
    function draw() {
      const { out, notes, matches } = found;
      body.innerHTML = `
        ${matches.length > 1 ? `<label>SteamGridDB game<select name="sgGame">${matches.map((m) => `<option value="${m.id}" ${m.id === (game || matches[0].id) ? 'selected' : ''}>${esc(m.name)}${m.release_date ? ` (${new Date(m.release_date * 1000).getFullYear()})` : ''}</option>`).join('')}</select></label>` : ''}
        <div class="art-tabs">${KINDS.map(([k, n]) => `<button type="button" data-tab="${k}" class="${k === tab ? 'primary' : ''}">${n} (${out[k].length})</button>`).join('')}</div>
        <div class="art-grid ${tab}">${out[tab].map((a, i) => `<button type="button" class="art-pick" data-i="${i}" title="From ${esc(a.from)}"><img src="${esc(a.thumb)}" loading="lazy" alt=""></button>`).join('') || '<p class="note">None found.</p>'}</div>
        ${notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')}
        <p class="note">${tab === 'cover' ? 'Covers show in the menus.' : tab === 'hero' ? 'Backgrounds play behind the game when it is selected, and the Game theme is built from them.' : 'Logos show on the Game theme.'}</p>`;
    }
    body.addEventListener('change', (ev) => { if (ev.target.name === 'sgGame') { game = +ev.target.value; load(); } });
    body.addEventListener('click', async (ev) => {
      const t = ev.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; draw(); return; }
      const p = ev.target.closest('.art-pick'); if (!p) return;
      const a = found.out[tab][+p.dataset.i];
      p.classList.add('saving');
      const r = await api.artSave(e.id, a.url, tab);
      p.classList.remove('saving');
      if (!r.ok) { toast(r.error, 'err'); return; }
      use(e, tab, r.data);
      $$('.art-pick.on', body).forEach((x) => x.classList.remove('on')); p.classList.add('on');
      toast(tab === 'cover' ? 'New cover set.' : tab === 'hero' ? 'Background added.' : 'Logo set.');
    });
    load();
  }

  function use(e, kind, file) {
    if (kind === 'cover') e.cover = file;
    if (kind === 'logo') e.logo = file;
    if (kind === 'hero') {
      e.hero = file;
      e.media = (e.media || []).filter((m) => m.src !== 'hero');
      e.media.unshift({ path: file, kind: 'image', src: 'hero', at: Date.now() });
    }
    save(); Showcase.reset?.(); refresh(e.id);
  }

  // One pass over the library: every game without a cover (or background) gets the first good one.
  async function fillAll() {
    const todo = S.lib.entries.filter((e) => !e.hidden && (!e.cover || !e.hero) && (e.type === 'steam' || (e.type === 'rom' && retroSystem(e)) || S.lib.settings.sgdbKey));
    if (!todo.length) { toast(S.lib.settings.sgdbKey ? 'Every game already has its art.' : 'Add a SteamGridDB key in Settings, Accounts to find art for non-Steam games.'); return; }
    toast(`Finding art for ${todo.length} game${todo.length === 1 ? '' : 's'}…`);
    let got = 0;
    for (const e of todo) {
      const { out } = await sources(e).catch(() => ({ out: { cover: [], hero: [] } }));
      for (const k of ['cover', 'hero']) {
        if ((k === 'cover' ? e.cover : e.hero) || !out[k][0]) continue;
        const r = await api.artSave(e.id, out[k][0].url, k);
        if (r.ok) { use(e, k, r.data); got++; }
      }
    }
    toast(got ? `Added ${got} picture${got === 1 ? '' : 's'}.` : 'No new pictures found.', got ? 'fun' : 'ok');
  }

  // Art for one new game, quietly: the first cover and background found.
  async function fillOne(e) {
    if (!(e.type === 'steam' || (e.type === 'rom' && retroSystem(e)) || S.lib.settings.sgdbKey)) return;
    const { out } = await sources(e).catch(() => ({ out: { cover: [], hero: [] } }));
    for (const k of ['cover', 'hero']) {
      if ((k === 'cover' ? e.cover : e.hero) || !out[k][0]) continue;
      const r = await api.artSave(e.id, out[k][0].url, k);
      if (r.ok) use(e, k, r.data);
    }
  }

  return { open, fillAll, fillOne, retroSystem };
})();

/* ============================================================ RetroAchievements */
const Ach = (() => {
  const BY_SYSTEM = [[/playstation 2|\bps2\b/, 21], [/\bpsp\b|portable/, 41], [/playstation|\bpsx\b|\bps1\b/, 12], [/gamecube/, 16], [/advance|\bgba\b/, 5],
    [/game ?boy colou?r|\bgbc\b/, 6], [/game ?boy|\bgb\b/, 4], [/\bdsi\b/, 78], [/nintendo ds|\bnds\b/, 18], [/nintendo 64|\bn64\b/, 2], [/super nintendo|super famicom|\bsnes\b/, 3],
    [/\bnes\b|famicom|nintendo entertainment/, 7], [/genesis|mega ?drive/, 1], [/master system/, 11], [/game ?gear/, 15], [/saturn/, 39], [/dreamcast/, 40], [/sega cd|mega cd/, 9], [/32x/, 10],
    [/pc ?engine cd|turbografx.?cd/, 76], [/pc ?engine|turbografx/, 8], [/arcade|mame|fbneo|neo ?geo$/, 27], [/2600/, 25], [/7800/, 51], [/lynx/, 13], [/jaguar/, 17],
    [/neo ?geo pocket/, 14], [/virtual boy/, 28], [/wonder ?swan/, 53], [/3do/, 43], [/msx/, 29], [/pok[eé]mon mini/, 24]];
  const BY_EXT = { nes: 7, fds: 7, sfc: 3, smc: 3, gb: 4, gbc: 6, gba: 5, n64: 2, z64: 2, v64: 2, md: 1, gen: 1, smd: 1, sms: 11, gg: 15, nds: 18, pce: 8, a26: 25, a78: 51, lnx: 13, ngp: 14, ngc: 14, vb: 28, ws: 53, wsc: 53, '32x': 10, min: 24 };
  const BADGE = 'https://media.retroachievements.org/Badge/';

  const on = () => !!(S.lib.settings.raUser && S.lib.settings.raKey);
  // Emulated games use RetroAchievements; Steam games use Steam's own list, read from this PC.
  const fits = (e) => e && (e.type === 'rom' || (e.type === 'steam' && !!e.appid));
  const steamy = (e) => e?.type === 'steam' && !!e.appid;
  function consoleOf(e) {
    const em = S.lib.emulators.find((x) => x.id === e.emulatorId);
    const sys = `${e.system || ''} ${em?.system || ''} ${em?.name || ''}`.toLowerCase();
    for (const [re, id] of BY_SYSTEM) if (re.test(sys)) return id;
    return BY_EXT[String(e.rom || '').split('.').pop().toLowerCase()] || null;
  }
  const norm = (t) => String(t).toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/,\s*the\b/g, ' ').replace(/^the\s+/, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

  async function match(e) {
    if (e.raId) return e.raId;
    const c = consoleOf(e); if (!c) return null;
    const r = await api.ra('GetGameList', { i: c, f: 1 });
    if (!r.ok || !Array.isArray(r.data)) return null;
    const want = norm(e.title);
    const list = r.data.filter((g) => !/^~/.test(g.Title)).map((g) => ({ id: g.ID, n: norm(g.Title) }));
    const hit = list.find((g) => g.n === want) || list.filter((g) => g.n.startsWith(want) || want.startsWith(g.n)).sort((a, b) => a.n.length - b.n.length)[0];
    if (hit) { e.raId = hit.id; save(); }
    return hit ? hit.id : null;
  }

  async function progress(e, fresh) {
    const id = await match(e); if (!id) return null;
    const r = await api.ra('GetGameInfoAndUserProgress', { g: id, u: S.lib.settings.raUser }, fresh);
    return r.ok ? r.data : null;
  }

  // The little line under a game: "🏆 12 of 40".
  async function fill(e, el) {
    if (steamy(e) && el) {
      const s = await api.steamAch(e.appid);
      if (el.isConnected) el.textContent = s && s.total ? `🏆 ${s.got} of ${s.total} achievements` : '';
      return;
    }
    if (!fits(e) || !on() || !el) return;
    const p = await progress(e);
    if (!el.isConnected) return;
    el.textContent = p ? `🏆 ${p.NumAwardedToUser || 0} of ${p.NumAchievements || 0} achievements${p.NumAwardedToUserHardcore ? ` (${p.NumAwardedToUserHardcore} hardcore)` : ''}` : '';
  }

  // Steam's achievements, the way Steam shows them: the icon, coloured when unlocked, grey when not.
  async function openSteam(e) {
    const s = await api.steamAch(e.appid);
    if (!s || !s.total) { toast(`${e.title} has no achievements on this PC yet. Start it once through Steam and they appear.`); return; }
    const list = s.list.slice().sort((a, b) => (b.got - a.got) || (b.time - a.time));
    const when = (t) => new Date(t).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
    openModal({
      title: `Achievements: ${e.title}`, wide: true,
      html: `<div class="ach-body"><div class="ach-head"><img src="${esc(list.find((a) => a.got)?.icon || list[0].icon)}" alt=""><div><b>${esc(e.title)}</b><span>Steam</span>
          <span class="fish-bar"><span style="width:${Math.round((s.got / s.total) * 100)}%"></span></span><span>${s.got} of ${s.total} unlocked · ${Math.round((s.got / s.total) * 100)}%</span></div></div>
        <div class="ach-grid">${list.map((a) => {
          const secret = a.hidden && !a.got;
          return `<div class="ach ${a.got ? 'got' : ''}" title="${esc(secret ? 'Hidden achievement' : a.desc)}"><img src="${esc(a.got ? a.icon : a.iconGray || a.icon)}" alt="" loading="lazy">
            <div><b>${esc(secret ? 'Hidden achievement' : a.title)}</b><span>${esc(secret ? 'Keep playing to find out.' : a.desc)}</span>${a.got && a.time ? `<em>Unlocked ${when(a.time)}</em>` : ''}</div></div>`;
        }).join('')}</div></div>`,
      buttons: [{ label: 'Close', primary: true }]
    });
  }

  async function open(e) {
    if (steamy(e)) { openSteam(e); return; }
    if (!fits(e)) { toast('Achievements are for Steam games and emulated games (RetroAchievements).'); return; }
    if (!on()) { toast('Add your RetroAchievements name and web API key in Settings, Accounts.', 'err'); return; }
    const root = openModal({ title: `Achievements: ${e.title}`, wide: true, html: '<div class="ach-body"><p class="note">Asking RetroAchievements…</p></div>',
      buttons: [{ label: 'Link a different game', left: true, onClick: () => { link(e); return false; } }, { label: 'Close' }] });
    const body = $('.ach-body', root);
    const p = await progress(e, true);
    if (!body.isConnected) return;
    if (!p) { body.innerHTML = `<p class="note">Couldn't match this game on RetroAchievements. Use "Link a different game" and paste its game ID (the number in its retroachievements.org address).</p>`; return; }
    const list = Object.values(p.Achievements || {}).sort((a, b) => (!!b.DateEarned - !!a.DateEarned) || a.DisplayOrder - b.DisplayOrder);
    const got = p.NumAwardedToUser || 0, all = p.NumAchievements || 0;
    body.innerHTML = `<div class="ach-head">${p.ImageIcon ? `<img src="https://media.retroachievements.org${esc(p.ImageIcon)}" alt="">` : ''}<div><b>${esc(p.Title)}</b><span>${esc(p.ConsoleName || '')}</span>
        <span class="fish-bar"><span style="width:${all ? Math.round((got / all) * 100) : 0}%"></span></span><span>${got} of ${all} unlocked · ${esc(p.UserCompletion || '0%')}</span></div></div>
      <div class="ach-grid">${list.map((a) => `<div class="ach ${a.DateEarned ? 'got' : ''}" title="${esc(a.Description)}"><img src="${BADGE}${esc(a.BadgeName)}${a.DateEarned ? '' : '_lock'}.png" alt="" loading="lazy">
        <div><b>${esc(a.Title)}</b><span>${esc(a.Description)}</span><em>${a.Points} points${a.DateEarnedHardcore ? ' · hardcore' : ''}</em></div></div>`).join('') || '<p class="note">This game has no achievements yet.</p>'}</div>`;
  }

  function link(e) {
    closeModal();
    openModal({ title: `RetroAchievements game for ${e.title}`, html: `<label>Game ID (the number at the end of its retroachievements.org/game/ address)<input type="text" name="raId" value="${esc(e.raId || '')}"></label>`,
      buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: (root) => { const v = parseInt(val(root, 'raId'), 10); e.raId = v > 0 ? v : null; save(); setTimeout(() => open(e), 50); } }] });
  }

  async function test() {
    const r = await api.ra('GetUserProfile', { u: S.lib.settings.raUser }, true);
    return r.ok ? `Signed in as ${r.data.User}, ${r.data.TotalPoints ?? 0} points.` : r.error;
  }

  return { fill, open, fits, on, test };
})();

/* ============================================================ the Game theme
   A theme that dresses itself in the selected game: its colours come from the game's art, its
   background is the game's own background picture, and its logo replaces the title when it has one.
   Steam games get their store background fetched automatically the first time. */
const GameTheme = (() => {
  const pal = {}, fetched = {};
  const on = () => !!S.theme?.dynamic;
  const hsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let h = 0; const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [Math.round((h * 60 + 360) % 360), Math.round(s * 100), Math.round(l * 100)];
  };

  async function show(e) {
    if (!on() || !e || e.run) return;
    if (e.type === 'steam' && e.appid && !e.hero && !fetched[e.id]) {
      fetched[e.id] = true;
      const r = await api.steamArt(e.appid);
      const hero = r.ok && r.data.find((a) => a.kind === 'hero');
      if (hero) { const s = await api.artSave(e.id, hero.url, 'hero'); if (s.ok && !e.hero) { e.hero = s.data; e.media = [{ path: s.data, kind: 'image', src: 'hero', at: Date.now() }, ...(e.media || [])]; save(); Showcase.show(e, true); } }
    }
    const art = e.hero || e.cover; if (!art) return;
    const p = pal[art] || (pal[art] = await api.palette(art));
    if (!p || S.sel !== e || !on()) return;
    const [h, s] = hsl(p.vivid), [bh, bs] = hsl(p.base);
    const sat = Math.max(55, s), root = document.documentElement.style;
    root.setProperty('--accent', `hsl(${h} ${sat}% 52%)`);
    root.setProperty('--accent-hi', `hsl(${h} ${sat}% 70%)`);
    root.setProperty('--glass-edge', `hsl(${h} ${sat}% 70% / .45)`);
    root.setProperty('--glass-hi', `hsl(${bh} ${Math.min(60, bs)}% 60% / .22)`);
    root.setProperty('--glass', `hsl(${bh} ${Math.min(50, bs)}% 18% / .45)`);
    root.setProperty('--glass-lo', `hsl(${bh} ${Math.min(50, bs)}% 8% / .7)`);
    root.setProperty('--bg', `radial-gradient(90% 80% at 50% 110%, hsl(${bh} ${Math.min(70, bs)}% 22%), hsl(${bh} ${Math.min(60, bs)}% 7%) 70%)`);
  }
  return { show, on };
})();
