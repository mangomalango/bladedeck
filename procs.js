'use strict';
/* Freeze and thaw running games, like the Steam Deck's "Pause Games" plugin: a frozen game keeps
   everything in memory but uses no processor or graphics, and carries on from the same frame
   when thawed. On Linux the game's processes are stopped (SIGSTOP) and continued (SIGCONT). For a
   Steam game that is everything Steam's launcher ("reaper SteamLaunch") started for it, so Proton
   and Wine stop too. On Windows each process is suspended through ntdll.
   Frozen games are written down, so a crash of Bladedeck never leaves one stuck: they are thawed
   on the next start, and on quit. */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

let file = '', frozen = new Map(); // key (root pid) -> [pids]
const muted = new Map(); // key (root pid) -> sink-input ids we muted

// A stopped program's sound stream keeps replaying its last bit of audio: a buzz. Mute its
// streams before freezing and unmute them after (PipeWire or PulseAudio, through pactl).
const pactl = (args) => new Promise((res) => execFile('pactl', args, { timeout: 4000 }, (err, out) => res(err ? null : String(out))));
async function muteTree(root, pids, on) {
  if (process.platform !== 'linux') return;
  if (!on) { for (const id of muted.get(root) || []) await pactl(['set-sink-input-mute', String(id), '0']); muted.delete(root); return; }
  const out = await pactl(['-f', 'json', 'list', 'sink-inputs']); if (!out) return;
  let list; try { list = JSON.parse(out); } catch { return; }
  const mine = new Set(pids.map(String));
  const ids = list.filter((i) => !i.mute && mine.has(String(i.properties?.['application.process.id']))).map((i) => i.index);
  for (const id of ids) await pactl(['set-sink-input-mute', String(id), '1']);
  muted.set(root, ids);
}

