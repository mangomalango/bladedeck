'use strict';
/* ROMs on their own, full screen, and Sources.
   Open a game file: pick any ROM or disc image (System, Open a game file; or A on it in Files; or
   "Open with Bladedeck" from the desktop) and it starts in the right emulator straight away,
   whether or not it is in the library.
   Full screen: every emulated game is made to fill its screen as its window appears (on KDE,
   through KWin), whatever the emulator was set to. Settings, Games turns it off.
   Sources: your own places to get ROMs, emulators and BIOS files, kept together: folders on this
   PC or a drive, and websites (your own server too). Bladedeck lists the emulators' official
   sites and where each emulator wants its BIOS; it ships no ROM or BIOS download sites.
   Uses S, api, esc, save, toast, openModal, closeModal, launch, cleanTitle, extList, baseName,
   uid, Panels, Watch, Shop, EMU_CATALOG, confirmAsk and $ at call time. */

const Roms = (() => {
  const st = () => S.lib.settings;

  /* -------------------------------------------------------------- open a game file */
  function emulatorsFor(file) {
    const ext = (String(file).match(/\.([^./\\]+)$/) || [, ''])[1].toLowerCase(), name = baseName(file).toLowerCase();
    return S.lib.emulators.filter((em) => (name === 'eboot.bin' ? /shadps4/i.test(`${em.name} ${em.exe}`) : extList(em).includes(ext)));
  }
  const isRom = (file) => emulatorsFor(file).length > 0;

  async function play(file) {
    if (!file) return;
    const known = S.lib.entries.find((e) => e.type === 'rom' && e.rom === file);
    if (known) { S.sel = known; launch(known); return; }
    const ems = emulatorsFor(file);
    if (!ems.length) {
      const ext = (String(file).match(/\.([^./\\]+)$/) || [, '?'])[1];
      if (await confirmAsk({ title: 'No emulator for this file', text: `None of your emulators opens .${ext} files. Get one from Get games, Emulators?`, yes: 'Get an emulator' })) Shop.open('emus');
      return;
    }
    const title = /eboot\.bin$/i.test(file) ? cleanTitle(String(file).replace(/[\\/][^\\/]*$/, '')) : cleanTitle(file);
    openModal({
      title: `Play ${title}`,
      html: `<p class="note">${esc(file)}</p>
        ${ems.length > 1 ? `<label>Emulator<select name="romEm">${ems.map((em) => `<option value="${esc(em.id)}">${esc(em.name)}${em.system ? ` · ${esc(em.system)}` : ''}</option>`).join('')}</select></label>` : `<p>Opens in <b>${esc(ems[0].name)}</b>, full screen.</p>`}`,
      buttons: [{ label: 'Cancel', left: true }, { label: 'Play and add to library', onClick: (root) => start(file, title, pick(root, ems), true) }, { label: 'Play', primary: true, onClick: (root) => start(file, title, pick(root, ems), false) }]
    });
  }
  const pick = (root, ems) => ems.find((em) => em.id === $('[name=romEm]', root)?.value) || ems[0];
  function start(file, title, em, keep) {
    const e = { id: keep ? uid() : `file:${file}`, type: 'rom', title, rom: file, emulatorId: em.id, system: em.system || em.name, added: Date.now(), playtime: 0 };
    if (keep) { S.lib.entries.push(e); save(); toast(`${title} is in your library now.`); }
    // Not kept: remembered for this run, so Running, Quick Resume and the live panel know it is a game.
    else S.oneOff = [...(S.oneOff || []).filter((x) => x.id !== e.id), e];
    setTimeout(() => { S.sel = e; launch(e); }, 50);
  }
  async function pickAndPlay() {
    const f = await api.pick({ kind: 'file' });
    if (f) play(f);
  }
  window.bladedeck.onOpenFile?.((f) => play(f));

  /* -------------------------------------------------------------- save states
     Starting a game that has save states: continue from the newest (highlighted), pick another,
     or start fresh. Resolves to a state's file, '' for fresh, or false when closed. */
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const slotName = (s) => (s.slot === 'resume' ? 'Where you left off' : `Slot ${s.slot}`);
  async function chooseState(e) {
    const list = await api.saveStates({ id: e.id, rom: e.rom, emulatorId: e.emulatorId }).catch(() => []);
    if (!list.length) return '';
    return new Promise((res) => {
      let done = false; const end = (v) => { if (!done) { done = true; res(v); } };
      const root = openModal({
        title: e.title, wide: true,
        html: `<div class="ss-list">${list.map((s, i) => `<button type="button" class="ss ${i === 0 ? 'first' : ''}" data-ss="${i}">
            ${s.thumb ? `<img src="${s.thumb}" alt="">` : '<i>💾</i>'}<div><b>${i === 0 ? `Continue: ${esc(slotName(s))}` : esc(slotName(s))}</b><span>Saved ${esc(ago(s.time))}</span></div></button>`).join('')}
          <button type="button" class="ss fresh" data-ss="fresh"><i>▶</i><div><b>Start fresh</b><span>From the game's own start (its memory card saves are still there)</span></div></button></div>`,
        buttons: [{ label: 'Cancel', onClick: () => end(false) }],
        onOpen: (r) => r.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-ss]'); if (!b) return;
          end(b.dataset.ss === 'fresh' ? '' : list[+b.dataset.ss].file); closeModal();
        })
      });
      S.modalGone = () => end(false);
      if (S.pad) PadNav.mark($('.ss.first', root));
    });
  }

  /* -------------------------------------------------------------- full screen */
  // Emulated games fill their screen as their window appears. Each window once, for 90 seconds.
  let watching = [];
  function launched(ses, e) {
    if (!ses?.pid || e?.type !== 'rom' || st().romsFullscreen === false) return;
    const em = S.lib.emulators.find((x) => x.id === e.emulatorId);
    if (em?.windowed) return;
    watching.push({ pid: ses.pid, until: Date.now() + 90000, done: new Set() });
  }
  window.bladedeck.onPeek(async (ev) => {
    if (ev.kind !== 'windows' || !watching.length) return;
    watching = watching.filter((w) => Date.now() < w.until);
    let l; try { l = JSON.parse(ev.caption) || []; } catch { return; }
    for (const w of l) {
      if (!w.pid || w.web || w.panel) continue;
      for (const job of watching) {
        if (job.done.has(w.id)) continue;
        const ok = w.pid === job.pid || ((await api.pidInfo(w.pid).catch(() => null))?.ancestors || []).includes(job.pid);
        if (!ok) continue;
        job.done.add(w.id);
        // A moment for the emulator to finish opening the window, then full screen.
        setTimeout(() => api.winAct(w.id, 'full'), 1200);
      }
    }
  });

  // Emulators set up before their full-screen option was added get it once (their own setting
  // makes the first frame full screen; KWin catches any that still open in a window).
  const FULL = [[/dolphin/i, '-C Dolphin.Display.Fullscreen=True', /Fullscreen=True/i], [/melonds/i, '-f', /(^|\s)(-f|--fullscreen)\b/], [/azahar|citra/i, '-f', /(^|\s)(-f|--fullscreen)\b/],
    [/ryujinx/i, '--fullscreen', /--fullscreen/], [/ppsspp/i, '--fullscreen', /--fullscreen/], [/xenia/i, '--fullscreen=true', /--fullscreen/], [/mgba/i, '-f', /(^|\s)-f\b/]];
  function fixArgs() {
    if (st().fullArgsFixed) return;
    for (const em of S.lib.emulators) {
      const row = FULL.find(([re]) => re.test(`${em.name} ${em.exe} ${em.args}`)); if (!row || row[2].test(em.args || '')) continue;
      // Just before the game's path (after "flatpak run <id>" and Dolphin's -b).
      em.args = /"\{rom\}"/.test(em.args || '') ? em.args.replace(/(-e\s+)?"\{rom\}"/, (m) => `${row[1]} ${m}`) : `${row[1]} ${em.args || ''}`.trim();
    }
    st().fullArgsFixed = true; save();
  }

  /* -------------------------------------------------------------- texture packs
     Which emulators can swap in higher-resolution textures, where to find packs, and (through
     Cheats & mods) the folder a pack goes in. Packs are made by fans and shared on these sites. */
  const gb = (q) => `https://gamebanana.com/search?_sSearchString=${encodeURIComponent(q)}`;
  const web = (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
  const TEXTURES = [
    [/pcsx2/i, 'PCSX2', 'Texture replacement: packs of PNG files, turned on in Graphics, Texture Replacement.', [['GameBanana', gb('PCSX2 texture pack')], ['PCSX2', 'https://pcsx2.net']]],
    [/dolphin/i, 'Dolphin', 'Custom textures: packs go in Load/Textures/<game id>; turn on "Load Custom Textures".', [['Custom Texture Projects', 'https://forums.dolphin-emu.org/Forum-custom-texture-projects'], ['GameBanana', gb('Dolphin texture pack')]]],
    [/ppsspp/i, 'PPSSPP', 'Texture replacement: packs go in PSP/TEXTURES/<game id>; turn on Replace textures.', [['PPSSPP forums', 'https://forums.ppsspp.org'], ['GameBanana', gb('PPSSPP texture pack')]]],
    [/duckstation/i, 'DuckStation', 'Texture replacement: packs go in its textures folder by game serial; turn on in Enhancements.', [['GameBanana', gb('DuckStation texture pack')], ['DuckStation', 'https://www.duckstation.org']]],
    [/cemu/i, 'Cemu', 'Graphic packs: higher resolutions and fixes, downloaded from inside Cemu (Options, Graphic packs).', [['Graphic packs', 'https://github.com/cemu-project/cemu_graphic_packs'], ['GameBanana', gb('Cemu graphic pack')]]],
    [/azahar|citra/i, 'Azahar', 'Custom textures: packs go in load/textures/<title id>; turn on "Use custom textures".', [['GameBanana', gb('3DS texture pack')]]],
    [/mupen|rmg|retroarch/i, 'Nintendo 64 (RMG, RetroArch)', 'HD textures through GLideN64: packs go in its hires_texture folder.', [['GameBanana', gb('N64 HD texture pack')]]],
    [/ryujinx/i, 'Ryujinx', 'Mods (textures included) go in mods/contents/<title id>; Cheats & mods opens the folder.', [['GameBanana', gb('Switch texture mod')]]],
    [/flycast/i, 'Flycast', 'Custom textures: packs go in its textures folder by game ID.', [['GameBanana', gb('Dreamcast texture pack')]]],
    [/rpcs3|xenia|xemu|mgba|melonds|snes9x|shadps4/i, '', 'This emulator cannot swap in textures. Its resolution scale (in its graphics settings) is the way to sharper pictures.', []]
  ];
  const texFor = (em) => TEXTURES.find(([re]) => re.test(`${em?.name || ''} ${em?.exe || ''} ${em?.args || ''}`)) || null;
  // For one game: its emulator's hub, and searches for a pack for this game.
  function textureLinks(e, em) {
    const t = texFor(em); if (!t || !t[3].length) return { note: t ? t[2] : '', links: [] };
    return { note: t[2], links: [['GameBanana: this game', gb(`${e.title} texture`)], ['The web: this game', web(`${e.title} HD texture pack ${em.name}`)], ...t[3]] };
  }

  /* -------------------------------------------------------------- Sources */
  const CATS = [['roms', 'ROMs'], ['emus', 'Emulators'], ['bios', 'BIOS and firmware'], ['tex', 'Texture packs'], ['rd', 'Real-Debrid']];
  let cat = 'roms';
  const list = () => (st().sources = st().sources || []);
  const inDock = (s) => (st().dock?.slots || []).some((x) => x.url === s.where);
  const isUrl = (u) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(u);

  /* Real-Debrid: your own files there, downloaded into Bladedeck/Real-Debrid. */
  const mb = (n) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1048576))} MB`);
  let rdData = null, rdProg = {};
  async function rdHtml() {
    const tok = st().rdToken || '';
    let acct = null, err = '';
    if (tok) { const a = await api.rdAccount(); if (a.ok) acct = a.data; else err = a.error; if (acct && !rdData) { const l = await api.rdList(); rdData = l.ok ? l.data : null; if (!l.ok) err = l.error; } }
    const row = (x, kind) => `<div class="src-row"><i>${kind === 't' ? '🧲' : '⬇'}</i><div class="src-t"><b>${esc(x.name)}</b><small>${mb(x.size || 0)}${rdProg[x.name] != null ? ` · ${rdProg[x.name] >= 100 ? 'Done' : `${rdProg[x.name]}%`}` : ''}</small></div><button type="button" data-rd="${kind}" data-id="${esc(x.id)}">Get</button></div>`;
    return `<p class="note">Your Real-Debrid files, downloaded into Bladedeck/Real-Debrid. ROMs there join your library by themselves.</p>
      <div class="row2"><label>API token${tok ? ' (saved)' : ''}<input type="password" name="rdToken" value="${esc(tok)}" autocomplete="off" placeholder="from real-debrid.com/apitoken"></label>
        <div class="pl-acts" style="align-self:end"><button type="button" data-rda="save">Save token</button><button type="button" data-rda="token">Get my token</button></div></div>
      ${err ? `<p class="note ph-warn">${esc(err)}</p>` : ''}
      ${!acct ? `<h4 class="set-sub">Your files (Real-Debrid's file server)</h4>${davHtml()}` : ''}
      ${acct ? `<p class="note">Signed in as <b>${esc(acct.name)}</b> · ${acct.premium ? `premium until ${esc(new Date(acct.until).toLocaleDateString())}` : 'not premium (downloads need premium)'}</p>
        <div class="pl-acts"><button type="button" data-rda="refresh">Refresh</button><button type="button" data-rda="folder">Open the folder</button></div>
        <h4 class="set-sub">Your files (Real-Debrid's file server)</h4>${davHtml()}
        <h4 class="set-sub">Torrents</h4>${rdData?.torrents.length ? rdData.torrents.map((x) => row(x, 't')).join('') : '<p class="note">None finished.</p>'}
        <h4 class="set-sub">Downloads</h4>${rdData?.downloads.length ? rdData.downloads.slice(0, 40).map((x) => row(x, 'd')).join('') : '<p class="note">None.</p>'}` : ''}`;
  }
  /* The file server: folders and files, like a drive. Needs your Real-Debrid name and the WebDAV
     password from your account page (not your login password). */
  let dav = { path: '', items: null, err: '' };
  function davHtml() {
    const st0 = st();
    const creds = `<div class="row2"><label>Real-Debrid name<input type="text" name="rdDavUser" value="${esc(st0.rdDavUser || '')}" autocomplete="off"></label><label>WebDAV password (account page)<input type="password" name="rdDavPass" value="${esc(st0.rdDavPass || '')}" autocomplete="off"></label></div>
      <div class="pl-acts"><button type="button" data-rda="davsave">${dav.items ? 'Save' : 'Open the file server'}</button><button type="button" data-rda="davpw">Get my WebDAV password</button></div>`;
    if (!dav.items) return creds + (dav.err ? `<p class="note ph-warn">${esc(dav.err)}</p>` : '');
    const up = dav.path ? `<div class="src-row"><i>↑</i><div class="src-t"><b>Up</b><small>/${esc(dav.path)}</small></div><button type="button" data-dav="up">Up</button></div>` : '';
    return creds + up + (dav.items.length ? dav.items.slice(0, 200).map((x, i) => `<div class="src-row"><i>${x.dir ? '📁' : '📄'}</i><div class="src-t"><b>${esc(x.name)}</b><small>${x.dir ? 'Folder' : mb(x.size)}${rdProg[x.name] != null ? ` · ${rdProg[x.name] >= 100 ? 'Done' : `${rdProg[x.name]}%`}` : ''}</small></div><button type="button" data-dav="${i}">${x.dir ? 'Open' : 'Get'}</button></div>`).join('') : '<p class="note">This folder is empty.</p>');
  }
  async function davGo(p) {
    const r = await api.rdDavList(p);
    if (r.ok) dav = { path: p, items: r.data, err: '' }; else dav = { path: '', items: null, err: r.error };
    sources();
  }
  async function rdClick(t, root) {
    if (t.dataset.rda === 'davsave') { st().rdDavUser = val(root, 'rdDavUser'); st().rdDavPass = $('[name=rdDavPass]', root).value; save(); setTimeout(() => davGo(dav.path), 300); return; }
    if (t.dataset.rda === 'davpw') { closeModal(); Panels.show({ kind: 'browser', key: 'browser', title: 'Browser', icon: '🌐', url: 'https://real-debrid.com/account' }); toast('Your WebDAV password is on your account page. Paste it in Sources, Real-Debrid.'); return; }
    if (t.dataset.dav === 'up') { davGo(dav.path.split('/').slice(0, -1).join('/')); return; }
    if (t.dataset.dav) {
      const x = dav.items[+t.dataset.dav]; if (!x) return;
      if (x.dir) { davGo(x.path); return; }
      const f = await api.rdFolder(), w = (st().watch = st().watch || { on: true, dirs: [] });
      if (!w.dirs.includes(f)) { w.dirs.push(f); save(); Watch.apply(); }
      t.disabled = true; t.textContent = 'Getting…'; rdProg[x.name] = 0;
      api.rdDavGet(x.path).then((r) => { if (!r.ok) toast(`${x.name}: ${r.error}`, 'err'); });
      toast(`Downloading ${x.name} into Bladedeck/Real-Debrid.`);
      return;
    }
    if (t.dataset.rda === 'save') { st().rdToken = val(root, 'rdToken'); save(); rdData = null; sources(); return; }
    if (t.dataset.rda === 'token') { closeModal(); Panels.show({ kind: 'browser', key: 'browser', title: 'Browser', icon: '🌐', url: 'https://real-debrid.com/apitoken' }); toast('Sign in, copy the token, then paste it in Sources, Real-Debrid.'); return; }
    if (t.dataset.rda === 'refresh') { rdData = null; sources(); return; }
    if (t.dataset.rda === 'folder') { const f = await api.rdFolder(); closeModal(); Panels.show({ kind: 'files', key: 'files', title: 'Files', icon: '🗂', path: f }); return; }
    const item = (t.dataset.rd === 't' ? rdData.torrents : rdData.downloads).find((x) => x.id === t.dataset.id); if (!item) return;
    t.disabled = true; t.textContent = 'Getting…';
    // Real-Debrid/ is watched, so ROMs that arrive there join the library.
    const f = await api.rdFolder(), w = (st().watch = st().watch || { on: true, dirs: [] });
    if (!w.dirs.includes(f)) { w.dirs.push(f); save(); Watch.apply(); }
    const files = t.dataset.rd === 't' ? await api.rdFiles(item.id) : { ok: true, data: [{ name: item.name, url: item.url }] };
    if (!files.ok) { toast(files.error, 'err'); t.disabled = false; t.textContent = 'Get'; return; }
    for (const x of files.data) {
      rdProg[x.name] = 0;
      api.rdGet(x.url, x.name).then((r) => { if (!r.ok) toast(`${x.name}: ${r.error}`, 'err'); });
    }
    toast(`Downloading ${files.data.length === 1 ? files.data[0].name : `${files.data.length} files`} into Bladedeck/Real-Debrid.`);
  }
  window.bladedeck.onRdProgress?.((p) => {
    rdProg[p.name] = p.pct;
    if (p.done) toast(`${p.name} is in Bladedeck/Real-Debrid.`, 'fun');
    const el = [...document.querySelectorAll('#modal .src-row b')].find((b) => b.textContent === p.name);
    const small = el?.parentElement.querySelector('small');
    if (small) small.textContent = `${small.textContent.split(' · ')[0]} · ${p.pct >= 100 ? 'Done' : `${p.pct}%`}`;
  });

  async function sources(which) {
    if (which) cat = which;
    if (cat === 'rd') {
      const body = await rdHtml();
      openModal({ title: 'Sources', wide: true, html: `<div class="src"><nav class="src-tabs">${CATS.map(([id, label]) => `<button type="button" class="${id === cat ? 'on' : ''}" data-cat="${id}">${label}</button>`).join('')}</nav>${body}</div>`,
        buttons: [{ label: 'Done', primary: true }],
        onOpen: (root) => root.addEventListener('click', (ev) => { const t = ev.target.closest('button'); if (!t) return; if (t.dataset.cat) { sources(t.dataset.cat); return; } if (t.dataset.rd || t.dataset.rda || t.dataset.dav) rdClick(t, root); }) });
      return;
    }
    const bios = cat === 'bios' ? await api.biosList().catch(() => []) : [];
    const mine = list().filter((s) => s.cat === cat);
    const row = (s) => `<div class="src-row" data-src="${esc(s.id)}"><i>${s.kind === 'folder' ? '📁' : '🌐'}</i><div class="src-t"><b>${esc(s.label)}</b><small>${esc(s.where)}</small></div>
        ${s.kind === 'link' ? '<button type="button" data-sa="browse">Browse</button><button type="button" data-sa="edit" aria-label="Edit">✎</button>' : ''}<button type="button" data-sa="open">Open</button>${s.kind === 'link' ? `<button type="button" data-sa="dock">${inDock(s) ? '✓ In the dock' : 'Put in the dock'}</button>` : ''}${cat === 'roms' && s.kind === 'folder' ? `<button type="button" data-sa="import">${(st().watch?.dirs || []).includes(s.where) ? '✓ In library' : 'Add its games'}</button>` : ''}<button type="button" data-sa="del" aria-label="Remove">✕</button></div>`;
    const html = `<div class="src">
      <nav class="src-tabs">${CATS.map(([id, label]) => `<button type="button" class="${id === cat ? 'on' : ''}" data-cat="${id}">${label}</button>`).join('')}</nav>
      <h4 class="set-sub">Your sources</h4>
      ${mine.length ? mine.map(row).join('') : `<p class="note">None yet. Add a folder (on this PC, a drive or a network share) or a website (your own server works too).</p>`}
      ${cat === 'roms' && !mine.some((x) => /archive\.org/.test(x.where)) ? `<div class="src-row sug"><i>🏛</i><div class="src-t"><b>Internet Archive</b><small>A library of old software, games and manuals. Sign in once in Bladedeck's browser and it stays signed in.</small></div><button type="button" data-sug="ia">Add</button></div>` : ''}
      <div class="pl-acts">${mine.some((x) => x.kind === 'link') || cat === 'roms' ? '<button type="button" class="primary" data-go="browse">🔎 Browse your sources</button>' : ''}<button type="button" data-add="folder">Add a folder</button><button type="button" data-add="link">Add a website</button>${cat === 'roms' ? '<button type="button" data-add="file">Open a game file</button>' : ''}</div>
      ${cat === 'emus' ? `<h4 class="set-sub">Official sites</h4><div class="src-grid">${EMU_CATALOG.map((e) => `<button type="button" class="src-site" data-site="${esc(e.site)}"><b>${esc(e.name)}</b><small>${esc(e.system)}</small></button>`).join('')}</div>
        <div class="pl-acts"><button type="button" data-go="emus">Install emulators (Get games)</button></div>` : ''}
      ${cat === 'bios' ? `<h4 class="set-sub">Where each emulator looks</h4><p class="note">Dump these from your own consoles; each emulator's site explains how. Add puts the files you pick into the right folder.</p>
        ${bios.map((b) => `<div class="src-row"><i>🧩</i><div class="src-t"><b>${esc(b.name)}</b><small>${esc(b.need)}${b.dir ? ` · ${esc(b.dir)}${b.exists ? '' : ' (made when needed)'}` : ''}</small></div>${b.dir ? `<button type="button" data-bios="${esc(b.id)}" data-ba="add">Add files</button><button type="button" data-bios="${esc(b.id)}" data-ba="open">Open folder</button>` : ''}</div>`).join('')}` : ''}
      ${cat === 'tex' ? `<h4 class="set-sub">By emulator</h4><p class="note">Higher-resolution textures made by fans. On a game, Start (Tasks), Cheats &amp; mods opens the folder its pack goes in.</p>
        ${TEXTURES.filter((t) => t[1]).map(([, name, note, links]) => `<div class="src-row"><i>🎨</i><div class="src-t"><b>${esc(name)}</b><small>${esc(note)}</small></div>${links.map(([l, u]) => `<button type="button" data-site="${esc(u)}">${esc(l)}</button>`).join('')}</div>`).join('')}
        <p class="note">${esc(TEXTURES[TEXTURES.length - 1][2].replace('This emulator', 'RPCS3, Xenia, xemu, mGBA, melonDS, Snes9x and shadPS4'))}</p>` : ''}
      ${cat === 'roms' ? '<p class="note">Games downloaded from your own site land in Downloads, which Bladedeck watches: they join the library by themselves. Free and homebrew games are in Get games.</p>' : ''}
    </div>`;
    openModal({
      title: 'Sources', wide: true, html,
      buttons: [{ label: 'Done', primary: true }],
      onOpen: (root) => root.addEventListener('click', (ev) => click(ev, root))
    });
  }

  async function click(ev, root) {
    const t = ev.target.closest('button'); if (!t) return;
    if (t.dataset.cat) { sources(t.dataset.cat); return; }
    if (t.dataset.site) { openLink(t.dataset.site); return; }
    if (t.dataset.go === 'emus') { closeModal(); Shop.open('emus'); return; }
    if (t.dataset.go === 'browse') { closeModal(); Finder.open(); return; }
    if (t.dataset.bios) {
      if (t.dataset.ba === 'open') { api.biosOpen(t.dataset.bios); return; }
      const r = await api.biosAdd(t.dataset.bios);
      if (r.ok) toast(`Copied ${r.copied.join(', ')}${r.replaced.length ? ` (replaced ${r.replaced.join(', ')})` : ''}.`, 'fun'); else if (!r.cancelled) toast(r.error, 'err');
      return;
    }
    if (t.dataset.add === 'file') { closeModal(); pickAndPlay(); return; }
    if (t.dataset.add === 'folder') {
      // Through the system's folder dialog: the folder becomes one Bladedeck may open.
      const r = await api.fsGrant();
      if (r?.ok) { list().push({ id: uid(), cat, kind: 'folder', label: baseName(r.path) || r.path, where: r.path }); save(); sources(); }
      return;
    }
    if (t.dataset.add === 'link') { addLink(); return; }
    if (t.dataset.sug === 'ia') { list().push({ id: uid(), cat: 'roms', kind: 'link', label: 'Internet Archive', where: 'https://archive.org/account/login' }); save(); sources(); return; }
    const s = list().find((x) => x.id === t.closest('[data-src]')?.dataset.src); if (!s) return;
    if (t.dataset.sa === 'dock') {
      // An app in the dock: one press opens the site in its own panel, signed in as before.
      if (!inDock(s)) { const d = (st().dock = st().dock || { on: true, slots: [] }); d.slots.push({ pick: 'custom', name: s.label.slice(0, 24), icon: '🌐', url: s.where, web: true, match: new URL(s.where).hostname.replace(/^www\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }); save(); Dock.draw(); toast(`${s.label} is in the dock.`, 'fun'); }
      sources(); return;
    }
    if (t.dataset.sa === 'browse') { closeModal(); Finder.open(s.id); return; }
    if (t.dataset.sa === 'edit') { addLink(s); return; }
    if (t.dataset.sa === 'del') { st().sources = list().filter((x) => x !== s); save(); sources(); return; }
    if (t.dataset.sa === 'open') { if (s.kind === 'folder') { closeModal(); Panels.show({ kind: 'files', key: 'files', title: 'Files', icon: '🗂', path: s.where }); } else openLink(s.where); return; }
    if (t.dataset.sa === 'import') {
      const w = (st().watch = st().watch || { on: true, dirs: [] });
      if (!w.dirs.includes(s.where)) { w.dirs.push(s.where); w.on = true; save(); Watch.apply(); Watch.catchUp(); toast(`Games in ${s.label} join the library, and new ones as they arrive.`, 'fun'); }
      sources();
    }
  }
  // Add a website, or change one (ed). Its search address is optional: Browse finds the site's
  // search box by itself and remembers it, but some sites need it spelled out.
  function addLink(ed) {
    openModal({
      title: ed ? `Edit ${ed.label}` : `Add a website (${CATS.find((c) => c[0] === cat)[1]})`,
      html: `<label>Name<input type="text" name="srcName" placeholder="My server" value="${esc(ed?.label || '')}"></label><label>Address<input type="text" name="srcUrl" placeholder="https://… or http://192.168.1.20:8080" value="${esc(ed?.where || '')}"></label>
        <label>Search address (optional), with {q} where the words go<input type="text" name="srcSearch" placeholder="https://example.com/search?q={q}" value="${esc(ed?.search || '')}"></label>
        <p class="note">Leave the search address empty and Browse finds the site's search box by itself.</p>`,
      buttons: [{ label: 'Cancel', onClick: () => { setTimeout(() => sources(), 0); } }, { label: ed ? 'Save' : 'Add', primary: true, onClick: (root) => {
        const url = val(root, 'srcUrl'), search = val(root, 'srcSearch');
        if (!isUrl(url)) { toast('Write the whole address, starting with https:// or http://', 'err'); return false; }
        if (search && (!isUrl(search.replace('{q}', 'x')) || !search.includes('{q}'))) { toast('The search address needs {q} where the words go.', 'err'); return false; }
        if (ed) Object.assign(ed, { label: val(root, 'srcName') || new URL(url).host, where: url, search });
        else list().push({ id: uid(), cat, kind: 'link', label: val(root, 'srcName') || new URL(url).host, where: url, search });
        save(); setTimeout(() => sources(), 0);
      } }]
    });
  }
  // https opens in Bladedeck's browser panel; a plain http address (a server on your network)
  // opens in your own browser, since the panel only loads secure pages.
  function openLink(url) {
    if (/^https:\/\//i.test(url)) { closeModal(); Panels.show({ kind: 'browser', key: 'browser', title: 'Browser', icon: '🌐', url }); }
    else { api.openLink(url); toast('Opened in your browser.'); }
  }

  return { play, pickAndPlay, isRom, launched, sources, fixArgs, chooseState, textureLinks };
})();
