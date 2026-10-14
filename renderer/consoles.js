'use strict';
/* Consoles: a tab for each console, gathering what Bladedeck has for that system in one place:
   the emulators for it (installed, or one press away in Get games), the BIOS or keys it needs and
   whether they are there, your games for it, PC ports and recompilations of its games, texture
   packs and cheats, and a search of your own sources for it. Bladedeck lists no ROM sites: games
   come from your own dumps, folders and sources.
   Uses S, api, esc, cover, launch, toast, openModal, closeModal, Shop, Roms, Mods, Finder,
   EMU_CATALOG, PORTS, PadNav and $ at call time. */
const Consoles = (() => {
  // Each console: its name, the words that find its emulators, ports and games, and an icon.
  const LIST = [
    ['ps2', 'PlayStation 2', /playstation 2|ps2/i, '🎮'], ['ps1', 'PlayStation', /^playstation$|ps1|psx/i, '🎮'], ['ps3', 'PlayStation 3', /playstation 3|ps3/i, '🎮'],
    ['ps4', 'PlayStation 4', /playstation 4|ps4/i, '🎮'], ['psp', 'PSP', /psp/i, '🎮'], ['switch', 'Switch', /switch/i, '🕹'],
    ['gcwii', 'GameCube and Wii', /gamecube|wii(?! u)/i, '🕹'], ['wiiu', 'Wii U', /wii u/i, '🕹'], ['n64', 'Nintendo 64', /nintendo 64|n64/i, '🕹'],
    ['snes', 'Super Nintendo', /super nintendo|snes/i, '🕹'], ['gba', 'Game Boy and GBA', /game boy|gba/i, '🕹'], ['ds', 'Nintendo DS', /nintendo ds$|nintendo ds\b(?!.*3)/i, '🕹'],
    ['3ds', 'Nintendo 3DS', /3ds/i, '🕹'], ['xbox', 'Xbox', /^xbox$/i, '🎮'], ['x360', 'Xbox 360', /xbox 360/i, '🎮'], ['dc', 'Dreamcast', /dreamcast/i, '🌀']
  ];
  let cur = 'ps2';

  async function open(which) {
    if (which) cur = which;
    const [k, name, re, icon] = LIST.find((x) => x[0] === cur) || LIST[0];
    const emus = EMU_CATALOG.filter((e) => re.test(e.system) || re.test(e.also || ''));
    const have = (e) => S.lib.emulators.find((x) => x.name.toLowerCase().startsWith(e.name.toLowerCase().split(' ')[0]));
    const bios = (await api.biosList().catch(() => [])).filter((b) => emus.some((e) => e.name.toLowerCase().startsWith(String(b.name).toLowerCase().split(' ')[0])));
    const games = S.lib.entries.filter((e) => !e.hidden && e.type === 'rom' && re.test(e.system || ''));
    const ports = PORTS.flatMap(([, l]) => l).filter((p) => re.test(p.console || ''));
    const tex = emus.map((e) => have(e)).filter(Boolean).map((em) => Roms.textureLinks({ title: name }, em)).find((t) => t.note);
    const row = (ic, title, sub, btns) => `<div class="src-row"><i>${ic}</i><div class="src-t"><b>${esc(title)}</b><small>${esc(sub)}</small></div>${btns}</div>`;
    const html = `<div class="src cn">
      <nav class="src-tabs cn-tabs">${LIST.map(([id, n]) => `<button type="button" class="${id === k ? 'on' : ''}" data-cn="${id}">${esc(n)}</button>`).join('')}</nav>
      <h3 class="cn-h">${icon} ${esc(name)}</h3>
      <h4 class="set-sub">Emulators</h4>
      ${emus.length ? emus.map((e) => row('◉', e.name, `${e.system}${e.also ? ` (also ${e.also})` : ''}${e.note ? ` · ${e.note}` : ''}`, have(e) ? '<button type="button" disabled>✓ Installed</button>' : '<button type="button" class="primary" data-get="emus">Install</button>')).join('') : '<p class="note">No emulator for it yet.</p>'}
      ${bios.length ? `<h4 class="set-sub">BIOS and keys</h4>${bios.map((b) => row(b.exists ? '✓' : '🧩', b.name, `${b.need}${b.dir ? (b.exists ? ' · folder is there' : ' · folder made when needed') : ''}`, b.dir ? `<button type="button" data-bios="${esc(b.id)}">Add files</button>` : '')).join('')}<p class="note">Dump these from your own console; each emulator's site explains how.</p>` : ''}
      <h4 class="set-sub">Your games (${games.length})</h4>
      ${games.length ? `<div class="cn-games">${games.slice(0, 40).map((e) => `<button type="button" class="cn-game" data-play="${esc(e.id)}"><span>${cover(e)}</span><b>${esc(e.title)}</b></button>`).join('')}</div>` : '<p class="note">None yet. Put your own dumps in a watched folder (Games or Downloads) or add a game folder in Emulators.</p>'}
      ${ports.length ? `<h4 class="set-sub">PC ports and recompilations</h4>${ports.map((p) => row('⟲', `${p.title}: ${p.port}`, `${p.status}${p.need ? ` · needs ${p.need}` : ''}`, `<button type="button" data-get="ports">${p.gh ? 'Install' : 'See it'}</button>`)).join('')}` : ''}
      ${tex ? `<h4 class="set-sub">Texture packs and cheats</h4><p class="note">${esc(tex.note)} On a game, Start (Tasks), Cheats &amp; mods opens its folder.</p>` : ''}
      <h4 class="set-sub">Find more</h4>
      <div class="pl-acts"><button type="button" data-find="1">🔎 Search your sources for ${esc(name)}</button>${/game boy|gba/i.test(name) ? '<button type="button" data-get="homebrew">Free homebrew games</button>' : ''}<button type="button" data-get="emus">All emulators</button></div>
    </div>`;
    openModal({ title: 'Consoles', wide: true, html, buttons: [{ label: 'Done', primary: true }],
      onOpen: (root) => {
        root.addEventListener('click', async (ev) => {
          const b = ev.target.closest('button'); if (!b) return;
          if (b.dataset.cn) { open(b.dataset.cn); return; }
          if (b.dataset.get) { closeModal(); Shop.open(b.dataset.get === 'homebrew' ? 'homebrew' : b.dataset.get); return; }
          if (b.dataset.bios) { const r = await api.biosAdd(b.dataset.bios); if (r.ok) toast(`Copied ${r.copied.join(', ')}.`, 'fun'); else if (!r.cancelled) toast(r.error, 'err'); return; }
          if (b.dataset.play) { const e = S.lib.entries.find((x) => x.id === b.dataset.play); closeModal(); if (e) { S.sel = e; launch(e); } return; }
          if (b.dataset.find) { closeModal(); Finder.open(); setTimeout(() => Finder.run(name), 300); }
        });
        // LB / RB go through the consoles.
        root.__lbrb = (a) => { const i = LIST.findIndex((x) => x[0] === cur); open(LIST[(i + (a === 'rb' ? 1 : LIST.length - 1)) % LIST.length][0]); };
      } });
  }
  return { open };
})();
