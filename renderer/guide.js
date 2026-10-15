'use strict';
/* Guide: a flap tucked into one edge of the screen for quick questions. "How do I beat this
   boss", "best build", "why does it stutter", or how Bladedeck itself works. It is not a blade:
   it hides behind a little pull pane until you want it.

   With a controller you pull it out. Hold the trigger to grab the pane (the controller hums),
   then push the stick the way the flap opens. It follows the stick, the hum grows, and past the
   halfway mark it snaps open with a thunk. Let go too early and it falls shut. A quick tap of the
   trigger still skips songs. With a mouse you drag the pane, or click it. G works on a keyboard.

   Answers come from Bladedeck's own tips, the game's Fandom wiki, StrategyWiki, PCGamingWiki and
   ProtonDB (online.js), with YouTube, Reddit and Steam guides a press away in the browser.
   Uses S, api, esc, save, toast, Sound, Dock and $ at call time. */

const GUIDE_TIPS = [
  ['Getting around', 'move menu blade controls keys buttons', 'Left and right move between blades, up and down pick a game, A launches. LB and RB jump a blade at a time. Back swaps between console and PC mode. F1 or ? lists every control.'],
  ['Jump out of a game and back', 'ctrl m peek back return leave switch alt pane', 'Press View and Menu together (or Ctrl+M) while playing. The game shrinks into a panel on the left. Press them again, or push left onto the panel and press A, to jump straight back in.'],
  ['See the game live', 'live view preview stream window capture', 'Highlight the game panel and press X (or click "Show live view"). On KDE, pick the game window in the box that appears. It keeps showing until you go back in.'],
  ['The dock', 'dock youtube music spotify apple discord files apps', 'The round buttons on the left open your everyday apps. One press opens an app, brings it up, or tucks it away; X minimizes and Y closes. Pick your own apps, and the browser for websites, with the ⋯ button.'],
  ['Use this guide', 'guide flap help search question trigger pull', 'Hold the trigger, then push the stick the way the flap opens. Ask about the game that is highlighted, or tap a topic. B goes back, and B again closes it. Change the side and the trigger in Settings, Guide.'],
  ['Change the theme', 'theme look colors bubbles aquarium aero game', 'Settings, Theme. Sky Bubbles lets you pop bubbles. Aero Aquarium has fish that grow from flakes you earn by playing. Game takes its colors and background from the game you have highlighted.'],
  ['Grow your fish', 'fish aquarium flakes baby feed name', 'Every 5 minutes of play earns a flake. Click the water, or System, Aquarium, Feed. A fish grows up after 10 flakes, then has a baby every 8 more, and you get to name it.'],
  ['Get cover art', 'art artwork cover picture background logo steamgriddb', 'Edit a game (Y) and choose Artwork. Steam games get Steam\'s own art for free. Add a SteamGridDB key in Settings, Accounts for art for anything, then System, Find missing art fills in your whole library.'],
  ['Achievements', 'retroachievements achievements trophies emulator', 'Add your RetroAchievements name and web API key in Settings, Accounts. Emulated games then show your progress; press R or click the left stick to see the list.'],
  ['Games start slowly', 'slow start stutter shader compile cache faster loading', 'Bladedeck starts Steam quietly when it opens, so Steam games skip Steam\'s own start-up. In Steam, Settings, Downloads, turn on Shader Pre-Caching and "Allow background processing of Vulkan shaders" so shaders build while you\'re away.'],
  ['Music', 'music song play pause skip', 'M, or holding the right stick in, plays and pauses (a right-stick click sorts the game lists). Tap LT or RT to skip. Pick the folder in Settings.'],
  ['Change the menu letters and icons', 'font letters icons tabs size look menus', 'System, Look and menus. Pick a font, capitals or small capitals, the size, and whether blade tabs show names, icons, or both.'],
  ['Add a game', 'add game library steam gog emulator rom', 'Drop a game, shortcut or ROM on the window, or use Add in PC mode. Steam and GOG games are found by the buttons in PC mode.'],
  ['Favorites', 'favorite star', 'Press X on a game to star it. Starred games have their own blade.']
];
const GUIDE_TOPICS = [['Beginner tips', 'beginner tips'], ['Bosses', 'bosses'], ['Walkthrough', 'walkthrough'], ['Secrets', 'secrets'], ['Best builds', 'best build'], ['Fixes and settings', 'fix settings performance']];
const PRONOUNCE = { platinum: 'Platinum: runs perfectly', gold: 'Gold: runs great after a tweak or two', silver: 'Silver: runs with some problems', bronze: 'Bronze: runs, but rough', borked: 'Borked: does not run', native: 'Native Linux game' };

