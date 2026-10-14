'use strict';
/* ROM sync: your own Bladedecks share their ROMs, so a game added on one PC turns up on the other.
   - Pairing first: one PC asks (over Nearby), the other says yes on screen. Both keep a secret
     made for that pair; every list and file request must carry it, so nobody else on the network
     can take anything.
   - A sync pulls what this PC is missing from the partner (same system, name and size counts as
     having it), then asks the partner to do the same the other way.
   - Space: the drive Bladedeck's home folder is on keeps at least 20 GB, or a tenth of the drive
     if that is more, free after every file. When it cannot take the next file, another drive with
     room is used (a USB or second drive; <drive>/Bladedeck ROMs). When none can, the sync stops
     and says how much it skipped.
   - Synced ROMs land in <folder>/<system>/ and those folders are watched, so they join the
     library under the right emulator by themselves.
   - Games that are a folder (Xbox 360 default.xex, PS3 and PS4 EBOOT.BIN) are not synced: they
     are thousands of files. A .cue or .m3u comes with the files beside it that share its name.
   Files go straight between the two PCs on the home network (HTTP on port 47628). */
const { ipcMain, app, net } = require('electron');
const { execFile } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const LAN = require('./lan');

const PORT = 47628, KEEP_MIN = 20 * 2 ** 30, KEEP_SHARE = 0.1;
const FOLDER_GAME = /^(default\.(xex|xbe)|eboot\.bin)$/i;
let send = () => {}, loadLib = () => ({ entries: [] }), server = null, busy = false, state = null;
const asks = new Map(); // peer id -> secret we offered, waiting for their yes
const file = () => path.join(app.getPath('userData'), 'romsync.json');
const load = () => { if (!state) { try { state = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { state = {}; } state.partners ||= {}; } return state; };
const persist = () => { try { fs.writeFileSync(file(), JSON.stringify(state, null, 2)); } catch { /* optional */ } };
const human = (n) => (n >= 2 ** 30 ? `${(n / 2 ** 30).toFixed(1)} GB` : `${Math.round(n / 2 ** 20)} MB`);
const clean = (s) => String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/^\.+/, '').trim().slice(0, 120) || 'Other';

/* -------------------------------------------------------------- what this PC has */
// One ROM: its file (and the files that belong to it), where it goes on the other side.
function mine() {
  const out = new Map();
  for (const e of loadLib().entries || []) {
    if (e.type !== 'rom' || !e.rom || FOLDER_GAME.test(path.basename(e.rom))) continue;
    let st; try { st = fs.statSync(e.rom); } catch { continue; }
    if (!st.isFile()) continue;
    const dir = path.dirname(e.rom), base = path.basename(e.rom), stem = base.replace(/\.[^.]+$/, '');
    // A cue sheet or playlist brings the tracks beside it that share its name.
    let parts = [base];
    if (/\.(cue|m3u|gdi)$/i.test(base)) { try { parts = fs.readdirSync(dir).filter((f) => f === base || (f.startsWith(stem) && f !== base && fs.statSync(path.join(dir, f)).isFile())); } catch { /* just the sheet */ } }
    const size = parts.reduce((n, f) => { try { return n + fs.statSync(path.join(dir, f)).size; } catch { return n; } }, 0);
    const system = clean(e.system || 'Other');
    const key = crypto.createHash('sha1').update(`${system.toLowerCase()}|${base.toLowerCase()}|${size}`).digest('hex').slice(0, 20);
    out.set(key, { key, title: e.title, system, name: base, size, dir, parts });
  }
  return out;
}

