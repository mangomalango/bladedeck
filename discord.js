'use strict';
/* Discord Rich Presence: shows friends on Discord what you are playing on Bladedeck,
   how long you have been playing, and your emulator or system. Connects directly to Discord's
   local IPC socket (on Linux, macOS or Windows) without extra tools or dependencies.
   Settings, Suggested extras turns it on or off. */
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ipcMain } = require('electron');

/* Discord shows a status only for an application registered on its developer site. Bladedeck has
   none of its own, so the player makes one (discord.com/developers/applications, New Application,
   any name such as "Bladedeck") and pastes its Application ID in Suggested extras. Without one, or
   with it switched off, nothing is ever sent. */
const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;

let sock = null, connected = false, curActivity = null, reconnectT = 0;
let getSettings = () => ({});

function socketPath() {
  if (process.platform === 'win32') {
    return '\\\\?\\pipe\\discord-ipc-0';
  }
  const xdg = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() || 1000}`;
  const candidates = [xdg, '/tmp', path.join(xdg, 'app', 'com.discordapp.Discord')];
  for (const dir of candidates) {
    for (let i = 0; i < 10; i++) {
      const p = path.join(dir, `discord-ipc-${i}`);
      try { if (fs.existsSync(p)) return p; } catch { /* next */ }
    }
  }
  return path.join(xdg, 'discord-ipc-0');
}

function sendPacket(op, data) {
  if (!sock || sock.destroyed) return false;
  try {
    const json = Buffer.from(JSON.stringify(data), 'utf8');
    const header = Buffer.alloc(8);
    header.writeInt32LE(op, 0);
    header.writeInt32LE(json.length, 4);
    sock.write(Buffer.concat([header, json]));
    return true;
  } catch {
    return false;
  }
}

function connect() {
  if (sock && !sock.destroyed) return;
  const p = socketPath();
  try {
    sock = net.createConnection(p);
    sock.on('connect', () => {
      connected = true;
      sendPacket(OP_HANDSHAKE, { v: 1, client_id: getSettings().discordClientId });
      if (curActivity) sendPacket(OP_FRAME, curActivity);
    });
    sock.on('data', () => { /* messages acknowledged */ });
    sock.on('error', () => { closeSock(); });
    sock.on('close', () => { closeSock(); });
  } catch {
    closeSock();
  }
}

function closeSock() {
  connected = false;
  if (sock) {
    try { sock.destroy(); } catch { /* closed */ }
    sock = null;
  }
}

function setActivity(info) {
  const st = getSettings();
  // Off unless asked for: sharing what you play leaves this PC, so it is a deliberate choice.
  if (st.discordRpc !== true || !/^\d{15,22}$/.test(String(st.discordClientId || ''))) { clearActivity(); return; }
  if (!info || !info.title) { clearActivity(); return; }

  const startTime = info.started ? Math.floor(+info.started / 1000) : Math.floor(Date.now() / 1000);
  const state = info.system ? `Playing on ${info.system}` : info.type === 'steam' ? 'Steam' : 'On Bladedeck';

  curActivity = {
    cmd: 'SET_ACTIVITY',
    args: {
      pid: process.pid,
      activity: {
        details: String(info.title).slice(0, 120),
        state: String(state).slice(0, 120),
        timestamps: { start: startTime },
        assets: {
          large_image: 'bladedeck_logo',
          large_text: String(info.title).slice(0, 120),
          small_image: 'playing',
          small_text: 'Bladedeck'
        }
      }
    },
    nonce: crypto.randomUUID()
  };

  if (!connected) connect();
  else sendPacket(OP_FRAME, curActivity);
}

function clearActivity() {
  curActivity = null;
  if (!connected) return;
  sendPacket(OP_FRAME, {
    cmd: 'SET_ACTIVITY',
    args: { pid: process.pid, activity: null },
    nonce: crypto.randomUUID()
  });
}

function stop() {
  clearTimeout(reconnectT);
  clearActivity();
  closeSock();
}

function register({ settings }) {
  getSettings = settings || (() => ({}));
  ipcMain.handle('discord-set', (_e, info) => { setActivity(info); return true; });
  ipcMain.handle('discord-clear', () => { clearActivity(); return true; });
}

module.exports = { register, setActivity, clearActivity, stop };
