'use strict';
/* ROM sync (romsync.js in main): your own PCs share their ROMs. Pair once (the other PC says yes
   on its screen), then Sync now, or let it keep them in sync by itself every hour while both are
   on. It never fills the main drive: it uses another drive when that one is low, and says so.
   Synced games land in watched folders and join the library with the right emulator.
   Uses S, api, esc, toast, openModal, closeModal, Sound, Nearby, Watch and $ at call time. */
const RomSync = (() => {
  const size = (n) => (n >= 2 ** 30 ? `${(n / 2 ** 30).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 2 ** 20))} MB`);
  const ago = (t) => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(); };
  let live = '';

  async function body() {
    const st = await api.romsyncState();
    const paired = new Set(st.partners.map((p) => p.id));
    const others = Nearby.peers().filter((p) => !paired.has(p.id));
    const partners = st.partners.map((p) => `<div class="rs-p"><div><b>🔄 ${esc(p.name)}</b><small>${esc(p.pc || '')} · ${p.here ? 'around now' : 'not around'} · last synced ${ago(p.last)}</small></div>
      <div class="rs-b"><button type="button" data-rs="sync" data-id="${esc(p.id)}" ${p.here && !st.busy ? '' : 'disabled'}>Sync now</button>
      <label><input type="checkbox" data-rs="auto" data-id="${esc(p.id)}" ${p.auto ? 'checked' : ''}> By itself</label>
      <button type="button" data-rs="forget" data-id="${esc(p.id)}">Stop syncing</button></div></div>`).join('');
    const pairs = others.map((p) => `<div class="rs-p"><div><b>${esc(p.name)}</b><small>${esc(p.pc || '')} · on this network</small></div><div class="rs-b"><button type="button" data-rs="pair" data-id="${esc(p.id)}">Pair to sync ROMs</button></div></div>`).join('');
    const drives = st.drives.map((d) => `<tr><td>${d.home ? '🏠 ' : '💽 '}${esc(d.mount)}</td><td>${size(d.free)} free</td><td>keeps ${size(d.keep)}</td><td>${d.spare ? `<b>can take ${size(d.spare)}</b>` : '<span class="warn">full enough</span>'}</td></tr>`).join('');
    return `<p class="note">Your PCs share the ROMs each one is missing, straight over your home network. ${st.mine} ROM${st.mine === 1 ? '' : 's'} here can be shared. Games that are a folder (Xbox 360, PS3, PS4) are not synced yet.</p>
      <div class="side-h">Your PCs</div>${partners || '<p class="note">None paired yet.</p>'}
      ${pairs ? `<div class="side-h">Pair with</div>${pairs}` : st.partners.length ? '' : '<p class="note">Open Bladedeck on your other PC. It shows up here when Nearby sees it (both on the same Wi-Fi, "Show me to other Bladedecks" on).</p>'}
      <div class="side-h">Where synced ROMs go</div><table class="rs-d">${drives}</table>
      <p class="note">The main drive (🏠) is used first, but always keeps 20 GB or a tenth of it free. When it cannot take more, a drive with room is used (its "Bladedeck ROMs" folder). If none can, the sync skips what does not fit and tells you.</p>
      <p class="rs-live">${esc(live)}</p>`;
  }
  async function open() {
    openModal({ title: 'ROM sync', wide: true, html: '<div class="rs"><p class="note">…</p></div>', buttons: [{ label: 'Close', primary: true }],
      onOpen: async (root) => {
        const box = $('.rs', root), redraw = async () => { if (box.isConnected) box.innerHTML = await body(); };
        await redraw();
        root.addEventListener('change', async (ev) => { const c = ev.target.closest('[data-rs=auto]'); if (c) { await api.romsyncSet(c.dataset.id, { auto: c.checked }); toast(c.checked ? 'It keeps in sync by itself while both PCs are on.' : 'Only when you press Sync now.'); } });
        root.addEventListener('click', async (ev) => {
          const b = ev.target.closest('button[data-rs]'); if (!b) return;
          const a = b.dataset.rs, id = b.dataset.id;
          if (a === 'pair') { const r = await api.romsyncPair(id); toast(r?.ok ? 'Asked. Say yes on the other PC.' : (r?.error || 'Could not ask.'), r?.ok ? 'ok' : 'err'); return; }
          if (a === 'sync') { b.disabled = true; const r = await api.romsyncSync(id); if (r && !r.ok) toast(r.error, 'err'); redraw(); return; }
          if (a === 'forget' && await confirmAsk({ title: 'Stop syncing?', text: 'The ROMs already copied stay. This PC stops sharing with that one.', yes: 'Stop syncing' })) { await api.romsyncSet(id, { forget: true }); redraw(); }
        });
        RomSync.redraw = redraw;
      } });
  }

  // Synced folders are watched, so their games join the library.
  function watch(folder) {
    const w = (S.lib.settings.watch ||= { on: true, dirs: [] });
    if (!w.dirs.some((d) => folder === d || folder.startsWith(d + '/') || folder.startsWith(d + '\\'))) { w.dirs.push(folder); w.on = true; save(); Watch.apply?.(); }
  }
  window.bladedeck.onRomsync?.((ev) => {
    if (ev.kind === 'ask') {
      Sound.play('secret');
      const ask = () => openModal({ title: `${ev.name} wants to sync ROMs`, html: `<p>Share ROMs between this PC and <b>${esc(ev.name)}</b>${ev.pc ? ` (${esc(ev.pc)})` : ''}?</p><p class="note">Only say yes for your own PCs. Each copies the ROMs it is missing from the other, keeping room on its drives. You can stop it any time in ROM sync.</p>`,
        buttons: [{ label: 'No', onClick: () => { api.romsyncAnswer(ev.peer, false); } }, { label: 'Yes, sync', primary: true, onClick: async () => { await api.romsyncAnswer(ev.peer, true); toast(`Paired with ${ev.name}. Press Sync now in ROM sync, or wait: it syncs by itself.`, 'fun'); } }] });
      if (S.modal) { toast(`${ev.name} wants to sync ROMs. Close this to answer.`); const t = setInterval(() => { if (!S.modal) { clearInterval(t); ask(); } }, 500); } else ask();
      return;
    }
    if (ev.kind === 'paired') { toast(`${ev.name} said yes: your ROMs sync with it now.`, 'fun'); RomSync.redraw?.(); return; }
    if (ev.kind === 'declined') { toast(`${ev.name} said no to syncing ROMs.`); return; }
    if (ev.kind === 'plan') { live = ev.count ? `Copying ${ev.count} ROM${ev.count === 1 ? '' : 's'} (${size(ev.bytes)}) from ${ev.name}…` : `Nothing new on ${ev.name}.`; }
    if (ev.kind === 'progress') live = `${ev.pct}% · ${ev.title}`;
    if (ev.kind === 'got') watch(ev.folder);
    if (ev.kind === 'failed') { live = ''; toast(`ROM sync with ${ev.name} stopped: ${ev.error}`, 'err'); }
    if (ev.kind === 'done') {
      live = '';
      if (ev.got) { Watch.catchUp?.(); toast(`Got ${ev.got} ROM${ev.got === 1 ? '' : 's'} (${size(ev.gotBytes)}) from ${ev.name}.`, 'fun'); }
      if (ev.note) toast(ev.note, 'err');
      RomSync.redraw?.();
    }
    const l = document.querySelector('.rs-live'); if (l) l.textContent = live;
  });
  return { open, redraw: null };
})();
