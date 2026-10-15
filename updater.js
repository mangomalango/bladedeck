'use strict';
/* Updates: System, Updates. Bladedeck asks GitHub whether there is a newer build, lists every fix
   it brings (the commits between the build you have and the new one, plus the release notes),
   and the Update button downloads it, checks it and puts it in place:
   - Windows: the installer runs silently and starts Bladedeck again (/S --force-run).
   - Linux: the new AppImage is written beside the running one and swapped in by renaming (a
     running AppImage keeps reading its old file, so it is never overwritten), then Bladedeck
     restarts from it.
   Two channels: Releases (the default: GitHub's latest release) and Nightly (the newest
   bladedeck-nightly; it has a download only when the team publishes a "nightly" pre-release).
   Run from source, it only shows the fixes: there, `git pull` is the update. */
const { app, ipcMain, Notification } = require('electron');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = /^[\w.-]+\/[\w.-]+$/;
const NIGHTLY_BRANCH = 'bladedeck-nightly';
let send = () => {}, last = null, busy = false;

// The build this is: written at build time (scripts/buildinfo.js), or asked of git from source.
function build() {
  let b = {};
  try { b = JSON.parse(fs.readFileSync(path.join(__dirname, 'build-info.json'), 'utf8')); } catch { /* not a built copy */ }
  if (!b.commit && !app.isPackaged) { try { b.commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* no git */ } }
  return { version: app.getVersion(), commit: b.commit || '', branch: b.branch || '', date: b.date || '', packaged: app.isPackaged, platform: process.platform, appimage: !!process.env.APPIMAGE };
}

async function gh(repo, p) {
  const r = await fetch(`https://api.github.com/repos/${repo}/${p}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Bladedeck' }, signal: AbortSignal.timeout(15000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(r.status === 403 ? 'GitHub is busy (too many checks this hour). Try again later.' : `GitHub answered ${r.status}.`);
  return r.json();
}
const num = (v) => String(v || '').replace(/^v/i, '').split(/[.-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
const newerVersion = (a, b) => { const [x, y] = [num(a), num(b)]; return (x[0] - y[0] || x[1] - y[1] || x[2] - y[2]) > 0; };
// A "-dev" build is older than the release of the same number.
const isDev = (v) => /-/.test(String(v));

// The file for this computer among a release's downloads.
function assetFor(rel) {
  const list = (rel && rel.assets) || [];
  if (process.platform === 'win32') return list.find((a) => /\.exe$/i.test(a.name) && /setup/i.test(a.name)) || list.find((a) => /\.exe$/i.test(a.name));
  if (process.platform === 'linux') return list.find((a) => /\.AppImage$/i.test(a.name));
  return null;
}
// The fixes in a list of commits: their first lines, newest first, without merges and housekeeping.
const fixesOf = (commits) => (commits || []).map((c) => ({ sha: c.sha.slice(0, 7), title: String(c.commit?.message || '').split('\n')[0], date: c.commit?.committer?.date || '' }))
  .filter((c) => c.title && !/^(Merge |Snapshot |HANDOFF|TEAM|WINDOWS\.md)/.test(c.title)).reverse();
// Release notes as lines (bullets and sentences), for releases made by hand.
const notesOf = (body) => String(body || '').split(/\r?\n/).map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter((l) => l && !/^#/.test(l));

async function check(repo, channel = 'release') {
  if (!REPO.test(String(repo || ''))) return { ok: false, error: 'No GitHub repository is set (Settings has it under Updates).' };
  const me = build();
  try {
    let target = null, rel = null, notes = [];
    if (channel === 'nightly') {
      rel = await gh(repo, 'releases/tags/nightly');
      target = NIGHTLY_BRANCH;
    } else {
      rel = await gh(repo, 'releases/latest');
      if (!rel) return { ok: true, build: me, channel, newer: false, latest: '', fixes: [], notes: [], note: 'No release yet.' };
      target = rel.tag_name; notes = notesOf(rel.body);
    }
    let fixes = [], ahead = 0, commitsKnown = false;
    if (me.commit && target) {
      const cmp = await gh(repo, `compare/${me.commit}...${encodeURIComponent(target)}`).catch(() => null);
      if (cmp) { ahead = cmp.ahead_by || 0; fixes = fixesOf(cmp.commits); commitsKnown = true; }
    }
    const latest = channel === 'nightly' ? (rel?.name || NIGHTLY_BRANCH) : String(rel.tag_name || '').replace(/^v/i, '');
    // With the build's commit known, newer means the target has commits this build lacks (an older
    // release is already inside this build, so it never counts). Without it, the version decides.
    const newer = commitsKnown ? ahead > 0
      : channel !== 'nightly' && (newerVersion(latest, me.version) || (isDev(me.version) && num(latest).join('.') === num(me.version).join('.')));
    const a = assetFor(rel);
    last = { repo, channel, asset: a ? { name: a.name, url: a.browser_download_url, size: a.size, digest: a.digest || '' } : null };
    return {
      ok: true, build: me, channel, newer, latest, ahead, fixes, notes, page: rel?.html_url || `https://github.com/${repo}/tree/${encodeURIComponent(target || '')}`,
      canInstall: !!(newer && a && me.packaged && (process.platform === 'win32' || me.appimage)),
      why: !newer ? '' : !me.packaged ? 'This copy runs from source: update it with git pull.' : !a ? (channel === 'nightly' ? 'The newest nightly has no download yet.' : 'This release has no download for this computer.') : process.platform === 'linux' && !me.appimage ? 'Only the AppImage can update itself.' : ''
    };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
}

