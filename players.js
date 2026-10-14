'use strict';
/* Players: the controllers plugged in, and multi-screen play.
   Controllers: every pad Linux sees (USB, Bluetooth, a wireless dongle), what kind it is, how it
   is connected and its battery. "Press A to claim" finds out which device is whose by reading
   the joystick devices for a moment, so two identical controllers are still told apart.
   DualSense extras (USB only: Linux has no sound over Bluetooth for it): its speaker and its
   headphone jack become two outputs of their own, and its microphone is an input like any other.
   Multi-screen: Player 2 gets a Bladedeck of their own, full screen on the other display, and each
   player's game runs on their screen, with their sound, seeing only their controller (the game is
   started inside bubblewrap with just that controller's device, as PartyDeck does). */
const { ipcMain, BrowserWindow, screen } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const run = (cmd, args, timeout = 6000) => new Promise((res) => execFile(cmd, args, { timeout }, (err, out) => res(err ? null : String(out))));
const read = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return ''; } };

/* -------------------------------------------------------------- controllers */
const RECEIVERS = /^(045e:02fe|045e:02e6|045e:0719|2dc8:3106|2dc8:3109|2dc8:310a|054c:0ba0|057e:0337)$/;
function kindOf(v, p, name) {
  const id = `${v}:${p}`;
  if (v === '054c' && /^(0ce6|0df2)$/.test(p) || /dualsense/i.test(name)) return /0df2|edge/i.test(p + name) ? 'DualSense Edge' : 'DualSense';
  if (v === '054c' && /^(05c4|09cc|0ba0)$/.test(p) || /dualshock|wireless controller/i.test(name) && v === '054c') return 'DualShock 4';
  if (v === '045e' || /xbox|x-box/i.test(name)) return 'Xbox';
  // PDP (Rock Candy, Afterglow), PowerA, Hori, Razer, Mad Catz: Xbox-style pads.
  if (/^(0e6f|24c6|0f0d|1532|0738|20d6)$/.test(v)) return 'Xbox-style';
  if (v === '057e') return /pro/i.test(name) ? 'Switch Pro' : 'Nintendo';
  if (v === '2dc8' || /8bitdo/i.test(name)) return '8BitDo';
  if (v === '28de') return 'Steam';
  if ((v === '18d1' && p === '9400') || /stadia/i.test(name)) return 'Stadia';
  return id === '0000:0000' ? 'Controller' : 'Controller';
}
// Every joystick: from /proc/bus/input/devices, with sysfs for its battery.
function pads() {
  if (process.platform !== 'linux') return [];
  const txt = read('/proc/bus/input/devices'); if (!txt) return [];
  const out = [];
  for (const block of txt.split(/\n\s*\n/)) {
    const h = (block.match(/^H: Handlers=(.*)$/m) || [])[1] || '';
    const js = (h.match(/\b(js\d+)\b/) || [])[1]; if (!js) continue;
    const ev = (h.match(/\b(event\d+)\b/) || [])[1] || '';
    const i = block.match(/^I: Bus=(\w+) Vendor=(\w+) Product=(\w+)/m) || [];
    const name = (block.match(/^N: Name="(.*)"$/m) || [])[1] || 'Controller';
    const sys = (block.match(/^S: Sysfs=(.*)$/m) || [])[1] || '';
    const uniq = (block.match(/^U: Uniq=(.*)$/m) || [])[1] || '';
    const [bus, v, p] = [i[1] || '', (i[2] || '').toLowerCase(), (i[3] || '').toLowerCase()];
    const conn = bus === '0005' ? 'Bluetooth' : RECEIVERS.test(`${v}:${p}`) ? 'Wireless (dongle)' : bus === '0003' ? 'USB cable' : 'Connected';
    // A DualSense (or DualShock 4) is three devices: the pad, its motion sensors and its touchpad.
    // Only the pad is listed; the others go along with it to a player's game (same id).
    const aux = /motion sensors|touchpad|accelerometer/i.test(name);
    out.push({ js, event: ev, name, vendor: v, product: p, kind: kindOf(v, p, name), conn, uniq, battery: battery(sys), aux, id: uniq || `${v}:${p}:${js}` });
  }
  return out;
}
// A battery whose device sits under the controller's own device in sysfs.
function battery(sys) {
  if (!sys || process.platform !== 'linux') return null;
  let devDir = ''; try { devDir = fs.realpathSync(path.join('/sys', sys, '..', '..')); } catch { return null; }
  if (!devDir) return null;
  let names = []; try { names = fs.readdirSync('/sys/class/power_supply'); } catch { return null; }
  for (const n of names) {
    let d = ''; try { d = fs.realpathSync(path.join('/sys/class/power_supply', n, 'device')); } catch { continue; }
    if (d === devDir || d.startsWith(devDir + '/') || devDir.startsWith(d + '/')) {
      const cap = read(path.join('/sys/class/power_supply', n, 'capacity'));
      if (cap) return { pct: +cap, charging: /charging|full/i.test(read(path.join('/sys/class/power_supply', n, 'status'))) && !/discharging/i.test(read(path.join('/sys/class/power_supply', n, 'status'))) };
    }
  }
  return null;
}

