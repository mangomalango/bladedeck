'use strict';
/* Bluetooth, for controllers and headphones, without leaving Bladedeck: whether Bluetooth is on,
   the devices paired with this PC (connect or disconnect each), and pairing a new one. A paired
   and trusted controller then reconnects by itself when its home button is pressed, as long as
   Bluetooth is on; "Turn Bluetooth on at start" keeps it that way.
   Linux uses rfkill (Bluetooth switched off in the system's quick settings is "soft blocked") and
   bluetoothctl. Windows opens its own Bluetooth settings page instead. */
const { ipcMain, shell } = require('electron');
const { execFile, spawn } = require('child_process');

const run = (cmd, args, timeout = 10000) => new Promise((res) => execFile(cmd, args, { timeout, windowsHide: true }, (err, out, errOut) => res({ ok: !err, out: String(out || ''), err: String(errOut || '') })));
const MAC = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i;
const linux = process.platform === 'linux';

// What kind of device, from the icon BlueZ gives it (or its name).
function kindOf(icon, name) {
  if (/input-gaming/.test(icon) || /stadia|controller|gamepad|dualsense|xbox|8bitdo|pro controller|joy-con/i.test(name)) return 'controller';
  if (/audio|headset|headphone/.test(icon) || /buds|headphone|earbud|liberty|airpods|wh-|wf-/i.test(name)) return 'audio';
  if (/phone/.test(icon)) return 'phone';
  return 'other';
}

async function power() {
  const rf = await run('rfkill', ['list', 'bluetooth']);
  const blocked = /Soft blocked: yes/.test(rf.out), hard = /Hard blocked: yes/.test(rf.out);
  const show = await run('bluetoothctl', ['show']);
  return { present: show.ok && /Controller/.test(show.out), on: !blocked && /Powered: yes/.test(show.out), blocked, hard };
}

async function info(mac) {
  const r = await run('bluetoothctl', ['info', mac]);
  const v = (k) => (r.out.match(new RegExp(`^\\s*${k}: (.*)$`, 'm')) || [])[1] || '';
  return { mac, name: v('Name') || v('Alias') || mac, icon: v('Icon'), paired: v('Paired') === 'yes', trusted: v('Trusted') === 'yes', connected: v('Connected') === 'yes', battery: +((v('Battery Percentage').match(/\((\d+)\)/) || [])[1]) || null };
}
async function devices(which = 'Paired') {
  const r = await run('bluetoothctl', which ? ['devices', which] : ['devices']);
  const macs = [...r.out.matchAll(/^Device (\S+)/gm)].map((m) => m[1]).filter((m) => MAC.test(m));
  const out = [];
  for (const m of macs) { const d = await info(m); out.push({ ...d, kind: kindOf(d.icon, d.name) }); }
  return out;
}

async function status() {
  if (!linux) return { supported: false, windows: process.platform === 'win32' };
  const p = await power();
  if (!p.present && !p.blocked) return { supported: true, present: false };
  // Paired devices are known even while Bluetooth is off (they reconnect once it is on).
  return { supported: true, present: true, ...p, devices: await devices() };
}

async function setOn(on) {
  if (on) {
    const u = await run('rfkill', ['unblock', 'bluetooth']);
    if (!u.ok) return { ok: false, error: 'Bluetooth is switched off and this PC did not let Bladedeck switch it on. Use the Bluetooth button in the system\'s quick settings.' };
    await new Promise((r) => setTimeout(r, 1200)); // the adapter comes back after an unblock
  }
  const r = await run('bluetoothctl', ['power', on ? 'on' : 'off']);
  return { ok: r.ok && !/Failed/i.test(r.out), error: r.ok ? '' : r.err.trim() };
}

async function connect(mac, on) {
  if (!MAC.test(String(mac))) return { ok: false, error: 'Bad request.' };
  if (on) await run('bluetoothctl', ['trust', mac]); // so it reconnects by itself next time
  const r = await run('bluetoothctl', [on ? 'connect' : 'disconnect', mac], 20000);
  const ok = r.ok && /successful/i.test(r.out);
  return { ok, error: ok ? '' : on ? 'It did not connect. Wake it (press its home button), keep it close, and try again.' : 'It did not disconnect.' };
}

/* Pairing: look around for 20 seconds; the page lists what shows up. A controller has to be in
   pairing mode (Stadia: hold Stadia and Y until the light flashes orange). */
let scanProc = null;
async function scan() {
  if (scanProc) return { ok: true, already: true };
  const before = new Set((await devices()).map((d) => d.mac));
  scanProc = spawn('bluetoothctl', ['--timeout', '20', 'scan', 'on'], { stdio: 'ignore' });
  scanProc.on('error', () => { scanProc = null; });
  await new Promise((r) => scanProc ? scanProc.on('exit', r) : r());
  scanProc = null;
  const all = await devices('');
  // Named devices only (unnamed ones are mostly other people's gadgets), and not already paired.
  return { ok: true, found: all.filter((d) => !before.has(d.mac) && d.name !== d.mac && !/^[0-9A-F-]{17}$/i.test(d.name)) };
}
async function pair(mac) {
  if (!MAC.test(String(mac))) return { ok: false, error: 'Bad request.' };
  const p = await run('bluetoothctl', ['--timeout', '25', 'pair', mac], 30000);
  if (!/successful|Already/i.test(p.out)) return { ok: false, error: 'Pairing did not finish. Put it in pairing mode again and retry.' };
  await run('bluetoothctl', ['trust', mac]);
  return connect(mac, true);
}

function register() {
  const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (err) { return { ok: false, error: String(err.message || err) }; } };
  ipcMain.handle('bt-status', guard(() => status()));
  ipcMain.handle('bt-power', guard((_e, on) => (linux ? setOn(!!on) : { ok: false })));
  ipcMain.handle('bt-connect', guard((_e, mac, on) => (linux ? connect(mac, on !== false) : { ok: false })));
  ipcMain.handle('bt-scan', guard(() => (linux ? scan() : { ok: false })));
  ipcMain.handle('bt-pair', guard((_e, mac) => (linux ? pair(mac) : { ok: false })));
  ipcMain.handle('bt-settings', () => {
    if (process.platform === 'win32') { shell.openExternal('ms-settings:bluetooth'); require('./winlist').fillNext(/Settings.* ApplicationFrameHost$|SystemSettings/i).catch(() => {}); }
    return true;
  });
}

// At start: Bluetooth on, when the player asked for that (controllers then reconnect by themselves).
async function startup(settings) { if (linux && settings && settings.btAtStart) { const p = await power(); if (!p.on) await setOn(true); } }

module.exports = { register, startup, kindOf };