const dir = () => path.join(app.getPath('userData'), 'updates');
// Downloads the file found by the last check, showing progress, and checks its size (and its
// SHA-256 when GitHub gives one). Then installs it.
async function update() {
  if (busy) return { ok: false, error: 'An update is already running.' };
  if (!last?.asset) return { ok: false, error: 'Check for updates first.' };
  busy = true;
  try {
    fs.mkdirSync(dir(), { recursive: true });
    const { name, url, size, digest } = last.asset;
    const file = path.join(dir(), name.replace(/[^\w.() -]/g, '_'));
    const r = await fetch(url, { headers: { 'User-Agent': 'Bladedeck' }, redirect: 'follow' });
    if (!r.ok || !r.body) throw new Error(`The download failed (${r.status}).`);
    const out = fs.createWriteStream(`${file}.part`);
    const hash = require('crypto').createHash('sha256');
    let got = 0, shown = 0;
    for await (const chunk of r.body) {
      out.write(chunk); hash.update(chunk); got += chunk.length;
      if (Date.now() - shown > 300) { shown = Date.now(); send('update-progress', { got, size }); }
    }
    await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
    if (size && got !== size) throw new Error('The download was incomplete. Try again.');
    if (/^sha256:/.test(digest) && digest.slice(7) !== hash.digest('hex')) throw new Error('The download did not match GitHub\'s checksum, so it was not installed.');
    fs.renameSync(`${file}.part`, file);
    send('update-progress', { got, size, done: true });
    return install(file);
  } catch (err) { return { ok: false, error: String(err.message || err) }; } finally { busy = false; }
}

function install(file) {
  if (process.platform === 'win32') {
    // The installer replaces Bladedeck once it has quit, then starts it again.
    const p = spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true });
    p.on('error', () => {}); p.unref();
    setTimeout(() => app.quit(), 800);
    return { ok: true, restarting: true };
  }
  if (process.platform === 'linux' && process.env.APPIMAGE) {
    const target = process.env.APPIMAGE;
    fs.copyFileSync(file, `${target}.new`);
    fs.chmodSync(`${target}.new`, 0o755);
    // Renaming swaps the name over to the new file; the running copy keeps its old one.
    fs.renameSync(`${target}.new`, target);
    try { fs.rmSync(file, { force: true }); } catch { /* fine */ }
    app.relaunch({ execPath: target, args: [] });
    setTimeout(() => app.quit(), 500);
    return { ok: true, restarting: true };
  }
  return { ok: false, error: 'This copy cannot update itself.' };
}

// The menu says when a check finds something; a system notification says it while a game runs.
function notify(r) {
  if (!r?.newer || !Notification.isSupported()) return;
  new Notification({ title: 'Bladedeck update ready', body: `${r.latest}${r.fixes?.length ? ` · ${r.fixes.length} fixes` : ''}. System, Updates.`, silent: true }).show();
}

function register({ getWin }) {
  send = (ch, d) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, d); };
  ipcMain.handle('update-info', () => build());
  ipcMain.handle('update-check', async (_e, o = {}) => { const r = await check(o.repo, o.channel); if (o.notify) notify(r); return r; });
  ipcMain.handle('update-install', () => update());
}

module.exports = { register, check, build, fixesOf, notesOf, newerVersion };
