'use strict';
/* Bladedeck on the phone. Pairs with a 6-digit code, then keeps a live line to Bladedeck
   (server-sent events) and sends it buttons and commands. Everything is plain fetch to the
   Bladedeck that served this page. */

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view');
let key = localStorage.getItem('bd-key') || '', st = null, tab = 'now', lib = null, libFilter = 'all', libQ = '', es = null;

function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2200); }
const buzz = () => { try { navigator.vibrate?.(12); } catch { /* no buzz */ } };

async function api(path, body) {
  const r = await fetch(`api/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { key = ''; localStorage.removeItem('bd-key'); pairScreen(); throw new Error('unpaired'); }
  return r.json();
}
const doIt = (b) => { buzz(); return api('do', b).catch(() => ({})); };
const art = (id, has, title) => (has ? `<div class="art" style="background-image:url('api/art?id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}')"></div>` : `<div class="art">${esc((title || '?').trim().slice(0, 2))}</div>`);

/* -------------------------------------------------------------- pairing */
function pairScreen() {
  $('#tabs').hidden = true;
  const pre = (location.hash.match(/pair=(\d{6})/) || [])[1] || '';
  view.innerHTML = `<div class="pairbox"><div class="orb" style="width:70px;height:70px;margin:0 auto"></div><h1>Pair with Bladedeck</h1>
    <p>In Bladedeck open System, This PC, Phone app, and enter the code it shows.</p>
    <input class="code" id="code" inputmode="numeric" maxlength="6" placeholder="000000" value="${pre}">
    <input id="name" placeholder="This phone's name" value="${esc(/Android/.test(navigator.userAgent) ? 'Android phone' : /iPhone/.test(navigator.userAgent) ? 'iPhone' : 'Phone')}">
    <button class="primary" id="pair">Pair</button>
    ${!window.BladedeckApp && /Android/.test(navigator.userAgent) ? '<a class="getapp" href="bladedeck-phone.apk" download="Bladedeck.apk">Get the Android app</a><p class="small">It finds Bladedeck by itself and keeps a notification for timers. Open the file once it downloads and allow installing from your browser.</p>' : ''}</div>`;
  $('#pair').onclick = async () => {
    const r = await fetch('api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: $('#code').value.replace(/\D/g, ''), name: $('#name').value }) }).then((x) => x.json()).catch(() => ({ error: 'Bladedeck did not answer.' }));
    if (!r.key) { toast(r.error || 'That did not work.'); return; }
    key = r.key; localStorage.setItem('bd-key', key); history.replaceState(null, '', location.pathname);
    start();
  };
  if (pre) $('#name').focus();
}

/* -------------------------------------------------------------- live state */
function connect() {
  es?.close();
  es = new EventSource(`api/events?key=${encodeURIComponent(key)}`);
  es.onmessage = (m) => { try { const s = JSON.parse(m.data); if (s && s.pc) { st = s; header(); if (tab === 'now') drawNow(); } } catch { /* skip */ } };
  // Timers and alarms from Bladedeck: set on the phone too (in the Android app), and ring here.
  es.addEventListener('alarms', (m) => { try { window.BladedeckApp?.schedule?.(m.data); } catch { /* not the app */ } });
  es.addEventListener('ring', (m) => { try { ring(JSON.parse(m.data)); } catch { /* skip */ } });
  es.onopen = () => $('#dot').classList.add('on');
  es.onerror = () => { $('#dot').classList.remove('on'); };
}
function header() {
  if (!st) return;
  $('#pc').textContent = st.pc;
  $('#lvl').textContent = `Level ${st.player.level}${st.player.streak > 1 ? ` · 🔥 ${st.player.streak} days` : ''}${st.capture.recording ? ' · ● REC' : ''}`;
  if (st.accent) document.documentElement.style.setProperty('--accent', st.accent);
}

/* -------------------------------------------------------------- Now */
function drawNow() {
  if (!st) { view.innerHTML = '<p class="empty">Connecting…</p>'; return; }
  const p = st.playing;
  const run = st.running.map((r) => `<div class="row ${r.game ? 'game' : 'app'}">${art(r.id, r.art, r.title)}
      <div><b>${esc(r.title)}</b><span class="chip ${r.paused ? 'paused' : p && r.id === p.id ? 'up' : ''}">${r.paused ? '❄ Paused' : p && r.id === p.id ? '● Playing' : r.min ? 'Minimized' : 'Running'}</span></div>
      <div class="acts"><button data-run="${r.i}" data-act="go">▶</button>${r.canPause ? `<button data-run="${r.i}" data-act="pause">${r.paused ? '⏵' : '❄'}</button>` : ''}<button data-run="${r.i}" data-act="close">✕</button></div></div>`).join('');
  view.innerHTML = `
    ${p ? `<h2>Playing</h2><div class="card"><div class="np">${art(p.id, p.art, p.title)}<div><b>${esc(p.title)}</b><small>${p.mins} min · ${esc(p.reward)}</small>${p.goal ? `<div class="goal">🎯 ${esc(p.goal)}</div>` : ''}${p.keys?.save ? `<small>Save state ${esc(p.keys.save)} · load ${esc(p.keys.load)}</small>` : ''}</div></div>
      <div class="btns"><button data-do="peek"><i>⇄</i>Game / Bladedeck</button><button data-do="rec" class="${st.capture.recording ? 'rec' : ''}"><i>${st.capture.recording ? '⏹' : '⏺'}</i>${st.capture.recording ? 'Stop' : 'Record'}</button>
        <button data-do="clip"><i>🎬</i>Save clip</button><button data-do="pip"><i>📺</i>Walkthrough</button><button data-pad="resume"><i>▣</i>Quick Resume</button><button data-pad="vol"><i>🔊</i>Sound</button></div></div>`
    : `<h2>Nothing playing</h2><div class="card"><p class="empty" style="padding:8px">Start a game from Library, or with the remote.</p>
      <div class="btns"><button data-tab-go="library"><i>🎮</i>Library</button><button data-do="rec" class="${st.capture.recording ? 'rec' : ''}"><i>${st.capture.recording ? '⏹' : '⏺'}</i>${st.capture.recording ? 'Stop' : 'Record'}</button><button data-pad="resume"><i>▣</i>Quick Resume</button></div></div>`}
    <h2>Running</h2>${run || '<p class="empty">Nothing else is running.</p>'}`;
}

/* -------------------------------------------------------------- Library */
async function drawLibrary() {
  if (!lib) { view.innerHTML = '<p class="empty">Loading your games…</p>'; lib = await api('library').catch(() => []); }
  const F = { all: () => true, fav: (e) => e.favorite, recent: (e) => e.last, steam: (e) => e.type === 'steam', emu: (e) => e.type === 'rom', pc: (e) => ['exe', 'gog', 'recomp', 'stream'].includes(e.type), apps: (e) => e.type === 'app' };
  let list = lib.filter(F[libFilter]).filter((e) => !libQ || e.title.toLowerCase().includes(libQ.toLowerCase()));
  list = libFilter === 'recent' ? list.sort((a, b) => b.last - a.last).slice(0, 30) : list.sort((a, b) => a.title.localeCompare(b.title));
  const chips = [['all', 'All'], ['fav', '★'], ['recent', 'Recent'], ['steam', 'Steam'], ['emu', 'Emulation'], ['pc', 'PC'], ['apps', 'Apps']];
  view.innerHTML = `<input class="search" id="q" placeholder="Search your games" value="${esc(libQ)}">
    <div class="chips">${chips.map(([k, n]) => `<button data-f="${k}" class="${k === libFilter ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="grid">${list.map((e) => `<button class="tile" data-game="${esc(e.id)}">${art(e.id, e.art, e.title)}<span>${esc(e.title)}</span></button>`).join('') || '<p class="empty">No games here.</p>'}</div>`;
  $('#q').oninput = (ev) => { libQ = ev.target.value; clearTimeout(drawLibrary.t); drawLibrary.t = setTimeout(() => { drawLibrary().then(() => { const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }); }, 250); };
}
function gameSheet(id) {
  const e = lib.find((x) => x.id === id); if (!e) return;
  const h = Math.round(e.playtime / 360) / 10;
  const s = document.createElement('div'); s.className = 'sheet';
  s.innerHTML = `<div class="card"><div class="np">${art(e.id, e.art, e.title)}<div><b>${esc(e.title)}</b><small>${esc(e.system || e.type)}${e.playtime ? ` · ${h} h played` : ''}</small>${e.goal ? `<div class="goal">🎯 ${esc(e.goal)}</div>` : ''}</div></div>
    <button class="primary" data-play>▶ Play on Bladedeck</button><button data-close>Close</button></div>`;
  s.onclick = async (ev) => {
    if (ev.target.closest('[data-play]')) { await doIt({ a: 'launch', id: e.id }); toast(`Starting ${e.title}`); s.remove(); setTab('now'); }
    else if (ev.target === s || ev.target.closest('[data-close]')) s.remove();
  };
  document.body.appendChild(s);
}

/* -------------------------------------------------------------- Remote */
function drawRemote() {
  view.innerHTML = `<h2>Remote</h2>
    <div class="shoulders"><button data-pad="lb">LB</button><button data-pad="lt">LT</button><button data-pad="rt">RT</button><button data-pad="rb">RB</button></div>
    <div class="pad"><div class="dpad"><button class="u" data-pad="up" data-rep>▲</button><button class="l" data-pad="left" data-rep>◀</button><button class="r" data-pad="right" data-rep>▶</button><button class="d" data-pad="down" data-rep>▼</button></div>
      <div class="face"><button class="y" data-pad="y">Y</button><button class="x" data-pad="x">X</button><button class="b" data-pad="b">B</button><button class="a" data-pad="a">A</button></div></div>
    <div class="mids"><button data-pad="back">View</button><button data-pad="start">Menu</button><button data-pad="guide">Guide</button><button data-pad="resume">Resume</button></div>
    <div class="mids"><button data-do="peek">⇄ Game</button><button data-pad="vol">🔊</button><button data-pad="music">♪</button><button data-do="pip">📺</button></div>
    <p class="label">Type into Bladedeck (search boxes, names, guide questions)</p>
    <div class="kb"><input id="kb" placeholder="Type here"><button class="primary" id="send">Send</button></div>`;
  $('#send').onclick = async () => { const r = await doIt({ a: 'type', text: $('#kb').value, enter: true }); toast(r.ok ? 'Sent' : 'Pick a text box on Bladedeck first (A on it).'); if (r.ok) $('#kb').value = ''; };
}

/* -------------------------------------------------------------- Clips */
async function drawClips() {
  view.innerHTML = '<p class="empty">Loading clips…</p>';
  const list = await api('captures').catch(() => []);
  view.innerHTML = `<h2>Clips</h2>${list.map((c) => `<div class="clip"><b>${esc(c.game)}</b><small>${new Date(c.at).toLocaleString()} · ${(c.size / 1048576).toFixed(1)} MB</small>
      <video preload="metadata" controls playsinline src="api/clip?f=${encodeURIComponent(c.file)}&key=${encodeURIComponent(key)}"></video></div>`).join('') || '<p class="empty">No clips yet. While playing: Record, or Save clip for the last moments.</p>'}`;
}

/* -------------------------------------------------------------- Me */
async function drawMe() {
  const p = st?.player || { level: 1, pct: 0, streak: 0 };
  view.innerHTML = `<h2>You</h2><div class="card me"><div class="ring" style="--p:${p.pct}"><span>${p.level}</span></div><div><b style="font-size:20px">${esc(st?.pc || '')}</b><br><small style="color:var(--dim)">Level ${p.level} · ${p.pct}% to the next${p.streak > 1 ? ` · 🔥 ${p.streak}-day streak` : ''}</small></div></div>
    <h2>Sound</h2><div class="card" id="snd"><p class="empty" style="padding:4px">Loading…</p></div>
    ${window.BladedeckApp?.notifyApps ? '<h2>Messages to the PC</h2><div class="card" id="msgs"></div>' : ''}
    <h2>This phone</h2><div class="card" style="display:grid;gap:8px">${window.BladedeckApp ? '<button id="switch" style="width:100%">Switch to another PC</button>' : ''}<button id="forget" style="width:100%">Forget this Bladedeck</button></div>`;
  if ($('#switch')) $('#switch').onclick = () => window.BladedeckApp.home();
  $('#forget').onclick = () => { if (confirm('Unpair this phone?')) { localStorage.removeItem('bd-key'); key = ''; try { window.BladedeckApp?.link?.(''); } catch { /* not the app */ } pairScreen(); } };
  drawMsgs();
  drawSound(await api('sound').catch(() => ({ error: 'No sound controls' })));
}
/* Messages to the PC (Android app only): notifications from the apps ticked here show on the PC
   as a small bubble (Bladedeck's Phone app settings say how). Nothing is sent until one is ticked. */
function drawMsgs() {
  const box = $('#msgs'), A = window.BladedeckApp; if (!box || !A?.notifyApps) return;
  if (!A.notifyAccess()) {
    box.innerHTML = '<p class="small">Show your phone\'s messages on the PC as a small bubble you can read without leaving the game. First let Bladedeck read notifications (Android asks once). Only the apps you tick here are ever sent, and only to this Bladedeck.</p><button id="msgallow" style="width:100%">Allow notification access</button>';
    $('#msgallow').onclick = () => { A.openNotifyAccess(); setTimeout(drawMsgs, 4000); };
    return;
  }
  let apps = []; try { apps = JSON.parse(A.notifyApps()); } catch { apps = []; }
  apps.sort((a, b) => a.name.localeCompare(b.name));
  box.innerHTML = apps.length ? `<p class="small">Tick the apps whose messages should show on the PC.</p>${apps.map((a) => `<label class="row" style="display:flex;gap:10px;align-items:center"><input type="checkbox" data-pkg="${esc(a.pkg)}" ${a.on ? 'checked' : ''}><span>${esc(a.name)}</span></label>`).join('')}`
    : '<p class="small">Apps show up here once they post a notification. Come back after a message arrives.</p>';
  box.onchange = (ev) => { const p = ev.target.dataset.pkg; if (p) A.setNotifyApp(p, ev.target.checked); };
}
function drawSound(s) {
  const box = $('#snd'); if (!box) return;
  if (!s || s.error) { box.innerHTML = `<p class="empty" style="padding:4px">${esc(s?.error === 'nosys' ? 'Sound controls are not available on this PC.' : s?.error || '')}</p>`; return; }
  const out = s.outputs.find((o) => o.on);
  const sl = (kind, id, label, v, m) => `<p class="label">${esc(label)}</p><div class="slider"><button data-mute="${kind}|${esc(id)}|${m ? 0 : 1}">${m ? '🔇' : '🔊'}</button><input type="range" min="0" max="100" value="${v}" data-vol="${kind}|${esc(id)}"><b>${m ? 'Muted' : v + '%'}</b></div>`;
  box.innerHTML = (out ? sl('output', out.name, 'Volume', out.volume, out.mute) : '') + (s.mic ? sl('mic', s.mic.name, 'Microphone', s.mic.volume, s.mic.mute) : '') + s.apps.map((a) => sl('app', a.id, a.label, a.volume, a.mute)).join('')
    + `<p class="label">Play sound on</p><div class="chips">${s.outputs.map((o) => `<button data-out="${esc(o.name)}" class="${o.on ? 'on' : ''}">${esc((o.port || o.label).replace(/ Output$/, ''))}</button>`).join('')}</div>`;
}

/* -------------------------------------------------------------- input */
document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button'); if (!t) return;
  if (t.dataset.tab) { setTab(t.dataset.tab); return; }
  if (t.dataset.tabGo) { setTab(t.dataset.tabGo); return; }
  if (t.dataset.pad && !t.hasAttribute('data-rep')) { doIt({ a: 'pad', key: t.dataset.pad }); return; }
  if (t.dataset.do) { const r = await doIt({ a: t.dataset.do }); if (t.dataset.do === 'clip') toast('Saving the last moments…'); if (t.dataset.do === 'pip') toast('Walkthrough window toggled'); return r; }
  if (t.dataset.run) {
    // Closing takes a second tap: the first one turns ✕ into "Close?" for three seconds.
    if (t.dataset.act === 'close' && !t.classList.contains('sure')) { buzz(); t.classList.add('sure'); t.textContent = 'Close?'; setTimeout(() => { t.classList.remove('sure'); t.textContent = '✕'; }, 3000); return; }
    await doIt({ a: 'run', i: +t.dataset.run, act: t.dataset.act }); return;
  }
  if (t.dataset.game) { gameSheet(t.dataset.game); return; }
  if (t.dataset.f) { libFilter = t.dataset.f; drawLibrary(); return; }
  if (t.dataset.mute) { const [kind, id, m] = t.dataset.mute.split('|'); buzz(); drawSound(await api('sound', { kind: kind === 'output' ? 'output' : kind, id, mute: m === '1' })); return; }
  if (t.dataset.out) { buzz(); drawSound(await api('sound', { kind: 'default', id: t.dataset.out })); }
});
document.addEventListener('change', async (ev) => {
  const v = ev.target.dataset.vol; if (!v) return;
  const [kind, id] = v.split('|');
  drawSound(await api('sound', { kind, id, volume: +ev.target.value }));
});
// The d-pad repeats while held, like a real one.
let repT = 0;
document.addEventListener('pointerdown', (ev) => {
  const t = ev.target.closest('[data-rep]'); if (!t) return;
  const k = t.dataset.pad; doIt({ a: 'pad', key: k });
  clearInterval(repT); const t0 = Date.now();
  repT = setInterval(() => { if (Date.now() - t0 > 380) doIt({ a: 'pad', key: k }); }, 110);
});
for (const e of ['pointerup', 'pointercancel', 'pointerleave']) document.addEventListener(e, () => clearInterval(repT));

/* -------------------------------------------------------------- alarms */
let beepT = 0;
function ring(r) {
  const el = $('#ring');
  el.innerHTML = `<div><b>⏰ ${esc(r.title)}</b><span>${esc(r.text)}</span><button class="primary" id="ring-ok">Stop</button></div>`;
  el.hidden = false;
  try { navigator.vibrate?.([600, 300, 600, 300, 600]); } catch { /* no buzz */ }
  try { window.BladedeckApp?.notify?.(r.title, r.text); } catch { /* not the app */ }
  let ctx = null;
  try { ctx = new AudioContext(); let n = 0; const one = () => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = n++ % 2 ? 988 : 784; g.gain.value = 0.2; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.3); }; one(); clearInterval(beepT); beepT = setInterval(one, 600); } catch { /* no sound */ }
  const stop = () => { clearInterval(beepT); ctx?.close(); el.hidden = true; };
  $('#ring-ok').onclick = stop; setTimeout(stop, 60000);
}

