'use strict';
/* Minecraft: Prism Launcher, your instances (each playable from the library, with controller
   support a press away), Modrinth modpacks, and the CurseForge app. See minecraft.js in main.
   Uses S, api, esc, save, toast, Sound, openModal, closeModal, launch, uid, Panels, PadNav and $
   at call time. */
const Minecraft = (() => {
  const FLAT = 'org.prismlauncher.PrismLauncher';
  let busy = null;
  const inLib = (i) => S.lib.entries.find((e) => e.mcInstance === i.id);
  const entryFor = (i) => inLib(i) || { id: `mc:${i.id}`, type: 'exe', title: `Minecraft: ${i.name}`, exe: i.exe, args: i.args, system: 'Minecraft', mcInstance: i.id, added: Date.now(), playtime: 0 };

  async function open() {
    const [stt, list] = await Promise.all([api.mcStatus(), api.mcInstances().catch(() => [])]);
    const lo = (i) => `${i.mc || '?'}${i.loader ? ` · ${i.loader[0].toUpperCase()}${i.loader.slice(1)}` : ' · no mod loader'}${i.mods ? ` · ${i.mods} mods` : ''}`;
    const html = `<div class="mc">
      ${stt.prism ? `<div class="mc-top"><p class="note">Prism Launcher plays every Minecraft: Java Edition version. Sign in with your Microsoft account in it once.</p>
          <div class="pl-acts"><button type="button" data-mc="prism">Open Prism Launcher</button><button type="button" data-mc="folder">Instances folder</button></div></div>
        <h4 class="set-sub">Your instances</h4>
        ${list.length ? list.map((i) => `<div class="src-row" data-inst="${esc(i.id)}"><i>⛏</i><div class="src-t"><b>${esc(i.name)}</b><small>${esc(lo(i))}${i.controller ? ' · 🎮 controller support' : ''}</small></div>
            <button type="button" class="primary" data-mc="play">Play</button>${inLib(i) ? '<button type="button" disabled>✓ In library</button>' : '<button type="button" data-mc="add">Add to library</button>'}${i.controller ? '' : '<button type="button" data-mc="pad">🎮 Controller support</button>'}</div>`).join('')
          : '<p class="note">No instances yet. Open Prism Launcher and press Add Instance (any version, or a modpack), or pick a modpack below.</p>'}
        ${list.length ? `<div class="pl-acts"><button type="button" data-mc="addall">Add all to the library</button></div>` : ''}`
        : `<div class="src-row sug"><i>⛏</i><div class="src-t"><b>Prism Launcher</b><small>The way Bladedeck plays Minecraft: Java Edition. Every version, mods and modpacks, your Microsoft account. Free and open source.</small></div>
          <button type="button" class="primary" data-mc="install" ${stt.linux ? '' : 'disabled'}>${busy != null ? `Installing… ${busy}%` : 'Install'}</button></div>
          ${stt.linux ? '' : '<p class="note">On Windows, get it from prismlauncher.org, then come back here.</p>'}`}
      <h4 class="set-sub">Controller support</h4>
      <p class="note">Java Minecraft has no controller support of its own. "Controller support" adds the Controlify mod (and the mods it needs) to an instance with Fabric, Quilt or NeoForge: then every button, rumble and the on-screen keyboard work.</p>
      <h4 class="set-sub">Modpacks</h4>
      <div class="pl-acts"><button type="button" data-mc="packs">Browse modpacks (Modrinth)</button></div>
      <h4 class="set-sub">CurseForge</h4>
      <p class="note">CurseForge modpacks are in Prism too: Add Instance, CurseForge. Or use the CurseForge app.</p>
      <div class="pl-acts">${stt.curseforge ? '<button type="button" data-mc="cf">Open CurseForge</button>' : '<button type="button" data-mc="getcf">Get the CurseForge app</button>'}</div></div>`;
    openModal({ title: 'Minecraft', wide: true, html, buttons: [{ label: 'Done', primary: true }],
      onOpen: (root) => root.addEventListener('click', (ev) => click(ev, list, stt)) });
  }

  async function click(ev, list, stt) {
    const b = ev.target.closest('button[data-mc]'); if (!b) return;
    const a = b.dataset.mc, inst = list.find((x) => x.id === b.closest('[data-inst]')?.dataset.inst);
    if (a === 'install') {
      if (busy != null) return;
      busy = 0; b.textContent = 'Installing…';
      const r = await api.emuInstall(FLAT); busy = null;
      if (!r.ok) { toast(r.error, 'err'); open(); return; }
      toast('Prism Launcher is installed. Open it once to sign in with your Microsoft account.', 'fun');
      if (!S.lib.entries.some((e) => e.mcPrism)) { const s = await api.mcStatus(); S.lib.entries.push({ id: uid(), type: 'app', title: 'Prism Launcher', exe: s.exe, args: s.pre.join(' '), mcPrism: true, added: Date.now(), playtime: 0 }); save(); refresh(); }
      open(); return;
    }
    if (a === 'prism' || a === 'folder' || a === 'cf') { if (!(await api.mcOpen(a === 'cf' ? 'curseforge' : a))) toast('That could not be opened.', 'err'); return; }
    if (a === 'getcf') { closeModal(); Panels.show({ kind: 'browser', key: 'browser', title: 'Browser', icon: '🌐', url: 'https://www.curseforge.com/download/app' }); toast('Download the Linux version: it lands in Downloads, and Minecraft, Open CurseForge finds it there.'); return; }
    if (a === 'packs') { closeModal(); packs(); return; }
    if (a === 'play' && inst) { closeModal(); const e = entryFor(inst); if (!inLib(inst)) S.oneOff = [...(S.oneOff || []).filter((x) => x.id !== e.id), e]; S.sel = e; launch(e); return; }
    if ((a === 'add' || a === 'addall')) {
      const add = a === 'add' ? [inst] : list.filter((i) => !inLib(i));
      for (const i of add.filter(Boolean)) S.lib.entries.push({ ...entryFor(i), id: uid() });
      save(); refresh(); toast(add.length === 1 ? `${add[0].name} is on the PC blade.` : `${add.length} instances are on the PC blade.`, 'fun'); open(); return;
    }
    if (a === 'pad' && inst) {
      b.disabled = true; b.textContent = 'Adding Controlify…';
      const r = await api.mcControllers(inst.id);
      if (!r.ok) { toast(r.error, 'err'); b.disabled = false; b.textContent = '🎮 Controller support'; return; }
      toast(r.data.added.length ? `${inst.name} has controller support now (${r.data.added.length} mods added).` : `${inst.name} already had it.`, 'fun');
      open();
    }
  }
  window.bladedeck.onEmuProgress?.(({ id, pct }) => { if (id === FLAT && busy != null) { busy = pct; const b = $('#modal [data-mc="install"]'); if (b) b.textContent = `Installing… ${pct}%`; } });

  // Modrinth's modpacks, searchable; Install makes a Prism instance of one.
  async function packs(q = '') {
    const r = await api.mcPacks({ q });
    const list = r.ok ? r.data : [];
    openModal({ title: 'Minecraft modpacks', wide: true,
      html: `<div class="fd-top"><input class="fd-q" type="search" name="mcq" placeholder="Search Modrinth modpacks" value="${esc(q)}"><button type="button" class="fd-go" data-mp="go">Search</button></div>
        ${r.ok ? '' : `<p class="note ph-warn">${esc(r.error)}</p>`}
        <div class="fd-cards" style="margin-top:12px">${list.map((x, i) => `<div class="fd-card"><span class="fd-img">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy">` : '<i>⛏</i>'}</span><b>${esc(x.title)}</b><small>${esc(x.sub)}</small><button type="button" class="primary" data-mp="get" data-i="${i}">Install</button></div>`).join('')}</div>
        <p class="note">Install hands the pack to Prism Launcher, which downloads it and makes an instance. Then Minecraft, Controller support on it. CurseForge packs: in Prism, Add Instance, CurseForge.</p>`,
      buttons: [{ label: 'Back', left: true, onClick: () => { setTimeout(open, 0); } }, { label: 'Done', primary: true }],
      onOpen: (root) => {
        const go = () => packs($('[name=mcq]', root).value.trim());
        $('[name=mcq]', root).addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); go(); } });
        root.addEventListener('click', async (ev) => {
          const b = ev.target.closest('[data-mp]'); if (!b) return;
          if (b.dataset.mp === 'go') { const i = $('[name=mcq]', root); if (S.pad && !i.value) { OSK.open(i); return; } go(); return; }
          const x = list[+b.dataset.i]; if (!x) return;
          b.disabled = true; b.textContent = 'Opening Prism…';
          const g = await api.mcPackGet({ id: x.id });
          if (!g.ok) { toast(g.error, 'err'); b.disabled = false; b.textContent = 'Install'; return; }
          toast(`${x.title} ${g.data.version} is going into Prism Launcher. Press OK there.`, 'fun'); b.textContent = 'Sent to Prism';
        });
      } });
  }
  return { open, packs };
})();