function procTable() {
  const kids = new Map(), parent = new Map();
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${d}/stat`, 'utf8');
      const ppid = +stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1];
      parent.set(+d, ppid);
      if (!kids.has(ppid)) kids.set(ppid, []);
      kids.get(ppid).push(+d);
    } catch { /* gone */ }
  }
  return { kids, parent };
}
const cmdline = (pid) => { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' '); } catch { return ''; } };

// Every process belonging to the game the window pid is part of.
function gameTree(pid) {
  const { kids, parent } = procTable();
  let root = pid, p = pid, steps = 0;
  while (p > 1 && steps++ < 30) {
    if (/\breaper\b.*SteamLaunch/.test(cmdline(p))) { root = p; break; }
    p = parent.get(p) || 0;
  }
  const out = [], walk = (q) => { for (const k of kids.get(q) || []) { out.push(k); walk(k); } };
  walk(root);
  if (root === pid) out.unshift(pid);
  return { root, pids: out.filter((x) => x !== process.pid) };
}

// Bladedeck's own processes, and every program it is running under (the terminal or file manager
// it was started from, the AppImage runtime): freezing or closing one of those takes Bladedeck
// down with it, so they are never touched.
function ownTree() {
  if (process.platform !== 'linux') return new Set([process.pid]);
  const { kids, parent } = procTable();
  const mine = new Set();
  // Bladedeck's own processes are the ones running its own program (Electron's renderer, GPU and
  // helper processes). Games and emulators it started are its children too, but they run other
  // programs, and those must stay closable and pausable.
  const self = exeOf(process.pid);
  const walk = (q) => { mine.add(q); for (const k of kids.get(q) || []) if (exeOf(k) === self) walk(k); };
  walk(process.pid);
  for (let p = parent.get(process.pid) || 0, i = 0; p > 1 && i < 40; p = parent.get(p) || 0, i++) mine.add(p);
  return mine;
}
const isOwn = (pid) => !!pid && ownTree().has(+pid);
function exeOf(pid) { try { return fs.readlinkSync(`/proc/${pid}/exe`); } catch { return ''; } }

function save() { try { fs.writeFileSync(file, JSON.stringify([...frozen.entries()])); } catch { /* optional */ } }

/* Windows: the game and every process under it. Never Bladedeck itself, anything above it (it is
   usually a child of explorer.exe, like Steam and everything started from the Start menu), or
   Steam and the desktop: freezing explorer.exe would freeze them all. Windows reuses process ids,
   so a "child" only counts when it started after its parent. */
const PS_SUSPEND = (pids, on, self = process.pid) => `
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class BDProc {
  [DllImport("ntdll.dll")] public static extern int NtSuspendProcess(IntPtr h);
  [DllImport("ntdll.dll")] public static extern int NtResumeProcess(IntPtr h);
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(int a, bool i, int pid);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  public static void Set(int pid, bool on) { IntPtr h = OpenProcess(0x0800, false, pid); if (h == IntPtr.Zero) return; if (on) NtSuspendProcess(h); else NtResumeProcess(h); CloseHandle(h); }
}
'@
$all = @(${pids.map(Number).filter(Boolean).join(',')})
$procs = Get-CimInstance Win32_Process
$byId = @{}; foreach ($p in $procs) { $byId[[int]$p.ProcessId] = $p }
$keep = 'explorer','steam','steamwebhelper','steamservice','gameoverlayui','dwm','csrss','winlogon','wininit','services','lsass','svchost','sihost','ctfmon','searchhost','startmenuexperiencehost','shellexperiencehost','textinputhost','runtimebroker','bladedeck','powershell','pwsh','conhost','windowsterminal','cmd'
$own = @{}; $id = ${Number(self)}
while ($id -and $byId.ContainsKey($id) -and -not $own.ContainsKey($id)) { $own[$id] = 1; $id = [int]$byId[$id].ParentProcessId }
function Kept($i) { $own.ContainsKey($i) -or ($byId.ContainsKey($i) -and $keep -contains $byId[$i].Name.ToLower().Replace('.exe','')) }
# A protected start (explorer, Steam, Bladedeck) freezes nothing, not even what runs under it.
if ($${on ? 'true' : 'false'}) { $all = @($all | Where-Object { -not (Kept $_) }) }
$more = $true
while ($more) { $more = $false; foreach ($p in $procs) {
  $pp = [int]$p.ParentProcessId; $pid2 = [int]$p.ProcessId
  if ($all -contains $pp -and -not ($all -contains $pid2) -and $byId.ContainsKey($pp) -and $p.CreationDate -ge $byId[$pp].CreationDate) { $all += $pid2; $more = $true } } }
foreach ($id in $all) {
  if ($${on ? 'true' : 'false'} -and (Kept $id)) { continue }
  [BDProc]::Set($id, $${on ? 'true' : 'false'})
}
`;

function setWin(pids, on) {
  return new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_SUSPEND(pids, on)], { windowsHide: true, timeout: 20000 }, (err) => res(!err)));
}

async function freeze(pid, on) {
  pid = +pid; if (!pid || pid === process.pid) return false;
  if (process.platform === 'win32') {
    const ok = await setWin([pid], on);
    if (ok) { if (on) frozen.set(pid, [pid]); else frozen.delete(pid); save(); }
    return ok;
  }
  if (process.platform !== 'linux') return false;
  // Never Steam itself, the desktop, or the display server.
  if (on && /(^|\/)(steam|steamwebhelper|plasmashell|kwin_wayland|kwin_x11|Xwayland|gnome-shell|pipewire|wireplumber)( |$)/.test(cmdline(pid))) return false;
  // Thawing uses the same list that was frozen, even if the tree has changed since.
  const known = [...frozen.entries()].find(([, l]) => l.includes(pid));
  const { root, pids } = on ? gameTree(pid) : known ? { root: known[0], pids: known[1] } : gameTree(pid);
  if (!pids.length) return false;
  if (on) { const own = ownTree(); if (own.has(root) || pids.some((p) => own.has(p))) return false; }
  const sig = on ? 'SIGSTOP' : 'SIGCONT';
  if (on) await muteTree(root, pids, true);
  // Stop children first and continue parents first, so nothing waits on a stopped parent.
  for (const p of on ? [...pids].reverse() : pids) { try { process.kill(p, sig); } catch { /* exited */ } }
  if (!on) await muteTree(root, pids, false);
  if (on) frozen.set(root, pids); else frozen.delete(root);
  save();
  return true;
}

const isFrozen = (pid) => [...frozen.values()].some((l) => l.includes(+pid));
const list = () => [...frozen.values()].flat();

async function thawAll() {
  for (const [root, pids] of [...frozen.entries()]) {
    if (process.platform === 'win32') await setWin(pids, false);
    else { for (const p of pids) { try { process.kill(p, 'SIGCONT'); } catch { /* exited */ } } await muteTree(root, pids, false); }
    frozen.delete(root);
  }
  save();
}

// At start: anything left frozen by a Bladedeck that crashed gets thawed.
function init(dir) {
  file = path.join(dir, 'frozen.json');
  try { frozen = new Map(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { frozen = new Map(); }
  if (frozen.size) thawAll();
}

// Who a window's process belongs to: the Steam app it was started for (Steam's launcher passes
// "AppId=N" down the chain), and its parent processes. Used to check a window is really the game.
function info(pid) {
  pid = +pid; if (!pid || process.platform !== 'linux') return { ancestors: [], appId: '' };
  const { parent } = procTable();
  const ancestors = []; let p = pid, appId = '';
  for (let i = 0; i < 40 && p > 1; i++) {
    const m = cmdline(p).match(/AppId=(\d+)/);
    if (m && !appId) appId = m[1];
    p = parent.get(p) || 0;
    if (p > 1) ancestors.push(p);
  }
  if (!appId) { try { const env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); const m = env.match(/(?:^|\0)SteamAppId=(\d+)/); if (m) appId = m[1]; } catch { /* not ours to read */ } }
  return { ancestors, appId };
}

/* Windows: no /proc. The process's program and its parents come from WMI, and a Steam game is
   known by where its program lives: steamapps\common\<installdir>, which the app's manifest names. */
function steamInstallDirs() {
  const roots = [path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam')];
  const libs = new Set(roots);
  for (const r of roots) { try { for (const m of fs.readFileSync(path.join(r, 'steamapps', 'libraryfolders.vdf'), 'utf8').matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\')); } catch { /* one library */ } }
  const map = new Map();
  for (const lib of libs) {
    let files; try { files = fs.readdirSync(path.join(lib, 'steamapps')); } catch { continue; }
    for (const f of files) {
      const id = (/^appmanifest_(\d+)\.acf$/.exec(f) || [])[1]; if (!id) continue;
      try { const d = (fs.readFileSync(path.join(lib, 'steamapps', f), 'utf8').match(/"installdir"\s+"([^"]+)"/) || [])[1]; if (d) map.set(path.join(lib, 'steamapps', 'common', d).toLowerCase(), id); } catch { /* mid-write */ }
    }
  }
  return map;
}
function infoWin(pid) {
  pid = +pid; if (!pid) return Promise.resolve({ ancestors: [], appId: '' });
  const ps = `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; $a = @(); $q = $p.ParentProcessId; for ($i = 0; $i -lt 20 -and $q; $i++) { $a += $q; $q = (Get-CimInstance Win32_Process -Filter "ProcessId=$q").ParentProcessId }; @{ path = [string]$p.ExecutablePath; anc = $a } | ConvertTo-Json -Compress`;
  return new Promise((res) => require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 8000 }, (err, out) => {
    let j = {}; try { j = JSON.parse(String(out)); } catch { /* gone */ }
    const exe = String(j.path || '').toLowerCase(); let appId = '';
    if (exe.includes('\\steamapps\\common\\')) for (const [dir, id] of steamInstallDirs()) if (exe.startsWith(dir + '\\')) { appId = id; break; }
    res({ ancestors: [].concat(j.anc || []).map(Number).filter(Boolean), appId });
  }));
}

module.exports = { init, freeze, isFrozen, list, thawAll, info, infoWin, isOwn };
