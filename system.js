'use strict';
/* System: the computer at a glance, and the everyday controls, without leaving Bladedeck.
   Stats: processor load and temperature, graphics card frequency (and load where the driver
   says), memory, storage, battery, network, uptime. Controls: Wi-Fi (list, connect,
   disconnect), screen brightness, and sleep / restart / shut down / lock.
   Linux reads /proc and /sys and uses nmcli and KDE's brightness service; Windows uses what
   Node and PowerShell can tell. Anything a machine does not have is simply left out. */
const { ipcMain } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = (cmd, args, timeout = 8000) => new Promise((res) => execFile(cmd, args, { timeout, windowsHide: true }, (err, out, errOut) => res({ ok: !err, out: String(out || ''), err: String(errOut || (err && err.message) || '') })));
const read = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return null; } };
const num = (f) => { const v = read(f); return v == null || v === '' ? null : +v; };

// Processor load since the last look.
let lastCpu = null;
function cpuLoad() {
  const t = os.cpus().reduce((a, c) => { const v = c.times; a.idle += v.idle; a.total += v.user + v.nice + v.sys + v.idle + v.irq; return a; }, { idle: 0, total: 0 });
  const prev = lastCpu; lastCpu = t;
  if (!prev || t.total === prev.total) return null;
  return Math.round(100 * (1 - (t.idle - prev.idle) / (t.total - prev.total)));
}

function temps() {
  const out = {};
  if (process.platform !== 'linux') return out;
  let dirs; try { dirs = fs.readdirSync('/sys/class/hwmon'); } catch { return out; }
  const NAME = { coretemp: 'Processor', k10temp: 'Processor', zenpower: 'Processor', amdgpu: 'Graphics', xe: 'Graphics', i915: 'Graphics', nouveau: 'Graphics', nvme: 'SSD', acpitz: 'Board', iwlwifi_1: 'Wi-Fi' };
  for (const d of dirs) {
    const base = path.join('/sys/class/hwmon', d), name = read(path.join(base, 'name')) || '';
    const label = NAME[name] || (/nvme/.test(name) ? 'SSD' : /iwlwifi/.test(name) ? 'Wi-Fi' : null);
    if (!label) continue;
    let max = null;
    for (const f of fs.readdirSync(base).filter((n) => /^temp\d+_input$/.test(n))) { const v = num(path.join(base, f)); if (v != null && v > 0) max = Math.max(max ?? 0, v / 1000); }
    if (max != null) out[label] = Math.round(Math.max(out[label] ?? 0, max));
  }
  return out;
}

function gpu() {
  if (process.platform !== 'linux') return null;
  for (const card of ['card0', 'card1', 'card2']) {
    const dev = `/sys/class/drm/${card}/device`, vendor = read(`${dev}/vendor`);
    if (!vendor) continue;
    const name = { '0x8086': 'Intel', '0x1002': 'AMD', '0x10de': 'NVIDIA' }[vendor] || 'Graphics';
    // Intel (xe and i915): current and top frequency. AMD: busy percent and video memory.
    const xe = `${dev}/tile0/gt0/freq0`;
    const cur = num(`${xe}/act_freq`) ?? num(`/sys/class/drm/${card}/gt_act_freq_mhz`) ?? num(`/sys/class/drm/${card}/gt_cur_freq_mhz`);
    const max = num(`${xe}/rp0_freq`) ?? num(`/sys/class/drm/${card}/gt_RP0_freq_mhz`);
    const busy = num(`${dev}/gpu_busy_percent`);
    const vu = num(`${dev}/mem_info_vram_used`), vt = num(`${dev}/mem_info_vram_total`);
    return { name, mhz: cur, maxMhz: max, busy, vramUsed: vu, vramTotal: vt };
  }
  return null;
}

function battery() {
  if (process.platform !== 'linux') return null;
  let list; try { list = fs.readdirSync('/sys/class/power_supply').filter((n) => /^BAT/.test(n)); } catch { return null; }
  if (!list.length) return null;
  const b = `/sys/class/power_supply/${list[0]}`;
  const watts = num(`${b}/power_now`);
  return { pct: num(`${b}/capacity`), status: read(`${b}/status`), watts: watts != null ? Math.round(watts / 1e5) / 10 : null };
}

function disks() {
  const seen = new Set(), out = [];
  for (const [label, p] of [['System', process.platform === 'win32' ? 'C:\\' : '/'], ['Home', os.homedir()], ['Games', path.join(os.homedir(), 'Games')]]) {
    try {
      const s = fs.statfsSync(p);
      const key = `${s.blocks}:${s.bfree}`; if (seen.has(key)) continue; seen.add(key);
      out.push({ label, total: s.blocks * s.bsize, free: s.bavail * s.bsize });
    } catch { /* not there */ }
  }
  return out;
}

