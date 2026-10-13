'use strict';
/* Wallpapers behind the menus: Wallpaper Engine's (from Steam) and your own.
   Wallpaper Engine keeps each wallpaper in a Steam Workshop folder (steamapps/workshop/content/
   431960/<id>) or in its own projects folder, each with a project.json saying its title, type,
   main file and preview. Bladedeck plays:
     video  - the video itself, muted and looping
     web    - the wallpaper's page, in a locked-down view (no Node, its own throwaway session,
              cannot read files outside its folder, cannot open windows or ask for permissions)
     scene  - these need Wallpaper Engine's own renderer, so their preview picture (often
              animated) is shown instead
   "application" wallpapers are programs and are never run.
   Your own: pictures, GIFs and videos copied into Bladedeck/Wallpapers (or dropped there).
   Wallpaper Engine itself is not needed to play video and web wallpapers, only to download them. */
const fs = require('fs');
const path = require('path');
const { ipcMain, session, app } = require('electron');
const FA = require('./fsaccess');

const WE = '431960';
const IMG = /\.(png|jpe?g|gif|webp|bmp|avif)$/i, VID = /\.(mp4|webm|mkv|mov|m4v)$/i;
const webDirs = new Set(); // folders of web wallpapers found by a scan; only these may load

function libraries(root) {
  const libs = new Set(root ? [root] : []);
  try { for (const m of fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8').matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\')); } catch { /* one library */ }
  return [...libs];
}
const own = () => path.join(FA.ROOT, 'Wallpapers');

function project(dir, source) {
  let p; try { p = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')); } catch { return null; }
  const type = String(p.type || '').toLowerCase();
  const file = p.file ? path.join(dir, String(p.file)) : '';
  const preview = p.preview ? path.join(dir, String(p.preview)) : '';
  // The main file must really be inside the wallpaper's folder.
  if (file && !FA.inside(file, dir)) return null;
  const item = { id: `we:${path.basename(dir)}`, title: String(p.title || path.basename(dir)).slice(0, 120), dir, source,
    preview: preview && FA.inside(preview, dir) && fs.existsSync(preview) ? preview : '', rating: String(p.contentrating || '') };
  if (type === 'video' && VID.test(file) && fs.existsSync(file)) return { ...item, kind: 'video', file };
  if (type === 'web' && /\.html?$/i.test(file) && fs.existsSync(file)) { webDirs.add(path.resolve(dir)); return { ...item, kind: 'web', file }; }
  if (type === 'scene' && item.preview) return { ...item, kind: 'scene', file: item.preview };
  return null; // applications, and anything broken
}

function scan(steamRoot) {
  const out = [];
  for (const lib of libraries(steamRoot)) {
    const roots = [
      [path.join(lib, 'steamapps', 'workshop', 'content', WE), 'Workshop'],
      [path.join(lib, 'steamapps', 'common', 'wallpaper_engine', 'projects', 'defaultprojects'), 'Wallpaper Engine'],
      [path.join(lib, 'steamapps', 'common', 'wallpaper_engine', 'projects', 'myprojects'), 'Your Wallpaper Engine projects']
    ];
    for (const [r, source] of roots) {
      let ids; try { ids = fs.readdirSync(r, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { continue; }
      for (const d of ids) { const it = project(path.join(r, d.name), source); if (it) out.push(it); }
    }
  }
  try { fs.mkdirSync(own(), { recursive: true }); } catch { /* read-only */ }
  try {
    for (const n of fs.readdirSync(own())) {
      const f = path.join(own(), n); if (n.startsWith('.') || !(IMG.test(n) || VID.test(n))) continue;
      out.push({ id: `own:${n}`, title: n.replace(/\.[^.]+$/, ''), kind: VID.test(n) ? 'video' : 'image', file: f, preview: IMG.test(n) ? f : '', source: 'Yours', dir: own() });
    }
  } catch { /* none */ }
  const seen = new Set();
  return out.filter((x) => (seen.has(x.id) ? false : seen.add(x.id))).sort((a, b) => a.title.localeCompare(b.title));
}

// Web wallpapers: may load their own folder's files and things from the web, nothing else on disk.
function guard() {
  const ses = session.fromPartition('wallpaper');
  ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  ses.webRequest.onBeforeRequest((d, cb) => {
    if (/^(https|data|blob|devtools):/i.test(d.url)) return cb({});
    if (/^file:/i.test(d.url)) {
      let p; try { p = decodeURIComponent(new URL(d.url).pathname); if (process.platform === 'win32') p = p.replace(/^\/([a-z]:)/i, '$1'); } catch { return cb({ cancel: true }); }
      return cb({ cancel: ![...webDirs].some((dir) => FA.inside(p, dir)) });
    }
    cb({ cancel: true });
  });
}
const webAllowed = (src) => {
  if (!/^file:/i.test(src || '')) return false;
  try { let p = decodeURIComponent(new URL(src).pathname); if (process.platform === 'win32') p = p.replace(/^\/([a-z]:)/i, '$1'); return [...webDirs].some((dir) => FA.inside(p, dir)); } catch { return false; }
};

function register({ steamRoot }) {
  app.whenReady().then(guard);
  ipcMain.handle('wall-list', () => scan(steamRoot()));
  // Your own: a copy goes into Bladedeck/Wallpapers, so it stays available.
  ipcMain.handle('wall-add', (_e, f) => {
    const src = path.resolve(String(f || ''));
    if (!(FA.allowed(src) || FA.wasPicked(src)) || !(IMG.test(src) || VID.test(src)) || !fs.existsSync(src)) return { ok: false, error: 'Pick a picture, GIF or video.' };
    fs.mkdirSync(own(), { recursive: true });
    const ext = path.extname(src), stem = path.basename(src, ext);
    let to = path.join(own(), path.basename(src)); for (let i = 2; fs.existsSync(to); i++) to = path.join(own(), `${stem} (${i})${ext}`);
    try { fs.copyFileSync(src, to); return { ok: true, id: `own:${path.basename(to)}` }; } catch (err) { return { ok: false, error: String(err.message || err) }; }
  });
  ipcMain.handle('wall-remove', (_e, id) => {
    const n = String(id).replace(/^own:/, ''), f = path.join(own(), path.basename(n));
    if (!String(id).startsWith('own:') || !FA.inside(f, own())) return false;
    try { fs.rmSync(f); return true; } catch { return false; }
  });
}

module.exports = { register, webAllowed };
