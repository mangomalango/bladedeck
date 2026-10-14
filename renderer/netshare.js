'use strict';
/* Network & sharing (netshare.js in main): the Settings page that says which network this is,
   whether Bladedeck shows itself here, and what the firewall lets in. Nearby (and ROM sync, which
   rides on it) only runs on home networks unless "Also share on public networks" is on.
   Uses S, api, esc, toast, save and $ at call time. */
const NetShare = (() => {
  const st = () => S.lib.settings;
  function settingsHtml(s) {
    return `<div class="ns-now"><p class="note">Looking at this network…</p></div>
      <h4 class="set-sub">Who can see this PC</h4>
      <div class="checks">
        <label><input type="checkbox" name="lanOn" ${s.lanOn !== false ? 'checked' : ''}> Show me to other Bladedecks (see who is around, invite them, send files, ROM sync)</label>
        <label><input type="checkbox" name="lanShare" ${s.lanShare === true ? 'checked' : ''}> Share my game list with them (so you can see which games you both have)</label>
        <label><input type="checkbox" name="publicNetworks" ${s.publicNetworks === true ? 'checked' : ''}> Also share on public networks (cafés, school, hotels: anyone there could see your name and what you play)</label>
      </div>
      <h4 class="set-sub">Firewall</h4><div class="ns-fw"><p class="note">Checking…</p></div>
      <h4 class="set-sub">Between your own devices</h4>
      <div class="btns"><button type="button" data-ns="romsync">🔄 ROM sync…</button><button type="button" data-ns="phone">📱 Phone app…</button><button type="button" data-ns="xfer">📤 Send files…</button></div>`;
  }
  async function fill(root) {
    const now = $('.ns-now', root), fw = $('.ns-fw', root); if (!now) return;
    const r = await api.netshareStatus().catch(() => null);
    if (!now.isConnected) return;
    const homes = st().homeNets || [];
    const n = r?.network;
    now.innerHTML = !n ? '<div class="ns-card"><b>📶 No network found</b><small>Nearby starts when this PC is on a network.</small></div>'
      : `<div class="ns-card ${r.home ? 'ok' : 'warn'}"><b>📶 ${esc(n.name || 'This network')}${n.category ? ` <span class="ns-tag">${esc(n.category === 'DomainAuthenticated' ? 'Work' : n.category)}</span>` : ''}</b>
        <small>${r.home ? 'Your home network: Bladedeck shows itself here.' : r.sharing ? 'Not a home network, but you share on public networks too.' : 'Not your home network, so Bladedeck stays hidden here.'}</small>
        <div class="btns">${!r.home && n.name ? '<button type="button" data-ns="home">This is my home network</button>' : ''}${homes.includes(n.name) ? '<button type="button" data-ns="unhome">Not my home network</button>' : ''}</div></div>`
        + (homes.filter((h) => h !== n.name).length ? `<p class="note">Other home networks: ${homes.filter((h) => h !== n.name).map((h) => `${esc(h)} <button type="button" class="ns-x" data-ns="forget" data-n="${esc(h)}" aria-label="Forget ${esc(h)}">✕</button>`).join(' · ')}</p>` : '');
    const f = r?.firewall;
    if (f?.kind === 'windows') {
      const pub = f.rules.some((x) => x.public), priv = f.rules.some((x) => x.private);
      fw.innerHTML = `<div class="ns-card"><b>🛡 Windows Firewall lets Bladedeck in on: ${f.rules.length ? [priv && 'home (Private)', pub && 'public'].filter(Boolean).join(' and ') || 'no networks' : 'no rule yet (Windows asks the first time)'}</b>
        <small>${pub && st().publicNetworks !== true ? 'That is more than your choice above. Match it so public networks cannot reach Bladedeck.' : 'Matches your choice above.'}</small>
        <div class="btns"><button type="button" data-ns="fw">Match the firewall to my choice</button></div></div>`;
    } else if (f?.kind === 'linux') {
      fw.innerHTML = f.ufw ? `<div class="ns-card warn"><b>🛡 This PC's firewall (${esc(f.ufw.name)}) blocks other Bladedecks</b><small>They can see you, but you cannot see them, and files they send never ask. To let them in from your home network, run this once in a terminal:</small><code>${esc(f.ufw.fix)}</code></div>`
        : '<div class="ns-card ok"><b>🛡 The firewall lets other Bladedecks on your home network in</b><small>Or no firewall is on. Public networks stay closed while sharing there is off.</small></div>';
    } else fw.innerHTML = '';
  }
  function read(root) { st().publicNetworks = !!$('[name=publicNetworks]', root)?.checked; st().lanShare = !!$('[name=lanShare]', root)?.checked; }
  async function click(root, b) {
    const a = b.dataset.ns, s = st();
    if (a === 'romsync') { closeModal(); setTimeout(() => RomSync.open(), 0); return; }
    if (a === 'phone') { closeModal(); setTimeout(() => Companion.open(), 0); return; }
    if (a === 'xfer') { closeModal(); setTimeout(() => Transfer.open(), 0); return; }
    if (a === 'home' || a === 'unhome' || a === 'forget') {
      const r = await api.netshareStatus().catch(() => null), name = a === 'forget' ? b.dataset.n : r?.network?.name;
      s.homeNets = (s.homeNets || []).filter((h) => h !== name); if (a === 'home' && name) s.homeNets.push(name);
      save(); setTimeout(() => api.netshareApply(), 400); fill(root); return;
    }
    if (a === 'fw') {
      b.disabled = true; b.textContent = 'Windows is asking you…';
      const r = await api.netshareFirewall(!!$('[name=publicNetworks]', root)?.checked);
      toast(r?.ok ? 'The firewall matches your choice now.' : 'The firewall was not changed (Windows did not get a yes).', r?.ok ? 'fun' : 'err');
      fill(root);
    }
  }
  // The network Bladedeck is on when this first runs is home, so nothing changes for anyone.
  async function init() {
    if (Array.isArray(st().homeNets)) return;
    const r = await api.netshareStatus().catch(() => null);
    if (Array.isArray(st().homeNets)) return;
    st().homeNets = r?.network?.name ? [r.network.name] : [];
    save(); setTimeout(() => api.netshareApply(), 500);
  }
  return { settingsHtml, fill, read, click, init };
})();

