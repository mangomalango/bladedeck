'use strict';
/* Moonlight: play games streamed from another PC (one running Sunshine, or an NVIDIA PC).
   Pairing happens in Moonlight itself (it shows a PIN to type into Sunshine). Bladedeck reads
   the PCs Moonlight has paired and the apps each one offers from Moonlight's own settings file,
   and adds each app to the library; playing one runs `moonlight stream <PC> <app>`, which
   starts the stream full screen and quits when it ends. */
const { ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const FLAT = 'com.moonlight_stream.Moonlight';
const DIR = 'Moonlight Game Streaming Project';
const h = os.homedir();

function onPath(cmd) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, cmd);
    try {
      if (process.platform === 'win32') { if (fs.existsSync(p + '.exe')) return p + '.exe'; continue; }
      fs.accessSync(p, fs.constants.X_OK); return p;
    } catch { /* keep looking */ }
  }
  return null;
}
const flatpakHas = (id) => [path.join(h, '.local/share/flatpak/app', id), path.join('/var/lib/flatpak/app', id)].some((p) => fs.existsSync(p));

// How to run Moonlight here: a program plus the words that go before Moonlight's own arguments.
function moonlight() {
  if (process.platform === 'win32') {
    const exe = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')]
      .filter(Boolean).map((d) => path.join(d, 'Moonlight Game Streaming', 'Moonlight.exe')).find((p) => fs.existsSync(p));
    return exe ? { exe, pre: [] } : null;
  }
  const native = onPath('moonlight') || onPath('moonlight-qt');
  if (native) return { exe: native, pre: [] };
  if (process.platform === 'linux' && flatpakHas(FLAT)) return { exe: onPath('flatpak') || '/usr/bin/flatpak', pre: ['run', FLAT] };
  return null;
}

// Moonlight keeps its settings and box art in different places per install.
function places() {
  if (process.platform === 'win32') return []; // Windows keeps them in the registry (readRegHosts)
  return [
    { conf: path.join(h, '.var/app', FLAT, 'config', DIR, 'Moonlight.conf'), art: path.join(h, '.var/app', FLAT, 'cache', DIR, 'Moonlight', 'boxart') },
    { conf: path.join(h, '.config', DIR, 'Moonlight.conf'), art: path.join(h, '.cache', DIR, 'Moonlight', 'boxart') }
  ];
}

// A Qt settings file: [hosts] holds "1\hostname=…", "1\apps\2\name=…" and so on.
function unquote(v) {
  v = v.trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\(.)/g, (_m, c) => (c === 'n' ? '\n' : c));
  return v;
}
function readHosts(file) {
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const hosts = {}; let section = '';
  for (const line of text.split(/\r?\n/)) {
    const s = line.match(/^\[(.+)\]$/); if (s) { section = s[1]; continue; }
    if (section !== 'hosts') continue;
    const m = line.match(/^(\d+)\\(.+?)=(.*)$/); if (!m) continue;
    const host = (hosts[m[1]] ||= { apps: {} });
    const a = m[2].match(/^apps\\(\d+)\\(.+)$/);
    if (a) (host.apps[a[1]] ||= {})[a[2]] = unquote(m[3]);
    else host[m[2]] = unquote(m[3]);
  }
  return Object.values(hosts).filter((x) => x.hostname).map((x) => ({
    name: x.hostname, uuid: x.uuid || '',
    apps: Object.values(x.apps).filter((a) => a.name && a.hidden !== 'true').map((a) => ({ name: a.name, id: a.id || '' }))
  }));
}

/* Windows: Moonlight's Qt settings live in the registry, the same tree as the file (hosts\1\hostname,
   hosts\1\apps\2\name). Read with `reg query /s`; numbers come back as 0x… DWORDs. */
const REG = `HKCU\\Software\\${DIR}\\Moonlight\\hosts`;
function parseReg(text) {
  const hosts = {}; let key = null;
  for (const line of String(text).split(/\r?\n/)) {
    const k = line.match(/\\hosts\\(\d+)(?:\\apps\\(\d+))?\s*$/i);
    if (/^HKEY_/i.test(line)) { key = k ? { h: k[1], a: k[2] } : null; continue; }
    const v = line.match(/^\s+(\S+)\s+REG_(\w+)\s+(.*)$/); if (!v || !key) continue;
    const val = v[2] === 'DWORD' ? String(parseInt(v[3], 16)) : v[3].trim();
    const host = (hosts[key.h] ||= { apps: {} });
    if (key.a) (host.apps[key.a] ||= {})[v[1]] = val; else host[v[1]] = val;
  }
  return Object.values(hosts).filter((x) => x.hostname).map((x) => ({
    name: x.hostname, uuid: x.uuid || '',
    apps: Object.values(x.apps).filter((a) => a.name && a.hidden !== 'true').map((a) => ({ name: a.name, id: a.id || '' }))
  }));
}
function readRegHosts() {
  try { return parseReg(require('child_process').execFileSync('reg', ['query', REG, '/s'], { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })); } catch { return []; }
}
// Box art on Windows: Qt's cache folder under Local AppData.
function winArt() {
  const la = process.env.LOCALAPPDATA || '';
  return [path.join(la, DIR, 'Moonlight', 'boxart'), path.join(la, DIR, 'Moonlight', 'cache', 'boxart'), path.join(la, DIR, 'boxart')].find((d) => fs.existsSync(d)) || path.join(la, DIR, 'Moonlight', 'boxart');
}

// Arguments as one line; splitArgs in main.js reads the quotes back.
const q = (s) => `"${String(s).replace(/"/g, '')}"`;

function scan() {
  const ml = moonlight();
  const games = [], pcs = [], seen = new Set();
  // The Moonlight that is installed comes first: an old settings file can still hold a PC under
  // its earlier name (same uuid), and that one would not stream.
  const all = places(); if (ml && !ml.pre.length) all.reverse();
  if (process.platform === 'win32') all.push({ reg: true, art: winArt() });
  for (const p of all) {
    for (const host of p.reg ? readRegHosts() : readHosts(p.conf)) {
      const id = host.uuid || host.name;
      if (seen.has(id)) continue;
      seen.add(id); pcs.push(host.name);
      for (const app of host.apps) {
        const art = app.id && host.uuid ? path.join(p.art, host.uuid, `${app.id}.png`) : '';
        games.push({
          key: `${host.name}/${app.name}`, host: host.name, app: app.name,
          title: app.name === 'Desktop' ? `${host.name} desktop` : `${app.name} on ${host.name}`,
          exe: ml ? ml.exe : '', args: ml ? [...ml.pre, 'stream', q(host.name), q(app.name)].join(' ') : '',
          cover: art && fs.existsSync(art) ? art : ''
        });
      }
    }
  }
  return { installed: !!ml, windows: process.platform === 'win32', pcs, games };
}

function register() {
  ipcMain.handle('moonlight-scan', () => scan());
  // Opens Moonlight itself, to pair a PC or change stream quality.
  ipcMain.handle('moonlight-open', () => {
    const ml = moonlight();
    if (!ml) { shell.openExternal('https://moonlight-stream.org/'); return { ok: false }; }
    try { const c = spawn(ml.exe, ml.pre, { detached: true, stdio: 'ignore' }); c.on('error', () => {}); c.unref(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
  });
}

module.exports = { register, scan, parseReg };
