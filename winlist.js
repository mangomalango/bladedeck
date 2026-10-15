'use strict';
/* The open windows, for the dock and Quick Resume, on desktops without the KDE (KWin) script:
   - Windows: a small helper (PowerShell with a little C#) lists real top-level windows and can
     bring one to the front, minimize it or close it.
   - Linux on X11 (GNOME on Xorg, XFCE, Cinnamon, MATE…): wmctrl does the same when installed.
   It sends the same "windows" list the KWin script does, so nothing else needs to know which
   desktop it is on. Bladedeck's own windows are left out. */
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const CS = String.raw`
using System; using System.Text; using System.Collections.Generic; using System.Diagnostics; using System.Runtime.InteropServices;
public static class BDWin {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, int flags, IntPtr extra);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int size);
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int l, t, r, b; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, int flags);
  static Dictionary<int, string> names = new Dictionary<int, string>();
  static string J(string s) {
    StringBuilder b = new StringBuilder("\"");
    foreach (char c in s ?? "") { if (c == '"' || c == '\\') { b.Append('\\'); b.Append(c); } else if (c < 32 || c > 126) b.Append("\\u" + ((int)c).ToString("x4")); else b.Append(c); }
    return b.Append('"').ToString();
  }
  static string Name(int pid) {
    string n; if (names.TryGetValue(pid, out n)) return n;
    try { n = Process.GetProcessById(pid).ProcessName; } catch { n = ""; }
    names[pid] = n; return n;
  }
  public static string List(int self) {
    // Windows hands a closed program's process id to the next one: names are looked up afresh each list.
    names.Clear();
    StringBuilder b = new StringBuilder("["); bool first = true; IntPtr fg = GetForegroundWindow();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true;
      if ((GetWindowLong(h, -20) & 0x80) != 0) return true; // tool windows
      int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      StringBuilder t = new StringBuilder(512); GetWindowText(h, t, 512); if (t.Length == 0) return true;
      StringBuilder c = new StringBuilder(256); GetClassName(h, c, 256);
      string cls = c.ToString(); if (cls == "Progman" || cls == "Shell_TrayWnd" || cls == "WorkerW") return true;
      int pid; GetWindowThreadProcessId(h, out pid); if (pid == self) return true;
      if (!first) b.Append(','); first = false;
      RECT rc; GetWindowRect(h, out rc);
      b.Append("{\"id\":\"w32:" + h.ToInt64() + "\",\"caption\":" + J(t.ToString()) + ",\"cls\":" + J(Name(pid)) + ",\"pid\":" + pid + ",\"min\":" + (IsIconic(h) ? "true" : "false") + ",\"active\":" + (h == fg ? "true" : "false") + ",\"rect\":[" + rc.l + "," + rc.t + "," + (rc.r - rc.l) + "," + (rc.b - rc.t) + "]}");
      return true;
    }, IntPtr.Zero);
    return b.Append(']').ToString();
  }
  // Onto another screen (x, y, w, h of that screen in pixels): a maximized or full-screen window
  // fills the new one, any other keeps its size and moves to the screen's corner.
  public static void Move(long id, int x, int y, int w, int hh) {
    IntPtr h = new IntPtr(id); RECT rc; GetWindowRect(h, out rc);
    bool zoomed = IsZoomed(h), full = !zoomed && rc.r - rc.l >= w && rc.b - rc.t >= hh;
    if (zoomed) ShowWindow(h, 9);
    if (full) SetWindowPos(h, IntPtr.Zero, x, y, w, hh, 0x0014);
    else SetWindowPos(h, IntPtr.Zero, x + 40, y + 40, 0, 0, 0x0015);
    if (zoomed) ShowWindow(h, 3);
  }
  public static void Act(long id, string a) {
    IntPtr h = new IntPtr(id);
    if (a == "min") ShowWindow(h, 6);
    else if (a == "close") PostMessage(h, 0x10, IntPtr.Zero, IntPtr.Zero);
    else {
      if (IsIconic(h)) ShowWindow(h, 9);
      // Windows only lets the app with the last input take the foreground; a tap of Alt counts.
      keybd_event(0x12, 0, 0, IntPtr.Zero); keybd_event(0x12, 0, 2, IntPtr.Zero);
      BringWindowToTop(h); SetForegroundWindow(h);
    }
  }
}
`;

const PS1 = (self) => `
Add-Type -TypeDefinition @'
${CS}
'@
while ($true) {
  $line = [Console]::In.ReadLine(); if ($line -eq $null) { break }
  try {
    if ($line -eq 'list') { $r = [BDWin]::List(${self}) }
    elseif ($line.StartsWith('move|')) { $p = $line.Split('|'); [BDWin]::Move([long]$p[1], [int]$p[2], [int]$p[3], [int]$p[4], [int]$p[5]); $r = [BDWin]::List(${self}) }
    else { $p = $line.Split('|'); [BDWin]::Act([long]$p[1], $p[0]); $r = [BDWin]::List(${self}) }
  } catch { $r = '[]' }
  [Console]::Out.WriteLine($r); [Console]::Out.Flush()
}
`;

let proc = null, waiters = [], buf = '', timer = 0, last = '', send = () => {}, x11 = false;
// The helper can die (sleep and resume, a crash): the next question starts it again, at most once
// every 10 seconds, so the dock and Quick Resume do not go quiet for the rest of the session.
let winDir = '', restartAt = 0;

function ask(cmd) {
  return new Promise((res) => {
    if (!proc && winDir && Date.now() - restartAt > 10000) { restartAt = Date.now(); known = null; try { startWin(winDir); } catch { /* next time */ } }
    if (!proc) return res('[]');
    waiters.push(res);
    proc.stdin.write(cmd + '\n');
  });
}