/* -------------------------------------------------------------- Files */
// To the phone: what is in Bladedeck/To phone on the PC. To the PC: lands in Bladedeck/From phone.
const size = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
async function drawFiles() {
  view.innerHTML = '<p class="empty">Loading…</p>';
  let list = []; try { list = await api('files'); } catch { return; }
  view.innerHTML = `<h2>Send to the PC</h2>
    <label class="up"><input type="file" id="up" multiple hidden><span class="primary">Choose files…</span></label>
    <div id="ups"></div>
    <p class="note">They go to the Bladedeck/From phone folder on the PC.</p>
    <h2>From the PC</h2>
    ${list.length ? list.map((f) => `<a class="row file" href="api/file?name=${encodeURIComponent(f.name)}&key=${encodeURIComponent(key)}" download="${esc(f.name)}"><div class="art">📄</div><div><b>${esc(f.name)}</b><span>${size(f.size)}</span></div><i>⬇</i></a>`).join('')
      : '<p class="empty">Nothing yet. On the PC, use Send files (or Send to phone in Files).</p>'}`;
  $('#up').onchange = () => { for (const f of $('#up').files) upload(f); $('#up').value = ''; };
}
function upload(f) {
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = `<div class="art">⬆</div><div><b>${esc(f.name)}</b><span>Sending… 0%</span></div>`;
  $('#ups').prepend(row);
  const x = new XMLHttpRequest();
  x.open('POST', `api/upload?name=${encodeURIComponent(f.name)}`);
  x.setRequestHeader('Authorization', `Bearer ${key}`);
  x.upload.onprogress = (e) => { if (e.lengthComputable) row.querySelector('span').textContent = `Sending… ${Math.round(100 * e.loaded / e.total)}%`; };
  x.onload = () => { let r = {}; try { r = JSON.parse(x.responseText); } catch { /* no body */ } row.querySelector('span').textContent = r.ok ? `Sent ✓ ${size(f.size)}` : (r.error || 'Did not send.'); buzz(); };
  x.onerror = () => { row.querySelector('span').textContent = 'Did not send. Is Bladedeck still on?'; };
  x.send(f);
}

function setTab(t) {
  tab = t;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  ({ now: drawNow, library: drawLibrary, remote: drawRemote, clips: drawClips, files: drawFiles, me: drawMe })[t]();
  view.scrollTop = 0;
}

async function start() {
  $('#tabs').hidden = false;
  try { st = await api('state'); header(); } catch { return; }
  // The Android app sends ticked notifications to this Bladedeck with this phone's key.
  try { window.BladedeckApp?.link?.(key); } catch { /* not the app */ }
  connect(); setTab(tab);
  api('alarms').then((a) => { try { window.BladedeckApp?.schedule?.(JSON.stringify(a)); } catch { /* not the app */ } }).catch(() => {});
}
if (key) start(); else pairScreen();
