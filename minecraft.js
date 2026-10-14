'use strict';
/* Minecraft, through Prism Launcher (open source, runs every version, signs in with your
   Microsoft account, and has CurseForge and Modrinth modpacks built in).
   - Your Prism instances, each one playable from Bladedeck's library (prismlauncher --launch).
   - Controller support: Java Minecraft has none of its own, so Bladedeck installs the Controlify
     mod (and the mods it needs) from Modrinth into an instance, matched to its Minecraft version
     and mod loader (Fabric, Quilt or NeoForge).
   - Modpacks: Modrinth's catalogue, searched here; Install hands the pack to Prism, which makes
     an instance of it. CurseForge packs are in Prism too (Add Instance, CurseForge), and the
     CurseForge app itself is offered for people who prefer it. */
const { ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const FLAT = 'org.prismlauncher.PrismLauncher';
const MR = 'https://api.modrinth.com/v2';
const UA = { 'User-Agent': 'Bladedeck/0.1 (game launcher)' };
const h = os.homedir();

function onPath(cmd) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) { const p = path.join(dir, cmd); try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* next */ } }
  return null;
}
const flatpakHas = (id) => [path.join(h, '.local/share/flatpak/app', id), '/var/lib/flatpak/app/' + id].some((p) => fs.existsSync(p));
// How to run Prism, and where it keeps its instances.
function prism() {
  if (process.platform === 'win32') {
    const exe = [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'PrismLauncher', 'prismlauncher.exe'), path.join(process.env.ProgramFiles || '', 'PrismLauncher', 'prismlauncher.exe')].find((p) => p && fs.existsSync(p));
    return exe ? { exe, pre: [], data: path.join(process.env.APPDATA || '', 'PrismLauncher') } : null;
  }
  const exe = onPath('prismlauncher');
  if (exe) return { exe, pre: [], data: path.join(h, '.local/share/PrismLauncher') };
  if (flatpakHas(FLAT)) return { exe: onPath('flatpak') || '/usr/bin/flatpak', pre: ['run', FLAT], data: path.join(h, '.var/app', FLAT, 'data/PrismLauncher') };
  return null;
}
// The CurseForge app: its AppImage in the usual places (or in Downloads, just downloaded).
function curseforge() {
  if (process.platform === 'win32') { const p = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'CurseForge Windows', 'CurseForge.exe'); return fs.existsSync(p) ? p : null; }
  for (const d of [path.join(h, 'Games', 'Apps'), path.join(h, 'Applications'), path.join(h, 'AppImages'), path.join(h, 'Downloads')]) {
    try { const f = fs.readdirSync(d).find((n) => /^curseforge.*\.appimage$/i.test(n)); if (f) return path.join(d, f); } catch { /* no folder */ }
  }
  return null;
}

