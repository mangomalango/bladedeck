'use strict';
/* About a game: a few plain lines under its title, what kind of game it is, what its story is
   about, how it plays with other people, and whether it has split screen. Looked up once per game
   and kept (game-info.json in Bladedeck's folder):
   - Steam's store: genres, and its feature list, which says exactly which kinds of multiplayer
     a game has (online co-op, LAN, Shared/Split Screen…). Games not from Steam are matched by name.
   - Wikipedia: the genre and modes from the game's info box, and the first sentence of its
     Gameplay and Plot sections. This is what old console games have.
   Only the title (and a Steam app id) leave the PC. Nothing found is remembered for two weeks;
   a lookup that failed (offline) is tried again after an hour. */
const { ipcMain, app, net } = require('electron');
const fs = require('fs');
const path = require('path');

const KEEP_DAYS = 60, NONE_DAYS = 14;
const file = () => path.join(app.getPath('userData'), 'game-info.json');
let cache = null, saveT = 0;
const load = () => { if (!cache) { try { cache = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { cache = {}; } } return cache; };
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.writeFileSync(file(), JSON.stringify(cache)); } catch { /* optional */ } }, 500); };
const busy = new Map();

const bare = (t) => String(t || '').replace(/\s*[[(][^\])]*[\])]/g, '').replace(/[™®©]/g, '').trim();
const words = (t) => String(t).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
// Is this the same game? Most of the words, and the sequel's number if it has one.
function same(a, b) {
  const x = words(a), y = words(b); if (!x.length || !y.length) return false;
  const hit = x.filter((w) => y.includes(w)).length;
  const nums = (l) => l.filter((w) => /^(\d+|ii|iii|iv|v|vi)$/.test(w)).join(' ');
  return hit / x.length >= 0.75 && hit / y.length >= 0.5 && nums(x) === nums(y);
}
async function json(url) {
  const r = await net.fetch(url, { headers: { 'User-Agent': 'Bladedeck (https://github.com/mangomalango/bladedeck)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* -------------------------------------------------------------- Steam */
async function steam(e) {
  let id = e.type === 'steam' ? String(e.appid || '').replace(/\D/g, '') : '';
  if (!id) {
    const s = await json(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(bare(e.title))}&l=english&cc=US`);
    const hit = (s.items || []).find((x) => x.type === 'app' && same(bare(e.title), x.name));
    if (!hit) return null;
    id = String(hit.id);
  }
  const d = (await json(`https://store.steampowered.com/api/appdetails?appids=${id}&l=english&filters=basic,genres,categories`))?.[id];
  if (!d?.success || !d.data) return null;
  return { genres: (d.data.genres || []).map((g) => g.description), cats: (d.data.categories || []).map((c) => c.description), blurb: d.data.short_description || '' };
}

/* -------------------------------------------------------------- Wikipedia */
// Wiki markup to plain text: templates, references, links and quotes go.
function plain(w) {
  let s = String(w).replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  for (let i = 0; i < 6 && /\{\{[^{}]*\}\}/.test(s); i++) s = s.replace(/\{\{[^{}]*\}\}/g, '');
  // Innermost links first, so a picture's caption (which holds links of its own) goes whole.
  for (let i = 0; i < 6 && /\[\[[^[\]]*\]\]/.test(s); i++) s = s.replace(/\[\[([^[\]]*)\]\]/g, (_m, l) => (/^(File|Image):/i.test(l) ? '' : l.split('|').pop()));
  return s.replace(/\[https?:\S+ ([^\]]*)\]/g, '$1').replace(/'{2,}/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
const firstSentence = (t) => { const m = String(t).match(/^.{20,260}?[.!?](?=\s+[A-Z0-9"'(]|\s*$)/); return (m ? m[0] : String(t).slice(0, 200)).trim(); };
function section(text, names) {
  const re = new RegExp(`^==+\\s*(${names})\\s*==+\\s*$`, 'mi');
  const m = text.match(re); if (!m) return '';
  const rest = text.slice(m.index + m[0].length);
  const body = rest.split(/^==[^=]/m)[0].split(/^===/m)[0];
  return plain(body.split(/\n\s*\n/).find((p) => plain(p).length > 40) || '');
}
// No story section: the opening paragraph often says what it is based on or where it is set.
function leadStory(text) {
  const lead = plain(text.split(/^==/m)[0].replace(/\{\{\s*Infobox[\s\S]*?^\}\}/mi, ''));
  const all = lead.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [];
  return (all.slice(1, 5).find((x) => /based on|follows|set (in|during|after)|takes place|tells|story|plays as|controls? |adapting|adaptation/i.test(x)) || '').trim();
}
async function wiki(e) {
  const t = bare(e.title);
  const s = await json(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${t} video game`)}&format=json&srlimit=5&origin=*`);
  const hit = (s.query?.search || []).find((x) => same(t, x.title.replace(/\s*\((\d{4} )?video game\)$/i, '')));
  if (!hit) return null;
  const p = await json(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(hit.title)}&prop=wikitext&format=json&formatversion=2&redirects=1&origin=*`);
  const text = p.parse?.wikitext || '';
  if (!/\{\{\s*Infobox video game/i.test(text)) return null; // a film or a book of the same name
  const box = (k) => { const m = text.match(new RegExp(`^\\s*\\|\\s*${k}\\s*=\\s*(.*)$`, 'mi')); return m ? plain(m[1].replace(/<br\s*\/?>/gi, ', ')).replace(/^,\s*|,\s*$/g, '') : ''; };
  return {
    genre: box('genre'), modes: box('modes'),
    gameplay: firstSentence(section(text, 'Gameplay')),
    story: firstSentence(section(text, 'Plot|Story|Synopsis|Setting|Premise|Setting and plot|Plot and setting|Story and setting')) || leadStory(text),
    split: /split[- ]?screen/i.test(text), splitNo: /no split[- ]?screen|without split[- ]?screen|lack of split[- ]?screen/i.test(text),
    coop: /\bco-?op(erative)?\b/i.test(text), online: /\bonline\b/i.test(text)
  };
}

/* -------------------------------------------------------------- putting it together */
function describe(st, wk) {
  const out = {};
  const genres = st?.genres?.filter((g) => !/^(Free to Play|Early Access|Indie|Casual)$/.test(g)) || [];
  out.kind = genres.length ? genres.slice(0, 3).join(', ') : wk?.genre || (st?.genres || []).slice(0, 2).join(', ');
  out.story = wk?.story || (st?.blurb ? firstSentence(plain(st.blurb)) : '') || '';
  out.play = wk?.gameplay || '';
  if (st?.cats?.length) {
    const c = new Set(st.cats), has = (x) => c.has(x);
    const local = has('Shared/Split Screen') || has('Shared/Split Screen Co-op') || has('Shared/Split Screen PvP');
    const parts = [];
    if (has('Online Co-op')) parts.push('online co-op'); if (has('Online PvP')) parts.push('online versus');
    if (has('LAN Co-op') || has('LAN PvP')) parts.push('LAN');
    if (has('Shared/Split Screen Co-op')) parts.push('couch co-op'); if (has('Shared/Split Screen PvP')) parts.push('couch versus');
    if (has('MMO')) parts.push('a big shared online world');
    if (!parts.length && (has('Multi-player') || has('Co-op') || has('PvP'))) parts.push('multiplayer');
    out.multi = parts.length ? `${parts.join(', ').replace(/^./, (m) => m.toUpperCase())}${has('Cross-Platform Multiplayer') ? ', across platforms' : ''}${has('Remote Play Together') ? '. Remote Play Together works' : ''}` : 'Single-player only';
    out.split = local ? 'yes' : 'no';
  } else if (wk) {
    const multi = /multi/i.test(wk.modes);
    out.multi = !wk.modes ? '' : multi ? `${wk.modes}${wk.coop ? ', with co-op' : ''}` : 'Single-player only';
    out.split = wk.split && !wk.splitNo ? 'yes' : multi ? 'unknown' : 'no';
  }
  return out.kind || out.story || out.multi ? out : null;
}

async function lookup(e) {
  const [st, wk] = await Promise.all([steam(e).catch((err) => ({ err })), wiki(e).catch((err) => ({ err }))]);
  // Both failing (rather than finding nothing) means offline: ask again later.
  if (st?.err && wk?.err) return { failed: true };
  return describe(st?.err ? null : st, wk?.err ? null : wk);
}

function get(e) {
  if (!e?.id || !bare(e.title) || ['app', 'stream'].includes(e.type) || e.emuApp) return Promise.resolve(null);
  const c = load(), r = c[e.id];
  if (r && r.title === e.title) {
    const age = Date.now() - r.t;
    if (r.info && age < KEEP_DAYS * 864e5) return Promise.resolve(r.info);
    if (!r.info && age < (r.failed ? 36e5 : NONE_DAYS * 864e5)) return Promise.resolve(null);
  }
  if (busy.has(e.id)) return busy.get(e.id);
  const job = lookup(e).then((res) => {
    const info = res && !res.failed ? res : null;
    c[e.id] = { title: e.title, t: Date.now(), info, failed: !!res?.failed }; save();
    return info;
  }).catch(() => null).finally(() => busy.delete(e.id));
  busy.set(e.id, job);
  return job;
}

function register(getSettings) {
  ipcMain.handle('game-info', (_e, entry) => {
    if (getSettings?.().gameInfo === false || !entry) return null;
    return get({ id: String(entry.id || ''), type: entry.type, title: String(entry.title || '').slice(0, 160), appid: entry.appid });
  });
}

module.exports = { register, get };
