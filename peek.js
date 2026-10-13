'use strict';
/* Peek: one key (Ctrl+M) hops between whatever you are playing and Bladedeck, and back.
   On KDE a small KWin script owns the shortcut, because Wayland apps cannot grab keys while
   another window has focus. It tells us what happened over DBus through a tiny Python helper.
   Elsewhere an Electron global shortcut does a simpler version: show Bladedeck, or minimize it. */
const { globalShortcut } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const NAME = 'bladedeck-peek';
const SHORTCUT = 'Bladedeck Peek';
const RETURN = 'Bladedeck Return';

const HELPER_PY = `
import dbus, dbus.service, dbus.mainloop.glib, json, sys
from gi.repository import GLib
dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
bus = dbus.SessionBus()
loop = GLib.MainLoop()
# A helper left behind by a crashed Bladedeck must not keep the name: take it over, and give it up
# to the next one. Exit when Bladedeck goes away (stdin closes) or another helper takes over.
name = dbus.service.BusName('dev.bladedeck.Peek', bus, allow_replacement=True, replace_existing=True, do_not_queue=True)
bus.add_signal_receiver(lambda n: loop.quit() if n == 'dev.bladedeck.Peek' else None, 'NameLost', 'org.freedesktop.DBus')
GLib.io_add_watch(sys.stdin.fileno(), GLib.IO_IN | GLib.IO_HUP | GLib.IO_ERR, lambda *a: loop.quit())
def out(o):
    sys.stdout.write(json.dumps(o) + '\\n'); sys.stdout.flush()
class Peek(dbus.service.Object):
    @dbus.service.method('dev.bladedeck.Peek', in_signature='ssss', out_signature='')
    def Event(self, kind, caption, pid, cls):
        out({'kind': str(kind), 'caption': str(caption), 'pid': int(pid or 0), 'cls': str(cls)})
Peek(bus, '/Peek')
out({'kind': 'ready'})
loop.run()
`;

// kinds sent back: peek (shortcut brought Bladedeck up over a window), focus (Bladedeck got
// focus some other way, with the window it came from), want-back (shortcut pressed in Bladedeck:
// it plays its pop-in animation and then invokes the Return shortcut), back (returned to the
// window), gone (that window closed).
const kwinScript = (deckPid, minimize) => `
const DECK = ${deckPid};
const MINIMIZE = ${minimize ? 'true' : 'false'};
let parked = null, last = null;
const isDeck = (w) => !!w && w.pid === DECK;
// The screen-share picker for the live view is a window too, but never the game.
const usable = (w) => !!w && !isDeck(w) && w.normalWindow && !w.skipTaskbar && !/portal/i.test(String(w.resourceClass));
const alive = (w) => !!w && workspace.windowList().indexOf(w) !== -1;
function tell(kind, w) {
  callDBus('dev.bladedeck.Peek', '/Peek', 'dev.bladedeck.Peek', 'Event',
    kind, w ? String(w.caption) : '', w ? String(w.pid) : '0', w ? String(w.resourceClass) : '');
}
function deck() { return workspace.windowList().find((w) => isDeck(w) && w.normalWindow) || null; }
function toggle() {
  const a = workspace.activeWindow, d = deck();
  if (!d) return;
  if (usable(a)) {
    parked = a;
    if (MINIMIZE) a.minimized = true;
    d.minimized = false;
    workspace.activeWindow = d;
    tell('peek', a);
  } else if (isDeck(a)) {
    if (alive(parked) || alive(last)) tell('want-back', alive(parked) ? parked : last);
  } else returnTo();
}
function returnTo() {
  const t = alive(parked) ? parked : alive(last) ? last : null;
  if (!t) return;
  t.minimized = false;
  workspace.activeWindow = t;
  parked = null;
  tell('back', t);
}
workspace.windowActivated.connect((w) => {
  if (usable(w)) last = w;
  else if (isDeck(w) && alive(last) && last !== parked) tell('focus', last);
});
workspace.windowAdded.connect((w) => { if (usable(w)) tell('opened', w); });
workspace.windowRemoved.connect((w) => {
  if (w === parked || w === last) { tell('gone', w); if (w === parked) parked = null; if (w === last) last = null; }
});
// The window dock: what is open, sent again whenever it changes.
function sendList(gone) {
  const list = workspace.windowList().filter((w) => usable(w) && w !== gone).map((w) => ({
    id: String(w.internalId), caption: String(w.caption), cls: String(w.resourceClass), pid: w.pid,
    min: !!w.minimized, active: workspace.activeWindow === w }));
  callDBus('dev.bladedeck.Peek', '/Peek', 'dev.bladedeck.Peek', 'Event', 'windows', JSON.stringify(list), '0', '');
}
function watch(w) { if (!w || isDeck(w)) return; w.captionChanged.connect(() => sendList()); w.minimizedChanged.connect(() => sendList()); }
workspace.windowList().forEach(watch);
workspace.windowAdded.connect((w) => { watch(w); sendList(); });
workspace.windowRemoved.connect((w) => sendList(w));
workspace.windowActivated.connect(() => sendList());
sendList();
registerShortcut('${SHORTCUT}', 'Bladedeck: peek at the launcher and jump back', 'Ctrl+M', toggle);
registerShortcut('${RETURN}', 'Bladedeck: return to the game (used by Bladedeck)', '', returnTo);
`;

function gdbus(args) {
  return new Promise((res) => execFile('gdbus', ['call', '--session', ...args], { timeout: 4000 }, (err, out) => res(err ? null : String(out))));
}

