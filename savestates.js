'use strict';
/* Save states: the states an emulator has kept for one game, so the game can start right where
   one left off. Each emulator names them its own way:
     PCSX2        sstates/<serial> (<crc>).<slot or resume>.p2s     serial from the disc's SYSTEM.CNF
     DuckStation  savestates/<serial>_<slot or resume>.sav           same
     PPSSPP       PSP/PPSSPP_STATE/<disc id>_<version>_<slot>.ppst   disc id from PARAM.SFO
     Dolphin      StateSaves/<game id>.s<slot>                       game id: the disc's first 6 bytes
     mGBA         <rom name>.ss<slot>, next to the game
     RetroArch    states/<core>/<rom name>.state<slot> (or .state.auto)
   and each loads one at start with its own option. A PCSX2 state carries a screenshot, shown in
   the chooser. Only files listed here for the game can be passed to an emulator. */
const { ipcMain } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = (cmd, args, timeout = 30000) => new Promise((res) => execFile(cmd, args, { timeout, encoding: 'buffer', maxBuffer: 16 << 20 }, (err, out) => res(err ? null : out)));
const h = os.homedir(), v = (id, ...p) => path.join(h, '.var/app', id, ...p), c = (...p) => path.join(h, '.config', ...p), d = (...p) => path.join(h, '.local/share', ...p);
const doc = (...p) => path.join(h, 'Documents', ...p), ad = (...p) => path.join(process.env.APPDATA || path.join(h, 'AppData', 'Roaming'), ...p);
const KINDS = [
  ['pcsx2', /pcsx2/i, [v('net.pcsx2.PCSX2', 'config/PCSX2/sstates'), c('PCSX2/sstates'), doc('PCSX2', 'sstates')]],
  ['duckstation', /duckstation/i, [v('org.duckstation.DuckStation', 'config/duckstation/savestates'), d('duckstation/savestates'), doc('DuckStation', 'savestates')]],
  ['ppsspp', /ppsspp/i, [v('org.ppsspp.PPSSPP', 'config/ppsspp/PSP/PPSSPP_STATE'), c('ppsspp/PSP/PPSSPP_STATE'), doc('PPSSPP', 'PSP', 'PPSSPP_STATE')]],
  ['dolphin', /dolphin/i, [v('org.DolphinEmu.dolphin-emu', 'data/dolphin-emu/StateSaves'), d('dolphin-emu/StateSaves'), doc('Dolphin Emulator', 'StateSaves')]],
  ['mgba', /mgba/i, []],
  ['retroarch', /retroarch/i, [v('org.libretro.RetroArch', 'config/retroarch/states'), c('retroarch/states'), ad('RetroArch', 'states')]]
];
const kindOf = (em) => KINDS.find(([, re]) => re.test(`${em?.name || ''} ${em?.exe || ''} ${em?.args || ''}`)) || null;
const ls = (dir) => { try { return fs.readdirSync(dir); } catch { return []; } };

/* -------------------------------------------------------------- which game is it */
const ids = new Map();
async function discFile(rom, inner) {
  if (!/\.(iso|bin|img)$/i.test(rom)) return null;
  const out = await run('7z', ['e', '-so', rom, inner]);
  return out && out.length ? out : null;
}
// PS1/PS2: SYSTEM.CNF says BOOT2 = cdrom0:\SLUS_211.89;1, which is SLUS-21189.
async function psSerial(rom) {
  let r = rom;
  if (/\.cue$/i.test(rom)) { const m = fs.readFileSync(rom, 'utf8').match(/FILE\s+"([^"]+)"/i); if (m) r = path.join(path.dirname(rom), m[1]); }
  const cnf = await discFile(r, 'SYSTEM.CNF'); if (!cnf) return null;
  const m = String(cnf).match(/BOOT2?\s*=\s*cdrom0?:\\?([A-Z]{4})[_-](\d{3})\.(\d{2})/i);
  return m ? `${m[1].toUpperCase()}-${m[2]}${m[3]}` : null;
}
// PSP: PARAM.SFO holds DISC_ID (ULUS10041).
async function pspId(rom) {
  const sfo = await discFile(rom, 'PSP_GAME/PARAM.SFO'); if (!sfo || sfo.readUInt32LE(0) !== 0x46535000) return null;
  const keys = sfo.readUInt32LE(8), vals = sfo.readUInt32LE(12), n = sfo.readUInt32LE(16);
  for (let i = 0; i < n; i++) {
    const e = 20 + i * 16, k = sfo.toString('utf8', keys + sfo.readUInt16LE(e), sfo.indexOf(0, keys + sfo.readUInt16LE(e)));
    if (k === 'DISC_ID') { const off = vals + sfo.readUInt32LE(e + 12), len = sfo.readUInt32LE(e + 4); return sfo.toString('utf8', off, off + len).replace(/\0.*$/, ''); }
  }
  return null;
}
// GameCube / Wii: the first six bytes of a plain disc image (GALE01). Compressed RVZ is not read.
function gcId(rom) {
  if (!/\.(iso|gcm)$/i.test(rom)) return null;
  try { const fd = fs.openSync(rom, 'r'), b = Buffer.alloc(6); fs.readSync(fd, b, 0, 6, 0); fs.closeSync(fd); const s = b.toString('ascii'); return /^[A-Z0-9]{6}$/.test(s) ? s : null; } catch { return null; }
}
async function gameId(kind, rom) {
  let st; try { st = fs.statSync(rom); } catch { return null; }
  const k = `${kind}|${rom}|${st.mtimeMs}`;
  if (ids.has(k)) return ids.get(k);
  const id = kind === 'pcsx2' || kind === 'duckstation' ? await psSerial(rom) : kind === 'ppsspp' ? await pspId(rom) : kind === 'dolphin' ? gcId(rom) : null;
  ids.set(k, id);
  return id;
}