function startWin(dir) {
  winDir = dir;
  const file = path.join(dir, 'bladedeck-windows.ps1');
  fs.writeFileSync(file, PS1(process.pid));
  proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l.startsWith('[')) { const w = waiters.shift(); if (w) w(l); } }
  });
  const dead = () => { proc = null; for (const w of waiters.splice(0)) w('[]'); };
  proc.on('exit', dead); proc.on('error', dead);
}

// wmctrl -lpx: "0x03a00003  0 4242 firefox.Firefox  host  Title"
function x11List() {
  return new Promise((res) => execFile('wmctrl', ['-lpx'], { timeout: 4000 }, (err, out) => {
    if (err) return res('[]');
    execFile('xprop', ['-root', '_NET_ACTIVE_WINDOW'], { timeout: 2000 }, (e2, act) => {
      const active = ((String(act || '').match(/0x[0-9a-f]+/i) || [])[0] || '').toLowerCase().replace(/^0x0*/, '');
      const l = String(out).split('\n').map((line) => {
        const m = line.match(/^(0x[0-9a-f]+)\s+(-?\d+)\s+(\d+)\s+(\S+)\s+\S+\s+(.*)$/i);
        if (!m || m[2] === '-1' || +m[3] === process.pid) return null;
        return { id: `x11:${m[1]}`, caption: m[5], cls: m[4].split('.').pop(), pid: +m[3], min: false, active: m[1].toLowerCase().replace(/^0x0*/, '') === active };
      }).filter(Boolean);
      res(JSON.stringify(l));
    });
  }));
}

/* Windows: which screen each window is on, named the way players.js names Windows screens, so
   multi-screen and sound-follows-the-game work as they do with KDE's connector names. */
function withScreens(out) {
  let l; try { l = JSON.parse(out); } catch { return null; }
  if (process.platform !== 'win32') return l;
  const { screen } = require('electron'), { screenName } = require('./players');
  for (const w of l) {
    if (!w.rect || w.min) continue;
    try { const [x, y, width, height] = w.rect; w.out = screenName(screen.getDisplayMatching(screen.screenToDipRect(null, { x, y, width, height }))); } catch { /* off screen */ }
  }
  return l;
}
/* Windows tells nobody when a window opens or closes, which KWin's script does on KDE. Comparing
   one list with the next gives the same "opened" and "gone" events, so the menu can tell when a
   game's window has arrived (and stop waiting) or closed. */
let known = null, onEvent = () => {};
function diff(l) {
  if (process.platform !== 'win32') return;
  const ids = new Map(l.map((w) => [w.id, w]));
  if (known) {
    for (const [id, w] of ids) if (!known.has(id)) onEvent({ kind: 'opened', caption: w.caption, pid: w.pid, cls: w.cls });
    for (const [id, w] of known) if (!ids.has(id)) onEvent({ kind: 'gone', caption: w.caption, pid: w.pid, cls: w.cls });
  }
  known = ids;
}
async function poll() {
  const out = x11 ? await x11List() : await ask('list');
  if (out !== last) { last = out; const l = withScreens(out); if (l) { diff(l); send(l); } }
}
// The window in front right now (not Bladedeck's): what Ctrl+M on Windows peeks away from.
async function foreground() {
  if (process.platform !== 'win32' || !winDir) return null;
  try { return JSON.parse(await ask('list')).find((w) => w.active) || null; } catch { return null; }
}

// mode is the peek mode; with KWin the script already sends windows.
function start({ dir, mode, onList, onWindowEvent }) {
  send = onList; if (onWindowEvent) onEvent = onWindowEvent;
  if (mode === 'kwin' || timer) return false;
  if (process.platform === 'win32') startWin(dir);
  else if (process.platform === 'linux' && process.env.DISPLAY && process.env.XDG_SESSION_TYPE !== 'wayland') {
    x11 = true;
    execFile('wmctrl', ['-m'], { timeout: 3000 }, (err) => { if (err) { x11 = false; clearInterval(timer); timer = 0; } });
  } else return false;
  timer = setInterval(poll, 2000);
  poll();
  return true;
}

async function act(id, a) {
  id = String(id);
  if (id.startsWith('w32:')) {
    const h = id.slice(4).replace(/\D/g, '');
    let cmd = `${a === 'min' || a === 'close' ? a : 'show'}|${h}`;
    // screen:<name> moves the window onto that screen (multi-screen puts each game on its player's).
    if (String(a).startsWith('screen:')) {
      const { screen } = require('electron'), { screenName } = require('./players');
      const d = screen.getAllDisplays().find((x) => screenName(x) === String(a).slice(7)); if (!d) return false;
      const r = screen.dipToScreenRect(null, d.bounds);
      cmd = `move|${h}|${r.x}|${r.y}|${r.width}|${r.height}`;
    }
    const out = await ask(cmd); last = out; const l = withScreens(out); if (l) send(l); return true;
  }
  if (id.startsWith('x11:')) {
    const w = id.slice(4).replace(/[^0-9a-fx]/gi, '');
    const run = (cmd, args) => new Promise((r) => execFile(cmd, args, { timeout: 4000 }, (err) => r(!err)));
    const ok = a === 'close' ? await run('wmctrl', ['-ic', w]) : a === 'min' ? await run('xdotool', ['windowminimize', w]) : await run('wmctrl', ['-ia', w]);
    setTimeout(poll, 300);
    return ok;
  }
  return false;
}

function stop() { clearInterval(timer); timer = 0; winDir = ''; if (proc) { try { proc.stdin.end(); proc.kill(); } catch { /* gone */ } proc = null; } }

module.exports = { start, act, stop, foreground };