/* Settings, easy to read: every on/off option is a row with a switch, its name in bold and the
   explanation (what was in brackets, or after a colon) on a dimmer line under it; each page opens
   with what it is for; and a search finds any setting on any page. */
const SetLook = (() => {
  const INFO = {
    general: ['👤', 'Your name, the weather, and what Home shows.'],
    look: ['🎨', 'Theme, motion, sound and how the menus look on your screen.'],
    games: ['🎮', 'How games start, emulators, Steam and the folders Bladedeck watches.'],
    pads: ['🕹', 'Who is which player, rumble, and each controller\'s sound.'],
    multi: ['👥', 'Split screen and a screen each, for playing in the same room.'],
    net: ['📶', 'Where other Bladedecks can see this PC, and what the firewall lets in.'],
    rec: ['🎬', 'Recording, instant replay, and the live view of a game.'],
    online: ['🔑', 'Keys for cover art and RetroAchievements.'],
    adv: ['🛠', 'Blades, themes and custom styles, for tinkering.']
  };
  function split(text) {
    const t = text.replace(/\s+/g, ' ').trim();
    let m = t.match(/^(.{6,}?)\s*\(([^()]+(?:\([^()]*\)[^()]*)*)\)\s*$/);
    if (m) return [m[1], m[2]];
    m = t.match(/^(.{6,70}?):\s+(.{12,})$/);
    if (m) return [m[1], m[2]];
    return [t, ''];
  }
  function rows(root) {
    for (const l of root.querySelectorAll('.set-sec .checks > label')) {
      if (l.querySelector('.row-t')) continue;
      const input = l.querySelector(':scope > input[type=checkbox]');
      if (!input || l.querySelector('select, textarea, input:not([type=checkbox])')) continue;
      const [title, sub] = split(l.textContent);
      const span = document.createElement('span'); span.className = 'row-t';
      span.innerHTML = `<b>${esc(title)}</b>${sub ? `<small>${esc(sub[0].toUpperCase() + sub.slice(1))}</small>` : ''}`;
      l.replaceChildren(span, input); l.classList.add('row');
    }
  }
  function head(root, id, label) {
    const pages = root.querySelector('.set-pages'); if (!pages) return;
    let h = pages.querySelector('.set-head');
    if (!h) { h = document.createElement('div'); h.className = 'set-head'; pages.prepend(h); }
    const [ic, line] = INFO[id] || ['⚙', ''];
    h.innerHTML = `<h3>${ic} ${esc(label)}</h3>${line ? `<p>${esc(line)}</p>` : ''}`;
  }
  // Type to find a setting on any page; empty shows the page you were on.
  function search(root, q, back) {
    const set = root.querySelector('.set'); q = q.trim().toLowerCase();
    set.classList.toggle('finding', !!q);
    if (!q) { root.querySelectorAll('.set-sec .row, .set-sec > label, .set-sec .row2 > label').forEach((x) => { x.hidden = false; }); back(); return; }
    let any = false;
    for (const sec of root.querySelectorAll('.set-sec')) {
      let hit = false;
      for (const x of sec.querySelectorAll('.row, :scope > label, .row2 > label')) { const ok = x.textContent.toLowerCase().includes(q); x.hidden = !ok; hit ||= ok; }
      sec.hidden = !hit; any ||= hit;
    }
    root.querySelector('.set-none').hidden = any;
  }
  function enhance(root, back) {
    rows(root);
    const nav = root.querySelector('.set-tabs');
    if (nav && !nav.querySelector('.set-find')) {
      nav.insertAdjacentHTML('afterbegin', '<input type="search" class="set-find" placeholder="🔍 Find a setting" aria-label="Find a setting">');
      root.querySelector('.set-pages').insertAdjacentHTML('beforeend', '<p class="note set-none" hidden>No setting has those words. Try fewer, or other words.</p>');
      nav.querySelector('.set-find').addEventListener('input', (ev) => search(root, ev.target.value, back));
    }
    for (const b of root.querySelectorAll('.set-tabs button[data-tab]')) if (!b.dataset.ic) { b.dataset.ic = 1; b.insertAdjacentHTML('afterbegin', `<i>${(INFO[b.dataset.tab] || ['⚙'])[0]}</i>`); }
  }
  return { enhance, head, rows };
})();