async function network() {
  if (process.platform !== 'linux') return null;
  const r = await run('nmcli', ['-t', '-f', 'TYPE,STATE,CONNECTION', 'dev', 'status']);
  if (!r.ok) return null;
  const up = r.out.split('\n').map((l) => l.split(':')).find((f) => f[1] === 'connected' && /wifi|ethernet/.test(f[0]));
  if (!up) return { connected: false };
  let signal = null;
  if (up[0] === 'wifi') { const w = await run('nmcli', ['-t', '-f', 'IN-USE,SIGNAL', 'dev', 'wifi', 'list', '--rescan', 'no']); const m = w.out.match(/^\*:(\d+)/m); if (m) signal = +m[1]; }
  return { connected: true, kind: up[0] === 'wifi' ? 'Wi-Fi' : 'Ethernet', name: up.slice(2).join(':'), signal };
}

async function brightness() {
  if (process.platform !== 'linux') return null;
  const q = (prop) => run('qdbus6', ['org.kde.ScreenBrightness', '/org/kde/ScreenBrightness/display0', `org.kde.ScreenBrightness.Display.${prop}`], 3000);
  const [b, m] = await Promise.all([q('Brightness'), q('MaxBrightness')]);
  if (b.ok && m.ok && +m.out) return { pct: Math.round(100 * +b.out / +m.out), max: +m.out, via: 'kde' };
  // Without KDE: the backlight itself, readable but usually only writable as root.
  try { const d = fs.readdirSync('/sys/class/backlight')[0]; if (d) { const cur = num(`/sys/class/backlight/${d}/brightness`), mx = num(`/sys/class/backlight/${d}/max_brightness`); if (mx) return { pct: Math.round(100 * cur / mx), max: mx, via: 'sys' }; } } catch { /* none */ }
  return null;
}

async function stats() {
  const tot = os.totalmem();
  let avail = os.freemem();
  if (process.platform === 'linux') { const m = (read('/proc/meminfo') || '').match(/MemAvailable:\s+(\d+)/); if (m) avail = +m[1] * 1024; }
  const [net, bright] = await Promise.all([network(), brightness()]);
  return {
    host: os.hostname(), uptime: os.uptime(),
    cpu: { model: (os.cpus()[0]?.model || '').replace(/\(R\)|\(TM\)|CPU|Processor/g, '').replace(/\s+/g, ' ').trim(), cores: os.cpus().length, load: cpuLoad() },
    mem: { total: tot, used: tot - avail }, gpu: gpu(), temps: temps(), battery: battery(), disks: disks(), net, brightness: bright, platform: process.platform
  };
}

function register() {
  cpuLoad();
  ipcMain.handle('sys-stats', () => stats());
  ipcMain.handle('sys-wifi', async () => {
    const r = await run('nmcli', ['-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'dev', 'wifi', 'list', '--rescan', 'auto'], 15000);
    if (!r.ok) return { error: 'Wi-Fi controls need NetworkManager (nmcli).' };
    const seen = new Map();
    for (const line of r.out.split('\n')) {
      const m = line.match(/^(\*?):(.*):(\d+):(.*)$/); if (!m || !m[2]) continue;
      const ssid = m[2].replace(/\\:/g, ':');
      const prev = seen.get(ssid);
      if (!prev || +m[3] > prev.signal || m[1]) seen.set(ssid, { ssid, signal: +m[3], secure: !!m[4] && m[4] !== '--', on: !!m[1] || prev?.on });
    }
    return { networks: [...seen.values()].sort((a, b) => b.on - a.on || b.signal - a.signal).slice(0, 20) };
  });
  ipcMain.handle('sys-wifi-connect', async (_e, { ssid, password }) => {
    const args = ['dev', 'wifi', 'connect', String(ssid)]; if (password) args.push('password', String(password));
    const r = await run('nmcli', args, 40000);
    return r.ok ? { ok: true } : { ok: false, error: (r.err || r.out).split('\n').filter(Boolean).pop() || 'Could not connect.' };
  });
  ipcMain.handle('sys-wifi-off', async () => { const r = await run('nmcli', ['dev', 'disconnect', 'wlan0'], 15000); return { ok: r.ok }; });
  ipcMain.handle('sys-brightness', async (_e, pct) => {
    const b = await brightness(); if (!b) return { ok: false };
    const v = Math.round(Math.max(1, Math.min(100, +pct)) * b.max / 100);
    if (b.via === 'kde') { const r = await run('qdbus6', ['org.kde.ScreenBrightness', '/org/kde/ScreenBrightness/display0', 'org.kde.ScreenBrightness.Display.SetBrightness', String(v), '0'], 3000); return { ok: r.ok }; }
    return { ok: false, error: 'Changing brightness needs KDE Plasma here.' };
  });
  ipcMain.handle('sys-power', async (_e, what) => {
    const W = process.platform === 'win32';
    const cmd = {
      sleep: W ? ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']] : ['systemctl', ['suspend']],
      restart: W ? ['shutdown', ['/r', '/t', '0']] : ['systemctl', ['reboot']],
      off: W ? ['shutdown', ['/s', '/t', '0']] : ['systemctl', ['poweroff']],
      lock: W ? ['rundll32.exe', ['user32.dll,LockWorkStation']] : ['loginctl', ['lock-session']]
    }[what];
    if (!cmd) return { ok: false };
    const r = await run(cmd[0], cmd[1], 15000);
    return { ok: r.ok, error: r.ok ? '' : r.err };
  });
}

module.exports = { register, stats };