/* -------------------------------------------------------------- drives and space */
function drives() {
  return new Promise((res) => {
    if (process.platform === 'win32') {
      execFile('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3 OR DriveType=2" | Select-Object DeviceID,FreeSpace,Size | ConvertTo-Json'], { timeout: 15000, windowsHide: true }, (err, out) => {
        let l = []; try { l = [].concat(JSON.parse(out || '[]')); } catch { /* none */ }
        res(l.filter((d) => d && d.Size).map((d) => ({ mount: `${d.DeviceID}\\`, dev: d.DeviceID, free: +d.FreeSpace, size: +d.Size })));
      });
      return;
    }
    execFile('df', ['-B1', '-x', 'tmpfs', '-x', 'devtmpfs', '-x', 'efivarfs', '-x', 'squashfs', '-x', 'overlay', '--output=source,target,avail,size'], { timeout: 15000 }, (err, out) => {
      const byDev = new Map();
      for (const line of String(out || '').trim().split('\n').slice(1)) {
        const m = line.trim().match(/^(\S+)\s+(.+?)\s+(\d+)\s+(\d+)$/); if (!m) continue;
        const mount = m[2];
        if (!/^\/($|home|run\/media\/|media\/|mnt\/)/.test(mount)) continue; // not /boot, /var, /srv…
        const dev = m[1].replace(/\[.*\]$/, '');
        (byDev.get(dev) || byDev.set(dev, []).get(dev)).push({ mount, dev, free: +m[3], size: +m[4] });
      }
      // Btrfs shows one drive under several mounts: the one holding home (deepest), else the shortest.
      const inHome = (d) => os.homedir() === d.mount || os.homedir().startsWith(d.mount === '/' ? '/' : d.mount + '/');
      res([...byDev.values()].map((l) => l.filter(inHome).sort((a, b) => b.mount.length - a.mount.length)[0] || l.sort((a, b) => a.mount.length - b.mount.length)[0]));
    });
  });
}
const keep = (d) => Math.max(KEEP_MIN, d.size * KEEP_SHARE);
const spare = (d) => Math.max(0, d.free - keep(d));
const homeDrive = (list) => list.filter((d) => os.homedir() === d.mount || os.homedir().startsWith(d.mount.replace(/[\\/]?$/, path.sep))).sort((a, b) => b.mount.length - a.mount.length)[0];
const folderOn = (d, list) => (d === homeDrive(list) ? (load().dir || path.join(os.homedir(), 'Games', 'ROMs', 'Synced')) : path.join(d.mount, 'Bladedeck ROMs'));
function writable(dir) { try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); return true; } catch { return false; } }
// The drive for the next file: home's first, then the one with the most room.
function pick(list, bytes) {
  const home = homeDrive(list);
  const order = [home, ...list.filter((d) => d !== home).sort((a, b) => spare(b) - spare(a))].filter(Boolean);
  return order.find((d) => spare(d) >= bytes && writable(folderOn(d, list))) || null;
}
async function plan() {
  const list = await drives(), home = homeDrive(list);
  return list.map((d) => ({ mount: d.mount, free: d.free, size: d.size, keep: keep(d), spare: spare(d), home: d === home, folder: folderOn(d, list) }));
}

/* -------------------------------------------------------------- the partner's side */
function serve() {
  if (server) return;
  server = http.createServer((req, res) => {
    const from = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    const secret = String(req.headers['x-bd-sync'] || '');
    const partner = Object.entries(load().partners).find(([id, p]) => p.secret && p.secret.length === secret.length && crypto.timingSafeEqual(Buffer.from(p.secret), Buffer.from(secret)) && LAN.peer(id)?.addr === from);
    if (!partner) { res.writeHead(403); return res.end(); }
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/list') { const l = [...mine().values()].map(({ dir, ...r }) => r); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(l)); }
    if (u.pathname === '/file') {
      const r = mine().get(u.searchParams.get('k') || ''), part = u.searchParams.get('p') || '';
      if (!r || !r.parts.includes(part)) { res.writeHead(404); return res.end(); }
      const f = path.join(r.dir, part);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(f).size });
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end();
  });
  server.on('error', () => { server = null; });
  server.listen(PORT, '0.0.0.0');
}

