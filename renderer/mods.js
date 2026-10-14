'use strict';
/* Cheats and mods for emulated games. Each emulator looks in its own folders (cheats, patches,
   texture packs, mod folders); this shows the ones for the game's emulator, opens them in the
   Files panel, and copies a file in: from Bladedeck's own Mods folder with one press (works from the
   controller), or any file with the picker. A notes box keeps codes or reminders per game.
   Open it with Start on an emulated game (Tasks), or Cheats & mods in PC mode.
   Uses S, api, esc, save, toast, openModal, closeModal, Panels and $ at call time. */
const Mods = (() => {
  async function open(e) {
    if (!e || e.type !== 'rom') return;
    const em = S.lib.emulators.find((x) => x.id === e.emulatorId);
    if (!em) { toast('This game has no emulator set.', 'err'); return; }
    const dirs = await api.modDirs({ name: em.name, exe: em.exe, rom: e.rom });
    // Ready-to-copy files come from Bladedeck's own Mods folder; anything else goes through the picker.
    const inbox = (await api.fsRoot()).mods;
    const dl = await api.fsList(inbox);
    const recent = (dl.items || []).sort((a, b) => b.at - a.at).slice(0, 8);
    let target = dirs.findIndex((d) => d.exists && d.path);
    if (target < 0) target = dirs.findIndex((d) => d.creatable);
    const html = () => `<div class="md">
      <p class="note">${esc(em.name)} reads cheats and mods from the folders below. Put files there, then turn them on in the emulator (most have a Cheats or Patches menu per game).</p>
      ${dirs.length ? dirs.map((d, i) => `<div class="md-dir ${i === target ? 'on' : ''}"><div><b>${esc(d.label)}</b><small>${esc(d.path || 'Inside the emulator')}${d.path && !d.exists ? ' · not created yet' : ''}</small></div>
          ${d.path ? `<button type="button" data-md="pick" data-i="${i}">${i === target ? '✓ Chosen' : 'Choose'}</button>${d.exists ? `<button type="button" data-md="open" data-i="${i}">Open in Files</button>` : d.creatable ? `<button type="button" data-md="mk" data-i="${i}">Create</button>` : ''}` : ''}</div>`).join('')
        : '<p class="note">Bladedeck does not know where this emulator keeps cheats. Look in its own settings.</p>'}
      ${dirs.some((d) => d.path) ? `<div class="side-h">Copy into the chosen folder</div>
        <div class="md-recent">${recent.map((f, i) => `<button type="button" data-md="copy" data-f="${i}"><b>${esc(f.name)}</b><small>${f.dir ? 'Folder' : `${Math.max(1, Math.round(f.size / 1024))} KB`} · Bladedeck/Mods</small></button>`).join('') || `<p class="note">Put downloaded mods and cheats in ${esc(inbox)} and they show up here.</p>`}
        <button type="button" data-md="file">Another file…</button></div>` : ''}
      ${(() => { const t = Roms.textureLinks(e, em); return `<div class="side-h">HD texture packs</div><p class="note">${esc(t.note)}</p>${t.links.length ? `<div class="md-recent">${t.links.map(([l, u]) => `<button type="button" data-md="site" data-u="${esc(u)}">${esc(l)}</button>`).join('')}</div>` : ''}`; })()}
      <label>Notes for this game (codes, which mods are on)<textarea name="mdNotes" rows="3">${esc(e.modNotes || '')}</textarea></label></div>`;
    openModal({
      title: `Cheats & mods: ${e.title}`, wide: true, html: html(),
      buttons: [{ label: 'Done', primary: true, onClick: (root) => { e.modNotes = $('[name=mdNotes]', root).value; save(); } }],
      onOpen: (root) => root.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-md]'); if (!b) return;
        const a = b.dataset.md, d = dirs[+b.dataset.i];
        if (a === 'site') { e.modNotes = $('[name=mdNotes]', root).value; save(); closeModal(); Panels.show({ kind: 'browser', key: 'browser', title: 'Browser', icon: '🌐', url: b.dataset.u }); return; }
        if (a === 'pick') { target = +b.dataset.i; $('.dlg-body', root).innerHTML = html(); }
        else if (a === 'open') { e.modNotes = $('[name=mdNotes]', root).value; save(); closeModal(); Panels.show({ kind: 'files', key: 'files', title: 'Files', icon: '🗂', path: d.path }); }
        else if (a === 'mk') { if (await api.modMkdir(d.path)) { d.exists = true; target = +b.dataset.i; toast('Folder created.'); $('.dlg-body', root).innerHTML = html(); } }
        else if (a === 'copy' || a === 'file') {
          const dst = dirs[target]; if (!dst?.path) { toast('Choose a folder first.', 'err'); return; }
          const src = a === 'copy' ? recent[+b.dataset.f]?.path : await api.pick({ kind: 'file' });
          if (!src) return;
          const r = await api.modAdd(dst.path, src);
          toast(r.ok ? `Copied into ${dst.label}. Turn it on in ${em.name}.` : r.error, r.ok ? 'fun' : 'err');
          if (r.ok) { dst.exists = true; $('.dlg-body', root).innerHTML = html(); }
        }
      })
    });
  }
  return { open };
})();