let helper = null, onEvent = () => {}, mode = null, win = null, scriptFile = '';

async function loadKwin(minimize) {
  fs.writeFileSync(scriptFile, kwinScript(process.pid, minimize));
  await gdbus(['--dest', 'org.kde.KWin', '--object-path', '/Scripting', '--method', 'org.kde.kwin.Scripting.unloadScript', NAME]);
  const r = await gdbus(['--dest', 'org.kde.KWin', '--object-path', '/Scripting', '--method', 'org.kde.kwin.Scripting.loadScript', scriptFile, NAME]);
  const id = r && (r.match(/-?\d+/) || [])[0];
  if (!id || +id < 0) return false;
  return !!(await gdbus(['--dest', 'org.kde.KWin', '--object-path', `/Scripting/Script${id}`, '--method', 'org.kde.kwin.Script.run']));
}

function startHelper() {
  return new Promise((res) => {
    let ready = false;
    try { helper = spawn('python3', ['-c', HELPER_PY], { stdio: ['pipe', 'pipe', 'ignore'] }); } catch { return res(false); }
    let buf = '';
    helper.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let ev; try { ev = JSON.parse(line); } catch { continue; }
        if (ev.kind === 'ready') { ready = true; res(true); } else onEvent(ev);
      }
    });
    helper.on('error', () => res(false));
    helper.on('exit', () => { helper = null; if (!ready) res(false); });
    setTimeout(() => res(ready), 4000);
  });
}

async function start(w, { dataDir, minimize, handler }) {
  win = w; onEvent = handler; scriptFile = path.join(dataDir, 'kwin-peek.js');
  const kde = process.platform === 'linux' && /KDE/i.test(process.env.XDG_CURRENT_DESKTOP || '');
  if (kde && await startHelper() && await loadKwin(minimize)) { mode = 'kwin'; return mode; }
  if (helper) { helper.kill(); helper = null; }
  // Fallback: Ctrl+M shows Bladedeck, and from Bladedeck it minimizes it to reveal the game.
  try {
    globalShortcut.register('CommandOrControl+M', electronToggle);
    mode = 'electron';
  } catch { mode = null; }
  return mode;
}

function electronToggle() {
  if (!win) return;
  if (win.isFocused()) onEvent({ kind: 'want-back' });
  else { win.restore(); win.show(); win.focus(); onEvent({ kind: 'peek', caption: '', pid: 0, cls: '' }); }
}

// The same as pressing Ctrl+M, for the controller.
async function toggle() {
  if (mode === 'kwin') return !!(await gdbus(['--dest', 'org.kde.kglobalaccel', '--object-path', '/component/kwin', '--method', 'org.kde.kglobalaccel.Component.invokeShortcut', SHORTCUT]));
  if (mode === 'electron') { electronToggle(); return true; }
  return false;
}

// Jump back to the game, the same as pressing the shortcut from Bladedeck.
async function back() {
  if (mode === 'kwin') {
    const ok = await gdbus(['--dest', 'org.kde.kglobalaccel', '--object-path', '/component/kwin', '--method', 'org.kde.kglobalaccel.Component.invokeShortcut', RETURN]);
    if (ok) return true;
  }
  if (win) { win.minimize(); onEvent({ kind: 'back' }); return true; }
  return false;
}

// Show, minimize or close one window from the dock. KWin scripts can't take calls, so each
// action is a tiny script of its own, loaded, run and unloaded. One at a time.
const ACTIONS = {
  show: 'w.minimized = false; workspace.activeWindow = w;',
  min: 'w.minimized = true;',
  close: 'w.closeWindow();'
};
let acting = Promise.resolve();
function windowAction(id, act) {
  if (mode !== 'kwin' || !ACTIONS[act]) return Promise.resolve(false);
  acting = acting.then(async () => {
    const file = path.join(path.dirname(scriptFile), 'kwin-act.js');
    fs.writeFileSync(file, `const w = workspace.windowList().find((x) => String(x.internalId) === ${JSON.stringify(String(id))});\nif (w) { ${ACTIONS[act]} }\n`);
    const name = 'bladedeck-act';
    await gdbus(['--dest', 'org.kde.KWin', '--object-path', '/Scripting', '--method', 'org.kde.kwin.Scripting.unloadScript', name]);
    const r = await gdbus(['--dest', 'org.kde.KWin', '--object-path', '/Scripting', '--method', 'org.kde.kwin.Scripting.loadScript', file, name]);
    const n = r && (r.match(/-?\d+/) || [])[0];
    if (!n || +n < 0) return false;
    const ok = !!(await gdbus(['--dest', 'org.kde.KWin', '--object-path', `/Scripting/Script${n}`, '--method', 'org.kde.kwin.Script.run']));
    await gdbus(['--dest', 'org.kde.KWin', '--object-path', '/Scripting', '--method', 'org.kde.kwin.Scripting.unloadScript', name]);
    return ok;
  }).catch(() => false);
  return acting;
}

async function reconfigure(minimize) { if (mode === 'kwin') await loadKwin(minimize); }

function stop() {
  if (mode === 'kwin') execFile('gdbus', ['call', '--session', '--dest', 'org.kde.KWin', '--object-path', '/Scripting', '--method', 'org.kde.kwin.Scripting.unloadScript', NAME], () => {});
  if (mode === 'electron') globalShortcut.unregisterAll();
  if (helper) { helper.kill(); helper = null; }
  mode = null;
}

module.exports = { start, back, toggle, windowAction, reconfigure, stop, mode: () => mode };
