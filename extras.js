'use strict';
/* Extras: the optional things Bladedeck suggests turning on (renderer/extras.js shows them).
   This side finds out what is already there, and does the two jobs that are Bladedeck's own:
   - Save backups: copies emulator save folders (memory cards, save data) and the library into
     ~/Bladedeck/Backups/<date>, keeping the newest 5. Local only; a sync tool or cloud drive
     pointed at that folder takes them further. Nothing outside the known save folders is read.
   - Update checks: asks GitHub which release is newest, for a repository set in Settings, and
     only reports it (with the page to download from). It never downloads or runs anything. */
const { ipcMain, app } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = (cmd, args, timeout = 5000) => new Promise((res) => execFile(cmd, args, { timeout, windowsHide: true }, (err, out) => res(err ? null : String(out))));
const onPath = (cmd) => (process.env.PATH || '').split(path.delimiter).some((d) => d && fs.existsSync(path.join(d, cmd)));

/* -------------------------------------------------------------- what is there */
async function tailscale() {
  if (!onPath('tailscale') && !onPath('tailscale.exe')) return { installed: false };
  const j = await run('tailscale', ['status', '--json']);
  let s = {}; try { s = JSON.parse(j || '{}'); } catch { /* not running */ }
  return { installed: true, up: s.BackendState === 'Running', ip: (s.Self?.TailscaleIPs || []).find((x) => x.includes('.')) || '' };
}
async function status() {
  return {
    tailscale: await tailscale(),
    gamemode: process.platform === 'linux' && onPath('gamemoderun'),
    backups: backupsInfo(),
    platform: process.platform
  };
}

