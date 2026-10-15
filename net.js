'use strict';
/* Net: Bladedecks on the same Tailscale network find each other, show who is online and what
   they are playing, and deliver pokes directly. The server listens only on this machine's
   Tailscale address and only answers Tailscale addresses, so nothing is exposed to the internet. */
const http = require('http');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');

const PORT = 47615;
const VERSION = 1;

// Tailscale hands out addresses in 100.64.0.0/10.
const isTs = (ip) => {
  const m = /^(?:::ffff:)?100\.(\d+)\.\d+\.\d+$/.exec(String(ip || ''));
  return !!m && +m[1] >= 64 && +m[1] <= 127;
};

function myIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && isTs(a.address)) return a.address;
  }
  return null;
}

function cli() {
  if (process.platform !== 'win32') return 'tailscale';
  const p = 'C:\\Program Files\\Tailscale\\tailscale.exe';
  return fs.existsSync(p) ? p : 'tailscale';
}

function status() {
  return new Promise((res) => execFile(cli(), ['status', '--json'], { timeout: 5000, maxBuffer: 8 << 20, windowsHide: true }, (err, out) => {
    if (err) return res(null);
    try { res(JSON.parse(out)); } catch { res(null); }
  }));
}

let server = null, ip = null, onPoke = () => {}, getPresence = () => ({});

function readBody(req, max = 4096) {
  return new Promise((res, rej) => {
    let n = 0; const parts = [];
    req.on('data', (d) => { n += d.length; if (n > max) { rej(new Error('too big')); req.destroy(); } else parts.push(d); });
    req.on('end', () => res(Buffer.concat(parts).toString('utf8')));
    req.on('error', rej);
  });
}

const clip = (v, n) => String(v ?? '').slice(0, n);

function start({ presence, poke }) {
  getPresence = presence; onPoke = poke;
  ip = myIp();
  if (!ip || server) return { ip, port: PORT, ok: !!server };
  server = http.createServer(async (req, res) => {
    const from = req.socket.remoteAddress;
    if (!isTs(from)) { res.writeHead(403).end(); return; }
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    try {
      if (req.method === 'GET' && req.url === '/hello') return send(200, { app: 'bladedeck', version: VERSION, ...getPresence() });
      if (req.method === 'POST' && req.url === '/poke') {
        const b = JSON.parse(await readBody(req));
        onPoke({ from: clip(b.from, 40) || 'Someone', kind: clip(b.kind, 20), game: clip(b.game, 120), text: clip(b.text, 500), appid: clip(b.appid, 12), ip: from.replace('::ffff:', ''), at: Date.now() });
        return send(200, { ok: true });
      }
      send(404, {});
    } catch { send(400, {}); }
  });
  server.on('error', () => { server = null; });
  server.listen(PORT, ip);
  return { ip, port: PORT, ok: true };
}

function request(host, method, pathname, body, timeout = 2000) {
  return new Promise((res) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host, port: PORT, method, path: pathname, timeout, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} }, (r) => {
      let out = ''; r.on('data', (d) => { out += d; if (out.length > 8192) r.destroy(); });
      r.on('end', () => { try { res({ ok: r.statusCode === 200, body: JSON.parse(out || '{}') }); } catch { res({ ok: false }); } });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => res({ ok: false }));
    if (data) req.write(data);
    req.end();
  });
}

// Every online machine on the tailnet, and which of them are running Bladedeck right now.
async function peers() {
  const st = await status();
  if (!st) return { error: myIp() ? 'Tailscale is running but its command line tool did not answer.' : 'Tailscale is not running on this computer.' };
  const list = Object.values(st.Peer || {}).filter((p) => p.Online && (p.TailscaleIPs || []).some(isTs)).map((p) => ({
    ip: p.TailscaleIPs.find(isTs), host: p.HostName, dns: String(p.DNSName || '').replace(/\.$/, ''), os: p.OS
  }));
  await Promise.all(list.map(async (p) => { const r = await request(p.ip, 'GET', '/hello', null, 1500); p.deck = r.ok && r.body.app === 'bladedeck' ? r.body : null; }));
  return { me: { ip: myIp(), host: st.Self?.HostName }, peers: list };
}

const hello = async (host) => { const r = await request(host, 'GET', '/hello', null, 1500); return r.ok && r.body.app === 'bladedeck' ? r.body : null; };
const poke = async (host, body) => (await request(host, 'POST', '/poke', body, 3000)).ok;

function stop() { if (server) { server.close(); server = null; } }

module.exports = { start, stop, peers, hello, poke, myIp, PORT };