/* Which device is the controller someone just pressed a button on. Reads every /dev/input/jsN
   (the input group can) until one sends a button press, for up to 15 seconds. */
let claiming = null;
function claim() {
  if (process.platform !== 'linux') return Promise.resolve(null);
  if (claiming) return claiming;
  const list = pads();
  claiming = new Promise((resolve) => {
    const streams = [];
    const done = (v) => { clearTimeout(t); for (const s of streams) { try { s.destroy(); } catch { /* closed */ } } claiming = null; resolve(v); };
    const t = setTimeout(() => done(null), 15000);
    for (const p of list) {
      let s; try { s = fs.createReadStream(`/dev/input/${p.js}`); } catch { continue; }
      streams.push(s);
      s.on('error', () => {});
      s.on('data', (buf) => {
        // struct js_event: u32 time, s16 value, u8 type, u8 number. Type 1 is a button; 0x80 marks the
        // state sent when the device is opened, which is not a press.
        for (let o = 0; o + 8 <= buf.length; o += 8) if (buf[o + 6] === 1 && buf.readInt16LE(o + 4) === 1) return done(p);
      });
    }
    if (!streams.length) done(null);
  });
  return claiming;
}

/* -------------------------------------------------------------- DualSense sound and rumble */
/* Over USB the DualSense is a 4-channel sound card: channels 1 and 2 are its sound, channels 3 and
   4 drive its haptic motors (so sound sent there is felt, not heard). Which of the speaker and the
   headphone jack plays channels 1 and 2 is set by a command to the controller itself (its "audio
   path"), not by the sound card; Linux only switches it when headphones go in or out. Bladedeck
   sends that command, so you choose:
     jack     the headphone jack, in stereo (the speaker is quiet)
     speaker  the speaker (mono, from channel 2), even with headphones plugged in
     both     both at once, each its own output: headphones mono (channel 1), speaker (channel 2)
   The same command sets the speaker's and headphones' volume, and how hard the motors rumble,
   which games feel too. Rumble strength also works over Bluetooth; sound needs the USB cable. */
const OUT_NAMES = { speaker: 'bladedeck_pad_speaker', jack: 'bladedeck_pad_jack' };
const PATH = { jack: 0, both: 2, speaker: 3 };
// The DualSense's raw device: USB (bus 0003) or Bluetooth (0005), DualSense or Edge.
function dsHid() {
  if (process.platform !== 'linux') return null;
  let names = []; try { names = fs.readdirSync('/sys/class/hidraw'); } catch { return null; }
  for (const n of names) {
    const ue = read(`/sys/class/hidraw/${n}/device/uevent`);
    const m = /HID_ID=(0003|0005):0000054C:00000(CE6|DF2)/i.exec(ue);
    if (m) return { dev: `/dev/${n}`, bt: m[1] === '0005' };
  }
  return null;
}
// CRC-32 for Bluetooth output reports (seeded with the 0xA2 header byte).
function crc32(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  return ~c >>> 0;
}
let btSeq = 0;
/* One output report with only the parts asked for marked valid; everything else (lights, rumble
   the game is playing) is left as it is. o: { path, speaker, headphones (0-100), rumble (12-100) } */
