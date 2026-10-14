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
    if (d.note) { toast(`${d.name}: ${d.note}`, 'err'); return; }
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
  // Any website: the search bar is an address bar, and whatever page it opens becomes a catalogue.
  const WEB = { id: 'web', label: 'Any website', icon: '🌐', where: '' };
  let src = null, q = '', items = [], item = null, mode = 'grid', busyMsg = '', panel = null, scrapeFor = null, next = '', loadingMore = false;
  const looksLikeUrl = (t) => /^https?:\/\//i.test(t) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t);
  const toUrl = (t) => (/^https?:\/\//i.test(t) ? t : `https://${t}`);
  const sites = () => (st().sources || []).filter((s) => s.kind === 'link');
  const allSources = () => [IA, WEB, ...sites().map((s) => ({ id: s.id, label: s.label, icon: s.cat === 'emus' ? '◉' : s.cat === 'bios' ? '🧩' : '🌐', where: s.where, search: s.search || '', s }))];
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
    if (!src) src = allSources().find((x) => x.id === st().finderSource) || IA;
    p.body.innerHTML = `<div class="fd">
      <div class="fd-top"><input class="fd-q" type="search" placeholder="Search" aria-label="Search"><button type="button" class="fd-go" data-fd="go">Search</button></div>
      <nav class="fd-src"></nav>
      <div class="fd-main"><div class="fd-grid"></div>
        <div class="fd-web" hidden><p class="fd-why"></p></div></div>
      <div class="fw-dl fd-dlbar" hidden></div></div>`;
    p.wv = null; // the panel's own browser view is made when a website source needs it
    const input = $('.fd-q', p.body);
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); run(input.value); } });
    // The next page of a website's catalogue loads as you near the bottom: no page buttons to find.
    $('.fd-grid', p.body).addEventListener('scroll', (ev) => { const g = ev.currentTarget; if (next && !loadingMore && mode === 'grid' && g.scrollTop + g.clientHeight > g.scrollHeight - 400) more(); }, { passive: true });
    p.body.addEventListener('click', (ev) => click(ev));
    chips(); grid(); WebDl.draw();
    if (q) input.value = q;
  }
  function chips() {
    const nav = $('.fd-src', panel.body);
    nav.innerHTML = allSources().map((x) => `<button type="button" class="fd-chip ${x.id === src?.id ? 'on' : ''}" data-src="${esc(x.id)}">${x.icon} ${esc(x.label)}</button>`).join('')
      + '<button type="button" class="fd-chip add" data-fd="sources">＋ Add a source</button>';
    $('.fd-q', panel.body).placeholder = src?.id === 'web' ? 'Type any address, like example.com/games' : `Search ${src?.label || ''}, or press Search to browse it`;
  }
  function grid() {
    const g = $('.fd-grid', panel.body); if (!g) return;
    if (busyMsg) { g.innerHTML = `<p class="fd-note">${esc(busyMsg)}</p>`; return; }
    if (mode === 'item' && item) { g.innerHTML = itemHtml(); mark(); return; }
    g.innerHTML = items.length
      ? `<div class="fd-cards">${items.map((it, i) => `<button type="button" class="fd-card" data-i="${i}"><span class="fd-img">${it.img ? `<img src="${esc(it.img)}" loading="lazy" alt="" referrerpolicy="no-referrer">` : '<i>🎮</i>'}</span><b>${esc(it.title)}</b><small>${esc([it.sub, size(it.size)].filter(Boolean).join(' · '))}</small></button>`).join('')}</div>`
      : `<div class="fd-empty"><b>${q ? 'Nothing found.' : src?.id === 'web' ? 'Open any website' : `Search ${esc(src?.label || 'a source')}`}</b><p>${q ? 'Try other words, or another source. A page made of games (a catalogue, a list, search results) works best.' : src?.id === 'ia' ? 'The Internet Archive holds old software, shareware, homebrew and manuals. Sign in once in the browser and items that need an account download too.' : src?.id === 'web' ? 'Type the address of any page that lists games. Bladedeck turns what is on it into cards, finds the download links on each one, blocks ads and pop-ups, and loads the next page as you scroll.' : 'Type what you are looking for, or press Search with nothing typed to browse the site\'s front page.'}</p></div>`;
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
    if (t.dataset.fd === 'go') { const i = $('.fd-q', panel.body); if (S.pad && !i.value && src?.id !== 'web' && src?.id !== 'ia') { run(''); return; } if (S.pad && !i.value) { OSK.open(i); return; } run(i.value); return; }
    if (t.dataset.fd === 'more') { more(); return; }
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
    q = String(text || '').trim();
    // An address typed anywhere opens that page as a catalogue.
    if (q && looksLikeUrl(q) && src.id !== 'ia') { openPage(toUrl(q)); return; }
    // A website with nothing typed: its front page.
    if (!q && src.id !== 'ia' && src.id !== 'web') { openPage(src.where); return; }
    if (!q) return;
    if (src.id === 'web') { openPage(`https://duckduckgo.com/html/?q=${encodeURIComponent(q + ' games')}`); return; }
    mode = 'grid'; item = null; items = []; next = ''; busyMsg = `Searching ${src.label}…`; grid(); hideWeb();
    Sound.play('tick');
    if (src.id === 'ia') {
      const r = await api.finderIa({ q, software: true });
      busyMsg = ''; items = r.ok ? r.data.items : []; if (!r.ok) toast(r.error, 'err'); grid(); return;
    }
    const tpl = src.search || await findSearch(src);
    if (!tpl) { busyMsg = ''; grid(); toast(`Bladedeck could not find ${src.label}'s search box. Give its search address in Sources (✎ on the site).`, 'err'); return; }
    scrape(tpl.replace('{q}', encodeURIComponent(q)), 'results');
  }
  function openPage(url) {
    mode = 'grid'; item = null; items = []; next = '';
    let host = url; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* as typed */ }
    busyMsg = `Opening ${host}…`; grid(); hideWeb(); Sound.play('tick');
    const i = $('.fd-q', panel.body); if (i && src.id === 'web') i.value = url;
    scrape(url, 'results');
  }
  // The next page of results, added below what is there.
  function more() {
    if (!next || loadingMore) return;
    loadingMore = true; const url = next; next = '';
    const g = $('.fd-grid', panel.body); g.insertAdjacentHTML('beforeend', '<p class="fd-note fd-more">Loading more…</p>');
    scrapeFor = { kind: 'results', url, append: true }; load(url);
    setTimeout(() => { if (loadingMore && scrapeFor?.url === url) { loadingMore = false; $('.fd-more', panel.body)?.remove(); } }, 30000);
  }

  /* A website is read in the panel's own browser view, which stays hidden unless the site needs
     you (a captcha, a sign-in) or you open a page. */
  function webview(first) {
    if (panel.wv) return panel.wv;
    const wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:webapps');
    wv.setAttribute('src', first || 'about:blank');
    wv.addEventListener('dom-ready', () => { wv.__ready = true; }, { once: true });
    wv.addEventListener('did-stop-loading', () => { if (scrapeFor) setTimeout(() => readPage(), 600); });
    $('.fd-web', panel.body).appendChild(wv);
    panel.wv = wv;
    return wv;
  }
  async function load(url) {
    if (/^http:\/\//i.test(url)) await api.webAllow?.(new URL(url).origin);
    // A new view starts straight on the page; one already open goes to it.
    if (!panel.wv) { webview(url); return; }
    const wv = panel.wv;
    if (!wv.__ready) { wv.setAttribute('src', url); return; }
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
    const out = new Map(), here = location.href.split('#')[0];
    // The whole site counts, subdomains too (itch.io's games live on name.itch.io).
    const site = (h) => h.replace(/^www\\./, '').split('.').slice(-2).join('.');
    const base = site(location.hostname);
    const CARD = 'article, li, tr, [class*=game], [class*=card], [class*=item], [class*=post], [class*=product], [class*=result], [class*=tile], [class*=entry], [class*=cell], [class*=thumb]';
    // A picture, however the page loads it (lazy attributes, a CSS background).
    const picOf = (el) => {
      if (!el) return '';
      const im = el.querySelector('img');
      const src = im && (im.currentSrc || im.getAttribute('src') || im.getAttribute('data-src') || im.getAttribute('data-lazy_src') || im.getAttribute('data-original') || im.getAttribute('data-lazy-src') || '');
      if (src && !/^data:/.test(src)) return new URL(src, location.href).href;
      const bg = [el, ...el.querySelectorAll('[style*=background]')].map((x) => (x.getAttribute('style') || '').match(/url\\(["']?([^"')]+)/)).find(Boolean);
      return bg ? new URL(bg[1], location.href).href : '';
    };
    let n = 0;
    for (const a of document.querySelectorAll('a[href]')) {
      let u; try { u = new URL(a.href); } catch { continue; }
      if (site(u.hostname) !== base || u.pathname === '/' || u.pathname === '' || u.href.split('#')[0] === here) continue;
      if (a.closest('header, footer, nav, [role=navigation], .pagination, .pager, .menu, .navbar, .breadcrumb, aside, .sidebar, #sidebar, form, [class*=author], [class*=byline], [class*=user], [class*=tools]')) continue;
      // Exclude lists of short category words (filters, tags) that have no pictures.
      const list = a.closest('ul, ol');
      if (list) {
        const lis = list.querySelectorAll(':scope > li');
        if (lis.length >= 3 && !list.querySelector('img, [style*=background]')) {
          const avgLen = [...lis].reduce((acc, li) => acc + (li.innerText || '').trim().length, 0) / lis.length;
          if (avgLen < 40) continue;
        }
      }
      // Look for the card from a.parentElement, preferring the nearest ancestor that holds a picture.
      let card = null, withPic = null, cur = a.parentElement;
      while (cur && cur !== document.body) {
        const c = cur.closest(CARD);
        if (!c || c.querySelectorAll('a[href]').length > 12) break;
        if (!card) card = c;
        if (picOf(c)) { withPic = c; break; }
        cur = c.parentElement;
      }
      card = withPic || card;
      const head = card && card.querySelector('h1, h2, h3, h4, h5, .title, [class*=title], [class*=name]');
      let title = ((head && head.innerText) || a.getAttribute('title') || a.innerText || (card && card.querySelector('img') || {}).alt || '').replace(/\\s+/g, ' ').trim();
      title = title.replace(/\\s*[:|–-]\\s*(screenshot|cover|thumbnail|image|logo)\\b.*$/i, '');
      if (title.length < 2 || title.length > 160 || /^(next|prev(ious)?|home|log ?in|sign (in|up)|register|more|read more|page \\d+|\\d+|«|»|‹|›)$/i.test(title)) continue;
      const sig = card ? card.tagName + '.' + [...card.classList].filter((c) => !/\\d/.test(c)).sort().join('.') : '';
      const key = u.href.split('#')[0], pic = picOf(card || a), old = out.get(key);
      if (!old) out.set(key, { url: key, title, img: pic, sig, at: n++ });
      else { if (!old.img && pic) old.img = pic; if (title.length > old.title.length && title.length < 120 && !old.headed) old.title = title; if (!old.sig && sig) old.sig = sig; }
      if (head && out.get(key)) out.get(key).headed = true;
    }
    let all = [...out.values()];
    // The catalogue is the box shape repeated most, with pictures: that is how lists of games look.
    const groups = new Map();
    for (const x of all) if (x.sig) { const g = groups.get(x.sig) || { n: 0, pics: 0 }; g.n++; if (x.img) g.pics++; groups.set(x.sig, g); }
    const best = [...groups.entries()].map(([sig, g]) => [sig, g.n * (0.4 + g.pics / g.n)]).sort((a, b) => b[1] - a[1])[0];
    let l = best && groups.get(best[0]).n >= 3 ? all.filter((x) => x.sig === best[0]) : all.filter((x) => x.img).concat(all.filter((x) => !x.img)).slice(0, 40);
    l = l.sort((a, b) => a.at - b.at).slice(0, 80);
    // The next page: rel=next, or a link that says Next / › / », or the page number after this one.
    let nx = (document.querySelector('link[rel=next], a[rel=next]') || {}).href || '';
    if (!nx) { const a = [...document.querySelectorAll('a[href]')].find((x) => /^(next|next page|older|more|load more|›|»|>|→)$/i.test((x.innerText || x.getAttribute('aria-label') || '').trim())); nx = a ? a.href : ''; }
    if (!nx) { const cur = document.querySelector('.pagination .active, .pagination .current, [aria-current=page], .page-numbers.current'); const n = cur && parseInt(cur.innerText, 10); if (n) { const a = [...document.querySelectorAll('a[href]')].find((x) => x.innerText.trim() === String(n + 1)); nx = a ? a.href : ''; } }
    return { items: l.map(({ url, title, img }) => ({ url, title, img: /^https?:/.test(img) ? img : '' })), next: nx && nx !== location.href ? nx : '' };
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
    // Its first moment is a blank page: wait for the real one.
    let at = ''; try { at = panel.wv.getURL(); } catch { return; }
    if (!at || at === 'about:blank') return;
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
      const r = await panel.wv.executeJavaScript(RESULTS).catch(() => ({ items: [], next: '' }));
      scrapeFor = null; hideWeb(); busyMsg = '';
      const fresh = (r.items || []).filter((x) => !items.some((y) => y.url === x.url));
      items = job.append ? [...items, ...fresh] : r.items || [];
      next = fresh.length ? r.next || '' : '';
      loadingMore = false;
      const g = $('.fd-grid', panel.body), keep = g ? g.scrollTop : 0;
      grid(); if (job.append && g) g.scrollTop = keep;
      return;
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