/* -------------------------------------------------------------- the states */
async function states(entry, em) {
  const kind = kindOf(em); if (!kind || !entry?.rom) return [];
  const [name, , dirs] = kind, rom = entry.rom, base = path.basename(rom, path.extname(rom));
  const out = [];
  const add = (file, slot) => { try { const s = fs.statSync(file); if (s.isFile() && s.size > 1024) out.push({ file, slot, time: s.mtimeMs, size: s.size }); } catch { /* gone */ } };
  if (name === 'mgba') { for (const f of ls(path.dirname(rom))) { const m = f.match(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.ss(\\d)$`)); if (m) add(path.join(path.dirname(rom), f), +m[1]); } }
  else if (name === 'retroarch') {
    const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const root of dirs) for (const sub of ['', ...ls(root)]) for (const f of ls(path.join(root, sub))) {
      const m = f.match(new RegExp(`^${esc}\\.state(\\d*)(\\.auto)?$`)); if (m) add(path.join(root, sub, f), m[2] ? 'resume' : +(m[1] || 0));
    }
  } else {
    const id = await gameId(name, rom); if (!id) return [];
    for (const root of dirs) for (const f of ls(root)) {
      let m;
      if (name === 'pcsx2' && (m = f.match(/^(\S+) \([0-9A-F]{8}\)\.(\d{2}|resume)\.p2s$/i)) && m[1] === id) add(path.join(root, f), m[2] === 'resume' ? 'resume' : +m[2]);
      else if (name === 'duckstation' && (m = f.match(/^(\S+?)_(\d+|resume)\.sav$/i)) && m[1] === id) add(path.join(root, f), m[2] === 'resume' ? 'resume' : +m[2]);
      else if (name === 'ppsspp' && (m = f.match(/^([A-Z]{4}\d{5})_[\d.]+_(\d+)\.ppst$/)) && m[1] === id) add(path.join(root, f), +m[2]);
      else if (name === 'dolphin' && (m = f.match(/^([A-Z0-9]{6})\.s(\d{2})$/)) && m[1] === id) add(path.join(root, f), +m[2]);
    }
  }
  return out.sort((a, b) => b.time - a.time);
}

// A PCSX2 state is a zip with a screenshot inside: shown in the chooser.
async function thumb(file) {
  if (!/\.p2s$/i.test(file)) return null;
  const png = await run('7z', ['e', '-so', file, 'Screenshot.png']);
  return png && png.length > 100 ? `data:image/png;base64,${png.toString('base64')}` : null;
}

/* For launching: the emulator's own option to start from this state, put before the game's path. */
async function withState(args, entry, em, file) {
  const kind = kindOf(em); if (!kind || !file) return args;
  const ok = (await states(entry, em)).some((s) => s.file === file);
  if (!ok) return args;
  const name = kind[0];
  const flag = name === 'pcsx2' || name === 'duckstation' ? ['-statefile', file] : name === 'dolphin' ? ['-s', file] : name === 'ppsspp' ? [`--state=${file}`] : name === 'mgba' ? ['-t', file] : null;
  if (!flag) return args;
  const at = args.indexOf('--') >= 0 ? args.indexOf('--') : args.findIndex((a) => a === entry.rom || a === '-e');
  const i = at >= 0 ? at : args.length - 1;
  return [...args.slice(0, i), ...flag, ...args.slice(i)];
}

function register({ getLib }) {
  ipcMain.handle('save-states', async (_e, entry) => {
    const lib = getLib(); const em = lib.emulators.find((x) => x.id === entry?.emulatorId);
    const list = await states(entry, em);
    for (const s of list.slice(0, 6)) s.thumb = await thumb(s.file);
    return list;
  });
}

module.exports = { register, withState, states };
