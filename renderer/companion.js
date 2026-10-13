'use strict';
/* Companion, the page side: answers the phone app (companion.js in main) and does what it asks.
   It sends a picture of the moment (what is playing and running, your level, recording) whenever
   it changes, and runs the phone's buttons as if they were pressed on a controller here.
   Phone app in System shows the QR code and pairing code, and the phones that are paired.
   Uses S, api, esc, toast, openModal, closeModal, Sound, handle, launch, Resume, Capture, Player,
   walkthrough, OSK, PadNav and $ at call time. */

const Companion = (() => {
  let rows = [];

  async function state() {
    const p = S.playing, e = p && S.lib.entries.find((x) => x.id === p.id);
    const snap = await Resume.snapshot().catch(() => ({ items: [], frozen: new Set(), order: [] }));
    rows = snap.items.filter((it) => it.e || (it.w && (it.w.web || Dock.slotFor(it.w))));
    const pl = S.lib.settings.player || { xp: 0 };
    const lvl = Player.levelOf(pl.xp), a = 60 * (lvl - 1) ** 2, b = 60 * lvl ** 2;
    const cap = await api.captureStatus().catch(() => ({}));
    return {
      pc: S.lib.settings.playerName || 'Bladedeck', accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      playing: e ? { id: e.id, title: e.title, mins: Math.round((Date.now() - p.t) / 60000), goal: e.goal || '', art: !!e.cover, reward: Player.nextReward(Math.round((Date.now() - p.t) / 60000)), keys: Capture.saveKeys(e) } : null,
      running: rows.map((it, i) => ({ i, title: it.title, game: !!it.e, id: it.e?.id || '', art: !!it.e?.cover, paused: !!(it.pid && snap.frozen.has(it.pid)), min: !!it.w?.min, canPause: !!(it.pid && !(it.w && it.w.web)) })),
      player: { level: lvl, pct: Math.round(100 * (pl.xp - a) / (b - a)), streak: Player.streak() },
      capture: { recording: !!cap.recording, replay: cap.mode === 'replay', available: !!cap.available },
      sel: S.sel && !S.sel.run ? { id: S.sel.id, title: S.sel.title } : null,
      busy: { modal: S.modal, osk: OSK.isOpen() }
    };
  }

  // Typing from the phone: into Bladedeck's on-screen keyboard's box, or the highlighted text box.
  function type(text, enter) {
    const el = (OSK.isOpen() && document.querySelector('#osk') && OSK.target?.()) || document.querySelector('.pad-hl') || document.activeElement;
    if (!el || !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return false;
    el.value = text; el.dispatchEvent(new Event('input', { bubbles: true }));
    if (enter) { OSK.close(); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
    return true;
  }

  async function run(b) {
    const a = b.a;
    if (a === 'pad') { if (['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'start', 'back', 'guide', 'vol', 'resume', 'music'].includes(b.key)) { S.pad = true; handle(b.key); } return { ok: true }; }
    if (a === 'launch') { const e = S.lib.entries.find((x) => x.id === b.id); if (!e) return { ok: false }; S.sel = e; launch(e); return { ok: true }; }
    if (a === 'peek') { api.peekToggle(); return { ok: true }; }
    if (a === 'rec') { await Capture.toggleRecord(); return { ok: true }; }
    if (a === 'clip') { await Capture.saveReplay(); return { ok: true }; }
    if (a === 'pip') { await walkthrough(b.q); return { ok: true }; }
    if (a === 'type') return { ok: type(String(b.text || ''), !!b.enter) };
    if (a === 'run') {
      const it = rows[+b.i]; if (!it) return { ok: false };
      if (b.act === 'go') await Resume.switchTo(it); else if (b.act === 'pause') await Resume.freeze(it); else if (b.act === 'close') await Resume.closeApp(it);
      push(); return { ok: true };
    }
    if (a === 'checkin') { const e = S.lib.entries.find((x) => x.id === b.id); if (e) { e.goal = String(b.goal || '').slice(0, 120); save(); updateDetail(); } return { ok: true }; }
    return { ok: false };
  }

  window.bladedeck.onCompanionCmd(async ({ id, cmd, args }) => {
    let value = null;
    try {
      if (cmd === 'state') value = await state();
      else if (cmd === 'do') value = await run(args || {});
      else if (cmd === 'captures') value = (await api.captureList()).slice(0, 60);
    } catch (err) { value = { ok: false, error: String(err.message || err) }; }
    api.companionReply(id, value);
  });
  window.bladedeck.onCompanionPaired(({ name }) => { toast(`${name} is paired. It can control Bladedeck now.`, 'fun'); Sound.play('secret'); if (S.modal && $('.ph')) closeModal(); });

  // Send the moment to phones that are listening, whenever it changes.
  let busy = false;
  async function push() { if (busy) return; busy = true; try { api.companionState(await state()); } catch { /* not ready */ } finally { busy = false; } }
  setInterval(() => { if (!document.hidden || S.playing) push(); }, 2000);

  /* -------------------------------------------------------------- the Phone app screen */
  async function open() {
    let info = await api.companionInfo();
    if (!info.enabled) { await api.companionEnable(true); info = await api.companionInfo(); }
    const pair = await api.companionCode();
    const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
    openModal({
      title: 'Phone app', wide: true,
      html: `<div class="ph">
        <div class="ph-pair"><div class="ph-qr">${pair.qr}</div>
          <div class="ph-how"><b>Pair your phone</b>
            <ol><li>Connect the phone to the same Wi-Fi (or Tailscale).</li><li>Scan the code with the phone's camera, or open <code>${esc(pair.urls[0]?.url || '')}</code> in its browser.</li><li>Enter this code:</li></ol>
            <div class="ph-code">${pair.code.slice(0, 3)} ${pair.code.slice(3)}</div><small>Works for 10 minutes. Then open this again for a new one.</small>
            ${pair.urls.length > 1 ? `<p class="note">Other addresses: ${pair.urls.slice(1).map((u) => `<code>${esc(u.url)}</code> (${esc(u.kind)})`).join(', ')}</p>` : ''}</div></div>
        <div class="side-h">Paired phones</div>
        ${info.devices.length ? info.devices.map((d) => `<div class="ph-dev"><b>${esc(d.name)}</b><span>paired ${ago(d.added)} · last seen ${ago(d.seen)}</span><button type="button" data-forget="${esc(d.id)}">Remove</button></div>`).join('') : '<p class="note">None yet.</p>'}
        <div class="checks"><label><input type="checkbox" class="ph-on" ${info.enabled ? 'checked' : ''}> Let paired phones connect</label></div>
        <p class="note">The phone app shows what is playing and running, your library to start games from, a remote with a keyboard, recording and clips, the sound card and your profile. On Android, the Bladedeck app (if installed) does the same in its own window.</p></div>`,
      buttons: [{ label: 'Close', primary: true }],
      onOpen: (root) => {
        root.addEventListener('click', async (ev) => {
          const f = ev.target.closest('[data-forget]');
          if (f) { await api.companionForget(f.dataset.forget); f.closest('.ph-dev').remove(); toast('That phone can no longer connect.'); }
        });
        root.addEventListener('change', async (ev) => { if (ev.target.classList.contains('ph-on')) { await api.companionEnable(ev.target.checked); toast(ev.target.checked ? 'Paired phones can connect.' : 'Phones are switched off.'); } });
      }
    });
  }

  return { open, state, push };
})();