const cfg = (txt, k) => ((txt.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim();
function instances() {
  const p = prism(); if (!p) return [];
  const dir = path.join(p.data, 'instances');
  let names = []; try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== '_LAUNCHER_TEMP'); } catch { return []; }
  return names.map((d) => {
    const root = path.join(dir, d.name);
    let ic = ''; try { ic = fs.readFileSync(path.join(root, 'instance.cfg'), 'utf8'); } catch { return null; }
    let pack = {}; try { pack = JSON.parse(fs.readFileSync(path.join(root, 'mmc-pack.json'), 'utf8')); } catch { /* old instance */ }
    const comp = (uid) => (pack.components || []).find((c) => c.uid === uid);
    const mc = comp('net.minecraft')?.version || cfg(ic, 'IntendedVersion');
    const loader = comp('net.fabricmc.fabric-loader') ? 'fabric' : comp('org.quiltmc.quilt-loader') ? 'quilt' : comp('net.neoforged') ? 'neoforge' : comp('net.minecraftforge') ? 'forge' : '';
    const game = ['.minecraft', 'minecraft'].map((x) => path.join(root, x)).find((x) => fs.existsSync(x)) || path.join(root, 'minecraft');
    let mods = []; try { mods = fs.readdirSync(path.join(game, 'mods')).filter((f) => /\.jar$/i.test(f)); } catch { /* none */ }
    return { id: d.name, name: cfg(ic, 'name') || d.name, mc, loader, controller: mods.some((f) => /controlify|midnightcontrols|controllable/i.test(f)), mods: mods.length, game,
      exe: p.exe, args: [...p.pre, '--launch', d.name].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ') };
  }).filter(Boolean);
}

async function getJson(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Modrinth answered ${r.status}.`);
  return r.json();
}
// The newest version of a Modrinth project that fits this Minecraft version and loader.
async function fit(project, mc, loader) {
  const q = new URLSearchParams({ loaders: JSON.stringify([loader === 'quilt' ? 'fabric' : loader]), game_versions: JSON.stringify([mc]) });
  const l = await getJson(`${MR}/project/${encodeURIComponent(project)}/version?${q}`);
  // Quilt runs Fabric mods; a Quilt build of the mod is better still.
  if (loader === 'quilt') { const ql = await getJson(`${MR}/project/${encodeURIComponent(project)}/version?${new URLSearchParams({ loaders: '["quilt"]', game_versions: JSON.stringify([mc]) })}`).catch(() => []); if (ql.length) return ql[0]; }
  return l[0] || null;
}
async function controllers(id) {
  const inst = instances().find((x) => x.id === id);
  if (!inst) throw new Error('That instance is not there any more.');
  if (!inst.loader || inst.loader === 'forge') throw new Error(inst.loader === 'forge' ? 'Controlify runs on Fabric, Quilt and NeoForge, not old Forge. Make a Fabric copy of this instance in Prism.' : 'This instance has no mod loader. In Prism: Edit, Version, Install Fabric. Then try again.');
  const mods = path.join(inst.game, 'mods'); fs.mkdirSync(mods, { recursive: true });
  const have = new Set(fs.readdirSync(mods));
  const done = new Set(), got = [];
  async function add(project, required) {
    if (done.has(project)) return; done.add(project);
    const v = await fit(project, inst.mc, inst.loader);
    if (!v) { if (required) throw new Error(project === 'controlify' ? `Controlify has no build for Minecraft ${inst.mc} on ${inst.loader} yet.` : `A mod Controlify needs has no build for Minecraft ${inst.mc}.`); return; }
    const f = v.files.find((x) => x.primary) || v.files[0];
    if (!have.has(f.filename)) {
      const r = await fetch(f.url, { headers: UA, signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error(`A download failed (${r.status}).`);
      fs.writeFileSync(path.join(mods, path.basename(f.filename)), Buffer.from(await r.arrayBuffer()));
      got.push(f.filename);
    }
    for (const d of v.dependencies || []) if (d.dependency_type === 'required' && d.project_id) await add(d.project_id, true);
  }
  await add('controlify', true);
  return { added: got, instance: inst.name };
}

async function packs({ q = '', offset = 0 } = {}) {
  const p = new URLSearchParams({ query: String(q).slice(0, 80), facets: JSON.stringify([['project_type:modpack']]), limit: '40', offset: String(Math.max(0, +offset || 0)), index: q ? 'relevance' : 'downloads' });
  const j = await getJson(`${MR}/search?${p}`);
  return (j.hits || []).map((x) => ({ id: x.project_id, slug: x.slug, title: x.title, sub: `${x.author} · ${(x.downloads || 0).toLocaleString()} downloads${x.versions?.length ? ` · ${x.versions[x.versions.length - 1]}` : ''}`, desc: String(x.description || '').slice(0, 200), img: x.icon_url || '' }));
}
// A modpack into Prism: the newest .mrpack, handed to Prism's own importer.
async function packGet(id) {
  const p = prism(); if (!p) throw new Error('Install Prism Launcher first.');
  if (!/^[\w-]{4,40}$/.test(String(id))) throw new Error('Bad request.');
  const l = await getJson(`${MR}/project/${id}/version`);
  const v = l.find((x) => x.files.some((f) => /\.mrpack$/i.test(f.filename)));
  if (!v) throw new Error('That pack has nothing Prism can import.');
  const f = v.files.find((x) => /\.mrpack$/i.test(x.filename));
  spawn(p.exe, [...p.pre, '--import', f.url], { detached: true, stdio: 'ignore' }).unref();
  return { version: v.version_number };
}

function register() {
  const wrap = (fn) => async (...a) => { try { return { ok: true, data: await fn(...a) } } catch (err) { return { ok: false, error: String(err.message || err) }; } };
  ipcMain.handle('mc-status', () => { const p = prism(); return { prism: !!p, flatpak: !!p && p.pre.length > 0, exe: p?.exe || '', pre: p?.pre || [], curseforge: curseforge() || '', linux: process.platform === 'linux' }; });
  ipcMain.handle('mc-instances', () => instances());
  ipcMain.handle('mc-controllers', wrap((_e, id) => controllers(String(id))));
  ipcMain.handle('mc-packs', wrap((_e, o) => packs(o || {})));
  ipcMain.handle('mc-pack-get', wrap((_e, o) => packGet(o?.id)));
  ipcMain.handle('mc-open', (_e, what) => {
    const p = prism();
    if (what === 'prism' && p) { spawn(p.exe, p.pre, { detached: true, stdio: 'ignore' }).unref(); return true; }
    if (what === 'curseforge') { const c = curseforge(); if (!c) return false; try { fs.chmodSync(c, 0o755); } catch { /* fine */ } spawn(c, [], { detached: true, stdio: 'ignore' }).unref(); return true; }
    if (what === 'folder' && p) { shell.openPath(path.join(p.data, 'instances')); return true; }
    return false;
  });
}

module.exports = { register, instances };
