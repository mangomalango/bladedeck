'use strict';
/* Nearby: Bladedecks on the same home network find each other, so people in the same house can
   see who is around, what they are playing, which games they both have, and invite each other to
   play. Each Bladedeck says hello every few seconds by UDP broadcast on port 47617 (its player
   name, what it is playing, its level, and its game titles if the player shares them); invites and
   pokes go straight to that Bladedeck. Nothing leaves the local network, an invite only ever asks
   the person, and "Show me to other Bladedecks" in Settings turns it all off. The game list is
   only sent when "Share my game list" is on (off until you turn it on). Anything received is
   size-limited and trimmed, invites and pokes only count from a Bladedeck that said hello from
   the same address, at most one every 5 seconds, and at most 32 Bladedecks are kept track of. */
const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { ipcMain, net } = require('electron');
const FA = require('./fsaccess');

const PORT = 47617, EVERY = 6000, GONE = 25000, SHARE_PORTS = [47618, 47627];
let sock = null, timer = 0, me = {}, peers = new Map(), send = () => {}, myId = '';
const offers = new Map(); // files others offered us: oid -> where to fetch
const hooks = new Map(); // message kind -> handler, for other features (romsync.js)
const nameOk = (n) => { const b = path.basename(String(n || '')).replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/^\.+/, '').trim().slice(0, 180); return b && !/\.part$/i.test(b) ? b : ''; };

/* Sending a file to one Bladedeck: a tiny web server just for it, on one of ten known ports
   (47618-47627, so a firewall can let exactly those through), that hands
   the file over once, only to that Bladedeck's address and only with the secret in the link,
   and closes after 10 minutes either way. */
function serveOnce(peer, file, onFetch, onSilence) {
  return new Promise((resolve) => {
    let fetched = false;
    const token = crypto.randomBytes(24).toString('hex'), size = fs.statSync(file).size;
    const srv = http.createServer((req, res) => {
      const from = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (from !== peer.addr || req.url !== `/${token}`) { res.writeHead(404); return res.end(); }
      fetched = true; clearTimeout(quiet); onFetch?.();
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': size });
      fs.createReadStream(file).pipe(res);
      res.on('finish', () => { clearTimeout(t); srv.close(); });
    });
    const t = setTimeout(() => srv.close(), 10 * 60000);
    // A minute with no answer: often their firewall dropped the offer, so they never saw a question.
    const quiet = setTimeout(() => { if (!fetched) onSilence?.(); }, 60000);
    // The first free port of the ten (several files can be on offer at once).
    let port = SHARE_PORTS[0];
    srv.on('error', (err) => { if (err.code === 'EADDRINUSE' && port < SHARE_PORTS[1]) srv.listen(++port, '0.0.0.0'); else { clearTimeout(t); resolve(null); } });
    srv.on('listening', () => resolve({ port: srv.address().port, token, size }));
    srv.listen(port, '0.0.0.0');
  });
}

function broadcasts() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if (a.family !== 'IPv4' || a.internal || !a.netmask) continue;
    const ip = a.address.split('.').map(Number), mask = a.netmask.split('.').map(Number);
    out.add(ip.map((b, i) => (b | (~mask[i] & 255))).join('.'));
  }
  return [...out];
}
const tell = () => send('lan-peers', [...peers.values()].map(({ addr, lastAsk, ...p }) => p));

function hello() {
  if (!sock) return;
  const msg = Buffer.from(JSON.stringify({ bd: 1, kind: 'hello', id: myId, ...me }));
  for (const b of broadcasts()) sock.send(msg, PORT, b, () => {});
  let changed = false;
  for (const [id, p] of peers) if (Date.now() - p.seen > GONE) { peers.delete(id); changed = true; }
  if (changed) tell();
}