/* -------------------------------------------------------------- save backups */
const BACKUPS = () => path.join(require('./fsaccess').ROOT, 'Backups');
const KEEP = 5, MAX_SOURCE = 2 * 1024 ** 3;
// Where emulators keep saves: Flatpak first, then a regular install. Linux and Windows.
function saveDirs() {
  const h = os.homedir(), v = (id, ...p) => path.join(h, '.var/app', id, ...p), c = (...p) => path.join(h, '.config', ...p), d = (...p) => path.join(h, '.local/share', ...p);
  const doc = (...p) => path.join(h, 'Documents', ...p), ad = (...p) => path.join(process.env.APPDATA || path.join(h, 'AppData', 'Roaming'), ...p);
  const W = process.platform === 'win32';
  const list = W ? [
    ['PCSX2', doc('PCSX2', 'memcards')], ['DuckStation', doc('DuckStation', 'memcards')], ['Dolphin GameCube', doc('Dolphin Emulator', 'GC')], ['Dolphin Wii', doc('Dolphin Emulator', 'Wii', 'title')],
    ['PPSSPP', doc('PPSSPP', 'PSP', 'SAVEDATA')], ['RetroArch', ad('RetroArch', 'saves')], ['Ryujinx', ad('Ryujinx', 'bis', 'user', 'save')], ['Cemu', ad('Cemu', 'mlc01', 'usr', 'save')], ['shadPS4', ad('shadPS4', 'savedata')]
  ] : [
    ['PCSX2', v('net.pcsx2.PCSX2', 'config/PCSX2/memcards')], ['PCSX2', c('PCSX2/memcards')],
    ['DuckStation', v('org.duckstation.DuckStation', 'config/duckstation/memcards')], ['DuckStation', d('duckstation/memcards')],
    ['Dolphin GameCube', v('org.DolphinEmu.dolphin-emu', 'data/dolphin-emu/GC')], ['Dolphin GameCube', d('dolphin-emu/GC')],
    ['Dolphin Wii', v('org.DolphinEmu.dolphin-emu', 'data/dolphin-emu/Wii/title')], ['Dolphin Wii', d('dolphin-emu/Wii/title')],
    ['PPSSPP', v('org.ppsspp.PPSSPP', 'config/ppsspp/PSP/SAVEDATA')], ['PPSSPP', c('ppsspp/PSP/SAVEDATA')],
    ['RetroArch', v('org.libretro.RetroArch', 'config/retroarch/saves')], ['RetroArch', c('retroarch/saves')],
    ['RPCS3', v('net.rpcs3.RPCS3', 'config/rpcs3/dev_hdd0/home/00000001/savedata')], ['RPCS3', c('rpcs3/dev_hdd0/home/00000001/savedata')],
    ['Ryujinx', v('io.github.ryubing.Ryujinx', 'config/Ryujinx/bis/user/save')], ['Ryujinx', c('Ryujinx/bis/user/save')],
    ['Cemu', v('info.cemu.Cemu', 'data/Cemu/mlc01/usr/save')], ['Cemu', d('Cemu/mlc01/usr/save')],
    ['Azahar', v('org.azahar_emu.Azahar', 'data/azahar-emu/sdmc')], ['Azahar', d('azahar-emu/sdmc')],
    ['shadPS4', d('shadPS4/savedata')]
  ];
  return list.filter(([, p]) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
}
function sizeOf(dir, cap) {
  let n = 0;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (n > cap) return; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.isFile()) n += fs.statSync(p).size; } };
  try { walk(dir); } catch { /* unreadable part */ }
  return n;
}
function backupsInfo() {
  let list = []; try { list = fs.readdirSync(BACKUPS()).filter((n) => /^\d{4}-\d\d-\d\d-\d{4}$/.test(n)).sort(); } catch { /* none yet */ }
  return { dir: BACKUPS(), count: list.length, last: list[list.length - 1] || '', sources: saveDirs().map(([name]) => name).filter((n, i, a) => a.indexOf(n) === i) };
}
async function backup() {
  const sources = saveDirs();
  const now = new Date(), pad = (x) => String(x).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const to = path.join(BACKUPS(), stamp);
  fs.mkdirSync(to, { recursive: true });
  const done = [], skipped = [];
  const used = new Map();
  for (const [name, dir] of sources) {
    if (sizeOf(dir, MAX_SOURCE) > MAX_SOURCE) { skipped.push(`${name} (over 2 GB)`); continue; }
    // Two installs of one emulator (Flatpak and regular) go side by side.
    const k = used.get(name) || 0; used.set(name, k + 1);
    try { fs.cpSync(dir, path.join(to, k ? `${name} ${k + 1}` : name), { recursive: true, errorOnExist: false, dereference: false }); done.push(name); } catch { skipped.push(name); }
  }
  // Bladedeck's own library (games, playtime, goals).
  try { fs.copyFileSync(path.join(app.getPath('userData'), 'library.json'), path.join(to, 'Bladedeck library.json')); done.push('Bladedeck library'); } catch { /* none */ }
  // Only the newest few are kept.
  const all = fs.readdirSync(BACKUPS()).filter((n) => /^\d{4}-\d\d-\d\d-\d{4}$/.test(n)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) fs.rmSync(path.join(BACKUPS(), old), { recursive: true, force: true });
  return { ok: true, dir: to, done: [...new Set(done)], skipped };
}

