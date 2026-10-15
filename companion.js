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
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.apk': 'application/vnd.android.package-archive' };

let server = null, file = '', data = { devices: [] }, pairing = null, getWin = () => null, loadLib = () => ({ entries: [] });
let pending = new Map(), seq = 0, streams = new Set(), lastState = '';

function load() { try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = { devices: [] }; } data.devices = data.devices || []; }
function persist() { try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch { /* optional */ } }

function addresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ ip: a.address, kind: /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a.address) ? 'Tailscale' : /^(wl|wlan|wifi)/i.test(name) ? 'Wi-Fi' : 'Network' });
  }
  // Tailscale first: it reaches the phone anywhere, and its traffic gets past a firewall that drops
  // everything else coming in (ufw on CachyOS, for one).
  return out.sort((a, b) => (b.kind === 'Tailscale') - (a.kind === 'Tailscale'));
}

/* Whether a firewall drops phones on the home network: ufw running with its default "deny
   incoming" and no rule for this port. Only read, never changed. (Tailscale is let through by
   Tailscale's own rules.) */
function lanBlocked() {
  if (process.platform !== 'linux') return false;
  try {
    if (!fs.existsSync('/etc/ufw/ufw.conf') || !/ENABLED=yes/.test(fs.readFileSync('/etc/ufw/ufw.conf', 'utf8'))) return false;
    const policy = (fs.readFileSync('/etc/default/ufw', 'utf8').match(/DEFAULT_INPUT_POLICY="(\w+)"/) || [])[1] || '';
    if (/ACCEPT/i.test(policy)) return false;
    return !new RegExp(`dport (${PORT}|4761[0-9]:\\d+)`).test(fs.readFileSync('/etc/ufw/user.rules', 'utf8'));
  } catch { return false; }
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

const MAX_UP = 4 * 1024 ** 3;
// A file name a phone sends: the name only (no folders), nothing hidden, no odd characters.
function safeName(n) {
  const b = path.basename(String(n || '')).replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/^\.+/, '').trim().slice(0, 180);
  return b && !/\.part$/i.test(b) ? b : '';
}
// Never overwrite: "photo.jpg" becomes "photo (2).jpg".
function freeName(dir, name) {
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  let to = path.join(dir, name);
  for (let i = 2; fs.existsSync(to) || fs.existsSync(`${to}.part`); i++) to = path.join(dir, `${stem} (${i})${ext}`);
  return to;
}
let alarms = [];
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
    // The Android app itself can be downloaded from here, so a phone needs nothing else to get it.
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...(f.endsWith('.apk') ? { 'Content-Disposition': 'attachment; filename="Bladedeck.apk"' } : {}) });
    return fs.createReadStream(f).pipe(res);
  }
  // Lets the Android app find Bladedecks on the network.
  if (p === '/api/hello') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); return res.end(JSON.stringify({ bladedeck: 1, pc: os.hostname() })); }
  if (p === '/api/pair' && req.method === 'POST') {
    const b = await body(req);
    // Five wrong tries and the code is thrown away, so it cannot be guessed by trying them all.
    if (pairing && String(b.code) !== pairing.code && ++pairing.misses >= 5) pairing = null;
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
    if (!e || !e.cover || !/\.(png|jpe?g|webp)$/i.test(e.cover)) { res.writeHead(404); return res.end(); }
    return stream(req, res, e.cover);
  }
  if (p === '/api/clip') {
    const FA = require('./fsaccess');
    const root = path.join(app.getPath('videos'), 'Bladedeck'), f = path.resolve(String(url.searchParams.get('f') || ''));
    if (!FA.inside(f, root) || FA.real(f) === FA.real(root)) { res.writeHead(403); return res.end(); }
    return stream(req, res, f);
  }
  if (p === '/api/sound') {
    const S = require('./store');
    try { return json(res, 200, req.method === 'POST' ? await S.soundSetFn(await body(req)) : await S.soundGet()); } catch (err) { return json(res, 200, { error: String(err.message || err) }); }
  }
  // A notification the phone forwards (only from apps ticked on the phone): a bubble (phonemsg.js).
  if (req.method === 'POST' && p === '/api/notify') return json(res, 200, require('./phonemsg').receive(dev.name, await body(req)));
  if (req.method === 'POST' && p === '/api/do') {
    const b = await body(req);
    const r = await ask('do', b, 15000);
    return json(res, 200, r || { ok: false });
  }
  if (p === '/api/captures') return json(res, 200, (await ask('captures', {}, 8000)) || []);
  // Files between the phone and the PC. The phone only ever sees Bladedeck/To phone, and what it
  // sends lands in Bladedeck/From phone; nothing else on the PC can be listed, read or written.
  if (p === '/api/files') {
    const FA = require('./fsaccess'), dir = FA.dir('toPhone'); FA.ensure();
    let list = []; try { list = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile() && !d.name.startsWith('.')).map((d) => { const st = fs.statSync(path.join(dir, d.name)); return { name: d.name, size: st.size, at: st.mtimeMs }; }); } catch { /* none */ }
    return json(res, 200, list.sort((a, b) => b.at - a.at));
  }
  if (p === '/api/file') {
    const FA = require('./fsaccess'), dir = FA.dir('toPhone'), name = path.basename(String(url.searchParams.get('name') || ''));
    const f = path.join(dir, name);
    if (!name || name.startsWith('.') || !FA.inside(f, dir) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
    const st = fs.statSync(f);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': st.size, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'no-store' });
    return fs.createReadStream(f).pipe(res);
  }
  if (p === '/api/upload' && req.method === 'POST') {
    const FA = require('./fsaccess'), dir = FA.dir('fromPhone'); FA.ensure();
    const name = safeName(url.searchParams.get('name'));
    const size = +req.headers['content-length'] || 0;
    if (!name) return json(res, 400, { error: 'That file needs a name.' });
    if (size > MAX_UP) return json(res, 413, { error: 'That file is too big (4 GB at most).' });
    const to = freeName(dir, name), part = `${to}.part`;
    const out = fs.createWriteStream(part, { flags: 'wx' });
    let got = 0, bad = false;
    req.on('data', (c) => { got += c.length; if (got > MAX_UP && !bad) { bad = true; req.unpipe(out); out.destroy(); fs.rm(part, { force: true }, () => {}); req.resume(); json(res, 413, { error: 'That file is too big (4 GB at most).' }); } });
    req.pipe(out);
    out.on('finish', () => {
      if (bad || (size && got !== size)) { fs.rm(part, { force: true }, () => {}); if (!res.writableEnded) json(res, 400, { error: 'The file did not arrive whole.' }); return; }
      fs.renameSync(part, to);
      const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('companion-received', { name: path.basename(to), size: got, from: dev.name });
      json(res, 200, { ok: true, name: path.basename(to) });
    });
    req.on('aborted', () => { out.destroy(); fs.rm(part, { force: true }, () => {}); });
    return;
  }
  if (p === '/api/alarms') return json(res, 200, alarms);
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
  // Timers and alarms, for phones to set on themselves; and one going off right now.
  const event = (name, d) => { const str = JSON.stringify(d); for (const r of streams) { try { r.write(`event: ${name}\ndata: ${str}\n\n`); } catch { streams.delete(r); } } };
  ipcMain.on('companion-alarms', (_e, list) => { alarms = (Array.isArray(list) ? list : []).slice(0, 20).map((a) => ({ id: String(a.id), kind: a.kind === 'timer' ? 'timer' : 'alarm', at: +a.at || 0, label: String(a.label || '').slice(0, 80) })); event('alarms', alarms); });
  ipcMain.on('companion-ring', (_e, r) => event('ring', { title: String(r?.title || 'Bladedeck').slice(0, 80), text: String(r?.text || '').slice(0, 200) }));
  // The page only builds its status when a phone is listening.
  ipcMain.handle('companion-listening', () => streams.size > 0);
  ipcMain.handle('companion-info', () => ({ blocked: lanBlocked(), enabled: !!data.enabled, port: PORT, addresses: addresses(), devices: data.devices.map((d) => ({ name: d.name, added: d.added, seen: d.seen, id: d.key.slice(0, 6) })), listeners: streams.size }));
  ipcMain.handle('companion-enable', (_e, on) => { data.enabled = !!on; persist(); if (on) start(); else stop(); return !!server; });
  ipcMain.handle('companion-code', () => {
    pairing = { code: String(crypto.randomInt(0, 1e6)).padStart(6, '0'), until: Date.now() + 10 * 60000, misses: 0 };
    const urls = addresses().map((a) => ({ ...a, url: `http://${a.ip}:${PORT}/` }));
    const qr = require('qrcode-generator')(0, 'M');
    qr.addData(urls[0] ? `${urls[0].url}#pair=${pairing.code}` : ''); qr.make();
    return { code: pairing.code, until: pairing.until, urls, qr: qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true }) };
  });
  // Whether the server answers on each address (from this PC: a firewall can still stop a phone).
  ipcMain.handle('companion-check', () => Promise.all(addresses().map((a) => new Promise((res) => {
    const r = http.get({ host: a.ip, port: PORT, path: '/api/hello', timeout: 3000 }, (x) => { x.resume(); res({ ...a, ok: x.statusCode === 200 }); });
    r.on('error', () => res({ ...a, ok: false })); r.on('timeout', () => { r.destroy(); res({ ...a, ok: false }); });
  }))));
  ipcMain.handle('companion-forget', (_e, id) => { data.devices = data.devices.filter((d) => !d.key.startsWith(String(id))); persist(); return true; });
  app.on('will-quit', stop);
}

module.exports = { register, PORT };