function start(id) {
  if (sock) return;
  myId = id;
  sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', () => { stop(); });
  sock.on('message', (buf, rinfo) => {
    if (buf.length > 60000) return; // bigger than any real hello
    let m; try { m = JSON.parse(buf.toString()); } catch { return; }
    if (!m || m.bd !== 1 || typeof m.id !== 'string' || m.id.length > 40 || m.id === myId) return;
    if (m.kind === 'hello' && !peers.has(m.id) && peers.size >= 32) return; // a flood of made-up Bladedecks
    if (m.kind === 'hello') {
      const fresh = !peers.has(m.id);
      const prev = peers.get(m.id);
      peers.set(m.id, { lastAsk: prev?.lastAsk || 0, id: m.id, name: String(m.name || 'Player').slice(0, 40), pc: String(m.pc || '').slice(0, 40), playing: m.playing ? { title: String(m.playing.title || '').slice(0, 120), appid: String(m.playing.appid || '').replace(/\D/g, '') } : null,
        level: +m.level || 1, titles: Array.isArray(m.titles) ? m.titles.slice(0, 600).map((t) => String(t).slice(0, 120)) : null, addr: rinfo.address, seen: Date.now() });
      if (fresh) send('lan-event', { kind: 'arrived', name: m.name });
      tell();
    } else if (m.kind === 'offer') {
      // Someone wants to send a file: remember where to fetch it, then ask the person.
      const p = peers.get(m.id);
      if (!p || p.addr !== rinfo.address || Date.now() - (p.lastAsk || 0) < 5000 || offers.size > 20) return;
      p.lastAsk = Date.now();
      const oid = crypto.randomBytes(6).toString('hex');
      const file = { name: nameOk(m.file?.name), size: Math.max(0, +m.file?.size || 0) };
      if (!file.name || !/^[a-f0-9]{48}$/.test(String(m.token)) || !(+m.port > 1024 && +m.port < 65536)) return;
      offers.set(oid, { addr: rinfo.address, port: +m.port, token: String(m.token), file, from: p.name, until: Date.now() + 9 * 60000 });
      send('lan-event', { kind: 'offer', oid, from: p.name, file });
    } else if (m.kind === 'got') {
      const p = peers.get(m.id); if (p && p.addr === rinfo.address) send('lan-event', { kind: 'got', from: p.name, name: String(m.name || '').slice(0, 180) });
    } else if (hooks.has(m.kind)) {
      // Other features' messages (ROM sync): only from a Bladedeck that said hello from that address.
      const p = peers.get(m.id);
      if (p && p.addr === rinfo.address) hooks.get(m.kind)(m, { id: p.id, name: p.name, pc: p.pc, addr: p.addr });
    } else if (m.kind === 'invite' || m.kind === 'poke') {
      // Only from a Bladedeck that said hello from that same address, and not more than one every 5 seconds.
      const p = peers.get(m.id);
      if (!p || p.addr !== rinfo.address || Date.now() - (p.lastAsk || 0) < 5000) return;
      p.lastAsk = Date.now();
      send('lan-event', { kind: m.kind, from: p ? p.name : String(m.name || 'Someone').slice(0, 40), game: m.game ? { title: String(m.game.title || '').slice(0, 120), appid: String(m.game.appid || '').replace(/\D/g, '') } : null });
    }
  });
  sock.bind(PORT, () => { try { sock.setBroadcast(true); } catch { /* not allowed */ } hello(); timer = setInterval(hello, EVERY); });
}
function stop() { clearInterval(timer); timer = 0; if (sock) { try { sock.close(); } catch { /* closed */ } } sock = null; peers.clear(); tell(); }

/* Is this PC's firewall likely to drop other Bladedecks? Then they see us (our hellos go out) but we
   never see them, and a file they offer never asks. On Linux, ufw blocks everything coming in
   unless a rule lets it; its rules file says whether ours is there. Windows asks by itself the
   first time, and firewalld's default home zone is not checked here. */
function firewall() {
  if (process.platform !== 'linux') return null;
  let conf = ''; try { conf = fs.readFileSync('/etc/ufw/ufw.conf', 'utf8'); } catch { return null; }
  if (!/^\s*ENABLED\s*=\s*yes/mi.test(conf)) return null;
  let rules = ''; try { rules = fs.readFileSync('/etc/ufw/user.rules', 'utf8'); } catch { /* not readable: assume no rule */ }
  if (/47617/.test(rules)) return null;
  return { name: 'ufw', fix: 'sudo ufw allow proto udp from 192.168.0.0/16 to any port 47617 && sudo ufw allow proto tcp from 192.168.0.0/16 to any port 47618:47628' };
}

