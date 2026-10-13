'use strict';
/* Capture: game recording and clips, from anywhere, even inside a game.
     Record or stop          View + X      Ctrl+Alt+R
     Save the last moments   View + RB     Ctrl+Alt+S   (the replay: 30 seconds by default)
   While a game runs the replay quietly keeps the last moments ready, so a great moment can be
   saved after it happened. Clips go to Videos/Bladedeck/<game>, show in Captures, play behind the
   game in the menu, and count for the game's "Roll camera" task.
   On Linux GPU Screen Recorder does the work on the graphics card (capture.js in main). Without it
   (Windows, or not installed) Bladedeck records with its own encoder, without the replay.
   Also: the save and load keys of the emulator a game runs in (save states).
   Uses S, api, esc, save, toast, openModal, closeModal, Sound, Tasks, Showcase, fileUrl and $ at call time. */

// Save-state keys in each emulator's default setup.
const SAVE_KEYS = [
  [/retroarch/i, 'F2', 'F4', 'F6 / F7 change slot'],
  [/pcsx2/i, 'F1', 'F3', 'F2 changes slot'],
  [/dolphin/i, 'Shift+F1', 'F1', 'Shift/F2–F8 for other slots'],
  [/ppsspp/i, 'F2', 'F4', 'F3 changes slot'],
  [/mgba/i, 'Shift+F1', 'F1', 'Shift/F2–F9 for other slots'],
  [/snes9x/i, 'Shift+F1', 'F1', 'Shift/F2–F9 for other slots'],
  [/melonds/i, 'Shift+F1', 'F1', 'Shift/F2–F8 for other slots'],
  [/duckstation/i, '', '', 'set under Settings, Hotkeys'],
  [/rpcs3|cemu|xemu|azahar|ryujinx|flycast|mupen|rmg/i, '', '', 'save inside the game; this emulator has no reliable save states']
];
function saveKeys(e) {
  if (!e || e.type !== 'rom') return null;
  const em = S.lib.emulators.find((x) => x.id === e.emulatorId);
  const row = em && SAVE_KEYS.find(([re]) => re.test(`${em.name} ${em.exe}`));
  return row ? { emulator: em.name, save: row[1], load: row[2], more: row[3] } : null;
}

