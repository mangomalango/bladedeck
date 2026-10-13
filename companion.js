'use strict';
/* Companion: Bladedeck on your phone. A small web server on the home network (and Tailscale)
   serves the phone app (companion/), and the app talks to Bladedeck through it:
     what is playing and running, your library to launch from, a remote (d-pad, A/B/X/Y, typing),
     recording and clips, the sound card, the walkthrough window, and your profile.
   Nobody gets in without pairing: Bladedeck shows a 6-digit code (and a QR code) that works for
   ten minutes; a phone that enters it gets its own key, kept in companion.json and removable from
   Bladedeck. Every request except the app itself and pairing needs that key.
   The page side lives in renderer/companion.js; this file asks it for state and hands it actions. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { ipcMain, app } = require('electron');

const PORT = 47616;
const STATIC = path.join(__dirname, 'companion');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

let server = null, file = '', data = { devices: [] }, pairing = null, getWin = () => null, loadLib = () => ({ entries: [] });
let pending = new Map(), seq = 0, streams = new Set(), lastState = '';

function load() { try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = { devices: [] }; } data.devices = data.devices || []; }
function persist() { try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch { /* optional */ } }

function addresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ ip: a.address, kind: /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a.address) ? 'Tailscale' : /^(wl|wlan|wifi)/i.test(name) ? 'Wi-Fi' : 'Network' });
  }
  return out.sort((a, b) => (a.kind === 'Tailscale') - (b.kind === 'Tailscale'));
}

// Ask the page for something and wait for its answer.
function ask(cmd, args = {}, timeout = 4000) {
  const w = getWin(); if (!w || w.isDestroyed()) return Promise.resolve(null);
  const id = ++seq;
  return new Promise((res) => {
    const t = setTimeout(() => { pending.delete(id); res(null); }, timeout);
    pending.set(id, (v) => { clearTimeout(t); res(v); });
    w.webContents.send('companion-cmd', { id, cmd, args });
  });
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
function body(req) {
  return new Promise((res) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e5) req.destroy(); }); req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch { res({}); } }); });
}
function authed(req) {
  const h = String(req.headers.authorization || ''), q = new URL(req.url, 'http://x').searchParams.get('key') || '';
  const key = h.startsWith('Bearer ') ? h.slice(7) : q;
  const d = key && data.devices.find((x) => x.key === key);
  if (d) d.seen = Date.now();
  return d || null;
}

// Clips stream with range requests, so phones can seek in them.
function stream(req, res, f) {
  let st; try { st = fs.statSync(f); } catch { res.writeHead(404); return res.end(); }
  const type = /\.webm$/i.test(f) ? 'video/webm' : /\.mp4$/i.test(f) ? 'video/mp4' : /\.mkv$/i.test(f) ? 'video/x-matroska' : /\.png$/i.test(f) ? 'image/png' : /\.webp$/i.test(f) ? 'image/webp' : 'image/jpeg';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? +range[1] : 0, end = range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    fs.createReadStream(f, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' });
    fs.createReadStream(f).pipe(res);
  }
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  // The app itself, for anyone on the network: it does nothing until paired.
  if (!p.startsWith('/api/')) {
    const rel = p === '/' ? 'index.html' : p.slice(1);
    const f = path.resolve(STATIC, rel);
    if (!f.startsWith(STATIC + path.sep) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    return fs.createReadStream(f).pipe(res);
  }
  // Lets the Android app find Bladedecks on the network.
  if (p === '/api/hello') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); return res.end(JSON.stringify({ bladedeck: 1, pc: os.hostname() })); }
  if (p === '/api/pair' && req.method === 'POST') {
    const b = await body(req);
    if (!pairing || Date.now() > pairing.until || String(b.code) !== pairing.code) { await new Promise((r) => setTimeout(r, 800)); return json(res, 403, { error: 'That code is not right, or it ran out. Open Phone app in Bladedeck for a new one.' }); }
    const dev = { key: crypto.randomBytes(24).toString('base64url'), name: String(b.name || 'Phone').slice(0, 40), added: Date.now(), seen: Date.now() };
    data.devices.push(dev); persist(); pairing = null;
    const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('companion-paired', { name: dev.name });
    return json(res, 200, { key: dev.key, pc: os.hostname() });
  }
  const dev = authed(req);
  if (!dev) return json(res, 401, { error: 'Not paired' });

  if (p === '/api/state') return json(res, 200, (await ask('state')) || { offline: true });
  if (p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(`data: ${lastState || '{}'}\n\n`);
    streams.add(res); req.on('close', () => streams.delete(res));
    return;
  }
  if (p === '/api/library') {
    const lib = loadLib();
    return json(res, 200, lib.entries.filter((e) => !e.hidden && !e.emuApp).map((e) => ({ id: e.id, title: e.title, type: e.type, system: e.system || '', playtime: e.playtime || 0, favorite: !!e.favorite, last: e.lastPlayed || 0, art: !!e.cover, goal: e.goal || '' })));
  }
  if (p === '/api/art') {
    const e = loadLib().entries.find((x) => x.id === url.searchParams.get('id'));
    if (!e || !e.cover) { res.writeHead(404); return res.end(); }
    return stream(req, res, e.cover);
  }
  if (p === '/api/clip') {
    const root = path.join(app.getPath('videos'), 'Bladedeck'), f = path.resolve(String(url.searchParams.get('f') || ''));
    if (!f.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    return stream(req, res, f);
  }
  if (p === '/api/sound') {
    const S = require('./store');
    try { return json(res, 200, req.method === 'POST' ? await S.soundSetFn(await body(req)) : await S.soundGet()); } catch (err) { return json(res, 200, { error: String(err.message || err) }); }
  }
  if (req.method === 'POST' && p === '/api/do') {
    const b = await body(req);
    const r = await ask('do', b, 15000);
    return json(res, 200, r || { ok: false });
  }
  if (p === '/api/captures') return json(res, 200, (await ask('captures', {}, 8000)) || []);
  json(res, 404, { error: 'Unknown' });
}