const Guide = (() => {
  const el = document.getElementById('flap');
  let pull = 0, isOpen = false, grab = null, view = 'home', results = null, page = null, focusI = 0, last = '', timer = 0, ask = 0;
  /* Two flaps in one place. The guide (hold its trigger and pull, or G) is only the guide. The
     quick menu (hold the other trigger and pull, C, or its own little tab) has music,
     notifications and recordings, with LB / RB between them, without leaving what you are doing. */
  const TABS = [['music', '♪', 'Music'], ['alerts', '🔔', 'Alerts'], ['rec', '⏺', 'Recordings']];
  let pane = 'guide', quickPane = 'music', cap = { available: false }, clips = [], tick = 0;
  const cfg = () => ({ side: 'right', trigger: 'lt', rumble: true, ...(S.lib.settings.guide || {}) });
  const game = () => (S.sel && !S.sel.run && S.sel.title ? S.sel : null);
  // The way the stick, or the mouse, pulls the flap open.
  const OPENS = { right: [-1, 0], left: [1, 0], top: [0, 1], bottom: [0, -1] };

  function set(p) {
    pull = Math.max(0, Math.min(1, p));
    el.style.setProperty('--pull', pull.toFixed(3));
    el.classList.toggle('peek', pull > 0 && !isOpen);
  }
  function layout() { el.dataset.side = cfg().side; }

  function open(how, which) {
    if (which === 'quick') which = quickPane;
    if (which && which !== pane) { if (isOpen) { isOpen = false; set(0); } setTab(which, true); }
    else if (!which && pane !== 'guide') setTab('guide', true);
    if (isOpen) return;
    isOpen = true; layout(); el.classList.add('open'); el.classList.remove('peek', 'grab'); set(1);
    Sound.play('pop'); buzz(0.9, 0.6, 140);
    draw(); focusI = pane === 'guide' ? 1 : 0; mark(); live();
    if (how === 'type') setTimeout(() => $('.gd-q', el)?.focus(), 60);
  }
  function close() {
    if (!isOpen && pull === 0) return;
    clearInterval(tick);
    isOpen = false; el.classList.remove('open', 'grab'); set(0);
    document.activeElement?.closest?.('#flap') && document.activeElement.blur();
    Sound.play('back');
  }
  const toggle = (how, which) => (isOpen && (which === 'quick' ? pane !== 'guide' : pane === 'guide') ? close() : open(how, which));

  /* -------------------------------------------------------------- rumble */
  let pad = null, lastBuzz = 0;
  function buzz(strong, weak, ms) {
    if (!cfg().rumble) return;
    Players.shake(pad, ms, strong, weak);
  }

  /* -------------------------------------------------------------- controller pull
     Called every frame by the gamepad loop. Returns true while the flap owns the stick. */
  function frame(p, now) {
    pad = p;
    const c = cfg(), gi = c.trigger === 'rt' ? 7 : 6, qi = gi === 7 ? 6 : 7;
    const val = (i) => p.buttons[i]?.value ?? (p.buttons[i]?.pressed ? 1 : 0);
    const which = grab ? grab.which : val(gi) > 0.35 ? 'guide' : val(qi) > 0.35 ? 'quick' : null;
    const tv = which === 'quick' ? val(qi) : val(gi);
    const [ox, oy] = OPENS[c.side] || OPENS.right;
    const along = (p.axes[0] || 0) * ox + (p.axes[1] || 0) * oy; // + toward open, - toward the edge
    if (tv > 0.35) {
      if (!grab) grab = { t: now, used: false, which };
      if (now - grab.t < 180) return grab.used;
      grab.used = true;
      el.classList.add('grab'); layout();
      if (isOpen) {
        // Push it back into the edge to shut it.
        if (along < -0.55) close();
        return true;
      }
      el.classList.toggle('quick', which === 'quick');
      const want = Math.max(0.06, along > 0.1 ? along : 0) * Math.min(1, tv / 0.8);
      set(pull + (want - pull) * 0.35);
      if (now - lastBuzz > 90) { lastBuzz = now; buzz(0.12 + pull * 0.6, 0.25 + pull * 0.5, 110); }
      if (pull > 0.62) open('pad', which === 'quick' ? 'quick' : null);
      return true;
    }
    if (grab) {
      const used = grab.used;
      grab = null; el.classList.remove('grab');
      if (!isOpen && pull > 0) { set(0); if (used) Sound.play('back'); }
      frame.tapped = !used; // a quick tap: the caller treats it as the trigger's usual job
      return used;
    }
    return false;
  }
  // Whether the last trigger release was a plain tap and should skip a song.
  const tapped = () => { const t = frame.tapped; frame.tapped = false; return t !== false; };
  const isTrigger = (k) => k === 'lt' || k === 'rt';

  /* -------------------------------------------------------------- mouse */
  const tab = () => $('.gd-tab', el);
  el.addEventListener('pointerdown', (ev) => {
    const tb = ev.target.closest('.gd-tab'); if (!tb) return;
    ev.preventDefault();
    const which = tb.classList.contains('q') ? 'quick' : null;
    if (!isOpen) el.classList.toggle('quick', !!which);
    const [ox, oy] = OPENS[cfg().side] || OPENS.right;
    const size = cfg().side === 'top' || cfg().side === 'bottom' ? el.querySelector('.gd-body').offsetHeight : el.querySelector('.gd-body').offsetWidth;
    const x0 = ev.clientX, y0 = ev.clientY, from = isOpen ? 1 : 0;
    let moved = false;
    el.classList.add('grab');
    const move = (e) => {
      const d = ((e.clientX - x0) * ox + (e.clientY - y0) * oy) / size;
      if (Math.abs(d) > 0.03) moved = true;
      if (moved) { if (isOpen) { isOpen = false; el.classList.remove('open'); } set(from + d); }
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      el.classList.remove('grab');
      if (!moved) { toggle(which ? 'pad' : 'type', which); return; }
      if (pull > 0.4) { isOpen = false; open(which ? 'pad' : 'type', which); } else { isOpen = true; close(); }
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });

  /* -------------------------------------------------------------- answers */
  function local(q) {
    const w = q.toLowerCase().split(/\W+/).filter((x) => x.length > 1);
    if (!w.length) return [];
    return GUIDE_TIPS.map(([t, k, a]) => [t, a, w.filter((x) => (t + ' ' + k).toLowerCase().includes(x)).length])
      .filter((x) => x[2]).sort((a, b) => b[2] - a[2]).slice(0, 3);
  }

  async function search(q, from) {
    last = q; view = 'results'; results = { q, from, local: from === 'deck' ? GUIDE_TIPS.map(([t, , a]) => [t, a]) : local(q), web: null, proton: null };
    draw();
    if (from === 'deck') return;
    const g = game(), my = ++ask;
    const r = await api.guideSearch(q, g ? { name: g.title, appid: g.type === 'steam' ? g.appid : '' } : {});
    if (my !== ask || view !== 'results') return;
    results.web = r.ok ? r.data.results : []; results.proton = r.ok ? r.data.proton : null; results.err = r.ok ? '' : r.error;
    draw();
  }

  // A wiki page, boiled down to headings, paragraphs, lists and a few pictures.
  function boil(html, base) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, noscript, .navbox, .toc, #toc, .mw-editsection, .reference, sup, .noprint, .portable-infobox nav, .mw-empty-elt, table.navbox').forEach((n) => n.remove());
    const out = []; let pics = 0;
    for (const n of doc.body.querySelectorAll('h2, h3, h4, p, li, dd, img, .pi-data, .pi-title')) {
      if (out.length > 450) break;
      const tag = n.tagName.toLowerCase();
      if (tag === 'img') {
        let src = n.getAttribute('data-src') || n.getAttribute('src') || '';
        if (src.startsWith('//')) src = 'https:' + src; else if (src.startsWith('/')) src = base + src;
        if (!/^https:/.test(src) || pics >= 10 || (+n.getAttribute('width') || 100) < 60) continue;
        pics++; out.push(`<img src="${esc(src)}" alt="" loading="lazy">`); continue;
      }
      if (tag === 'li' && n.querySelector('li')) continue; // its inner items come on their own
      if (n.closest('li') && tag !== 'li') continue;
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      if (/^h/.test(tag)) out.push(`<h4>${esc(t)}</h4>`);
      else if (tag === 'li') out.push(`<p class="li">${esc(t)}</p>`);
      else if (n.classList.contains('pi-title')) out.push(`<h4>${esc(t)}</h4>`);
      else out.push(`<p>${esc(t)}</p>`);
    }
    return out.join('') || '<p>This page has nothing to show here. Open it in the browser.</p>';
  }

  async function read(r) {
    view = 'page'; page = { title: r.title, url: r.url, html: '<p class="dim">Loading…</p>' }; draw();
    const my = ++ask;
    const res = await api.guidePage(r.src, r.title);
    if (my !== ask || view !== 'page') return;
    page.html = res.ok ? boil(res.data.html, new URL(r.url).origin) : `<p>${esc(res.error)}</p>`;
    draw();
  }

  function web(url) {
    api.dockOpen({ url, web: true, browser: Dock.browser() });
    toast('Opened in your browser.');
  }
  function elsewhere(q) {
    const g = game(), topic = `${g ? g.title + ' ' : ''}${q || 'guide'}`.trim();
    const e = encodeURIComponent;
    return [
      ['📺', 'Watch in the walkthrough window', null, topic],
      ['▶', 'YouTube videos', `https://www.youtube.com/results?search_query=${e(topic)}`],
      ['💬', 'Reddit', `https://www.reddit.com/search/?q=${e(topic)}`],
      ...(g && g.type === 'steam' && g.appid ? [['♨', 'Steam guides', `https://steamcommunity.com/app/${e(g.appid)}/guides/?searchText=${e(q)}&browsefilter=trend`]] : []),
      ['🔎', 'The web', `https://duckduckgo.com/?q=${e(topic)}`]
    ];
  }

  /* -------------------------------------------------------------- drawing */
  const SRC = { sw: 'StrategyWiki', pcgw: 'PCGamingWiki', fandom: 'Fandom wiki' };
  function setTab(t, quiet) {
    if ((t !== 'guide' && !TABS.some(([id]) => id === t)) || t === pane) return;
    pane = t; focusI = t === 'guide' ? 1 : 0;
    if (t !== 'guide') quickPane = t;
    el.classList.toggle('quick', t !== 'guide');
    if (!quiet) { Sound.play('tick'); buzz(0.2, 0.3, 40); }
    if (t === 'alerts') Notify.seen();
    if (t === 'rec') loadCaptures();
    if (isOpen) { draw(); live(); }
  }
  // Music, alerts and recordings change while you look at them: redraw every second and a half.
  function live() { clearInterval(tick); if (isOpen && pane !== 'guide') tick = setInterval(() => { if (isOpen && !S.modal) { if (pane === 'rec') loadCaptures(); else draw(); } }, 1500); }
  async function loadCaptures() {
    const [s, l] = await Promise.all([api.captureStatus().catch(() => ({})), api.captureList().catch(() => [])]);
    cap = s || {}; clips = (l || []).slice(0, 6);
    if (isOpen && pane === 'rec') draw();
  }
  const tabsHtml = () => `<nav class="gd-tabs">${TABS.map(([id, ic, name]) => `<button type="button" data-tab="${id}" class="${id === pane ? 'on' : ''}"><i>${ic}</i><span>${name}</span></button>`).join('')}<small>LB RB</small></nav>`;
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function drawMusic() {
    const m = Music.now();
    return `<div class="gd-now"><i>♪</i><div><b>${esc(m.title || 'Nothing playing')}</b><span>${esc(m.artist || (m.count ? `${m.count} songs in your music folder` : 'Pick a music folder in Settings, Look and sound'))}</span></div></div>
      ${m.length ? `<div class="gd-prog"><i style="width:${(100 * m.at / m.length).toFixed(1)}%"></i></div><small class="gd-time">${mmss(m.at)} / ${mmss(m.length)}</small>` : ''}
      <div class="gd-ctl"><button type="button" class="gd-f" data-m="prev">⏮ Back</button><button type="button" class="gd-f gd-big" data-m="toggle">${m.playing ? '⏸ Pause' : '▶ Play'}</button><button type="button" class="gd-f" data-m="next">Next ⏭</button></div>
      <div class="gd-ctl"><button type="button" class="gd-f" data-m="down">− Quieter</button><span class="gd-vol">${m.volume}%</span><button type="button" class="gd-f" data-m="up">Louder +</button></div>
      <div class="gd-ctl"><button type="button" class="gd-f" data-m="shuffle">Shuffle ${m.shuffle ? 'on' : 'off'}</button><button type="button" class="gd-f" data-m="list">All songs</button></div>
      <div class="gd-h">More</div><div class="gd-links"><button type="button" class="gd-f" data-m="app">♫ Open your music app</button><button type="button" class="gd-f" data-m="sound">🔊 Sound card</button></div>
      <p class="gd-note">Anywhere in the menu: M plays and pauses, a quick tap of LT or RT skips.</p>`;
  }
  function drawAlerts() {
    const dl = Notify.downloads(), list = Notify.recent().slice(0, 30);
    return (dl.length ? `<div class="gd-h">Downloads</div>${dl.map((d) => `<div class="gd-dl gd-f" tabindex="-1"><b>⬇ ${esc(d.name)}</b><div class="gd-prog"><i style="width:${d.pct}%"></i></div><small>${esc(d.from)} · ${d.pct}%</small></div>`).join('')}` : '')
      + `<div class="gd-h">${list.length ? 'Recent' : ''}</div>`
      + (list.map((n) => `<div class="gd-al gd-f ${n.kind}" tabindex="-1"><i>${Notify.ICON[n.kind] || '💬'}</i><span>${esc(n.msg)}</span><small>${esc(Notify.when(n.t))}</small></div>`).join('') || '<p class="gd-note">Nothing new. Messages that pop up while you play wait here.</p>')
      + `<div class="gd-links"><button type="button" class="gd-f" data-n="clear">Clear all</button><button type="button" class="gd-f" data-n="center">Notification center</button></div>`;
  }
  function drawRec() {
    const replay = cap.running && cap.mode === 'replay', recording = !!cap.recording;
    const state = recording ? `<b class="gd-recon">● Recording</b><span>since ${new Date(cap.since).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>` : replay ? '<b>Replay is ready</b><span>The last moments can be saved at any time</span>' : cap.available ? '<b>Not recording</b><span>The replay starts by itself when a game does</span>' : '<b>Bladedeck\'s own recorder</b><span>GPU Screen Recorder (Settings, Recording) adds the instant replay</span>';
    return `<div class="gd-now"><i>⏺</i><div>${state}</div></div>
      <div class="gd-ctl"><button type="button" class="gd-f gd-big" data-c="rec">${recording ? '■ Stop recording' : '● Start recording'}</button><button type="button" class="gd-f" data-c="clip" ${replay ? '' : 'disabled'}>Save the last moments</button></div>
      <div class="gd-h">Latest captures</div>
      ${clips.length ? clips.map((c, i) => `<button type="button" class="gd-f gd-clip" data-clip="${i}"><b>${esc(c.game || 'Desktop')}</b><small>${new Date(c.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${(c.size / 1048576).toFixed(0)} MB</small></button>`).join('') : '<p class="gd-note">No captures yet.</p>'}
      <div class="gd-links"><button type="button" class="gd-f" data-c="gallery">All captures</button><button type="button" class="gd-f" data-c="settings">Recording settings</button></div>
      <p class="gd-note">In a game too: View + X records, View + RB saves the last moments.</p>`;
  }

  function draw() {
    if (pane !== 'guide') {
      const name = TABS.find(([id]) => id === pane)[2];
      const body = pane === 'music' ? drawMusic() : pane === 'alerts' ? drawAlerts() : drawRec();
      el.querySelector('.gd-body').innerHTML = `<div class="gd-head"><b>Quick menu</b><span>${name}</span><button type="button" class="gd-x" data-g="close" aria-label="Close">✕</button></div>${tabsHtml()}<div class="gd-scroll">${body}</div>`;
      mark(); return;
    }
    const g = game();
    const head = `<div class="gd-head"><b>Guide</b><span>${g ? `Asking about <em>${esc(g.title)}</em>` : 'Ask about Bladedeck, or highlight a game first'}</span><button type="button" class="gd-x" data-g="close" aria-label="Close">✕</button></div>
      <input class="gd-q" type="search" placeholder="${g ? `How do I… in ${esc(g.title)}` : 'Search a question or topic'}" value="${esc(view === 'home' ? '' : last)}" aria-label="Question">`;
    let body = '';
    if (view === 'home') {
      body = `<div class="gd-chips">${g ? GUIDE_TOPICS.map(([n, q]) => `<button type="button" class="gd-f" data-q="${esc(q)}">${esc(n)}</button>`).join('') : ''}<button type="button" class="gd-f" data-deck="1">Bladedeck tips</button><button type="button" class="gd-f" data-tour="1">🧭 Take the tour</button></div>
        <p class="gd-note">Type a question, or pick a topic. ${g ? 'Answers come from the game\'s wikis.' : ''}</p>`;
    } else if (view === 'results') {
      const r = results;
      body = `<button type="button" class="gd-f gd-back" data-g="back">‹ Topics</button>`
        + (r.proton ? `<div class="gd-proton t-${esc(r.proton.tier)}">🐧 ProtonDB ${esc(PRONOUNCE[r.proton.tier] || r.proton.tier)}${r.proton.reports ? ` · ${r.proton.reports} reports` : ''}</div>` : '')
        + r.local.map(([t, a]) => `<div class="gd-tip gd-f" tabindex="-1"><b>${esc(t)}</b><span>${esc(a)}</span></div>`).join('')
        + (r.from === 'deck' ? '' : r.web === null ? '<p class="gd-note">Looking it up…</p>'
          : (r.web.length ? r.web.map((x, i) => `<button type="button" class="gd-res gd-f" data-r="${i}"><small>${esc(SRC[x.src.split(':')[0]])}</small><b>${esc(x.title.replace(/_/g, ' '))}</b>${x.snippet ? `<span>${esc(x.snippet)}</span>` : ''}</button>`).join('')
            : `<p class="gd-note">${esc(r.err || 'No wiki pages for that. Try the links below.')}</p>`)
          + `<div class="gd-h">Search elsewhere</div><div class="gd-links">${elsewhere(r.q).map(([ic, n, u, pip]) => `<button type="button" class="gd-f" ${pip ? `data-pip="${esc(pip)}"` : `data-u="${esc(u)}"`}>${ic} ${esc(n)}</button>`).join('')}</div>`);
    } else if (view === 'page') {
      body = `<div class="gd-pbar"><button type="button" class="gd-f gd-back" data-g="back">‹ Answers</button><button type="button" class="gd-f" data-u="${esc(page.url)}">Open in browser</button></div>
        <h3 class="gd-pt">${esc(page.title)}</h3><div class="gd-page">${page.html}</div>`;
    }
    el.querySelector('.gd-body').innerHTML = head + `<div class="gd-scroll">${body}</div>`;
    mark();
  }

  // The controller cursor: the search box is not reachable without a keyboard, so it skips it.
  const stops = () => [...el.querySelectorAll('.gd-q'), ...el.querySelectorAll('.gd-scroll .gd-f:not([disabled])'), ...el.querySelectorAll('.gd-x')];
  function mark() {
    const s = stops(); if (!s.length) return;
    focusI = Math.max(0, Math.min(s.length - 1, focusI));
    s.forEach((n, i) => n.classList.toggle('hl', i === focusI && isOpen));
  }

  el.addEventListener('click', (ev) => {
    const t = ev.target.closest('button, .gd-tip'); if (!t) return;
    choose(t);
  });
  function choose(t) {
    if (t.classList.contains('gd-q')) { OSK.open(t); return; }
    if (t.dataset.tab) { setTab(t.dataset.tab); return; }
    if (t.dataset.m) { music(t.dataset.m); return; }
    if (t.dataset.n) { if (t.dataset.n === 'clear') { Notify.clear(); Sound.play('back'); draw(); } else { close(); Notify.open(); } return; }
    if (t.dataset.c || t.dataset.clip) { recording(t); return; }
    Sound.play('tick');
    if (t.dataset.g === 'close') close();
    else if (t.dataset.g === 'back') { view = view === 'page' ? 'results' : 'home'; focusI = 0; draw(); }
    else if (t.dataset.deck) { focusI = 0; search('', 'deck'); }
    else if (t.dataset.tour) { close(); Tour.open(); }
    else if (t.dataset.q) { focusI = 0; search(t.dataset.q); }
    else if (t.dataset.r) read(results.web[+t.dataset.r]);
    else if (t.dataset.pip) { walkthrough(t.dataset.pip); toast('The walkthrough window is up. Ctrl+Alt+Y or View + Y hides it.'); }
    else if (t.dataset.u) web(t.dataset.u);
  }
  function music(m) {
    Sound.play('tick');
    const v = Music.now().volume;
    if (m === 'toggle') Music.toggle();
    else if (m === 'next') Music.next();
    else if (m === 'prev') Music.prev();
    else if (m === 'up' || m === 'down') Music.setVolume(Math.max(0, Math.min(100, v + (m === 'up' ? 10 : -10))) / 100);
    else if (m === 'shuffle') Music.toggleShuffle();
    else if (m === 'list') { close(); Music.open(); return; }
    else if (m === 'app') { close(); if (!Dock.openByName('Music')) toast('Pick your music app in the dock (⋯, Edit dock).', 'err'); return; }
    else if (m === 'sound') { close(); Volume.open(); return; }
    setTimeout(draw, 120);
  }
  async function recording(t) {
    Sound.play('tick');
    if (t.dataset.clip) { const c = clips[+t.dataset.clip]; if (c && !(await api.captureOpen(c.file))) toast('Nothing on this PC plays that clip.', 'err'); return; }
    const c = t.dataset.c;
    if (c === 'rec') await Capture.toggleRecord();
    else if (c === 'clip') await Capture.saveReplay();
    else if (c === 'gallery') { close(); Capture.gallery(); return; }
    else if (c === 'settings') { close(); openSettingsAt('rec'); return; }
    loadCaptures();
  }
  el.addEventListener('input', (ev) => {
    if (!ev.target.classList.contains('gd-q')) return;
    clearTimeout(timer);
    const q = ev.target.value.trim();
    timer = setTimeout(() => { if (q) { focusI = 0; search(q); keepTyping(); } else { view = 'home'; draw(); keepTyping(); } }, 450);
  });
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); close(); }
    if (ev.key === 'Enter' && ev.target.classList.contains('gd-q')) { clearTimeout(timer); const q = ev.target.value.trim(); if (q) { search(q); keepTyping(); } }
  });
  function keepTyping() { const q = $('.gd-q', el); if (q && !S.pad && document.activeElement !== q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }

  // Controller and keyboard while it is open. Returns true when it used the input.
  function handle(a) {
    if (!isOpen) return false;
    const s = stops(), scroll = $('.gd-scroll', el);
    if (a === 'lb' || a === 'rb') { if (pane !== 'guide') { const i = TABS.findIndex(([id]) => id === pane); setTab(TABS[(i + (a === 'rb' ? 1 : TABS.length - 1)) % TABS.length][0]); } return true; }
    if (a === 'b' && pane !== 'guide') { close(); return true; }
    if (a === 'b') { if (view === 'home') close(); else { view = view === 'page' ? 'results' : 'home'; focusI = 0; draw(); Sound.play('back'); } return true; }
    if (pane === 'guide' && view === 'page' && (a === 'up' || a === 'down')) { scroll.scrollBy({ top: a === 'down' ? 160 : -160, behavior: 'smooth' }); return true; }
    if (a === 'down' || a === 'right') { focusI = Math.min(s.length - 1, focusI + 1); mark(); s[focusI]?.scrollIntoView({ block: 'nearest' }); Sound.play('tick'); return true; }
    if (a === 'up' || a === 'left') { focusI = Math.max(0, focusI - 1); mark(); s[focusI]?.scrollIntoView({ block: 'nearest' }); Sound.play('tick'); return true; }
    if (a === 'a') { if (s[focusI]) choose(s[focusI]); return true; }
    if (a === 'start' || a === 'back') { close(); return true; }
    return true; // everything else stays in the flap
  }

  function settingsHtml() {
    const c = cfg(), o = (v, n, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${n}</option>`;
    return `<div class="row2"><label>The guide flap opens from<select name="guideSide">${o('right', 'The right edge', c.side)}${o('left', 'The left edge', c.side)}${o('top', 'The top', c.side)}${o('bottom', 'The bottom', c.side)}</select></label>
      <label>Hold this trigger to pull out the guide (the other one pulls out the quick menu)<select name="guideTrigger">${o('lt', 'LT (left trigger)', c.trigger)}${o('rt', 'RT (right trigger)', c.trigger)}</select></label></div>
      <div class="checks"><label><input type="checkbox" name="guideRumble" ${c.rumble ? 'checked' : ''}> Trigger haptic rumble: Vibrate the controller while pulling open the guide flap. Default: off.</label></div>`;
  }
  function readSettings(root) {
    S.lib.settings.guide = { side: $('[name=guideSide]', root).value, trigger: $('[name=guideTrigger]', root).value, rumble: $('[name=guideRumble]', root).checked };
    layout();
  }

  // A click anywhere else puts it away.
  addEventListener('pointerdown', (ev) => { if (isOpen && !S.modal && !el.contains(ev.target)) close(); }, true);

  function init() {
    el.innerHTML = '<button type="button" class="gd-tab" aria-label="Guide (hold the trigger and pull)"><i>?</i><span>Guide</span></button><button type="button" class="gd-tab q" aria-label="Quick menu: music, alerts, recordings (hold the other trigger and pull)"><i>♪</i><span>Quick</span></button><div class="gd-body"></div>';
    layout(); set(0); draw();
  }

  return { init, open, close, toggle, frame, tapped, isTrigger, handle, settingsHtml, readSettings, tab: (t) => (isOpen && pane === t ? close() : open('pad', t)), quick: () => toggle('pad', 'quick'), isOpen: () => isOpen, pane: () => pane, pulling: () => !!grab?.used };
})();