function register({ getWin, dataId }) {
  send = (ch, d) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, d); };
  ipcMain.handle('lan-set', (_e, info) => {
    if (!info || info.enabled === false) { stop(); return false; }
    me = { name: String(info.name || 'Player').slice(0, 40), pc: os.hostname(), playing: info.playing || null, level: +info.level || 1, titles: info.share ? (info.titles || []).slice(0, 600) : null };
    start(dataId());
    return true;
  });
  ipcMain.handle('lan-firewall', () => firewall());
  ipcMain.handle('lan-peers', () => [...peers.values()].map(({ addr, lastAsk, ...p }) => p));
  ipcMain.handle('lan-offer', async (_e, peerId, file) => {
    const p = peers.get(String(peerId)), f = path.resolve(String(file || ''));
    if (!p || !sock) return { ok: false, error: 'They are not around any more.' };
    if (!(FA.allowed(f) || FA.wasPicked(f)) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return { ok: false, error: 'That file is not available.' };
    const s = await serveOnce(p, f, () => send('lan-event', { kind: 'sending', to: p.name, name: path.basename(f) }), () => send('lan-event', { kind: 'unanswered', to: p.name, name: path.basename(f) })); if (!s) return { ok: false, error: 'Could not start sending.' };
    sock.send(Buffer.from(JSON.stringify({ bd: 1, kind: 'offer', id: myId, name: me.name, file: { name: path.basename(f), size: s.size }, port: s.port, token: s.token })), PORT, p.addr, () => {});
    return { ok: true };
  });
  ipcMain.handle('lan-accept', async (_e, oid, yes) => {
    const o = offers.get(String(oid)); offers.delete(String(oid));
    if (!o || !yes) return { ok: false };
    if (Date.now() > o.until) return { ok: false, error: 'That offer ran out. Ask them to send it again.' };
    FA.ensure();
    const name = nameOk(o.file.name); if (!name) return { ok: false, error: 'That file has a strange name.' };
    const dir = FA.dir('fromFriends'), ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
    let to = path.join(dir, name); for (let i = 2; fs.existsSync(to); i++) to = path.join(dir, `${stem} (${i})${ext}`);
    const part = `${to}.part`;
    try {
      const r = await net.fetch(`http://${o.addr}:${o.port}/${o.token}`);
      if (!r.ok) return { ok: false, error: 'They stopped sending it.' };
      const out = fs.createWriteStream(part); const reader = r.body.getReader(); let got = 0, last = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        got += value.length;
        if (got > o.file.size) { reader.cancel(); out.destroy(); fs.rmSync(part, { force: true }); return { ok: false, error: 'The file was bigger than they said, so it was stopped.' }; }
        out.write(Buffer.from(value));
        const pct = Math.round(100 * got / (o.file.size || 1)); if (pct !== last) { last = pct; send('lan-event', { kind: 'progress', oid, pct }); }
      }
      await new Promise((res) => out.end(res));
      if (got !== o.file.size) { fs.rmSync(part, { force: true }); return { ok: false, error: 'The file did not arrive whole.' }; }
      fs.renameSync(part, to);
      const p = [...peers.values()].find((x) => x.addr === o.addr);
      if (p && sock) sock.send(Buffer.from(JSON.stringify({ bd: 1, kind: 'got', id: myId, name: path.basename(to) })), PORT, p.addr, () => {});
      return { ok: true, name: path.basename(to), path: to };
    } catch (err) { fs.rmSync(part, { force: true }); return { ok: false, error: 'The file could not be received.' }; }
  });
  ipcMain.handle('lan-send', (_e, peerId, msg) => {
    const p = peers.get(String(peerId)); if (!p || !sock) return false;
    const kind = msg && msg.kind === 'invite' ? 'invite' : 'poke';
    sock.send(Buffer.from(JSON.stringify({ bd: 1, kind, id: myId, name: me.name, game: kind === 'invite' ? msg.game : null })), PORT, p.addr, () => {});
    return true;
  });
}

// For other features: a Bladedeck around now (with its address), a message to one, and messages of a kind.
const peer = (id) => { const p = peers.get(String(id)); return p ? { id: p.id, name: p.name, pc: p.pc, addr: p.addr } : null; };
function sendTo(id, msg) { const p = peers.get(String(id)); if (!p || !sock) return false; sock.send(Buffer.from(JSON.stringify({ ...msg, bd: 1, id: myId, name: me.name })), PORT, p.addr, () => {}); return true; }
const on = (kind, fn) => hooks.set(kind, fn);

module.exports = { register, stop, peer, sendTo, on, myId: () => myId, newId: () => crypto.randomBytes(8).toString('hex') };
