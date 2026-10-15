'use strict';
/* Game music: a game's own music, for playing while it is highlighted in the menu.
   Where it comes from, in order:
   - the music file picked for the game (Edit, Music)
   - Steam soundtracks you own (steamapps/music/<name> Soundtrack)
   - the game's own folder: PC games usually keep their music as ordinary audio files (music, bgm,
     ost folders); sound effects and voice lines are passed over
   - disc images (PS1, PS2, PSP .iso): read with 7z, and a music track in a format ffmpeg knows
     (ADX, HCA, AT3, BRSTM, VAG, Ogg…) is turned into a short Ogg clip
   Cartridge ROMs and Xbox 360 or GameCube discs keep music as code or in formats no tool here
   reads; those use a picked file. Anything found once is remembered (game-music.json, and the
   clips made from discs in game-music/). */
const { ipcMain, app } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PLAYS = /\.(ogg|oga|opus|mp3|flac|wav|m4a)$/i;           // the menu can play these as they are
const CONVERTS = /\.(adx|hca|at3|at9|brstm|bcstm|bfstm|vag|xa|ogg|mp3|wav|aax|aix)$/i; // on a disc: worth trying with ffmpeg
const GOOD = /music|bgm|\bost\b|soundtrack|theme|title|menu|main|track|song|stream|\bbg\b/i;
const BAD = /sfx|\bse\b|se_|select|cursor|confirm|cancel|beep|blip|move|pickup|coin|sound.?effect|voice|\bvo\b|vo_|dialog|speech|narrat|ambien|amb_|foot|step|ui_|click|hit_|impact|explos|weapon|gun|jingle|fanfare|stinger|test|silence/i;
const run = (cmd, args, timeout = 60000, opts = {}) => new Promise((res) => execFile(cmd, args, { timeout, maxBuffer: 64 << 20, windowsHide: true, ...opts }, (err, out) => res(err ? null : out)));
const dir = () => path.join(app.getPath('userData'), 'game-music');
const indexFile = () => path.join(app.getPath('userData'), 'game-music.json');
let index = null;
const load = () => { if (!index) { try { index = JSON.parse(fs.readFileSync(indexFile(), 'utf8')); } catch { index = {}; } } return index; };
const keep = (id, v) => { load()[id] = v; try { fs.writeFileSync(indexFile(), JSON.stringify(index)); } catch { /* optional */ } return v.file || null; };

