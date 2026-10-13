'use strict';
/* Nearby: Bladedecks on the same home network find each other, so people in the same house can
   see who is around, what they are playing, which games they both have, and invite each other to
   play. Each Bladedeck says hello every few seconds by UDP broadcast on port 47617 (its player
   name, what it is playing, its level, and its game titles if the player shares them); invites and
   pokes go straight to that Bladedeck. Nothing leaves the local network, an invite only ever asks
   the person, and "Show me to other Bladedecks" in Settings turns it all off. */
const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');
const { ipcMain } = require('electron');

const PORT = 47617, EVERY = 6000, GONE = 25000;
let sock = null, timer = 0, me = {}, peers = new Map(), send = () => {}, myId = '';

function broadcasts() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if (a.family !== 'IPv4' || a.internal || !a.netmask) continue;
    const ip = a.address.split('.').map(Number), mask = a.netmask.split('.').map(Number);
    out.add(ip.map((b, i) => (b | (~mask[i] & 255))).join('.'));
  }
  return [...out];
}
const tell = () => send('lan-peers', [...peers.values()].map(({ addr, ...p }) => p));

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
    let m; try { m = JSON.parse(buf.toString()); } catch { return; }
    if (!m || m.bd !== 1 || m.id === myId) return;
    if (m.kind === 'hello') {
      const fresh = !peers.has(m.id);
      peers.set(m.id, { id: m.id, name: String(m.name || 'Player').slice(0, 40), pc: String(m.pc || '').slice(0, 40), playing: m.playing ? { title: String(m.playing.title || '').slice(0, 120), appid: String(m.playing.appid || '').replace(/\D/g, '') } : null,
        level: +m.level || 1, titles: Array.isArray(m.titles) ? m.titles.slice(0, 600).map((t) => String(t).slice(0, 120)) : null, addr: rinfo.address, seen: Date.now() });
      if (fresh) send('lan-event', { kind: 'arrived', name: m.name });
      tell();
    } else if (m.kind === 'invite' || m.kind === 'poke') {
      const p = peers.get(m.id);
      send('lan-event', { kind: m.kind, from: p ? p.name : String(m.name || 'Someone').slice(0, 40), game: m.game ? { title: String(m.game.title || '').slice(0, 120), appid: String(m.game.appid || '').replace(/\D/g, '') } : null });
    }
  });
  sock.bind(PORT, () => { try { sock.setBroadcast(true); } catch { /* not allowed */ } hello(); timer = setInterval(hello, EVERY); });
}
function stop() { clearInterval(timer); timer = 0; if (sock) { try { sock.close(); } catch { /* closed */ } } sock = null; peers.clear(); tell(); }

function register({ getWin, dataId }) {
  send = (ch, d) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, d); };
  ipcMain.handle('lan-set', (_e, info) => {
    if (!info || info.enabled === false) { stop(); return false; }
    me = { name: String(info.name || 'Player').slice(0, 40), pc: os.hostname(), playing: info.playing || null, level: +info.level || 1, titles: info.share ? (info.titles || []).slice(0, 600) : null };
    start(dataId());
    return true;
  });
  ipcMain.handle('lan-peers', () => [...peers.values()].map(({ addr, ...p }) => p));
  ipcMain.handle('lan-send', (_e, peerId, msg) => {
    const p = peers.get(String(peerId)); if (!p || !sock) return false;
    const kind = msg && msg.kind === 'invite' ? 'invite' : 'poke';
    sock.send(Buffer.from(JSON.stringify({ bd: 1, kind, id: myId, name: me.name, game: kind === 'invite' ? msg.game : null })), PORT, p.addr, () => {});
    return true;
  });
}

module.exports = { register, stop, newId: () => crypto.randomBytes(8).toString('hex') };