function dsWrite(o = {}) {
  if (process.platform !== 'linux') return { ok: false, error: 'DualSense features work on Linux.' };
  const h = dsHid(); if (!h) return { ok: false, error: 'No DualSense is connected.' };
  const c = Buffer.alloc(47);
  if (o.path != null && !h.bt) { c[0] |= 0x80; c[7] = (PATH[o.path] ?? 0) << 4; }
  if (o.headphones != null && !h.bt) { c[0] |= 0x10; c[4] = Math.round(Math.max(0, Math.min(100, o.headphones)) * 0x7f / 100); }
  // The PS5 uses 0x3D-0x64 for the speaker: quieter than 0x3D is near silent, louder distorts.
  if (o.speaker != null && !h.bt) { c[0] |= 0x20; c[5] = o.speaker <= 0 ? 0 : Math.round(0x3d + (0x64 - 0x3d) * Math.min(100, o.speaker) / 100); }
  // Motor power: 0 is full strength, each step takes 12.5% off (7 is the gentlest). Triggers too.
  if (o.rumble != null) { const r = Math.max(0, Math.min(7, Math.round((100 - o.rumble) / 12.5))); c[1] |= 0x40; c[36] = r | (r << 4); }
  let rep;
  if (h.bt) {
    rep = Buffer.alloc(78); rep[0] = 0x31; rep[1] = (btSeq++ & 0x0f) << 4; rep[2] = 0x10; c.copy(rep, 3);
    rep.writeUInt32LE(crc32(Buffer.concat([Buffer.from([0xa2]), rep.subarray(0, 74)])), 74);
  } else { rep = Buffer.alloc(63); rep[0] = 0x02; c.copy(rep, 1); }
  try { const fd = fs.openSync(h.dev, 'w'); try { fs.writeSync(fd, rep); } finally { fs.closeSync(fd); } return { ok: true, bt: h.bt }; }
  catch (err) { return { ok: false, error: /EACCES|EPERM/.test(String(err.code)) ? 'Bladedeck may not talk to the controller directly (its device belongs to root). Steam\'s controller rules fix that: install steam-devices.' : String(err.message || err) }; }
}
// The controller's 4-channel output (its "Direct" setup on systems with its sound profile).
async function dsSink() {
  if (process.platform !== 'linux') return null;
  const j = await run('pactl', ['-f', 'json', 'list', 'sinks']); if (!j) return null;
  let l; try { l = JSON.parse(j); } catch { return null; }
  return l.find((s) => !s.name.startsWith('bladedeck_') && (/dualsense|sony.*wireless_controller/i.test(s.name) || /054c/i.test(s.properties?.['device.vendor.id'] || '')) && (s.channel_map || '').includes('rear')) || null;
}
async function dsCard() {
  if (process.platform !== 'linux') return null;
  const j = await run('pactl', ['-f', 'json', 'list', 'cards']); if (!j) return null;
  let l; try { l = JSON.parse(j); } catch { return null; }
  return l.find((c) => /dualsense|sony/i.test(c.name) || /054c/i.test(c.properties?.['device.vendor.id'] || '')) || null;
}
async function loaded() {
  if (process.platform !== 'linux') return [];
  const out = await run('pactl', ['list', 'short', 'modules']) || '';
  return out.split('\n').filter((l) => /sink_name=bladedeck_pad_/.test(l)).map((l) => ({ id: l.split('\t')[0], which: /bladedeck_pad_speaker/.test(l) ? 'speaker' : 'jack' }));
}
let dsMode = '';
/* The Stadia controller: over USB it rumbles (Linux's hid-google-stadiaff driver) and is a sound
   card with a headphone jack and a microphone. Over Bluetooth (after Google's 2023 update) Linux
   gives it buttons only: no rumble, no sound. */
