'use strict';
/* Steam Input's desktop layout and Bladedeck. While no game is running (so in Bladedeck too),
   Steam drives a controller with its "desktop layout", and Steam's own layouts can put the PC to
   sleep from a button: holding Menu on a Steam Deck-style controller (Steam Controller, Steam
   Deck) and pressing Share on an Xbox one. Holding Menu is also half of Bladedeck's View + Menu,
   so switching between a game and Bladedeck could put the PC to sleep.
   This finds those bindings (controller_action host_suspend) in the desktop and Big Picture
   layouts, and on request takes them out, keeping a copy of each file it changes. Steam must be
   closed for that: it writes its layouts back when it quits.
   On Windows it also takes Windows' shortcut keys out of the desktop layout (keysWalk below). */
const { ipcMain } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const APPS = ['413080', '413090']; // desktop layout, Big Picture layout
const LAYOUT = { neptune: 'Steam Deck-style (Steam Controller, Steam Deck)', xboxone: 'Xbox', xbox360: 'Xbox 360', ps4: 'PlayStation 4', ps5: 'PlayStation 5', switch_pro: 'Switch Pro', steamcontroller_gordon: 'Steam Controller (2015)' };
const BUTTON = { button_escape: 'Menu', button_menu: 'View', button_capture: 'Share', button_a: 'A', button_b: 'B', button_x: 'X', button_y: 'Y', left_bumper: 'LB', right_bumper: 'RB', left_trigger: 'LT', right_trigger: 'RT', button_back_left: 'L4', button_back_right: 'R4', button_back_left_upper: 'L5', button_back_right_upper: 'R5' };
const PRESS = { Full_Press: 'press', Long_Press: 'hold', Double_Press: 'double press', Start_Press: 'press', Release: 'let go of' };

function steamRoots() {
  const h = os.homedir();
  const l = process.platform === 'win32'
    ? [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean).map((d) => path.join(d, 'Steam'))
    : [path.join(h, '.local/share/Steam'), path.join(h, '.steam/steam'), path.join(h, '.var/app/com.valvesoftware.Steam/.local/share/Steam')];
  const seen = new Set();
  return l.filter((p) => { try { const r = fs.realpathSync(p); if (seen.has(r)) return false; seen.add(r); return true; } catch { return false; } });
}
function files() {
  const out = [];
  for (const root of steamRoots()) {
    const base = path.join(root, 'steamapps', 'common', 'Steam Controller Configs');
    let users = []; try { users = fs.readdirSync(base); } catch { continue; }
    for (const u of users) for (const a of APPS) {
      const d = path.join(base, u, 'config', a);
      let names = []; try { names = fs.readdirSync(d); } catch { continue; }
      for (const n of names) if (/\.vdf$/i.test(n)) out.push(path.join(d, n));
    }
  }
  return out;
}

/* -------------------------------------------------------------- VDF (Valve's text format) */
// A node is [key, value]: value is a string, or a list of nodes. Order and repeats are kept.
function parse(text) {
  const toks = []; const re = /"((?:[^"\\]|\\.)*)"|([{}])|\/\/[^\n]*|([^\s{}"]+)/g; let m;
  while ((m = re.exec(text))) { if (m[1] !== undefined) toks.push({ s: m[1] }); else if (m[2]) toks.push({ b: m[2] }); else if (m[3]) toks.push({ s: m[3] }); }
  let i = 0;
  const list = () => {
    const out = [];
    while (i < toks.length && toks[i].b !== '}') {
      const k = toks[i++]; if (k.s === undefined) continue;
      const v = toks[i];
      if (v && v.b === '{') { i++; out.push([k.s, list()]); i++; } else if (v && v.s !== undefined) { i++; out.push([k.s, v.s]); }
    }
    return out;
  };
  return list();
}
function write(nodes, depth = 0) {
  const tab = '\t'.repeat(depth);
  return nodes.map(([k, v]) => (Array.isArray(v) ? `${tab}"${k}"\n${tab}{\n${write(v, depth + 1)}${tab}}\n` : `${tab}"${k}"\t\t"${v}"\n`)).join('');
}
const holdsSuspend = (v) => (Array.isArray(v) ? v.some(([, x]) => holdsSuspend(x)) : /host_suspend/.test(v));

// Each sleep binding: which button, how it is pressed. With cut, it is taken out.
function walk(nodes, found, cut, inputName = '') {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const [k, v] = nodes[i];
    if (!Array.isArray(v)) continue;
    if (k === 'activators') {
      for (let j = v.length - 1; j >= 0; j--) {
        if (!holdsSuspend(v[j][1])) continue;
        found.push({ button: BUTTON[inputName] || inputName, press: PRESS[v[j][0]] || v[j][0] });
        if (cut) v.splice(j, 1);
      }
      continue;
    }
    // A button left with no activators is unbound, which is how Steam writes one too.
    walk(v, found, cut, k);
  }
}

