'use strict';
/* Feedback and ideas: System, Feedback and ideas. What to fix and what to add, written from the
   menu, kept in ~/Bladedeck/Feedback/feedback.md (plain text the owner can read too), each entry
   with the build it came from (version, commit, Windows or Linux) and where in Bladedeck it was
   written. The assistants read this file at the start of each round and turn entries into task
   cards; nothing is sent anywhere. A test copy keeps its own file in its scratch folder. */
const { app, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const KINDS = { fix: 'Fix', idea: 'Idea' };
const folder = () => (process.env.BLADEDECK_TEST ? path.join(app.getPath('userData'), 'Feedback') : path.join(os.homedir(), 'Bladedeck', 'Feedback'));
const file = () => path.join(folder(), 'feedback.md');
const HEAD = '# Bladedeck feedback and ideas\n\nWritten from System, Feedback and ideas. Newest at the bottom. Each line says the build it came from.\n';

function add({ kind, text, where } = {}) {
  const t = String(text || '').replace(/\r/g, '').trim().slice(0, 4000);
  if (!t) return { ok: false, error: 'Write something first.' };
  const b = require('./updater').build();
  const k = KINDS[kind] || 'Idea';
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const from = `${b.version}${b.commit ? ` (${b.commit.slice(0, 7)})` : ''}, ${process.platform === 'win32' ? 'Windows' : process.platform === 'linux' ? 'Linux' : process.platform}, ${os.hostname()}`;
  const entry = `\n## ${stamp} · ${k}\n- Build: ${from}${where ? `\n- Where: ${String(where).slice(0, 120)}` : ''}\n- Status: new\n\n${t.split('\n').map((l) => `> ${l}`).join('\n')}\n`;
  fs.mkdirSync(folder(), { recursive: true });
  if (!fs.existsSync(file())) fs.writeFileSync(file(), HEAD);
  fs.appendFileSync(file(), entry);
  return { ok: true, file: file() };
}

// The entries, newest first, for the list under the box.
function list() {
  let text = ''; try { text = fs.readFileSync(file(), 'utf8'); } catch { return []; }
  return text.split(/\n(?=## )/).slice(1).map((s) => {
    const m = /^## (.+?) · (\w+)/.exec(s) || [];
    return { when: m[1] || '', kind: (m[2] || '').toLowerCase(), status: (/- Status: (.+)/.exec(s) || [])[1] || 'new', text: s.split('\n').filter((l) => l.startsWith('> ')).map((l) => l.slice(2)).join('\n') };
  }).reverse().slice(0, 50);
}

function register() {
  ipcMain.handle('feedback-add', (_e, o) => { try { return add(o || {}); } catch (err) { return { ok: false, error: String(err.message || err) }; } });
  ipcMain.handle('feedback-list', () => list());
  ipcMain.handle('feedback-folder', () => { fs.mkdirSync(folder(), { recursive: true }); return folder(); });
}

module.exports = { register, add, list };
