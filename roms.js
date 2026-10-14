'use strict';
/* ROMs, the system side (renderer/roms.js is the rest).
   - Game files handed to Bladedeck from outside ("Open with Bladedeck" in a file manager, or
     `bladedeck game.iso`) are passed to the menu to play.
   - BIOS and firmware: where each emulator looks for them, and copying files you pick (from your
     own dumps, a folder or a drive) into that folder. Only folders listed here are ever written,
     and only files you just picked in the system's file dialog are copied. */
const { ipcMain, dialog, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

/* -------------------------------------------------------------- BIOS folders */
// [emulator, what it needs, Flatpak folder, regular folder, Windows folder]
function biosTable() {
  const h = os.homedir(), v = (id, ...p) => path.join(h, '.var/app', id, ...p), c = (...p) => path.join(h, '.config', ...p), d = (...p) => path.join(h, '.local/share', ...p);
  const doc = (...p) => path.join(h, 'Documents', ...p), ad = (...p) => path.join(process.env.APPDATA || path.join(h, 'AppData', 'Roaming'), ...p);
  return [
    ['pcsx2', 'PCSX2', 'PS2 BIOS (required)', v('net.pcsx2.PCSX2', 'config/PCSX2/bios'), c('PCSX2/bios'), doc('PCSX2', 'bios')],
    ['duckstation', 'DuckStation', 'PS1 BIOS (required)', v('org.duckstation.DuckStation', 'config/duckstation/bios'), d('duckstation/bios'), doc('DuckStation', 'bios')],
    ['retroarch', 'RetroArch', 'System files for its cores', v('org.libretro.RetroArch', 'config/retroarch/system'), c('retroarch/system'), ad('RetroArch', 'system')],
    ['ryujinx', 'Ryujinx', 'Switch keys (prod.keys, title.keys); firmware is installed from its menu', v('io.github.ryubing.Ryujinx', 'config/Ryujinx/system'), c('Ryujinx/system'), ad('Ryujinx', 'system')],
    ['dolphin', 'Dolphin', 'GameCube IPL (optional, for the boot animation)', v('org.DolphinEmu.dolphin-emu', 'data/dolphin-emu/GC'), d('dolphin-emu/GC'), doc('Dolphin Emulator', 'GC')],
    ['melonds', 'melonDS', 'DS BIOS and firmware (optional)', v('net.kuribo64.melonDS', 'config/melonDS'), c('melonDS'), ad('melonDS')],
    ['flycast', 'Flycast', 'Dreamcast BIOS (dc_boot.bin, dc_flash.bin; optional)', v('org.flycast.Flycast', 'data/flycast'), d('flycast'), ad('flycast', 'data')],
    ['xemu', 'xemu', 'Xbox BIOS, MCPX boot ROM and hard disk image (set in its settings)', v('app.xemu.xemu', 'data/xemu/xemu'), d('xemu/xemu'), ad('xemu', 'xemu')],
    ['rpcs3', 'RPCS3', 'PS3 firmware (PS3UPDAT.PUP), installed from its File menu', '', '', ''],
    ['shadps4', 'shadPS4', 'PS4 system modules (optional, from your console)', '', d('shadPS4/sys_modules'), ad('shadPS4', 'sys_modules')]
  ];
}
// The folder to use for one emulator: the one that exists (Flatpak first), else the one its
// install would use.
function biosDir(id) {
  const row = biosTable().find((r) => r[0] === id); if (!row) return null;
  const [, name, need, flat, reg, win] = row;
  if (process.platform === 'win32') return win ? { name, need, dir: win, exists: fs.existsSync(win) } : { name, need, dir: '', exists: false };
  const appDir = flat && flat.split(path.sep).slice(0, flat.split(path.sep).indexOf('app') + 2).join(path.sep);
  const pick = [flat, reg].find((p) => p && fs.existsSync(p)) || (flat && fs.existsSync(appDir) ? flat : reg);
  return { name, need, dir: pick || '', exists: !!pick && fs.existsSync(pick) };
}

function register({ getWin }) {
  ipcMain.handle('bios-list', () => biosTable().map(([id]) => ({ id, ...biosDir(id) })));
  // Pick files and copy them into one emulator's BIOS folder. Never overwrites without saying so.
  ipcMain.handle('bios-add', async (e, id) => {
    const b = biosDir(String(id)); if (!b || !b.dir) return { ok: false, error: 'This emulator takes its files from its own menu.' };
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: `Files for ${b.name}`, properties: ['openFile', 'multiSelections'] });
    if (r.canceled || !r.filePaths.length) return { ok: false, cancelled: true };
    fs.mkdirSync(b.dir, { recursive: true });
    const copied = [], replaced = [];
    for (const f of r.filePaths) {
      let st; try { st = fs.statSync(f); } catch { continue; }
      if (!st.isFile() || st.size > 512 * 1024 ** 2) continue; // BIOS and key files are small
      const to = path.join(b.dir, path.basename(f));
      if (fs.existsSync(to)) replaced.push(path.basename(f));
      fs.copyFileSync(f, to); copied.push(path.basename(f));
    }
    return { ok: true, dir: b.dir, copied, replaced };
  });
  ipcMain.handle('bios-open', (_e, id) => { const b = biosDir(String(id)); if (!b?.dir) return false; fs.mkdirSync(b.dir, { recursive: true }); shell.openPath(b.dir); return true; });

  // A game file given on the command line, now or to an already running Bladedeck.
  const fileArg = (argv) => argv.slice(1).find((a) => !a.startsWith('-') && path.isAbsolute(a) && fs.existsSync(a) && fs.statSync(a).isFile() && !/\.(js|asar)$/i.test(a));
  const send = (f) => { const w = getWin(); if (f && w && !w.isDestroyed()) w.webContents.send('open-file', f); };
  const first = fileArg(process.argv);
  if (first) ipcMain.once('ready-for-files', () => send(first));
  require('electron').app.on('second-instance', (_ev, argv) => send(fileArg(argv)));
}

module.exports = { register };