function start() {
  if (server) return true;
  server = http.createServer((req, res) => { handle(req, res).catch(() => { try { json(res, 500, { error: 'Something went wrong' }); } catch { /* closed */ } }); });
  server.on('error', () => { server = null; });
  server.listen(PORT, '0.0.0.0');
  return true;
}
function stop() { if (server) { server.close(); server = null; } for (const r of streams) { try { r.end(); } catch { /* gone */ } } streams.clear(); }

function register({ getWin: gw, loadLib: ll }) {
  getWin = gw; loadLib = ll;
  file = path.join(app.getPath('userData'), 'companion.json');
  load();
  if (data.enabled) app.whenReady().then(start);
  ipcMain.on('companion-reply', (_e, { id, value }) => { const f = pending.get(id); if (f) { pending.delete(id); f(value); } });
  // The page pushes its state; phones listening get it straight away.
  ipcMain.on('companion-state', (_e, s) => {
    const str = JSON.stringify(s);
    if (str === lastState) return;
    lastState = str;
    for (const r of streams) { try { r.write(`data: ${str}\n\n`); } catch { streams.delete(r); } }
  });
  // The page only builds its status when a phone is listening.
  ipcMain.handle('companion-listening', () => streams.size > 0);
  ipcMain.handle('companion-info', () => ({ enabled: !!data.enabled, port: PORT, addresses: addresses(), devices: data.devices.map((d) => ({ name: d.name, added: d.added, seen: d.seen, id: d.key.slice(0, 6) })), listeners: streams.size }));
  ipcMain.handle('companion-enable', (_e, on) => { data.enabled = !!on; persist(); if (on) start(); else stop(); return !!server; });
  ipcMain.handle('companion-code', () => {
    pairing = { code: String(crypto.randomInt(0, 1e6)).padStart(6, '0'), until: Date.now() + 10 * 60000 };
    const urls = addresses().map((a) => ({ ...a, url: `http://${a.ip}:${PORT}/` }));
    const qr = require('qrcode-generator')(0, 'M');
    qr.addData(urls[0] ? `${urls[0].url}#pair=${pairing.code}` : ''); qr.make();
    return { code: pairing.code, until: pairing.until, urls, qr: qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true }) };
  });
  ipcMain.handle('companion-forget', (_e, id) => { data.devices = data.devices.filter((d) => !d.key.startsWith(String(id))); persist(); return true; });
  app.on('will-quit', stop);
}

module.exports = { register, PORT };
