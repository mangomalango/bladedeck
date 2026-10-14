'use strict';
/* Real-Debrid: your own Real-Debrid files, brought into Bladedeck. With your API token (from
   real-debrid.com/apitoken while signed in) it lists your torrents and downloads, and downloads the
   ones you pick into ~/Bladedeck/Real-Debrid, where ROMs join the library by themselves.
   It talks only to api.real-debrid.com, and only downloads from Real-Debrid's own servers.
   Real-Debrid's file server is here too: its WebDAV (dav.real-debrid.com), with your Real-Debrid
   name and the separate WebDAV password from your account page, browsed like folders. */
const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const API = 'https://api.real-debrid.com/rest/1.0';
const DL_HOST = /(^|\.)real-debrid\.com$/i;
let getToken = () => '', send = () => {};
const folder = () => path.join(require('./fsaccess').ROOT, 'Real-Debrid');

async function rd(p, opts = {}) {
  const token = getToken(); if (!token) throw new Error('Add your Real-Debrid API token first.');
  const r = await fetch(`${API}${p}`, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
  if (r.status === 401) throw new Error('Real-Debrid did not accept the token. Get a fresh one from real-debrid.com/apitoken.');
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(`Real-Debrid answered ${r.status}.`);
  return r.json();
}
const wrap = (fn) => async (...a) => { try { return { ok: true, data: await fn(...a) } ; } catch (err) { return { ok: false, error: String(err.message || err) }; } };

async function account() {
  const u = await rd('/user');
  return { name: u.username, premium: u.type === 'premium', until: u.expiration || '' };
}
async function list() {
  const [t, d] = await Promise.all([rd('/torrents?limit=100'), rd('/downloads?limit=100')]);
  return {
    torrents: (t || []).filter((x) => x.status === 'downloaded').map((x) => ({ id: x.id, name: x.filename, size: x.bytes, links: (x.links || []).length, added: x.added })),
    downloads: (d || []).map((x) => ({ id: x.id, name: x.filename, size: x.filesize, url: x.download, added: x.generated }))
  };
}
// A finished torrent's files become direct links (unrestrict), one per file.
async function torrentFiles(id) {
  if (!/^[A-Z0-9]+$/i.test(String(id))) throw new Error('Bad request.');
  const info = await rd(`/torrents/info/${id}`);
  const out = [];
  for (const link of info.links || []) {
    const u = await rd('/unrestrict/link', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ link }) });
    out.push({ name: u.filename, size: u.filesize, url: u.download });
  }
  return out;
}

/* -------------------------------------------------------------- the file server (WebDAV) */
const DAV = 'https://dav.real-debrid.com';
let getDav = () => ({ user: '', pass: '' });
const davAuth = () => { const d = getDav(); if (!d.user || !d.pass) throw new Error('Add your Real-Debrid name and WebDAV password first.'); return 'Basic ' + Buffer.from(`${d.user}:${d.pass}`).toString('base64'); };
const davPath = (p) => { const s = '/' + String(p || '').split('/').filter((x) => x && x !== '.' && x !== '..').map(encodeURIComponent).join('/'); return s; };
async function davList(p) {
  const r = await fetch(DAV + davPath(p) + (p ? '/' : ''), { method: 'PROPFIND', headers: { Authorization: davAuth(), Depth: '1', 'Content-Type': 'application/xml' }, signal: AbortSignal.timeout(20000) });
  if (r.status === 401 || r.status === 403) throw new Error('Real-Debrid did not accept that name and WebDAV password (it is a separate password, on your account page).');
  if (!r.ok && r.status !== 207) throw new Error(`The file server answered ${r.status}.`);
  const xml = await r.text(), here = davPath(p);
  const out = [];
  for (const m of xml.matchAll(/<(?:\w+:)?response\b[\s\S]*?<\/(?:\w+:)?response>/gi)) {
    const b = m[0], tag = (t) => ((b.match(new RegExp(`<(?:\\w+:)?${t}[^>]*>([\\s\\S]*?)<\/(?:\\w+:)?${t}>`, 'i')) || [])[1] || '').trim();
    let href = tag('href'); try { href = new URL(href, DAV).pathname; } catch { continue; }
    const dec = decodeURIComponent(href).replace(/\/$/, '');
    if (dec === decodeURIComponent(here).replace(/\/$/, '') || !dec) continue;
    out.push({ name: dec.split('/').pop(), path: dec.replace(/^\//, ''), dir: /<(?:\w+:)?collection\s*\/?>/i.test(b), size: +tag('getcontentlength') || 0 });
  }
  return out.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
}

const going = new Map();
async function download(url, name, auth) {
  let u; try { u = new URL(String(url)); } catch { throw new Error('Bad request.'); }
  if (u.protocol !== 'https:' || !DL_HOST.test(u.hostname)) throw new Error('Bladedeck only downloads from Real-Debrid\'s own servers.');
  const safe = path.basename(String(name || decodeURIComponent(u.pathname.split('/').pop()) || 'download')).replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/^\.+/, '').slice(0, 180) || 'download';
  fs.mkdirSync(folder(), { recursive: true });
  const to = path.join(folder(), safe), part = `${to}.part`;
  if (going.has(to)) throw new Error('That file is already downloading.');
  const ac = new AbortController(); going.set(to, ac);
  try {
    const r = await fetch(u, { signal: ac.signal, headers: auth ? { Authorization: auth } : {} });
    if (!r.ok || !r.body) throw new Error(`The download failed (${r.status}).`);
    const total = +r.headers.get('content-length') || 0;
    const out = fs.createWriteStream(part);
    let got = 0, last = -1;
    for await (const chunk of r.body) {
      got += chunk.length;
      if (!out.write(chunk)) await new Promise((res) => out.once('drain', res));
      const pct = total ? Math.floor(100 * got / total) : 0;
      if (pct !== last) { last = pct; send('rd-progress', { name: safe, pct, got, total }); }
    }
    await new Promise((res) => out.end(res));
    fs.renameSync(part, to);
    send('rd-progress', { name: safe, pct: 100, got, total, done: true, file: to });
    return { file: to };
  } catch (err) { try { fs.rmSync(part, { force: true }); } catch { /* gone */ } throw err; } finally { going.delete(to); }
}

function register({ getWin, settings }) {
  getToken = () => String(settings().rdToken || '').trim();
  getDav = () => ({ user: String(settings().rdDavUser || '').trim(), pass: String(settings().rdDavPass || '') });
  send = (ch, d) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, d); };
  ipcMain.handle('rd-account', wrap(account));
  ipcMain.handle('rd-list', wrap(list));
  ipcMain.handle('rd-files', wrap((_e, id) => torrentFiles(id)));
  ipcMain.handle('rd-get', wrap((_e, url, name) => download(url, name)));
  ipcMain.handle('rd-dav-list', wrap((_e, p) => davList(String(p || ''))));
  ipcMain.handle('rd-dav-get', wrap((_e, p) => { const pp = davPath(p); return download(DAV + pp, decodeURIComponent(pp.split('/').pop()), davAuth()); }));
  ipcMain.handle('rd-stop', () => { for (const ac of going.values()) ac.abort(); return true; });
  ipcMain.handle('rd-folder', () => { fs.mkdirSync(folder(), { recursive: true }); return folder(); });
}

module.exports = { register };