/* -------------------------------------------------------------- Steam */
function steamLibs() {
  const h = os.homedir();
  const roots = [path.join(h, '.local/share/Steam'), path.join(h, '.steam/steam'), path.join(h, '.var/app/com.valvesoftware.Steam/.local/share/Steam'), 'C:\\Program Files (x86)\\Steam'].filter((p) => fs.existsSync(path.join(p, 'steamapps')));
  const libs = new Set(roots);
  for (const r of roots) { try { for (const m of fs.readFileSync(path.join(r, 'steamapps', 'libraryfolders.vdf'), 'utf8').matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\')); } catch { /* one library */ } }
  return [...libs];
}
function steamDir(appid) {
  for (const lib of steamLibs()) {
    try {
      const mf = fs.readFileSync(path.join(lib, 'steamapps', `appmanifest_${appid}.acf`), 'utf8');
      const d = (mf.match(/"installdir"\s+"([^"]+)"/) || [])[1];
      if (d) return path.join(lib, 'steamapps', 'common', d);
    } catch { /* not in this library */ }
  }
  return null;
}
const squash = (t) => String(t || '').toLowerCase().replace(/[™®©]/g, '').replace(/[^a-z0-9]+/g, '');
function steamSoundtrack(title) {
  const want = squash(title); if (want.length < 3) return null;
  for (const lib of steamLibs()) {
    const m = path.join(lib, 'steamapps', 'music');
    let names = []; try { names = fs.readdirSync(m); } catch { continue; }
    const hit = names.find((n) => squash(n).startsWith(want) || squash(n).includes(want));
    if (hit) { const f = best(path.join(m, hit), 4); if (f) return f; }
  }
  return null;
}

/* -------------------------------------------------------------- a folder */
// The likeliest music file in a folder: named like music, not like a sound effect, song-sized.
function best(root, maxDepth = 7) {
  const found = []; let seen = 0;
  const walk = (d, depth) => {
    if (depth > maxDepth || seen > 40000) return;
    let items; try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (++seen > 40000) return;
      const p = path.join(d, it.name);
      if (it.isDirectory()) { if (!/^(\.|shadercache|logs?|crash|redist|_commonredist|directx|vcredist)/i.test(it.name)) walk(p, depth + 1); }
      else if (PLAYS.test(it.name)) { let size = 0; try { size = fs.statSync(p).size; } catch { continue; } found.push({ p, size }); }
    }
  };
  walk(root, 0);
  const score = ({ p, size }) => {
    const rel = path.relative(root, p);
    let s = 0;
    if (GOOD.test(rel)) s += 5;
    if (/title|menu|main.?theme|theme/i.test(path.basename(p))) s += 3;
    if (BAD.test(rel)) s -= 8;
    const mb = size / 1048576;
    s += mb >= 1 && mb <= 25 ? 3 : mb < 0.3 ? -12 : mb < 1 ? -2 : -1; // songs are big, sound effects tiny
    return s;
  };
  const top = found.map((f) => ({ ...f, s: score(f) })).filter((f) => f.s > 0).sort((a, b) => b.s - a.s || b.size - a.size)[0];
  return top ? top.p : null;
}

/* -------------------------------------------------------------- a disc image */
async function fromDisc(id, iso) {
  if (!/\.(iso|bin|img)$/i.test(iso) || !fs.existsSync(iso)) return null;
  const list = await run('7z', ['l', '-slt', '-ba', iso], 60000);
  if (!list) return null;
  const files = [];
  for (const block of String(list).split(/\n\s*\n/)) {
    const p = (block.match(/^Path = (.*)$/m) || [])[1], size = +((block.match(/^Size = (\d+)/m) || [])[1] || 0);
    if (p && size > 200000 && size < 80 * 1048576 && CONVERTS.test(p) && !BAD.test(p)) files.push({ p, size, s: (GOOD.test(p) ? 5 : 0) + (/title|menu|opening/i.test(p) ? 3 : 0) });
  }
  files.sort((a, b) => b.s - a.s || b.size - a.size);
  fs.mkdirSync(dir(), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bladedeck-music-'));
  try {
    for (const f of files.slice(0, 5)) {
      // One file out of the disc, then 90 seconds of it as Ogg.
      if ((await run('7z', ['e', '-y', `-o${tmp}`, iso, f.p], 120000)) === null) continue;
      const src = path.join(tmp, path.basename(f.p)); if (!fs.existsSync(src)) continue;
      const out = path.join(dir(), `${String(id).replace(/[^\w-]/g, '_')}.ogg`);
      const ok = await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-t', '90', '-vn', '-c:a', 'libvorbis', '-q:a', '4', out], 120000);
      fs.rmSync(src, { force: true });
      if (ok !== null && fs.existsSync(out) && fs.statSync(out).size > 20000) return out;
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return null;
}

/* -------------------------------------------------------------- finding it */
const busy = new Map();
async function find(e) {
  if (!e?.id) return null;
  if (e.music && fs.existsSync(e.music)) return e.music;
  const known = load()[e.id];
  if (known) { if (known.file && fs.existsSync(known.file)) return known.file; if (known.none && Date.now() - known.t < 7 * 864e5) return null; }
  if (busy.has(e.id)) return busy.get(e.id);
  const job = (async () => {
    let f = null;
    if (e.type === 'steam' && e.appid) f = steamSoundtrack(e.title) || ((d) => d && best(d))(steamDir(String(e.appid).replace(/\D/g, '')));
    else if (e.type === 'rom' && e.rom) f = (await fromDisc(e.id, e.rom)) || best(path.dirname(e.rom), 1);
    else if (e.exe) f = steamSoundtrack(e.title) || best(e.cwd || path.dirname(e.exe));
    return keep(e.id, f ? { file: f } : { none: true, t: Date.now() });
  })().finally(() => busy.delete(e.id));
  busy.set(e.id, job);
  return job;
}

function register() {
  ipcMain.handle('game-music', (_e, entry) => find(entry || {}).catch(() => null));
  // Forget what was found for a game (to look again, or after picking a file).
  ipcMain.handle('game-music-forget', (_e, id) => { if (load()[id]) { delete index[id]; try { fs.writeFileSync(indexFile(), JSON.stringify(index)); } catch { /* optional */ } } return true; });
}

module.exports = { register, find };
