'use strict';
/* Game recording, like a console's: record whenever you like, and keep the last 30 seconds (or
   more) ready to save, for the moment you did not expect. Clips land in Videos/Bladedeck/<game>.
   On Linux this uses GPU Screen Recorder, which encodes on the graphics card (AV1 where the card
   can, which also plays inside Bladedeck) and barely touches game performance. One process holds
   the replay buffer and makes full recordings too:
     SIGUSR1   save the replay buffer      SIGRTMIN  start/stop a full recording
     SIGINT    stop (the buffer is dropped)
   On Wayland it asks once which screen to record and remembers (restore-portal-session).
   Without it (Windows, or not installed) the page records with its own encoder; see capture.js
   in the renderer. Files are found by watching the folder, then moved into the game's folder. */
const { app, ipcMain, Notification, shell } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const FLAT = 'com.dec05eba.gpu_screen_recorder';
const root = () => path.join(app.getPath('videos'), 'Bladedeck');
const inbox = () => path.join(root(), '.incoming');
const VIDEO = /\.(webm|mp4|mkv|mov)$/i;

let send = () => {}, gsr = null, proc = null, mode = null, recording = false, recStart = 0, codec = null, watcher = null;
let current = { title: '', id: '' };

function onPath(cmd) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) { const p = path.join(dir, cmd); try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* next */ } }
  return null;
}
const flatpakHas = (id) => [path.join(os.homedir(), '.local/share/flatpak/app', id), path.join('/var/lib/flatpak/app', id)].some((p) => fs.existsSync(p));

// How to run it: the program on the PATH, or the Flathub app's command.
function find() {
  if (process.platform !== 'linux') return null;
  const exe = onPath('gpu-screen-recorder');
  if (exe) return { cmd: exe, pre: [] };
  if (flatpakHas(FLAT)) return { cmd: onPath('flatpak') || '/usr/bin/flatpak', pre: ['run', '--command=gpu-screen-recorder', FLAT] };
  return null;
}

// AV1 in WebM plays inside Bladedeck (Electron cannot play H.264); fall back to H.264 MP4.
async function pickCodec() {
  if (codec) return codec;
  codec = await new Promise((res) => execFile(gsr.cmd, [...gsr.pre, '--info'], { timeout: 15000 }, (err, out) => {
    const s = String(out || '');
    res(/^av1$/m.test(s) ? { k: 'av1', ac: 'opus', c: 'webm', ext: 'webm' } : { k: 'h264', ac: 'aac', c: 'mp4', ext: 'mp4' });
  }));
  return codec;
}

const wayland = () => process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY;
async function args(opts, replaySecs) {
  const c = await pickCodec();
  const audio = opts.mic ? ['-a', 'default_output|default_input'] : ['-a', 'default_output'];
  return [
    ...gsr.pre, '-w', wayland() ? 'portal' : 'screen', ...(wayland() ? ['-restore-portal-session', 'yes'] : []),
    '-f', String(opts.fps || 60), ...audio, '-k', c.k, '-ac', c.ac, '-c', c.c, '-q', 'very_high', '-cursor', 'no',
    ...(replaySecs ? ['-r', String(replaySecs), '-o', inbox(), '-ro', inbox()] : ['-o', path.join(inbox(), `Video_${stamp()}.${c.ext}`)])
  ];
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// The recorder itself inside the Flatpak sandbox: signals go to it, not to "flatpak run".
function target() {
  if (!proc) return 0;
  if (!gsr.pre.length) return proc.pid;
  const kids = new Map();
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try { const st = fs.readFileSync(`/proc/${d}/stat`, 'utf8'); const pp = +st.slice(st.lastIndexOf(')') + 2).split(' ')[1]; if (!kids.has(pp)) kids.set(pp, []); kids.get(pp).push(+d); } catch { /* gone */ }
  }
  const walk = (p) => { for (const k of kids.get(p) || []) { let cl = ''; try { cl = fs.readFileSync(`/proc/${k}/cmdline`, 'utf8'); } catch { /* gone */ } if (/gpu-screen-recorder/.test(cl) && !/flatpak|bwrap/.test(cl.split('\0')[0])) return k; const f = walk(k); if (f) return f; } return 0; };
  return walk(proc.pid) || proc.pid;
}
const sig = (s) => { const t = target(); if (!t) return false; try { process.kill(t, s); return true; } catch { return false; } };

