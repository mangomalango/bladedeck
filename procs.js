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

function save() { try { fs.writeFileSync(file, JSON.stringify([...frozen.entries()])); } catch { /* optional */ } }

const PS_SUSPEND = (pids, on) => `
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
$more = $true
while ($more) { $more = $false; foreach ($p in $procs) { if ($all -contains [int]$p.ParentProcessId -and -not ($all -contains [int]$p.ProcessId)) { $all += [int]$p.ProcessId; $more = $true } } }
foreach ($id in $all) { [BDProc]::Set($id, $${on ? 'true' : 'false'}) }
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
  const sig = on ? 'SIGSTOP' : 'SIGCONT';
  // Stop children first and continue parents first, so nothing waits on a stopped parent.
  for (const p of on ? [...pids].reverse() : pids) { try { process.kill(p, sig); } catch { /* exited */ } }
  if (on) frozen.set(root, pids); else frozen.delete(root);
  save();
  return true;
}

const isFrozen = (pid) => [...frozen.values()].some((l) => l.includes(+pid));
const list = () => [...frozen.values()].flat();

async function thawAll() {
  for (const [root, pids] of [...frozen.entries()]) {
    if (process.platform === 'win32') await setWin(pids, false);
    else for (const p of pids) { try { process.kill(p, 'SIGCONT'); } catch { /* exited */ } }
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

module.exports = { init, freeze, isFrozen, list, thawAll };