function stadiaStatus() {
  if (process.platform !== 'linux') return { present: false };
  const p = pads().find((x) => x.kind === 'Stadia');
  if (!p) return { present: false };
  const usb = p.conn === 'USB cable';
  const driver = fs.existsSync('/sys/module/hid_google_stadiaff') || /hid[-_]google[-_]stadiaff/.test(read('/proc/modules'));
  return { present: true, usb, bt: p.conn === 'Bluetooth', rumble: usb && driver, driver, battery: p.battery };
}
async function dsStatus() {
  if (process.platform !== 'linux') return { present: false };
  const card = await dsCard(), h = dsHid();
  if (!card && !h) return { present: false };
  const mods = await loaded();
  return { present: true, usb: !!card, bt: !!h?.bt, sink: !!card, outputs: mods.map((m) => m.which), mode: dsMode || (mods.length ? 'both' : 'jack') };
}
/* mode: '' (Bladedeck leaves the controller's sound alone), 'jack', 'speaker' or 'both'. Each
   output Bladedeck makes is a mono sound output pointing at the channel that reaches it. */
async function dsOutputs(mode, vol = {}) {
  if (process.platform !== 'linux') return { ok: false, error: 'DualSense sound is supported on Linux.' };
  if (mode === true) mode = 'both'; if (mode === false) mode = '';
  for (const m of await loaded()) await run('pactl', ['unload-module', m.id]);
  dsMode = mode || '';
  if (!mode) { clearInterval(padPin); dsWrite({ path: 'jack' }); return { ok: true }; }
  let sink = await dsSink();
  if (!sink) {
    const card = await dsCard();
    const names = Object.keys(card?.profiles || {});
    const prof = names.find((n) => /^direct$/i.test(n) || /surround-40/.test(n));
    if (prof) { await run('pactl', ['set-card-profile', card.name, prof]); await new Promise((r) => setTimeout(r, 700)); sink = await dsSink(); }
  }
  if (!sink) return { ok: false, error: 'The controller has no sound right now. Connect it with a USB cable: Linux only gives it sound that way.' };
  const outs = mode === 'both' ? [['speaker', 'front-right', 'Controller speaker'], ['jack', 'front-left', 'Controller headphones']]
    : mode === 'speaker' ? [['speaker', 'front-right', 'Controller speaker']] : [['jack', 'front-left,front-right', 'Controller headphones']];
  for (const [which, map, label] of outs) {
    const stereo = map.includes(',');
    const r = await run('pactl', ['load-module', 'module-remap-sink', `sink_name=${OUT_NAMES[which]}`, `sink_properties=device.description='${label}'`, `master=${sink.name}`,
      `channels=${stereo ? 2 : 1}`, `master_channel_map=${map}`, `channel_map=${stereo ? 'front-left,front-right' : 'mono'}`, 'remix=no']);
    if (!r) return { ok: false, error: `The ${label.toLowerCase()} could not be set up.` };
  }
  await pinPadOutputs();
  const w = dsWrite({ path: mode, speaker: vol.speaker ?? 80, headphones: vol.headphones ?? 80 });
  clearInterval(padPin); padPin = setInterval(() => { if (dsMode) pinPadOutputs(); }, 10000);
  return w.ok ? { ok: true } : { ok: false, error: w.error };
}
/* PipeWire does not always connect a new output to the device it was made for: it can fall back
   to the default output (the laptop speakers), so "Controller speaker" played on the laptop. Each
   controller output's stream is moved onto the controller itself, and checked again every 10
   seconds, since reconnecting the controller makes its sound device anew. */