// Finished files appear in the inbox; move each into its game's folder and say so.
function watch() {
  if (watcher) return;
  fs.mkdirSync(inbox(), { recursive: true });
  const seen = new Set(fs.readdirSync(inbox()));
  watcher = setInterval(() => {
    let files; try { files = fs.readdirSync(inbox()).filter((f) => VIDEO.test(f) && !seen.has(f)); } catch { return; }
    for (const f of files) {
      const p = path.join(inbox(), f);
      let st; try { st = fs.statSync(p); } catch { continue; }
      // Still being written: wait until it stops growing.
      if (Date.now() - st.mtimeMs < 1500) continue;
      seen.add(f);
      const dir = path.join(root(), (current.title || 'Desktop').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Desktop');
      fs.mkdirSync(dir, { recursive: true });
      const kind = /^Replay/i.test(f) ? 'replay' : 'recording';
      const to = path.join(dir, `${current.title || 'Clip'} ${kind === 'replay' ? 'replay' : 'recording'} ${stamp()}${path.extname(f)}`.replace(/[\\/:*?"<>|]+/g, ''));
      try { fs.renameSync(p, to); } catch { continue; }
      send('capture-saved', { file: to, kind, id: current.id, title: current.title, secs: kind === 'recording' ? Math.round((Date.now() - recStart) / 1000) : null });
      if (Notification.isSupported()) new Notification({ title: kind === 'replay' ? 'Clip saved' : 'Recording saved', body: `${current.title || 'Desktop'} · Videos/Bladedeck`, silent: true }).show();
    }
  }, 1000);
}

function status() { return { available: !!(gsr = gsr || find()), running: !!proc, mode, recording, since: recStart, dir: root() }; }

async function startReplay(opts) {
  gsr = gsr || find(); if (!gsr) return status();
  if (proc && mode === 'replay') return status();
  if (proc) stop();
  fs.mkdirSync(inbox(), { recursive: true }); watch();
  proc = spawn(gsr.cmd, await args(opts, Math.max(5, Math.min(600, +opts.replay || 30))), { stdio: 'ignore' });
  mode = 'replay';
  proc.on('exit', () => { proc = null; mode = null; recording = false; send('capture-status', status()); });
  send('capture-status', status());
  return status();
}

async function toggleRecord(opts) {
  gsr = gsr || find(); if (!gsr) return { ...status(), fallback: true };
  watch();
  if (proc && mode === 'replay') {
    // A full recording inside the running replay process.
    sig(34); recording = !recording; if (recording) recStart = Date.now();
  } else if (proc && mode === 'record') {
    sig('SIGINT'); recording = false;
  } else {
    fs.mkdirSync(inbox(), { recursive: true });
    proc = spawn(gsr.cmd, await args(opts, 0), { stdio: 'ignore' });
    mode = 'record'; recording = true; recStart = Date.now();
    proc.on('exit', () => { proc = null; mode = null; recording = false; send('capture-status', status()); });
  }
  send('capture-status', status());
  return status();
}

function saveReplay() {
  if (!proc || mode !== 'replay') return { ...status(), noReplay: true };
  sig('SIGUSR1');
  return status();
}

function stop() { if (proc) { sig('SIGINT'); const p = proc; setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* gone */ } }, 4000); } proc = null; mode = null; recording = false; }

// Every capture, newest first, for the gallery.
function list() {
  const out = [];
  const walk = (d, depth) => {
    let items; try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (it.name.startsWith('.')) continue;
      const p = path.join(d, it.name);
      if (it.isDirectory() && depth < 2) walk(p, depth + 1);
      else if (VIDEO.test(it.name)) { try { const st = fs.statSync(p); out.push({ file: p, game: path.basename(d), size: st.size, at: st.mtimeMs, ext: path.extname(it.name).slice(1).toLowerCase() }); } catch { /* gone */ } }
    }
  };
  walk(root(), 0);
  return out.sort((a, b) => b.at - a.at).slice(0, 300);
}

function register({ getWin }) {
  send = (ch, d) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, d); };
  ipcMain.handle('capture-status', () => status());
  ipcMain.handle('capture-game', (_e, g) => { current = { title: String(g?.title || ''), id: String(g?.id || '') }; return true; });
  ipcMain.handle('capture-replay', (_e, opts) => startReplay(opts || {}));
  ipcMain.handle('capture-record', (_e, opts) => toggleRecord(opts || {}));
  ipcMain.handle('capture-save', () => saveReplay());
  ipcMain.handle('capture-stop', () => { stop(); return status(); });
  ipcMain.handle('capture-list', () => list());
  ipcMain.handle('capture-delete', (_e, file) => { const f = path.resolve(String(file)); if (!f.startsWith(root() + path.sep) || !VIDEO.test(f)) return false; try { fs.rmSync(f); return true; } catch { return false; } });
  ipcMain.handle('capture-dir', () => { fs.mkdirSync(root(), { recursive: true }); return root(); });
  // Open a clip in the video player, or the captures folder: nothing outside it.
  ipcMain.handle('capture-open', async (_e, file) => {
    fs.mkdirSync(root(), { recursive: true });
    const f = file ? path.resolve(String(file)) : root();
    if (f !== root() && !f.startsWith(root() + path.sep)) return false;
    return !(await shell.openPath(f));
  });
  // The page's own recorder (Windows, or no GPU Screen Recorder) writes here too.
  ipcMain.handle('capture-write', (_e, { name, data, title }) => {
    const dir = path.join(root(), String(title || 'Desktop').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Desktop');
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, String(name).replace(/[\\/:*?"<>|]+/g, ''));
    fs.writeFileSync(f, Buffer.from(data));
    return f;
  });
  app.on('will-quit', stop);
}

module.exports = { register, status };
