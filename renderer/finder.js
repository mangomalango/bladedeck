'use strict';
/* Browse your sources: a clean store-like view of the places you get games from. Pick a source
   along the top, search, and what it finds comes back as a catalogue of cards. Open one to see
   its files and press Install: the file downloads through Bladedeck's own browser (so sites you
   are signed in to work), lands in ~/Games/ROMs/Downloaded, is unpacked if it is an archive, and
   joins the library. If a site wants a captcha, its page appears right there for you to solve,
   and the results come in once you have.
   Sources: the Internet Archive (its own search, built in) and every website you added in
   Sources. For a website, Bladedeck finds its search box by itself; a search address with {q} in
   it (Sources, the site's ✎) is used instead when you give one. Bladedeck lists no sites of its own
   beyond the Archive: you bring the places, it makes them easy to use.
   Also here: WebDl, the downloads from every Bladedeck browser view (progress bars in the browser
   panel and here, a notice when one finishes, and the notification center's list).
   Uses S, api, esc, save, toast, Sound, Panels, PadNav, OSK, Watch and $ at call time. */

const WebDl = (() => {
  let list = [];
  const mb = (n) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(0, Math.round(n / 1024))} KB`);
  const pct = (d) => (d.total ? Math.min(100, Math.round(100 * d.got / d.total)) : 0);
  const busy = (d) => d.state === 'progressing' || d.state === 'unpacking';
  window.bladedeck.onWebDl?.((l) => { list = l || []; draw(); });
  window.bladedeck.onWebDlStart?.((d) => toast(`Downloading ${d.name}${d.from ? ` from ${d.from}` : ''}.`));
  window.bladedeck.onWebDlDone?.((d) => {
    if (d.unpacked) { toast(`${d.title || d.name} is unpacked and joining your library.`, 'fun'); Watch.catchUp?.(); return; }
    toast(`${d.name} finished downloading${d.state === 'unpacking' ? ', unpacking…' : '.'}`, 'fun');
  });
  window.bladedeck.webDlList?.().then((l) => { list = l || []; draw(); }).catch(() => {});

  // One row: name, bar, how far, and what you can do with it.
  function row(d) {
    const state = d.state === 'unpacking' ? 'Unpacking…' : d.state === 'completed' ? (d.unpacked ? 'Installed' : 'Done') : d.state === 'cancelled' ? 'Cancelled' : d.state === 'interrupted' ? 'Stopped' : d.paused ? 'Paused' : d.speed ? `${mb(d.speed)}/s` : 'Starting…';
    const acts = busy(d) && d.state !== 'unpacking' ? `<button type="button" data-dl="${d.paused ? 'resume' : 'pause'}" data-id="${d.id}">${d.paused ? '▶' : '⏸'}</button><button type="button" data-dl="cancel" data-id="${d.id}" aria-label="Cancel">✕</button>`
      : d.state === 'completed' ? `<button type="button" data-dl="show" data-id="${d.id}">Show</button><button type="button" data-dl="forget" data-id="${d.id}" aria-label="Clear">✕</button>` : `<button type="button" data-dl="forget" data-id="${d.id}" aria-label="Clear">✕</button>`;
    return `<div class="wd-row ${esc(d.state)}"><div class="wd-t"><b>${esc(d.name)}</b><small>${esc(state)} · ${mb(d.got)}${d.total ? ` of ${mb(d.total)}` : ''}</small></div>
      <i class="wd-bar"><b style="width:${d.state === 'completed' ? 100 : pct(d)}%"></b></i><div class="wd-acts">${acts}</div></div>`;
  }
  // Every download bar on screen: the browser panels' and Browse's. Finished ones show for a minute.
  function draw() {
    const now = list.filter((d) => busy(d) || Date.now() - d.at < 3600000).filter((d) => busy(d) || d.state === 'completed' || d.state === 'interrupted').slice(-4);
    for (const bar of document.querySelectorAll('.fw-dl')) {
      bar.hidden = !now.some(busy) && !now.length;
      bar.innerHTML = now.map(row).join('');
    }
  }
  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-dl]'); if (!b) return;
    const d = list.find((x) => x.id === b.dataset.id); if (!d) return;
    if (b.dataset.dl === 'show') { Panels.show({ kind: 'files', key: 'files', title: 'Files', icon: '🗂', path: d.unpacked || d.dir }); return; }
    await api.webDlAct(d.id, b.dataset.dl);
  });
  // For the notification center and the quick menu.
  const downloads = () => list.filter(busy).map((d) => ({ name: d.name, pct: pct(d), from: d.from || 'Browser' }));
  return { draw, downloads, list: () => list.slice() };
})();

const Finder = (() => {
  const st = () => S.lib.settings;
  const IA = { id: 'ia', label: 'Internet Archive', icon: '🏛', where: 'https://archive.org' };
  let src = null, q = '', items = [], item = null, mode = 'grid', busyMsg = '', panel = null, scrapeFor = null;
  const sites = () => (st().sources || []).filter((s) => s.kind === 'link');
  const allSources = () => [IA, ...sites().map((s) => ({ id: s.id, label: s.label, icon: s.cat === 'emus' ? '◉' : s.cat === 'bios' ? '🧩' : '🌐', where: s.where, search: s.search || '', s }))];
  const FILE = /\.(zip|7z|rar|iso|chd|cso|rvz|wbfs|gcz|wua|wux|nsp|xci|nds|3ds|cia|gba|gbc|gb|nes|sfc|smc|n64|z64|v64|md|gen|cue|bin|pbp|m3u|apk|exe|msi|appimage|tar\.gz|tar\.xz|wad|xex|elf|vpk)(\?|$)/i;
  const size = (n) => (!n ? '' : n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1048576))} MB`);

  function open(sourceId) {
    if (sourceId) src = allSources().find((x) => x.id === sourceId) || null;
    if (!src) src = allSources().find((x) => x.id === st().finderSource) || IA;
    panel = Panels.show({ kind: 'finder', key: 'finder', title: 'Browse your sources', icon: '🔎' });
  }

  /* -------------------------------------------------------------- the panel */
  function mount(p) {
    panel = p;
    p.body.innerHTML = `<div class="fd">
      <div class="fd-top"><input class="fd-q" type="search" placeholder="Search" aria-label="Search"><button type="button" class="fd-go" data-fd="go">Search</button></div>
      <nav class="fd-src"></nav>
      <div class="fd-main"><div class="fd-grid"></div>
        <div class="fd-web" hidden><p class="fd-why"></p></div></div>
      <div class="fw-dl fd-dlbar" hidden></div></div>`;
    p.wv = null; // the panel's own browser view is made when a website source needs it
    const input = $('.fd-q', p.body);
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); run(input.value); } });
    p.body.addEventListener('click', (ev) => click(ev));
    chips(); grid(); WebDl.draw();
    if (q) input.value = q;
  }
  function chips() {
    const nav = $('.fd-src', panel.body);
    nav.innerHTML = allSources().map((x) => `<button type="button" class="fd-chip ${x.id === src?.id ? 'on' : ''}" data-src="${esc(x.id)}">${x.icon} ${esc(x.label)}</button>`).join('')
      + '<button type="button" class="fd-chip add" data-fd="sources">＋ Add a source</button>';
    $('.fd-q', panel.body).placeholder = `Search ${src?.label || ''}`;
  }
  function grid() {
    const g = $('.fd-grid', panel.body); if (!g) return;
    if (busyMsg) { g.innerHTML = `<p class="fd-note">${esc(busyMsg)}</p>`; return; }
    if (mode === 'item' && item) { g.innerHTML = itemHtml(); mark(); return; }
    g.innerHTML = items.length
      ? `<div class="fd-cards">${items.map((it, i) => `<button type="button" class="fd-card" data-i="${i}"><span class="fd-img">${it.img ? `<img src="${esc(it.img)}" loading="lazy" alt="" referrerpolicy="no-referrer">` : '<i>🎮</i>'}</span><b>${esc(it.title)}</b><small>${esc([it.sub, size(it.size)].filter(Boolean).join(' · '))}</small></button>`).join('')}</div>`
      : `<div class="fd-empty"><b>${q ? 'Nothing found.' : `Search ${esc(src?.label || 'a source')}`}</b><p>${q ? 'Try other words, or another source.' : src?.id === 'ia' ? 'The Internet Archive holds old software, shareware, homebrew and manuals. Sign in once in the browser and items that need an account download too.' : 'Type what you are looking for. Bladedeck searches the site and shows what it finds here.'}</p></div>`;
    mark();
  }
  function itemHtml() {
    const it = item;
    const files = it.files || [];
    return `<div class="fd-item"><button type="button" class="fd-back" data-fd="back">‹ Results</button>
      <div class="fd-ihead">${it.img ? `<img src="${esc(it.img)}" alt="" referrerpolicy="no-referrer">` : ''}<div><h3>${esc(it.title)}</h3><p>${esc(it.sub || it.desc || '')}</p>
        <div class="fd-iacts"><button type="button" data-fd="page">Open its page</button>${it.restricted ? '<span class="fd-warn">This item needs you signed in to the Archive: Open its page and sign in.</span>' : ''}</div></div></div>
      ${it.loading ? '<p class="fd-note">Looking at its files…</p>' : files.length ? `<div class="fd-files">${files.map((f, i) => `<div class="fd-file"><div><b>${esc(f.name)}</b><small>${esc([f.format, size(f.size)].filter(Boolean).join(' · '))}</small></div>${f.file === false ? `<button type="button" data-go="${i}">Go</button>` : `<button type="button" class="primary" data-get="${i}">Install</button>`}</div>`).join('')}</div>`
        : '<p class="fd-note">No downloads were found on this page. Open its page and download from there: Bladedeck catches the download.</p>'}</div>`;
  }
  const mark = () => { if (S.pad && panel?.el.classList.contains('focus')) { const f = $('.fd-card, .fd-file button, .fd-back', panel.body) || $('.fd-chip.on', panel.body); if (f && !panel.body.querySelector('.pad-hl')) PadNav.mark(f); } };

  async function click(ev) {
    const t = ev.target.closest('button'); if (!t) return;
    if (t.dataset.src) { src = allSources().find((x) => x.id === t.dataset.src) || IA; st().finderSource = src.id; save(); items = []; item = null; mode = 'grid'; chips(); hideWeb(); if (q) run(q); else grid(); return; }
    if (t.dataset.fd === 'go') { const i = $('.fd-q', panel.body); if (S.pad && !i.value) { OSK.open(i); return; } run(i.value); return; }
    if (t.dataset.fd === 'sources') { Roms.sources('roms'); return; }
    if (t.dataset.fd === 'back') { mode = 'grid'; item = null; hideWeb(); grid(); Sound.play('back'); return; }
    if (t.dataset.fd === 'page') { if (item) showWeb(item.url, ''); return; }
    if (t.dataset.fd === 'hideweb') { hideWeb(); return; }
    if (t.dataset.i) { openItem(items[+t.dataset.i]); return; }
    if (t.dataset.get) { install(item.files[+t.dataset.get], t); return; }
    if (t.dataset.go) { showWeb(item.files[+t.dataset.go].url, ''); return; }
  }

  /* -------------------------------------------------------------- searching */
  async function run(text) {
    q = String(text || '').trim(); if (!q) return;
    mode = 'grid'; item = null; items = []; busyMsg = `Searching ${src.label}…`; grid(); hideWeb();
    Sound.play('tick');
    if (src.id === 'ia') {
      const r = await api.finderIa({ q, software: true });
      busyMsg = ''; items = r.ok ? r.data.items : []; if (!r.ok) toast(r.error, 'err'); grid(); return;
    }
    const tpl = src.search || await findSearch(src);
    if (!tpl) { busyMsg = ''; grid(); toast(`Bladedeck could not find ${src.label}'s search box. Give its search address in Sources (✎ on the site).`, 'err'); return; }
    scrape(tpl.replace('{q}', encodeURIComponent(q)), 'results');
  }

  /* A website is read in the panel's own browser view, which stays hidden unless the site needs
     you (a captcha, a sign-in) or you open a page. */
  function webview() {
    if (panel.wv) return panel.wv;
    const wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:webapps');
    wv.setAttribute('src', 'about:blank');
    wv.addEventListener('did-stop-loading', () => { if (scrapeFor) setTimeout(() => readPage(), 600); });
    $('.fd-web', panel.body).appendChild(wv);
    panel.wv = wv;
    return wv;
  }
  async function load(url) {
    const wv = webview();
    if (/^http:\/\//i.test(url)) await api.webAllow?.(new URL(url).origin);
    try { wv.loadURL(url); } catch { wv.setAttribute('src', url); }
  }
  function showWeb(url, why) {
    const box = $('.fd-web', panel.body);
    box.hidden = false; panel.body.querySelector('.fd').classList.add('web');
    $('.fd-why', box).innerHTML = `${esc(why || 'The page itself. Downloads you start here show in the bar below.')} <button type="button" data-fd="hideweb">Back to the catalogue</button>`;
    if (url) { scrapeFor = null; load(url); if (item) api.webDlExpect({ url, title: item.title }); }
    setTimeout(() => panel.wv?.focus(), 80);
  }
  function hideWeb() {
    const box = $('.fd-web', panel?.body || document); if (!box) return;
    box.hidden = true; panel.body.querySelector('.fd').classList.remove('web');
  }

  const DETECT = `(() => {
    const inp = document.querySelector('input[type=search], input[name=q], input[name=s], input[name=search], input[name=query], input[name=keyword], input[name=keywords], input[name=term]');
    if (!inp || !inp.name) return null;
    const f = inp.form;
    if (f && (f.getAttribute('method') || 'get').toLowerCase() === 'post') return null;
    const act = new URL((f && f.getAttribute('action')) || location.pathname, location.href);
    const p = new URLSearchParams();
    if (f) for (const el of f.elements) if (el.name && el !== inp && el.type === 'hidden') p.set(el.name, el.value);
    p.set(inp.name, '__Q__');
    return act.origin + act.pathname + '?' + p.toString().replace('__Q__', '{q}');
  })()`;
  const CAPTCHA = `(() => {
    const t = (document.title + ' ' + ((document.body && document.body.innerText) || '').slice(0, 4000)).toLowerCase();
    const fr = [...document.querySelectorAll('iframe')].map((f) => f.src || '').join(' ');
    return /just a moment|verify you are human|checking your browser|are you a robot|attention required|complete the security check|press and hold/.test(t)
      || /challenges\\.cloudflare|hcaptcha|recaptcha|turnstile|captcha-delivery/.test(fr)
      || !!document.querySelector('#challenge-form, #challenge-running, .cf-turnstile, .g-recaptcha, .h-captcha, #px-captcha');
  })()`;
  const RESULTS = `(() => {
    const out = new Map(), base = location.origin, here = location.href.split('#')[0];
    let n = 0;
    for (const a of document.querySelectorAll('a[href]')) {
      let u; try { u = new URL(a.href); } catch { continue; }
      if (u.origin !== base || u.pathname === '/' || u.href.split('#')[0] === here) continue;
      if (a.closest('header, footer, nav, [role=navigation], .pagination, .pager, .menu, .navbar, .breadcrumb, .sidebar, #sidebar, .widget')) continue;
      const card = a.closest('article, li, tr, .card, .item, .post, .result, .entry, .game, .product, .grid-item');
      const img = a.querySelector('img') || (card && card.querySelector('img'));
      let title = (a.getAttribute('title') || a.innerText || (img && img.alt) || '').replace(/\\s+/g, ' ').trim();
      if (title.length < 3 || title.length > 160 || /^(next|prev(ious)?|home|log ?in|sign (in|up)|register|more|read more|page \\d+|\\d+|«|»|‹|›)$/i.test(title)) continue;
      const score = (img ? 3 : 0) + (card ? 2 : 0) + Math.min(3, title.length / 18) + Math.min(2, u.pathname.split('/').filter(Boolean).length * 0.4);
      const key = u.href.split('#')[0], old = out.get(key);
      const pic = img ? (img.currentSrc || img.src || img.getAttribute('data-src') || '') : '';
      if (!old) out.set(key, { url: key, title, img: pic, score, at: n++ });
      else { if (title.length > old.title.length && title.length < 120) old.title = title; if (!old.img && pic) old.img = pic; old.score = Math.max(old.score, score); }
    }
    let l = [...out.values()];
    const good = l.filter((x) => x.score >= 4.5);
    l = (good.length >= 3 ? good : l.sort((a, b) => b.score - a.score).slice(0, 30)).sort((a, b) => a.at - b.at).slice(0, 60);
    return l.map(({ url, title, img }) => ({ url, title, img: /^https?:/.test(img) ? img : '' }));
  })()`;
  const FILES = `(() => {
    const EXT = ${FILE.toString()};
    const out = new Map();
    for (const a of document.querySelectorAll('a[href]')) {
      let u; try { u = new URL(a.href); } catch { continue; }
      if (!/^https?:$/.test(u.protocol)) continue;
      const text = (a.innerText || a.getAttribute('title') || '').replace(/\\s+/g, ' ').trim();
      const isFile = EXT.test(u.pathname) || a.hasAttribute('download');
      if (!isFile && !/download/i.test(text + ' ' + u.pathname)) continue;
      const name = isFile ? decodeURIComponent(u.pathname.split('/').pop()) : (text || 'Download page').slice(0, 100);
      if (!out.has(u.href)) out.set(u.href, { name, url: u.href, file: isFile, format: isFile ? (u.pathname.match(/\\.([\\w.]+)$/) || [, ''])[1].toUpperCase() : 'Page' });
    }
    const og = document.querySelector('meta[property="og:image"]'), d = document.querySelector('meta[name=description], meta[property="og:description"]');
    return { files: [...out.values()].sort((a, b) => (b.file ? 1 : 0) - (a.file ? 1 : 0)).slice(0, 80), img: og ? og.content : '', desc: d ? d.content.slice(0, 300) : '', title: document.title };
  })()`;

  // A site's search address, from the search box on its front page; remembered for next time.
  function findSearch(s) {
    return new Promise((res) => {
      scrapeFor = { kind: 'detect', s, res };
      busyMsg = `Finding ${s.label}'s search…`; grid();
      load(s.where);
      setTimeout(() => { if (scrapeFor?.kind === 'detect' && scrapeFor.s === s) { scrapeFor = null; res(null); } }, 25000);
    });
  }
  function scrape(url, kind) { scrapeFor = { kind, url }; load(url); setTimeout(() => { if (scrapeFor?.url === url && busyMsg) { busyMsg = ''; grid(); } }, 30000); }

  async function readPage() {
    const job = scrapeFor; if (!job || !panel?.wv) return;
    let captcha = false; try { captcha = await panel.wv.executeJavaScript(CAPTCHA); } catch { return; }
    if (captcha) { showWeb('', `${src.label} wants to check that you are a person. Do it here, and Bladedeck carries on by itself.`); return; }
    if (job.kind === 'detect') {
      const tpl = await panel.wv.executeJavaScript(DETECT).catch(() => null);
      const guess = tpl || `${new URL(job.s.where).origin}/?s={q}`;
      scrapeFor = null;
      if (job.s.s) { job.s.s.search = guess; save(); }
      job.res(guess); return;
    }
    if (job.kind === 'results') {
      const l = await panel.wv.executeJavaScript(RESULTS).catch(() => []);
      scrapeFor = null; hideWeb(); busyMsg = ''; items = l || []; grid(); return;
    }
    if (job.kind === 'item') {
      const r = await panel.wv.executeJavaScript(FILES).catch(() => null);
      scrapeFor = null; hideWeb();
      if (item && item.url === job.url) { Object.assign(item, { files: r?.files || [], img: item.img || r?.img || '', desc: r?.desc || '', loading: false }); grid(); }
    }
  }

  async function openItem(it) {
    if (!it) return;
    item = { ...it, files: [], loading: true }; mode = 'item'; grid(); Sound.play('tick');
    if (src.id === 'ia') {
      const r = await api.finderIa({ files: it.id });
      if (item?.id !== it.id) return;
      Object.assign(item, { loading: false, files: r.ok ? r.data.files.filter((f) => !/\.(jpe?g|png|gif|txt|nfo|xml|sqlite|torrent)$/i.test(f.name)) : [], restricted: r.ok && r.data.restricted });
      if (!r.ok) toast(r.error, 'err');
      grid(); return;
    }
    scrape(it.url, 'item');
  }

  async function install(f, btn) {
    if (!f) return;
    btn.disabled = true; btn.textContent = 'Starting…';
    // ~/Games/ROMs/Downloaded is in the library's watched folders, so what lands there joins it.
    const dir = await api.webDlRoms();
    const w = (st().watch = st().watch || { on: true, dirs: [] });
    if (!w.dirs.some((d) => dir === d || dir.startsWith(d + '/') || dir.startsWith(d + '\\'))) { w.dirs.push(dir); w.on = true; save(); Watch.apply?.(); }
    const r = await api.webDlStart({ url: f.url, kind: 'game', title: item?.title || f.name });
    if (!r.ok) { toast(r.error, 'err'); btn.disabled = false; btn.textContent = 'Install'; return; }
    btn.textContent = 'Downloading';
    Sound.play('go');
  }

  function focus(p) { mark(); if (!S.pad) $('.fd-q', p.body)?.focus(); }
  function handle(p, a) {
    const web = !$('.fd-web', p.body).hidden;
    if (a === 'b') { if (web) hideWeb(); else if (mode === 'item') { mode = 'grid'; item = null; grid(); } else Panels.leave(); Sound.play('back'); return true; }
    if (a === 'y') { const i = $('.fd-q', p.body); PadNav.mark(i); OSK.open(i); return true; }
    if (a === 'lb' || a === 'rb') { const l = allSources(), k = l.findIndex((x) => x.id === src?.id); src = l[(k + (a === 'rb' ? 1 : l.length - 1)) % l.length]; st().finderSource = src.id; chips(); items = []; item = null; mode = 'grid'; if (q) run(q); else grid(); Sound.play('tick'); return true; }
    if (a === 'lt' || a === 'rt' || a === 'music' || a === 'vol' || a === 'guide') return false;
    return PadNav.input(p.body, a) || true;
  }
  return { open, mount, focus, handle, run };
})();