let padPin = 0;
async function pinPadOutputs() {
  const sink = await dsSink(); if (!sink) return;
  const j = await run('pactl', ['-f', 'json', 'list', 'sink-inputs']); if (!j) return;
  let l; try { l = JSON.parse(j); } catch { return; }
  for (const i of l) {
    if (!String(i.properties?.['node.name'] || '').startsWith('output.bladedeck_pad_') || i.sink === sink.index) continue;
    await run('pactl', ['move-sink-input', String(i.index), sink.name]);
  }
}

/* -------------------------------------------------------------- multi-screen */
let p2 = null, deps = null;
// Displays, with KDE's connector name (eDP-1, HDMI-A-1) where it can be matched by position.
async function displays() {
  const ds = screen.getAllDisplays(), prim = screen.getPrimaryDisplay().id;
  let ks = [];
  if (process.platform === 'linux') {
    const j = await run('kscreen-doctor', ['-j']);
    try { ks = (JSON.parse(j || '{}').outputs || []).filter((o) => o.enabled && o.connected); } catch { ks = []; }
  }
  return ds.map((d, i) => {
    const k = ks.find((o) => o.pos && Math.abs(o.pos.x - d.bounds.x) < 4 && Math.abs(o.pos.y - d.bounds.y) < 4);
    const name = k?.name || '';
    return { id: d.id, n: i + 1, name, label: d.label || name || `Screen ${i + 1}`, builtIn: /^(eDP|LVDS|DSI)/i.test(name) || d.internal === true, bounds: d.bounds, primary: d.id === prim };
  });
}
/* Screens that show the same picture (mirrored) count as one. Multi-screen can set them side by
   side (extended) and put them back the way they were when it is turned off. */
let unmirrored = null;
async function kscreen() { if (process.platform !== 'linux') return []; try { return (JSON.parse((await run('kscreen-doctor', ['-j'])) || '{}').outputs || []).filter((o) => o.enabled && o.connected); } catch { return []; } }
async function mirrored() {
  if (process.platform !== 'linux') return [];
  const ks = await kscreen();
  return ks.filter((o) => o.replicationSource && o.replicationSource !== 0).map((o) => ({ name: o.name, source: (ks.find((x) => x.id === o.replicationSource) || {}).name || '' }));
}
async function extend(on) {
  if (process.platform !== 'linux') return { ok: false, error: 'Display management is supported on Linux (KDE Plasma).' };
  const ok = (r) => r !== null;
  if (on) {
    const ks = await kscreen(), m = await mirrored(); if (!m.length) return { ok: true };
    let right = Math.max(...ks.filter((o) => !m.some((x) => x.name === o.name)).map((o) => o.pos.x + (o.size?.width || 1920) / (o.scale || 1)));
    const args = [], back = [];
    for (const x of m) {
      const o = ks.find((k) => k.name === x.name);
      args.push(`output.${x.name}.mirror.none`, `output.${x.name}.position.${Math.round(right)},0`);
      back.push({ name: x.name, source: x.source, pos: o.pos });
      right += (o.size?.width || 1920) / (o.scale || 1);
    }
    // Older Plasma has no "mirror" setting; placing the screen beside the other does it there.
    if (!ok(await run('kscreen-doctor', args, 10000)) && !ok(await run('kscreen-doctor', args.filter((a) => !/\.mirror\./.test(a)), 10000))) return { ok: false, error: 'The screens could not be set side by side. Do it in System Settings, Display Configuration.' };
    unmirrored = back;
    await new Promise((r) => setTimeout(r, 1500));
    return { ok: true };
  }
  if (!unmirrored) return { ok: true };
  const args = unmirrored.flatMap((x) => [`output.${x.name}.position.${x.pos.x},${x.pos.y}`, ...(x.source ? [`output.${x.name}.mirror.${x.source}`] : [])]);
  unmirrored = null;
  return { ok: ok(await run('kscreen-doctor', args, 10000)) };
}
function displayById(id) { return screen.getAllDisplays().find((d) => d.id === +id) || null; }
function place(w, d) {
  if (!w || !d) return;
  const wasFull = w.isFullScreen();
  if (wasFull) w.setFullScreen(false);
  w.setBounds({ x: d.bounds.x + 40, y: d.bounds.y + 40, width: Math.min(1360, d.bounds.width - 80), height: Math.min(840, d.bounds.height - 80) });
  setTimeout(() => w.setFullScreen(true), 150);
}
function openP2(displayId) {
  const d = displayById(displayId); if (!d) return { ok: false, error: 'That screen is not connected.' };
  if (p2 && !p2.isDestroyed()) { place(p2, d); p2.show(); return { ok: true }; }
  p2 = new BrowserWindow({
    x: d.bounds.x + 40, y: d.bounds.y + 40, width: 1280, height: 760, backgroundColor: '#101410', autoHideMenuBar: true, show: false,
    title: 'Bladedeck — Player 2',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, webviewTag: false }
  });
  p2.setMenuBarVisibility(false);
  p2.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  p2.webContents.on('will-navigate', (ev) => ev.preventDefault());
  p2.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { player: '2' } });
  p2.once('ready-to-show', () => { p2.show(); p2.setFullScreen(true); });
  p2.on('focus', () => p2.webContents.send('deck-focus', true));
  p2.on('blur', () => p2.webContents.send('deck-focus', false));
  p2.on('page-title-updated', (ev) => ev.preventDefault());
  p2.on('closed', () => { p2 = null; const w = deps.getWin(); if (w && !w.isDestroyed()) w.webContents.send('ms-closed'); });
  return { ok: true };
}
function closeP2() { if (p2 && !p2.isDestroyed()) p2.close(); p2 = null; return true; }