/* -------------------------------------------------------------- syncing */
async function getJson(addr, secret, p) {
  const r = await net.fetch(`http://${addr}:${PORT}${p}`, { headers: { 'x-bd-sync': secret } });
  if (!r.ok) throw new Error(r.status === 403 ? 'They do not have this PC as a sync partner any more.' : `HTTP ${r.status}`);
  return r.json();
}
async function fetchTo(addr, secret, key, part, to, onBytes) {
  const r = await net.fetch(`http://${addr}:${PORT}/file?k=${key}&p=${encodeURIComponent(part)}`, { headers: { 'x-bd-sync': secret } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const tmp = `${to}.part`, out = fs.createWriteStream(tmp), reader = r.body.getReader();
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; if (!out.write(Buffer.from(value))) await new Promise((ok) => out.once('drain', ok)); onBytes(value.length); }
    await new Promise((ok, no) => out.end((err) => (err ? no(err) : ok())));
    fs.renameSync(tmp, to);
  } catch (err) { out.destroy(); fs.rmSync(tmp, { force: true }); throw err; }
}

async function sync(peerId, { andBack = true } = {}) {
  const p = load().partners[peerId], peer = LAN.peer(peerId);
  if (!p) return { ok: false, error: 'Pair with that PC first.' };
  if (!peer) return { ok: false, error: `${p.name} is not around right now (Nearby).` };
  if (busy) return { ok: false, error: 'A sync is already running.' };
  busy = true;
  const tell = (d) => send('romsync-event', { peer: peerId, name: p.name, ...d });
  try {
    tell({ kind: 'start' });
    const theirs = await getJson(peer.addr, p.secret, '/list');
    const have = new Set([...mine().values()].map((r) => `${r.system.toLowerCase()}|${r.name.toLowerCase()}|${r.size}`));
    const want = theirs.filter((r) => r && r.key && Array.isArray(r.parts) && !have.has(`${String(r.system).toLowerCase()}|${String(r.name).toLowerCase()}|${r.size}`));
    const total = want.reduce((n, r) => n + (+r.size || 0), 0);
    tell({ kind: 'plan', count: want.length, bytes: total });
    let got = 0, gotBytes = 0, skipped = 0, skippedBytes = 0, done = 0;
    const folders = new Set();
    const already = (r, list) => list.some((d) => { try { return fs.statSync(path.join(folderOn(d, list), clean(r.system), path.basename(String(r.name)))).size > 0; } catch { return false; } });
    for (const r of want) {
      const list = await drives();
      // Synced before and not in the library yet (it joins once the folder is looked at).
      if (already(r, list)) continue;
      const d = pick(list, +r.size || 0);
      if (!d) { skipped++; skippedBytes += +r.size || 0; continue; }
      const dir = path.join(folderOn(d, list), clean(r.system));
      fs.mkdirSync(dir, { recursive: true });
      try {
        for (const part of r.parts) {
          const name = path.basename(String(part)); if (!name || name !== String(part)) throw new Error('odd file name');
          const to = path.join(dir, name);
          if (fs.existsSync(to)) continue;
          await fetchTo(peer.addr, p.secret, r.key, name, to, (n) => { done += n; tell({ kind: 'progress', pct: Math.round(100 * done / (total || 1)), title: r.title }); });
        }
        got++; gotBytes += +r.size || 0; folders.add(folderOn(d, list));
        tell({ kind: 'got', title: r.title, system: r.system, file: path.join(dir, path.basename(r.name)), folder: folderOn(d, list) });
      } catch (err) { skipped++; skippedBytes += +r.size || 0; }
    }
    p.last = Date.now(); persist();
    if (andBack) LAN.sendTo(peerId, { kind: 'sync-please' });
    const res = { ok: true, got, gotBytes, skipped, skippedBytes, folders: [...folders] };
    tell({ kind: 'done', ...res, note: skipped ? `${skipped} (${human(skippedBytes)}) did not fit: no drive has that much room beyond what is kept free.` : '' });
    return res;
  } catch (err) {
    tell({ kind: 'failed', error: String(err.message || err) });
    return { ok: false, error: `The sync with ${p.name} stopped: ${err.message || err}` };
  } finally { busy = false; }
}

