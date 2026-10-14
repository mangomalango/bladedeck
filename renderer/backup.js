'use strict';
/* Backup and restore (backup.js in main): every choice, place and setting you made, saved by
   itself every day and while you change things, and whenever you ask. Pick one to go back to it;
   Export makes one file to keep elsewhere or take to another PC. Uses api, esc, toast,
   openModal, closeModal, confirmAsk and $ at call time. */
const Backup = (() => {
  const when = (t) => new Date(t).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  async function open() {
    const l = await api.backupList().catch(() => []);
    openModal({ title: 'Backup and restore', wide: true,
      html: `<p class="note">Bladedeck backs up everything you set (games, emulators, sources, the dock, blades, places, controllers, looks) every day you use it and every half hour while you change things. They are in your Bladedeck folder, under Backups, so they survive a reinstall. Website sign-ins are not included.</p>
        <div class="pl-acts"><button type="button" class="primary" data-bk="make">Back up now</button><button type="button" data-bk="export">Export to a file…</button><button type="button" data-bk="import">Import a file…</button><button type="button" data-bk="folder">Open the folder</button></div>
        <h4 class="set-sub">Backups</h4>
        ${l.length ? l.map((b) => `<div class="src-row" data-id="${esc(b.id)}"><i>${b.auto ? '🕒' : '💾'}</i><div class="src-t"><b>${esc(b.note || (b.auto ? 'Automatic' : 'Backup'))} · ${esc(when(b.at))}</b><small>${b.games} games · ${b.emulators} emulators · ${b.sources} sources</small></div><button type="button" data-bk="restore">Go back to this</button></div>`).join('') : '<p class="note">None yet. The first one is made a few seconds after Bladedeck starts.</p>'}`,
      buttons: [{ label: 'Done', primary: true }],
      onOpen: (root) => root.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-bk]'); if (!b) return;
        const a = b.dataset.bk;
        if (a === 'make') { const r = await api.backupMake('Saved by you'); toast(r.ok ? 'Backed up.' : r.error, r.ok ? 'fun' : 'err'); open(); return; }
        if (a === 'folder') { api.backupFolder(); return; }
        if (a === 'export') { const r = await api.backupExport(); if (r.ok && r.data) toast(`Exported to ${r.data}.`, 'fun'); else if (!r.ok) toast(r.error, 'err'); return; }
        const id = b.closest('[data-id]')?.dataset.id;
        if (!(await confirmAsk({ title: a === 'import' ? 'Import a backup?' : 'Go back to this backup?', text: 'Everything you set now is replaced by what the backup has (what you have now is backed up first, so you can come back). Bladedeck restarts.', yes: a === 'import' ? 'Pick the file' : 'Restore and restart' }))) { open(); return; }
        const r = a === 'import' ? await api.backupImport() : await api.backupRestore(id);
        if (r.ok && r.data) toast('Restoring. Bladedeck restarts in a moment.', 'fun'); else if (!r.ok) toast(r.error, 'err'); else open();
      }) });
  }
  return { open };
})();