/* A game for one player in multi-screen: only that player's controller exists for it, it may read
   the controller while another window has focus (both games run at once), and its sound goes to
   the player's output. Returns the program and arguments to run instead, and extra environment. */
function wrapForPlayer(exe, args, player) {
  const env = { SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS: '1' };
  if (player?.sink && /^[\w.:@+-]+$/.test(player.sink)) { env.PULSE_SINK = player.sink; env.PIPEWIRE_NODE = player.sink; }
  const mine = pads().filter((p) => (player?.pads || []).includes(p.id));
  const bwrap = ['/usr/bin/bwrap', '/bin/bwrap'].find((f) => fs.existsSync(f));
  if (!bwrap || !mine.length) return { exe, args, env, isolated: false };
  const keep = mine.flatMap((p) => [p.js, p.event].filter(Boolean)).flatMap((n) => ['--dev-bind', `/dev/input/${n}`, `/dev/input/${n}`]);
  return { exe: bwrap, args: ['--dev-bind', '/', '/', '--tmpfs', '/dev/input', ...keep, '--', exe, ...args], env, isolated: true };
}

/* The screen a player's menu is on, by KDE's name for it (eDP-1, HDMI-A-1). A player whose screen
   is "where Bladedeck is now" still has one: wherever their window is. */
async function screenOf(w) {
  if (!w || w.isDestroyed()) return '';
  const b = w.getBounds(), d = screen.getDisplayMatching(b);
  const l = await displays();
  return (l.find((x) => x.id === d.id) || {}).name || '';
}

/* A player's game sound stays on their output. Games Bladedeck starts get PULSE_SINK, but a Steam
   game is started by Steam, and some games open their sound late or reopen it: every 3 seconds,
   any stream from the game's processes (or, for Steam, any process of that Steam app) that is not
   on the player's output is moved there. */
