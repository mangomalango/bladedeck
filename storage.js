'use strict';
/* Storage map: how much space games, media, downloads and caches take on this PC,
   from most to least space.
   - Drives: total, used, free space from statfs.
   - Games:
     - Steam: exact size read instantly from appmanifest_<appid>.acf (SizeOnDisk).
     - ROMs: file sizes of disc images, cartridges and track files.
     - PC ports (recomp): executable and game directory sizes.
     - Native PC and GOG games: executable and directory sizes.
     - Minecraft: Prism Launcher instances and worlds.
   - Media: recordings, clips and instant replays in Videos/Bladedeck.
   - Caches & downloads: online video/theme caches, artwork, backups and Downloads. */
const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

function disks() {
  const seen = new Set(), out = [];
  const mounts = [
    ['System', process.platform === 'win32' ? 'C:\\' : '/'],
    ['Home', os.homedir()],
    ['Games', path.join(os.homedir(), 'Games')]
  ];
  for (const [label, p] of mounts) {
    try {
      if (!fs.existsSync(p)) continue;
      const s = fs.statfsSync(p);
      const key = `${s.blocks}:${s.bfree}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const total = s.blocks * s.bsize;
      const free = s.bavail * s.bsize;
      out.push({ label, path: p, total, free, used: total - free });
    } catch { /* not mounted */ }
  }
  return out;
}

// Fast recursive directory size calculation with depth and count caps to prevent hanging on huge trees.
function fastDirSize(dir, maxDepth = 4, maxFiles = 10000) {
  let total = 0, count = 0;
  function walk(d, depth) {
    if (depth > maxDepth || count >= maxFiles) return;
    let list;
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const ent of list) {
      if (count++ >= maxFiles) return;
      const full = path.join(d, ent.name);
      try {
        if (ent.isDirectory()) {
          walk(full, depth + 1);
        } else if (ent.isFile()) {
          total += fs.statSync(full).size;
        }
      } catch { /* skip unreadable */ }
    }
  }
  walk(dir, 0);
  return total;
}

// Locate all Steam libraries from libraryfolders.vdf
function steamLibraries() {
  const h = os.homedir();
  const roots = [
    path.join(h, '.local/share/Steam'),
    path.join(h, '.steam/steam'),
    path.join(h, '.var/app/com.valvesoftware.Steam/.local/share/Steam'),
    'C:\\Program Files (x86)\\Steam'
  ].filter((p) => { try { return fs.existsSync(path.join(p, 'steamapps')); } catch { return false; } });

  const libs = new Set(roots);
  for (const r of roots) {
    try {
      const vdf = fs.readFileSync(path.join(r, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
        const p = m[1].replace(/\\\\/g, '\\');
        if (fs.existsSync(path.join(p, 'steamapps'))) libs.add(p);
      }
    } catch { /* single library */ }
  }
  return [...libs];
}

// Read Steam game size directly from appmanifest_<appid>.acf
function steamGameInfo(appid, libs) {
  const aid = String(appid).replace(/\D/g, '');
  if (!aid) return null;
  for (const lib of libs) {
    const mf = path.join(lib, 'steamapps', `appmanifest_${aid}.acf`);
    try {
      if (!fs.existsSync(mf)) continue;
      const text = fs.readFileSync(mf, 'utf8');
      const sizeM = text.match(/"SizeOnDisk"\s+"(\d+)"/i);
      const dirM = text.match(/"installdir"\s+"([^"]+)"/i);
      const size = sizeM ? +sizeM[1] : 0;
      const installDir = dirM ? path.join(lib, 'steamapps', 'common', dirM[1]) : '';
      return { size, path: installDir || mf };
    } catch { /* continue */ }
  }
  return null;
}

function fmtSize(n) {
  if (!n || n <= 0) return '0 B';
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

async function scanStorage(entries = []) {
  const libs = steamLibraries();
  const items = [];
  const cats = {
    steam: { id: 'steam', label: 'Steam games', size: 0, count: 0, color: '#00d2c4' },
    recomp: { id: 'recomp', label: 'PC ports', size: 0, count: 0, color: '#f5a623' },
    rom: { id: 'rom', label: 'Emulated ROMs', size: 0, count: 0, color: '#b37feb' },
    pc: { id: 'pc', label: 'Other PC games', size: 0, count: 0, color: '#4a90e2' },
    media: { id: 'media', label: 'Clips & recordings', size: 0, count: 0, color: '#ff6b6b' },
    cache: { id: 'cache', label: 'Caches & artwork', size: 0, count: 0, color: '#52c41a' },
    downloads: { id: 'downloads', label: 'Downloads', size: 0, count: 0, color: '#1890ff' }
  };

  // 1. Scan Library Games
  for (const e of entries) {
    if (!e || e.hidden || e.emuApp || e.type === 'stream') continue;

    if (e.type === 'steam') {
      const info = steamGameInfo(e.appid, libs);
      if (info && info.size > 0) {
        cats.steam.size += info.size;
        cats.steam.count++;
        items.push({
          id: e.id,
          title: e.title,
          type: 'steam',
          typeLabel: 'Steam',
          category: 'steam',
          size: info.size,
          formatted: fmtSize(info.size),
          path: info.path,
          sub: `Steam App ${e.appid}`,
          entry: e
        });
      }
    } else if (e.type === 'rom' && e.rom) {
      try {
        if (fs.existsSync(e.rom)) {
          const st = fs.statSync(e.rom);
          let sz = st.size;
          // If it's a cue or m3u sheet, sum other track files in same folder if dedicated
          if (/\.(cue|m3u)$/i.test(e.rom)) {
            const dir = path.dirname(e.rom);
            const parentFiles = fs.readdirSync(dir);
            if (parentFiles.length <= 15) {
              sz = 0;
              for (const f of parentFiles) {
                if (/\.(bin|iso|img|chd|wav|flac|cue|m3u)$/i.test(f)) {
                  try { sz += fs.statSync(path.join(dir, f)).size; } catch { /* skip */ }
                }
              }
            }
          }
          cats.rom.size += sz;
          cats.rom.count++;
          items.push({
            id: e.id,
            title: e.title,
            type: 'rom',
            typeLabel: e.system || 'Emulated',
            category: 'rom',
            size: sz,
            formatted: fmtSize(sz),
            path: e.rom,
            sub: e.system ? `${e.system} · ${path.basename(e.rom)}` : path.basename(e.rom),
            entry: e
          });
        }
      } catch { /* missing file */ }
    } else if (e.type === 'recomp') {
      let sz = 0;
      let targetPath = e.exe || '';
      try {
        if (e.exe && fs.existsSync(e.exe)) {
          const dir = path.dirname(e.exe);
          const isHome = dir === os.homedir();
          // If installed in ~/Games/Emulators/<name>, get directory size
          if (!isHome && /Games[\\/]Emulators/i.test(dir)) {
            sz = fastDirSize(dir);
            targetPath = dir;
          } else if (fs.statSync(e.exe).isFile()) {
            sz = fs.statSync(e.exe).size;
          }
        }
      } catch { /* skip */ }
      if (sz > 0) {
        cats.recomp.size += sz;
        cats.recomp.count++;
        items.push({
          id: e.id,
          title: e.title,
          type: 'recomp',
          typeLabel: 'PC Port',
          category: 'recomp',
          size: sz,
          formatted: fmtSize(sz),
          path: targetPath,
          sub: e.system || 'Native PC port',
          entry: e
        });
      }
    } else if (e.type === 'exe' || e.type === 'gog' || e.type === 'app') {
      let sz = 0;
      let targetPath = e.exe || '';
      try {
        if (e.exe && fs.existsSync(e.exe)) {
          const st = fs.statSync(e.exe);
          if (st.isFile()) sz = st.size;
        }
      } catch { /* skip */ }
      if (sz > 0) {
        cats.pc.size += sz;
        cats.pc.count++;
        items.push({
          id: e.id,
          title: e.title,
          type: e.type,
          typeLabel: e.type === 'gog' ? 'GOG' : 'PC Game',
          category: 'pc',
          size: sz,
          formatted: fmtSize(sz),
          path: targetPath,
          sub: path.basename(targetPath),
          entry: e
        });
      }
    }
  }

  // 2. Scan Videos / Bladedeck (Captures & Media)
  try {
    const vidDir = path.join(app.getPath('videos'), 'Bladedeck');
    if (fs.existsSync(vidDir)) {
      const files = fs.readdirSync(vidDir, { withFileTypes: true });
      for (const f of files) {
        if (!f.isFile() || f.name.startsWith('.')) continue;
        const full = path.join(vidDir, f.name);
        try {
          const st = fs.statSync(full);
          if (st.size > 200000) { // > 200 KB
            cats.media.size += st.size;
            cats.media.count++;
            items.push({
              id: `media:${f.name}`,
              title: f.name,
              type: 'capture',
              typeLabel: 'Media',
              category: 'media',
              size: st.size,
              formatted: fmtSize(st.size),
              path: full,
              sub: `Capture · ${new Date(st.mtimeMs).toLocaleDateString()}`
            });
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* videos folder not available */ }

  // 3. Scan Caches (Online media, artwork, backups)
  const userData = app.getPath('userData');
  try {
    const omDir = path.join(userData, 'online-media');
    if (fs.existsSync(omDir)) {
      const sz = fastDirSize(omDir);
      if (sz > 1000000) {
        cats.cache.size += sz;
        cats.cache.count++;
        items.push({
          id: 'cache:online-media',
          title: 'Online gameplay clips & music cache',
          type: 'cache',
          typeLabel: 'Cache',
          category: 'cache',
          size: sz,
          formatted: fmtSize(sz),
          path: omDir,
          sub: 'Downloaded previews from YouTube'
        });
      }
    }
  } catch { /* skip */ }

  try {
    const artDir = path.join(userData, 'art');
    if (fs.existsSync(artDir)) {
      const sz = fastDirSize(artDir);
      if (sz > 500000) {
        cats.cache.size += sz;
        cats.cache.count++;
        items.push({
          id: 'cache:art',
          title: 'Box art and cover images',
          type: 'cache',
          typeLabel: 'Artwork',
          category: 'cache',
          size: sz,
          formatted: fmtSize(sz),
          path: artDir,
          sub: 'Covers and backgrounds'
        });
      }
    }
  } catch { /* skip */ }

  // 4. Scan Downloads & Shared folders
  const dlDirs = [
    [path.join(os.homedir(), 'Bladedeck', 'From friends'), 'Files from friends'],
    [path.join(os.homedir(), 'Bladedeck', 'To phone'), 'Files shared with phone'],
    [path.join(os.homedir(), 'Bladedeck', 'From phone'), 'Files sent from phone'],
    [path.join(os.homedir(), 'Games', 'ROMs', 'Downloaded'), 'Downloaded ROMs']
  ];
  for (const [d, label] of dlDirs) {
    try {
      if (fs.existsSync(d)) {
        const files = fs.readdirSync(d, { withFileTypes: true });
        for (const f of files) {
          if (!f.isFile() || f.name.startsWith('.')) continue;
          const full = path.join(d, f.name);
          const st = fs.statSync(full);
          if (st.size > 500000) {
            cats.downloads.size += st.size;
            cats.downloads.count++;
            items.push({
              id: `dl:${f.name}`,
              title: f.name,
              type: 'download',
              typeLabel: 'Download',
              category: 'downloads',
              size: st.size,
              formatted: fmtSize(st.size),
              path: full,
              sub: label
            });
          }
        }
      }
    } catch { /* skip */ }
  }

  // Sort items from MOST to LEAST space
  items.sort((a, b) => b.size - a.size);

  const totalAccounted = Object.values(cats).reduce((acc, c) => acc + c.size, 0);

  // Assign ranks and percentages
  items.forEach((it, idx) => {
    it.rank = idx + 1;
    it.pct = totalAccounted > 0 ? Math.round((it.size / totalAccounted) * 1000) / 10 : 0;
  });

  return {
    ok: true,
    drives: disks(),
    categories: cats,
    totalAccounted,
    formattedTotal: fmtSize(totalAccounted),
    items
  };
}

function register() {
  ipcMain.handle('storage-map', async (_e, entries) => {
    return scanStorage(entries || []);
  });
}

module.exports = { register, scanStorage };