function register({ getWin, loadLib: ll }) {
  loadLib = ll;
  send = (ch, d) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, d); };
  if (Object.keys(load().partners).length) serve();
  // Pairing: they ask, the person here answers; a yes is remembered on both sides.
  LAN.on('sync-ask', (m, peer) => {
    if (!/^[a-f0-9]{64}$/.test(String(m.secret))) return;
    asks.set(`in:${peer.id}`, String(m.secret));
    send('romsync-event', { kind: 'ask', peer: peer.id, name: peer.name, pc: peer.pc });
  });
  LAN.on('sync-yes', (m, peer) => {
    const secret = asks.get(`out:${peer.id}`); if (!secret) return;
    asks.delete(`out:${peer.id}`);
    load().partners[peer.id] = { name: peer.name, pc: peer.pc, secret, auto: true, at: Date.now() }; persist(); serve();
    send('romsync-event', { kind: 'paired', peer: peer.id, name: peer.name });
  });
  LAN.on('sync-no', (m, peer) => { asks.delete(`out:${peer.id}`); send('romsync-event', { kind: 'declined', peer: peer.id, name: peer.name }); });
  // The partner finished pulling from us: our turn, if we keep it in sync.
  LAN.on('sync-please', (m, peer) => { const p = load().partners[peer.id]; if (p && p.auto !== false) sync(peer.id, { andBack: false }).catch(() => {}); });

  ipcMain.handle('romsync-state', async () => ({ partners: Object.entries(load().partners).map(([id, p]) => ({ id, name: p.name, pc: p.pc, auto: p.auto !== false, last: p.last || 0, here: !!LAN.peer(id) })), drives: await plan(), mine: mine().size, busy, dir: load().dir || '' }));
  ipcMain.handle('romsync-pair', (_e, peerId) => {
    const peer = LAN.peer(peerId); if (!peer) return { ok: false, error: 'That PC is not around right now.' };
    const secret = crypto.randomBytes(32).toString('hex');
    asks.set(`out:${peer.id}`, secret);
    LAN.sendTo(peer.id, { kind: 'sync-ask', secret });
    return { ok: true };
  });
  ipcMain.handle('romsync-answer', (_e, peerId, yes) => {
    const secret = asks.get(`in:${peerId}`), peer = LAN.peer(peerId);
    asks.delete(`in:${peerId}`);
    if (!secret || !peer) return { ok: false };
    if (!yes) { LAN.sendTo(peer.id, { kind: 'sync-no' }); return { ok: true }; }
    load().partners[peer.id] = { name: peer.name, pc: peer.pc, secret, auto: true, at: Date.now() }; persist(); serve();
    LAN.sendTo(peer.id, { kind: 'sync-yes' });
    return { ok: true };
  });
  ipcMain.handle('romsync-sync', (_e, peerId) => sync(String(peerId)));
  ipcMain.handle('romsync-set', (_e, peerId, o = {}) => {
    const p = load().partners[String(peerId)]; if (!p) return false;
    if (o.forget) delete load().partners[String(peerId)]; else if ('auto' in o) p.auto = !!o.auto;
    persist(); return true;
  });
  // Every hour, partners who are around and kept in sync automatically get a sync.
  setInterval(() => { for (const [id, p] of Object.entries(load().partners)) if (p.auto !== false && LAN.peer(id) && Date.now() - (p.last || 0) > 36e5) { sync(id).catch(() => {}); break; } }, 5 * 60000).unref?.();
}

module.exports = { register, drives, plan, pick, mine };