/* The desktop layout also turns buttons into Windows' own shortcut keys: RB is Alt, LB is Ctrl,
   View is Tab and a Steam Deck's L4 is the Windows key, so RB + View is Alt+Tab, and View or Menu
   with L4 opens Task View or the Start menu, under Bladedeck and over it. View, Menu, LB and RB
   become the controller buttons they are (Steam's Xbox-style pad, which the menu reads); Alt,
   Ctrl, Tab and the Windows key on any other button are taken off. Menu was Escape: it becomes
   Start too, so B (and a keyboard) stay Bladedeck's way back. Desktop layout only. */
const PAD = { button_menu: 'select', button_escape: 'start', left_bumper: 'shoulder_left', right_bumper: 'shoulder_right' };
const SHORTCUT = /^key_press ((LEFT_|RIGHT_)?(ALT|CONTROL|WINDOWS)|TAB)\b/i;
const keyOf = (b) => (/^key_press (\w+)/i.exec(b) || [])[1] || '';
function keysWalk(nodes, found, cut, inputName = '') {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const [k, v] = nodes[i];
    if (!Array.isArray(v)) continue;
    if (k !== 'activators') { keysWalk(v, found, cut, k); continue; }
    for (let j = v.length - 1; j >= 0; j--) {
      const act = v[j][1]; if (!Array.isArray(act)) continue;
      const bindings = act.find(([n]) => n === 'bindings'); if (!bindings || !Array.isArray(bindings[1])) continue;
      const list = bindings[1];
      for (let m = list.length - 1; m >= 0; m--) {
        const [n, b] = list[m]; if (n !== 'binding' || typeof b !== 'string') continue;
        const pad = PAD[inputName];
        const hit = SHORTCUT.test(b) || (inputName === 'button_escape' && /^key_press ESCAPE\b/i.test(b));
        if (!hit) continue;
        found.push({ kind: 'keys', button: BUTTON[inputName] || inputName, key: keyOf(b), to: pad ? 'button' : 'nothing' });
        if (!cut) continue;
        if (pad) list[m] = ['binding', `xinput_button ${pad}, , `];
        else list.splice(m, 1);
      }
      if (cut && !list.length) v.splice(j, 1);
    }
  }
}

const KEY_NAME = { LEFT_ALT: 'Alt', RIGHT_ALT: 'Alt', ALT: 'Alt', LEFT_CONTROL: 'Ctrl', RIGHT_CONTROL: 'Ctrl', CONTROL: 'Ctrl', LEFT_WINDOWS: 'the Windows key', RIGHT_WINDOWS: 'the Windows key', WINDOWS: 'the Windows key', TAB: 'Tab', ESCAPE: 'Escape' };
// Controllers in the desktop layout; not the phone's touch layout (Steam Link), which has no such buttons to give.
const isDesktop = (f) => path.basename(path.dirname(f)) === '413080' && !/mobile_touch/i.test(path.basename(f));
function scan() {
  const out = [];
  for (const f of files()) {
    let text; try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const found = [], tree = parse(text);
    if (/host_suspend/.test(text)) walk(tree, found, false);
    if (process.platform === 'win32' && isDesktop(f)) keysWalk(tree, found, false);
    const kind = path.basename(f, '.vdf').replace(/^controller_/, '');
    for (const x of found) out.push({ file: f, layout: LAYOUT[kind] || kind, app: path.basename(path.dirname(f)) === '413090' ? 'Big Picture' : 'desktop', ...x, ...(x.key ? { key: KEY_NAME[x.key.toUpperCase()] || x.key } : {}) });
  }
  return out;
}

const steamRunning = () => new Promise((res) => {
  if (process.platform === 'win32') execFile('tasklist', ['/FI', 'IMAGENAME eq steam.exe', '/NH'], { timeout: 5000, windowsHide: true }, (err, out) => res(!err && /steam\.exe/i.test(String(out))));
  else execFile('pgrep', ['-x', 'steam'], { timeout: 5000 }, (err) => res(!err));
});

async function fix() {
  if (await steamRunning()) return { ok: false, steamRunning: true };
  const changed = [];
  for (const f of new Set(scan().map((x) => x.file))) {
    const text = fs.readFileSync(f, 'utf8');
    const tree = parse(text); walk(tree, [], true);
    if (process.platform === 'win32' && isDesktop(f)) keysWalk(tree, [], true);
    const keep = `${f}.bladedeck-${new Date().toISOString().slice(0, 10)}.bak`;
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, text);
    fs.writeFileSync(f, write(tree));
    changed.push(f);
  }
  return { ok: true, changed: changed.length, left: scan().length };
}

function register() {
  ipcMain.handle('steam-sleep-scan', () => { try { return scan(); } catch { return []; } });
  ipcMain.handle('steam-sleep-fix', async () => { try { return await fix(); } catch (err) { return { ok: false, error: String(err.message || err) }; } });
}

module.exports = { register, scan, parse, write, walk, keysWalk };