const pins = new Map();
async function pinTick(key) {
  if (process.platform !== 'linux') return;
  const pin = pins.get(key); if (!pin) return;
  const j = await run('pactl', ['-f', 'json', 'list', 'sink-inputs']), sj = await run('pactl', ['-f', 'json', 'list', 'sinks']);
  let ins = [], sinks = []; try { ins = JSON.parse(j || '[]'); sinks = JSON.parse(sj || '[]'); } catch { return; }
  const target = sinks.find((x) => x.name === pin.sink); if (!target) return;
  const Procs = require('./procs');
  for (const i of ins) {
    if (i.sink === target.index) continue;
    const pid = +(i.properties?.['application.process.id'] || 0); if (!pid) continue;
    const inf = Procs.info(pid);
    const mine = (pin.pid && (pid === pin.pid || inf.ancestors.includes(pin.pid))) || (pin.appid && String(inf.appId) === String(pin.appid));
    if (mine) await run('pactl', ['move-sink-input', String(i.index), pin.sink]);
  }
}
function pinSound({ key, pid, appid, sink } = {}) {
  key = String(key || ''); if (!key) return false;
  const old = pins.get(key); if (old) clearInterval(old.t);
  if (!sink || !/^[\w.:@+-]+$/.test(sink)) { pins.delete(key); return true; }
  const pin = { pid: +pid || 0, appid: /^\d+$/.test(String(appid || '')) ? String(appid) : '', sink, t: null };
  pin.t = setInterval(() => pinTick(key), 3000);
  // Never forever: a session that was not ended still lets go after 12 hours.
  setTimeout(() => { if (pins.get(key) === pin) { clearInterval(pin.t); pins.delete(key); } }, 12 * 3600000);
  pins.set(key, pin); pinTick(key);
  return true;
}

function register(d) {
  deps = d;
  ipcMain.handle('pads-list', () => pads());
  ipcMain.handle('pads-claim', () => claim());
  ipcMain.handle('ds-status', () => dsStatus());
  ipcMain.handle('stadia-status', () => stadiaStatus());
  ipcMain.handle('ds-outputs', (_e, mode, vol) => dsOutputs(mode, vol || {}));
  ipcMain.handle('ds-set', (_e, o) => dsWrite(o || {}));
  ipcMain.handle('ms-displays', () => displays());
  ipcMain.handle('ms-open', (_e, displayId) => openP2(displayId));
  ipcMain.handle('ms-close', () => closeP2());
  ipcMain.handle('ms-mirrored', () => mirrored());
  ipcMain.handle('ms-extend', (_e, on) => extend(!!on));
  ipcMain.handle('ms-place-main', (_e, displayId) => { place(deps.getWin(), displayById(displayId)); return true; });
  // Raise one player's own Bladedeck window (their menu), on their screen.
  // Player 2's menu cannot write the library, so its finished sessions go to Player 1's menu.
  ipcMain.handle('ms-report', (e, r) => {
    if (!p2 || p2.isDestroyed() || e.sender !== p2.webContents) return false;
    const w = deps.getWin(); if (!w || w.isDestroyed()) return false;
    const id = String(r?.id || '').slice(0, 80), seconds = Math.max(0, Math.min(86400, Math.round(+r?.seconds || 0)));
    if (!id) return false;
    w.webContents.send('p2-session', { id, seconds, at: Date.now() }); return true;
  });
  ipcMain.handle('ms-my-screen', (e) => screenOf(BrowserWindow.fromWebContents(e.sender)));
  ipcMain.handle('ms-pin-sound', (_e, o) => pinSound(o || {}));
  ipcMain.handle('ms-menu', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) { w.show(); w.moveTop(); w.focus(); require('./peek').focusDeck(w.getTitle()); } return true; });
}

// The DualSense outputs are Bladedeck's; they go away with it.
// (Synchronous: it runs while Bladedeck quits.)
function stop() {
  closeP2();
  for (const p of pins.values()) clearInterval(p.t); pins.clear(); clearInterval(padPin);
  if (process.platform === 'linux') {
    try {
      const out = require('child_process').execFileSync('pactl', ['list', 'short', 'modules'], { encoding: 'utf8', timeout: 3000 });
      for (const l of out.split('\n')) if (/sink_name=bladedeck_pad_/.test(l)) require('child_process').execFileSync('pactl', ['unload-module', l.split('\t')[0]], { timeout: 3000 });
    } catch { /* no pactl */ }
  }
}

module.exports = { register, wrapForPlayer, pads, stop, p2: () => p2 };
