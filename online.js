'use strict';
/* Online extras: artwork from SteamGridDB and Steam's own store art, and RetroAchievements.
   Keys live in the library settings (sgdbKey, raUser, raKey) and never leave this process
   except to the service they belong to. Pictures are saved next to the game's other media. */
const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ART_HOSTS = /^(cdn2\.steamgriddb\.com|cdn\.cloudflare\.steamstatic\.com|shared\.(akamai|cloudflare|fastly)\.steamstatic\.com|cdn\.akamai\.steamstatic\.com|steamcdn-a\.akamaihd\.net|media\.retroachievements\.org|thumbnails\.libretro\.com|hh3\.gbdev\.io|img\.itch\.zone)$/;
const SGDB_PATH = /^(search\/autocomplete\/[^/?#]+|(grids|heroes|logos|icons)\/(game|steam)\/\d+)(\?[\w=&,.%-]*)?$/;
const RA_METHODS = new Set(['GetGameList', 'GetGameInfoAndUserProgress', 'GetUserProfile', 'GetUserRecentlyPlayedGames', 'GetUserSummary']);

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Bladedeck/0.1', ...headers }, signal: AbortSignal.timeout(15000) });
  if (r.status === 401 || r.status === 403) throw new Error('The key was not accepted. Check it in Settings, Accounts.');
  if (!r.ok) throw new Error(`The server said ${r.status}.`);
  return r.json();
}
const wrap = (fn) => async (...a) => { try { return { ok: true, data: await fn(...a) }; } catch (err) { return { ok: false, error: String(err && err.message || err) }; } };

function register({ settings, mediaDir }) {
  ipcMain.handle('sgdb', wrap(async (_e, p) => {
    const key = settings().sgdbKey;
    if (!key) throw new Error('Add your SteamGridDB API key in Settings, Accounts first.');
    if (!SGDB_PATH.test(String(p))) throw new Error('Bad request.');
    const j = await getJson(`https://www.steamgriddb.com/api/v2/${p}`, { Authorization: `Bearer ${key}` });
    if (!j.success) throw new Error((j.errors || ['SteamGridDB had a problem.']).join(' '));
    return j.data;
  }));

  // Several RetroAchievements answers barely change; keep them for a day so menus stay quick.
  const raCache = new Map();
  ipcMain.handle('ra', wrap(async (_e, method, params = {}, fresh) => {
    const st = settings();
    if (!st.raUser || !st.raKey) throw new Error('Add your RetroAchievements name and web API key in Settings, Accounts first.');
    if (!RA_METHODS.has(method)) throw new Error('Bad request.');
    const q = new URLSearchParams({ z: st.raUser, y: st.raKey, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    const url = `https://retroachievements.org/API/API_${method}.php?${q}`;
    const ttl = method === 'GetGameList' ? 86400000 : 60000;
    const hit = raCache.get(url);
    if (!fresh && hit && Date.now() - hit.t < ttl) return hit.data;
    const data = await getJson(url);
    raCache.set(url, { t: Date.now(), data });
    return data;
  }));

  // Download one picture for a game and return where it was saved.
  ipcMain.handle('art-save', wrap(async (_e, id, url, kind) => {
    const u = new URL(String(url));
    if (u.protocol !== 'https:' || !ART_HOSTS.test(u.hostname)) throw new Error('That picture comes from a site Bladedeck does not download from.');
    const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`The picture could not be downloaded (${r.status}).`);
    const type = r.headers.get('content-type') || '';
    const ext = /png/.test(type) ? '.png' : /webp/.test(type) ? '.webp' : /gif/.test(type) ? '.gif' : /bmp/.test(type) ? '.bmp' : '.jpg';
    if (!/^image\//.test(type)) throw new Error('That was not a picture.');
    const buf = Buffer.from(await r.arrayBuffer());
    const dir = mediaDir(id); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${String(kind).replace(/\W/g, '') || 'art'}-${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10)}${ext}`);
    fs.writeFileSync(file, buf);
    return file;
  }));

  // Steam's own store art needs no key. Only the ones that exist are returned.
  ipcMain.handle('steam-art', wrap(async (_e, appid) => {
    const id = String(appid).replace(/\D/g, '');
    const base = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}`;
    const want = [['cover', 'library_600x900_2x.jpg'], ['cover', 'library_600x900.jpg'], ['hero', 'library_hero.jpg'], ['logo', 'logo.png'], ['wide', 'header.jpg']];
    const out = [];
    await Promise.all(want.map(async ([kind, f]) => {
      try { const r = await fetch(`${base}/${f}`, { method: 'HEAD', signal: AbortSignal.timeout(8000) }); if (r.ok) out.push({ kind, url: `${base}/${f}` }); } catch { /* not there */ }
    }));
    // The small cover is the same picture as the big one.
    const big = out.some((a) => a.url.endsWith('library_600x900_2x.jpg'));
    return out.filter((a) => !(big && a.url.endsWith('library_600x900.jpg')))
      .sort((a, b) => want.findIndex((w) => a.url.endsWith(w[1])) - want.findIndex((w) => b.url.endsWith(w[1])));
  }));

  /* Guide: quick answers for the selected game from wikis that need no key. StrategyWiki has
     walkthroughs and boss pages, the game's own Fandom wiki has the rest, PCGamingWiki has fixes
     and settings, and ProtonDB says how well a Steam game runs on Linux. */
  const WIKIS = { sw: 'https://strategywiki.org/w/api.php', pcgw: 'https://www.pcgamingwiki.com/w/api.php' };
  const wikiApi = (src) => WIKIS[src] || (/^fandom:[a-z0-9-]{2,60}$/.test(src) ? `https://${src.slice(7)}.fandom.com/api.php` : null);
  const pageUrl = (src, title) => {
    const t = encodeURIComponent(String(title).replace(/ /g, '_'));
    return src === 'sw' ? `https://strategywiki.org/wiki/${t}` : src === 'pcgw' ? `https://www.pcgamingwiki.com/wiki/${t}` : `https://${src.slice(7)}.fandom.com/wiki/${t}`;
  };
  const plain = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  async function mwSearch(src, q, n = 5) {
    const u = `${wikiApi(src)}?${new URLSearchParams({ action: 'query', list: 'search', srsearch: q, srlimit: n, format: 'json', formatversion: 2, origin: '*' })}`;
    const r = await fetch(u, { headers: { 'User-Agent': 'Bladedeck/0.1' }, signal: AbortSignal.timeout(8000), redirect: 'follow' });
    if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return [];
    const j = await r.json();
    return ((j.query && j.query.search) || []).map((x) => ({ src, title: x.title, snippet: plain(x.snippet), url: pageUrl(src, x.title) }));
  }
  // StrategyWiki keeps a game's guide as subpages: "Celeste/Walkthrough", "Celeste/Bosses".
  const STOP = /^(how|to|do|i|the|a|an|of|in|on|beat|get|best|what|where|is|for|and|guide|tips?)$/i;
  async function swGuides(name, q) {
    const base = (await mwSearch('sw', name, 3)).find((r) => !r.title.includes('/'));
    if (!base) return [];
    const u = `${WIKIS.sw}?${new URLSearchParams({ action: 'query', list: 'allpages', apprefix: `${base.title}/`, aplimit: 60, format: 'json', formatversion: 2 })}`;
    const j = await getJson(u).catch(() => ({}));
    const subs = ((j.query && j.query.allpages) || []).map((x) => x.title).filter((t) => !/Table of Contents$/.test(t));
    const words = q.toLowerCase().split(/\W+/).filter((w) => w && !STOP.test(w));
    const score = (t) => words.filter((w) => t.toLowerCase().includes(w.replace(/e?s$/, ''))).length + (/walkthrough|boss/i.test(t) ? 0.5 : 0);
    const pick = subs.map((t) => [t, score(t)]).filter(([, n]) => !words.length || n >= 1).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
    const out = pick.map((t) => ({ src: 'sw', title: t, snippet: `StrategyWiki guide: ${t.split('/').slice(1).join(' / ')}`, url: pageUrl('sw', t) }));
    return out.length ? out : [{ ...base, snippet: `The full StrategyWiki guide for ${base.title}.` }];
  }
  // PCGamingWiki has one page per game, named after it. Search only when the name is not a page.
  async function pcgwPage(name) {
    const j = await getJson(`${WIKIS.pcgw}?${new URLSearchParams({ action: 'query', titles: name, redirects: 1, format: 'json', formatversion: 2 })}`);
    const pg = j.query && j.query.pages && j.query.pages[0];
    if (pg && !pg.missing && !pg.invalid) return [{ src: 'pcgw', title: pg.title, snippet: 'Fixes, settings and what to tweak on PC.', url: pageUrl('pcgw', pg.title) }];
    return (await mwSearch('pcgw', name, 1)).map((r) => ({ ...r, snippet: 'Fixes, settings and what to tweak on PC.' }));
  }
  // A game's Fandom wiki is usually its name squashed together: eldenring, hollowknight, witcher.
  const fandomOf = new Map();
  async function findFandom(name) {
    if (fandomOf.has(name)) return fandomOf.get(name);
    const base = name.toLowerCase().replace(/[™®©]/g, '').replace(/^the\s+/, '');
    const cands = [...new Set([base, base.split(/[:\-–—]/)[0], base.replace(/\s+\d+$|\s+(i|ii|iii|iv|v)$/, ''), base.split(/\s+/)[0]]
      .map((x) => x.replace(/[^a-z0-9]/g, '')).filter((x) => x.length > 2))].slice(0, 4);
    const found = await Promise.all(cands.map(async (c) => {
      try {
        const r = await fetch(`https://${c}.fandom.com/api.php?action=query&meta=siteinfo&format=json`, { headers: { 'User-Agent': 'Bladedeck/0.1' }, signal: AbortSignal.timeout(6000) });
        return r.ok && new URL(r.url).hostname === `${c}.fandom.com` && /json/.test(r.headers.get('content-type') || '') ? c : null;
      } catch { return null; }
    }));
    const hit = found.find(Boolean) || null;
    fandomOf.set(name, hit);
    return hit;
  }
  ipcMain.handle('guide-search', wrap(async (_e, q = '', game = {}) => {
    q = String(q).slice(0, 120).trim(); const name = String(game.name || '').slice(0, 120).trim();
    const jobs = [];
    if (name) {
      jobs.push(swGuides(name, q).catch(() => []));
      jobs.push(findFandom(name).then((f) => (f ? mwSearch(`fandom:${f}`, q || name, 5) : [])).catch(() => []));
      if (!q || /fix|crash|setting|performance|fps|linux|proton|controller|resolution|save|mod|stutter/i.test(q)) jobs.push(pcgwPage(name).catch(() => []));
    } else if (q) {
      jobs.push(mwSearch('sw', q, 5).catch(() => []));
    }
    const proton = game.appid && process.platform === 'linux' ? fetch(`https://www.protondb.com/api/v1/reports/summaries/${String(game.appid).replace(/\D/g, '')}.json`, { signal: AbortSignal.timeout(6000) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
    const [lists, pdb] = await Promise.all([Promise.all(jobs), proton]);
    // Fandom first (the game's own wiki), then StrategyWiki guides, then PC fixes; fixes first when that is the question.
    const fixy = /fix|crash|setting|performance|fps|linux|proton|stutter|resolution/i.test(q);
    const order = fixy ? { pcgw: 0, fandom: 1, sw: 2 } : { fandom: 0, sw: 1, pcgw: 2 };
    const results = lists.flat().sort((a, b) => order[a.src.split(':')[0]] - order[b.src.split(':')[0]]);
    return { results, proton: pdb && pdb.tier ? { tier: pdb.tier, trending: pdb.trendingTier, reports: pdb.total } : null };
  }));
  ipcMain.handle('guide-page', wrap(async (_e, src, title) => {
    const api = wikiApi(String(src)); if (!api) throw new Error('Bad request.');
    const j = await getJson(`${api}?${new URLSearchParams({ action: 'parse', page: String(title).slice(0, 200), prop: 'text', redirects: 1, disableeditsection: 1, format: 'json', formatversion: 2 })}`);
    if (!j.parse) throw new Error('That page could not be found.');
    return { title: j.parse.title, html: j.parse.text, url: pageUrl(src, j.parse.title) };
  }));
}

module.exports = { register };
