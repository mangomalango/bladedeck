'use strict';
/* Browse your sources, the main-process side: the Internet Archive's own search and file lists
   (its public API, no scraping). Other sources are read by the page in a browser view of its own,
   since they are ordinary websites (see renderer/finder.js). */
const { ipcMain } = require('electron');

const UA = { 'User-Agent': 'Bladedeck/0.1 (game launcher)' };
async function getJson(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`The Internet Archive answered ${r.status}.`);
  return r.json();
}
const ID = /^[\w.-]{1,120}$/;

async function search({ q = '', software = true, page = 1 } = {}) {
  const words = String(q).trim().slice(0, 120);
  if (!words) return { items: [], total: 0 };
  const query = `(${words.replace(/[()]/g, ' ')})${software ? ' AND mediatype:(software)' : ''}`;
  const p = new URLSearchParams({ q: query, rows: '48', page: String(Math.max(1, Math.min(50, +page || 1))), output: 'json' });
  for (const f of ['identifier', 'title', 'creator', 'year', 'downloads', 'item_size', 'collection']) p.append('fl[]', f);
  p.append('sort[]', 'downloads desc');
  const j = await getJson(`https://archive.org/advancedsearch.php?${p}`);
  const docs = j.response?.docs || [];
  return {
    total: j.response?.numFound || 0,
    items: docs.filter((d) => ID.test(d.identifier)).map((d) => ({
      id: d.identifier, title: String(Array.isArray(d.title) ? d.title[0] : d.title || d.identifier).slice(0, 160),
      sub: [d.year, Array.isArray(d.creator) ? d.creator[0] : d.creator].filter(Boolean).join(' · ').slice(0, 120),
      size: +d.item_size || 0, img: `https://archive.org/services/img/${d.identifier}`, url: `https://archive.org/details/${d.identifier}`
    }))
  };
}
// An item's own files (not the ones the Archive makes from them), biggest first.
async function files(id) {
  if (!ID.test(String(id))) throw new Error('Bad request.');
  const j = await getJson(`https://archive.org/metadata/${id}`);
  const skip = /(_meta\.xml|_files\.xml|_meta\.sqlite|_archive\.torrent|__ia_thumb\.jpg|_reviews\.xml)$/i;
  return {
    title: String(j.metadata?.title || id).slice(0, 160),
    restricted: !!(j.metadata?.['access-restricted-item'] || j.is_dark),
    files: (j.files || []).filter((f) => f.source === 'original' && !skip.test(f.name) && !/^history\//.test(f.name))
      .map((f) => ({ name: f.name, size: +f.size || 0, format: f.format || '', url: `https://archive.org/download/${id}/${f.name.split('/').map(encodeURIComponent).join('/')}` }))
      .sort((a, b) => b.size - a.size).slice(0, 300)
  };
}

function register() {
  ipcMain.handle('finder-ia', async (_e, o = {}) => {
    try { return { ok: true, data: o.files ? await files(o.files) : await search(o) }; }
    catch (err) { return { ok: false, error: String(err.message || err) }; }
  });
}
module.exports = { register };