const Capture = (() => {
  const cfg = () => ({ replay: 30, mic: false, fps: 60, ...(S.lib.settings.capture || {}) });
  let st = { available: false, running: false, mode: null, recording: false }, page = null;

  async function refresh() { st = await api.captureStatus(); badge(); return st; }
  function badge() {
    const r = document.getElementById('rec'); if (!r) return;
    const on = st.recording || !!page;
    r.hidden = !on && !(st.running && st.mode === 'replay');
    r.textContent = on ? 'REC' : 'REPLAY';
    r.classList.toggle('replay', !on);
  }
  window.bladedeck.onCaptureStatus((s) => { st = s; badge(); });

  const playing = () => (S.playing && S.lib.entries.find((x) => x.id === S.playing.id)) || null;
  function tellGame() { const e = playing(); api.captureGame(e ? { title: e.title, id: e.id } : {}); }

  // A game started: keep the replay ready while it runs.
  async function sessionStarted() {
    tellGame();
    await refresh();
    if (st.available && cfg().replay > 0 && !(st.running && st.mode === 'replay')) { await api.captureReplay({ replay: cfg().replay, mic: cfg().mic, fps: cfg().fps }); refresh(); }
  }
  // Nothing running any more: stop the replay a minute later (unless recording).
  let idleT = 0;
  function sessionsChanged() {
    clearTimeout(idleT);
    if ((S.sessions || []).length) return;
    idleT = setTimeout(async () => { await refresh(); if (!(S.sessions || []).length && st.mode === 'replay' && !st.recording) { await api.captureStop(); refresh(); } }, 60000);
  }

  async function toggleRecord() {
    tellGame();
    await refresh();
    if (!st.available) { pageRecord(); return; }
    const r = await api.captureRecord({ replay: cfg().replay, mic: cfg().mic, fps: cfg().fps });
    st = r; badge();
    Sound.play(r.recording ? 'go' : 'back');
    note(r.recording ? 'Recording. View + X or Ctrl+Alt+R stops it.' : 'Recording stopped; saving it…');
  }

  async function saveReplay() {
    tellGame();
    await refresh();
    if (!st.available) { note('Saving the last moments needs GPU Screen Recorder. Install it in Settings, Recording.', true); return; }
    if (!(st.running && st.mode === 'replay')) {
      if (cfg().replay > 0) { await api.captureReplay({ replay: cfg().replay, mic: cfg().mic, fps: cfg().fps }); note('The replay was not running; it is now, so the next moment can be saved.'); }
      else note('The replay is off. Turn it on in Settings, Recording.', true);
      refresh(); return;
    }
    await api.captureSave();
    Sound.play('pop');
    note(`Saving the last ${cfg().replay} seconds…`);
  }

  // Toasts are hidden behind a game; when Bladedeck is not in front, the saved-file
  // notification from the system is what the player sees.
  function note(text, err) { toast(text, err ? 'err' : 'ok'); }

  // A finished clip: attach it to its game.
  window.bladedeck.onCaptureSaved((d) => {
    const e = S.lib.entries.find((x) => x.id === d.id);
    if (e) {
      (e.media = e.media || []).push({ path: d.file, kind: 'video', rec: true, secs: d.secs || cfg().replay, tag: d.kind === 'replay' ? 'replay' : '', at: Date.now() });
      save(); Tasks.sync(e); if (S.sel === e) Showcase.show(e, true);
    }
    Sound.play('fixed');
    toast(d.kind === 'replay' ? `Clip saved${e ? ` for ${e.title}` : ''}.` : `Recording saved${e ? ` for ${e.title}` : ''}.`, 'fun');
  });

  /* -------------------------------------------------------------- Bladedeck's own recorder */
  async function pageRecord() {
    if (page) { page.rec.stop(); return; }
    await api.captureWant('', ['screen'], true, true);
    let stream;
    try { stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: { frameRate: { max: 60 }, width: { max: 1920 }, height: { max: 1080 } } }); }
    catch { toast('Recording was cancelled.', 'err'); return; }
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    const chunks = [], e = playing(), t0 = Date.now();
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
    page = { rec, e };
    rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const buf = await new Blob(chunks, { type: mime }).arrayBuffer();
      const secs = Math.round((Date.now() - t0) / 1000);
      const file = await api.captureWrite({ name: `${e ? e.title : 'Desktop'} recording ${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.webm`, data: buf, title: e?.title });
      page = null; badge();
      if (e && file) { (e.media = e.media || []).push({ path: file, kind: 'video', rec: true, secs, at: Date.now() }); save(); Tasks.sync(e); }
      toast(`Recording saved${e ? ` for ${e.title}` : ''}.`, 'fun'); Sound.play('fixed');
    };
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (rec.state !== 'inactive') rec.stop(); });
    rec.start(2000); badge();
    // Long recordings in memory get heavy; stop at 30 minutes.
    setTimeout(() => { if (page?.rec === rec && rec.state !== 'inactive') rec.stop(); }, 30 * 60000);
    Sound.play('go');
  }

  // The "Roll camera" task: record the first few minutes of the next session.
  async function recordFor(e, secs) {
    await refresh();
    if (!st.available) { Recorder.start(e); return; }
    if (!st.recording) await toggleRecord();
    setTimeout(async () => { await refresh(); if (st.recording) toggleRecord(); }, secs * 1000);
  }

  /* -------------------------------------------------------------- gallery */
  async function gallery(onlyGame) {
    const all = await api.captureList();
    const list = onlyGame ? all.filter((c) => c.game === onlyGame) : all;
    const mb = (n) => `${(n / 1048576).toFixed(n > 1e8 ? 0 : 1)} MB`;
    const playable = (c) => c.ext === 'webm';
    let i = 0;
    const draw = (root) => {
      const c = list[i];
      $('.cg', root).innerHTML = list.length ? `
        <div class="cg-view">${c ? (playable(c) ? `<video src="${fileUrl(c.file)}" controls autoplay muted></video>` : `<div class="cg-ext"><p>This clip is H.264 MP4, which plays in your video player.</p><button type="button" data-x="open">Play it</button></div>`) : ''}</div>
        <p class="cg-cap"><b>${esc(c.game)}</b> · ${new Date(c.at).toLocaleString()} · ${mb(c.size)}</p>
        <div class="cg-row">${list.map((x, j) => `<button type="button" class="cg-th ${j === i ? 'on' : ''}" data-j="${j}"><span>${esc(x.game)}</span><small>${new Date(x.at).toLocaleDateString()} ${new Date(x.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></button>`).join('')}</div>`
        : `<p class="note">No clips yet. While playing, View + X (or Ctrl+Alt+R) records, and View + RB (or Ctrl+Alt+S) saves the last ${cfg().replay || 30} seconds.</p>`;
    };
    openModal({
      title: onlyGame ? `Captures: ${onlyGame}` : 'Captures', wide: true, html: '<div class="cg"></div>',
      buttons: [{ label: 'Delete this clip', danger: true, left: true, onClick: async (root) => { const c = list[i]; if (!c) return false; if (await api.captureDelete(c.file)) { list.splice(i, 1); i = Math.min(i, list.length - 1); draw(root); toast('Clip deleted.'); } return false; } },
        { label: 'Open folder', onClick: () => { api.captureOpen(''); return false; } },
        { label: 'Close', primary: true }],
      onOpen: (root) => {
        draw(root);
        root.addEventListener('click', (ev) => {
          const t = ev.target.closest('[data-j]'); if (t) { i = +t.dataset.j; draw(root); return; }
          if (ev.target.closest('[data-x=open]')) api.captureOpen(list[i].file);
        });
      }
    });
  }

  /* -------------------------------------------------------------- settings */
  function settingsHtml() {
    const c = cfg(), o = (v, n, cur) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${n}</option>`;
    return `<p class="note cap-status">Checking the recorder…</p>
      <div class="row2"><label>Keep the last moments ready to save (replay)<select name="capReplay">${o(0, 'Off', c.replay)}${o(15, '15 seconds', c.replay)}${o(30, '30 seconds', c.replay)}${o(60, '1 minute', c.replay)}${o(120, '2 minutes', c.replay)}${o(300, '5 minutes', c.replay)}</select></label>
        <label>Frames per second<select name="capFps">${o(30, '30', c.fps)}${o(60, '60', c.fps)}</select></label></div>
      <div class="checks"><label><input type="checkbox" name="capMic" ${c.mic ? 'checked' : ''}> Record my microphone too</label></div>
      <div class="cap-btns" style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-x="capgallery">Captures</button><button type="button" data-x="capsetup">Set up screen recording now</button></div>
      <p class="note">While playing: View + X or Ctrl+Alt+R records and stops; View + RB or Ctrl+Alt+S saves the last moments. Clips go to Videos/Bladedeck.</p>`;
  }
  async function settingsOpen(root) {
    await refresh();
    const el = $('.cap-status', root);
    if (st.available) el.innerHTML = 'GPU Screen Recorder is installed: recording uses the graphics card, so games keep their speed.';
    else if (navigator.userAgent.includes('Windows')) el.innerHTML = 'On Windows Bladedeck records with its own encoder (no replay). Xbox Game Bar (Win+Alt+R) also records.';
    else el.innerHTML = 'Install GPU Screen Recorder for smooth recording and the replay (it records on the graphics card). <button type="button" data-x="capinstall">Install it</button>';
    root.addEventListener('click', async (ev) => {
      const x = ev.target.closest('[data-x]')?.dataset.x;
      if (x === 'capinstall') { el.textContent = 'Installing GPU Screen Recorder…'; const r = await api.emuInstall('com.dec05eba.gpu_screen_recorder'); el.textContent = r.ok ? 'Installed. Recording and the replay are ready.' : `It did not install: ${r.error}`; refresh(); }
      if (x === 'capgallery') { closeModal(); gallery(); }
      if (x === 'capsetup') {
        await refresh();
        if (!st.available) { toast('Install GPU Screen Recorder first.', 'err'); return; }
        // Starting the replay once here lets the system ask which screen, while you are in Bladedeck.
        await api.captureReplay({ replay: cfg().replay || 30, mic: cfg().mic, fps: cfg().fps });
        toast('Pick your screen in the box that appears; Bladedeck remembers it.');
        setTimeout(async () => { if (!(S.sessions || []).length) { await api.captureStop(); refresh(); } }, 20000);
      }
    });
  }
  function readSettings(root) {
    S.lib.settings.capture = { replay: +$('[name=capReplay]', root).value, fps: +$('[name=capFps]', root).value, mic: $('[name=capMic]', root).checked };
  }

  // Shortcuts that work inside games arrive from KWin, the global shortcuts, or the Windows pad helper.
  window.bladedeck.onPeek((ev) => { if (ev.kind === 'rec') toggleRecord(); if (ev.kind === 'clip') saveReplay(); });

  return { refresh, sessionStarted, sessionsChanged, toggleRecord, saveReplay, recordFor, gallery, settingsHtml, settingsOpen, readSettings, saveKeys };
})();