/* -------------------------------------------------------------- update checks */
// "owner/name" of the GitHub repository Bladedeck's releases come from.
const REPO = /^[\w.-]{1,39}\/[\w.-]{1,100}$/;
function ghApi(path) {
  return new Promise((res) => {
    try { require('child_process').execFile('gh', ['api', path], { timeout: 15000, windowsHide: true }, (err, out) => { if (err) return res(null); try { res(JSON.parse(String(out))); } catch { res(null); } }); }
    catch { res(null); }
  });
}
async function updateCheck(repo) {
  if (!REPO.test(String(repo || ''))) return { ok: false, error: 'No release page is set yet.' };
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Bladedeck' }, signal: AbortSignal.timeout(10000) });
    let j = null;
    if (r.ok) j = await r.json();
    // A private repository answers "not found" to everyone else: ask the GitHub CLI, signed in on
    // this PC, instead. Bladedeck never keeps a token of its own.
    else if (r.status === 404) j = await ghApi(`repos/${repo}/releases/latest`);
    if (!j && r.status === 404) return { ok: false, error: 'No release found. If the repository is private, sign the GitHub CLI in on this PC (gh auth login).' };
    if (!j) return { ok: false, error: `GitHub answered ${r.status}.` };
    const latest = String(j.tag_name || '').replace(/^v/i, ''), mine = app.getVersion();
    const num = (v) => v.split(/[.-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
    const [a, b] = [num(latest), num(mine)];
    // A test build (0.2.3-dev) is older than the release of the same number.
    const newer = a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || (mine.includes('-') && !latest.includes('-') ? 1 : 0);
    // Only a github.com page for that same repository is ever handed back to open.
    const page = /^https:\/\/github\.com\//.test(j.html_url || '') ? j.html_url : `https://github.com/${repo}/releases`;
    return { ok: true, latest, mine, newer: newer > 0, page };
  } catch { return { ok: false, error: 'Could not reach GitHub.' }; }
}

/* -------------------------------------------------------------- AdGuard DNS
   Two ways, both off until asked for:
   - Bladedeck only: its own browser panels and web apps look names up through AdGuard's encrypted
     DNS (DNS over HTTPS), which drops ad and tracker addresses. Nothing outside Bladedeck changes.
   - This whole PC: the Wi-Fi or Ethernet connection in use gets AdGuard's DNS servers
     (NetworkManager), and Off gives it back the network's own. Phones on Tailscale can use the
     same servers by setting them in Tailscale's DNS page. */
const ADGUARD = { doh: 'https://dns.adguard-dns.com/dns-query', v4: '94.140.14.14 94.140.15.15', v6: '2a10:50c0::ad1:ff 2a10:50c0::ad2:ff' };
function appDns(on) {
  try { app.configureHostResolver(on ? { secureDnsMode: 'secure', secureDnsServers: [ADGUARD.doh] } : { secureDnsMode: 'automatic', secureDnsServers: [] }); return true; } catch { return false; }
}
async function activeConnection() {
  const out = await run('nmcli', ['-t', '-f', 'NAME,DEVICE,TYPE', 'con', 'show', '--active']);
  const line = (out || '').split('\n').map((l) => l.split(':')).find((f) => /wireless|ethernet/.test(f[2] || ''));
  return line ? { name: line[0], device: line[1] } : null;
}
async function dnsStatus() {
  if (process.platform !== 'linux') return { system: null };
  const c = await activeConnection(); if (!c) return { system: null };
  const dns = (await run('nmcli', ['-g', 'ipv4.dns', 'con', 'show', c.name])) || '';
  return { system: { connection: c.name, adguard: dns.includes('94.140.14.14') } };
}
async function dnsSystem(on) {
  const c = await activeConnection(); if (!c) return { ok: false, error: 'No Wi-Fi or Ethernet connection is in use.' };
  const set = on ? ['ipv4.dns', ADGUARD.v4, 'ipv4.ignore-auto-dns', 'yes', 'ipv6.dns', ADGUARD.v6, 'ipv6.ignore-auto-dns', 'yes']
    : ['ipv4.dns', '', 'ipv4.ignore-auto-dns', 'no', 'ipv6.dns', '', 'ipv6.ignore-auto-dns', 'no'];
  if ((await run('nmcli', ['con', 'mod', c.name, ...set], 20000)) === null) return { ok: false, error: 'NetworkManager did not take the change.' };
  // Applied to the live connection without dropping it.
  await run('nmcli', ['dev', 'reapply', c.device], 20000);
  return { ok: true, connection: c.name };
}

function register(o = {}) {
  if (o.settings?.().adguardApp) app.whenReady().then(() => appDns(true));
  ipcMain.handle('dns-status', () => dnsStatus());
  ipcMain.handle('dns-app', (_e, on) => appDns(!!on));
  ipcMain.handle('dns-system', (_e, on) => dnsSystem(!!on));
  ipcMain.handle('extras-status', () => status());
  ipcMain.handle('extras-backup', () => backup().catch((err) => ({ ok: false, error: String(err.message || err) })));
  ipcMain.handle('extras-update', (_e, repo) => updateCheck(repo));
}

module.exports = { register, backup };
