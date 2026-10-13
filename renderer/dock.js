'use strict';
/* Dock: a few everyday apps (YouTube, music, chat, files, whatever people pick) on the left, under the now-playing view.
   Each slot shows whether its app is open and what it is showing (the video or song in the title),
   and one press opens it, brings it up, or tucks it away. On KDE it sees and moves real windows
   through the KWin script in peek.js; elsewhere a slot just opens its app.
   Uses S, api, esc, save, toast, openModal, val, Sound and $ at call time. */

/* Apps the dock knows. Each can run as an installed app (tried in order; Flatpak IDs too), and/or
   as a web page in the browser picked in Edit dock. `match` is which windows belong to it. */
const DOCK_APPS = [
  ['Video', [
    { id: 'youtube', name: 'YouTube', icon: '▶', match: 'YouTube(?! Music)', url: 'https://www.youtube.com' },
    { id: 'freetube', name: 'FreeTube', icon: '▶', match: 'freetube', apps: [{ cmd: 'freetube', flat: 'io.freetubeapp.FreeTube' }], url: 'https://www.youtube.com' },
    { id: 'twitch', name: 'Twitch', icon: '📺', match: 'Twitch', url: 'https://www.twitch.tv' },
    { id: 'netflix', drm: true, name: 'Netflix', icon: '🎬', match: 'Netflix', url: 'https://www.netflix.com' },
    { id: 'crunchyroll', drm: true, name: 'Crunchyroll', icon: '🍥', match: 'Crunchyroll', url: 'https://www.crunchyroll.com' },
    { id: 'plex', name: 'Plex', icon: '🎞', match: 'Plex', apps: [{ cmd: 'plex-desktop', flat: 'tv.plex.PlexDesktop' }], url: 'https://app.plex.tv' },
    { id: 'jellyfin', name: 'Jellyfin', icon: '🎞', match: 'jellyfin', apps: [{ cmd: 'jellyfinmediaplayer', flat: 'com.github.iwalton3.jellyfin-media-player' }] },
    { id: 'vlc', name: 'VLC', icon: '🔶', match: 'vlc', apps: [{ cmd: 'vlc', flat: 'org.videolan.VLC' }] }
  ]],
  ['Music', [
    { id: 'music', name: 'Music', icon: '♪', match: 'spotify|cider|Apple Music|YouTube Music|tidal|deezer|strawberry|elisa|rhythmbox|audacious|amarok|clementine',
      apps: [{ cmd: 'spotify', flat: 'com.spotify.Client' }, { cmd: 'cider', flat: 'sh.cider.Cider' }, { cmd: 'youtube-music', flat: 'app.ytmdesktop.ytmdesktop' }, { cmd: 'tidal-hifi', flat: 'com.mastermindzh.tidal-hifi' },
        { cmd: 'strawberry', flat: 'org.strawberrymusicplayer.strawberry' }, { cmd: 'elisa', flat: 'org.kde.elisa' }, { cmd: 'rhythmbox', flat: 'org.gnome.Rhythmbox3' }],
      url: 'https://music.youtube.com', label: 'Any music app you have' },
    { id: 'spotify', drm: true, name: 'Spotify', icon: '🎧', match: 'spotify', apps: [{ cmd: 'spotify', flat: 'com.spotify.Client' }], uri: 'spotify:', url: 'https://open.spotify.com' },
    { id: 'apple', drm: true, name: 'Apple Music', icon: '🍎', match: 'Apple Music|cider', apps: [{ cmd: 'cider', flat: 'sh.cider.Cider' }], url: 'https://music.apple.com' },
    { id: 'ytmusic', name: 'YouTube Music', icon: '♫', match: 'YouTube Music', apps: [{ cmd: 'youtube-music', flat: 'app.ytmdesktop.ytmdesktop' }], url: 'https://music.youtube.com' },
    { id: 'tidal', drm: true, name: 'Tidal', icon: '〰', match: 'tidal', apps: [{ cmd: 'tidal-hifi', flat: 'com.mastermindzh.tidal-hifi' }], uri: 'tidal:', url: 'https://listen.tidal.com' },
    { id: 'amazon', drm: true, name: 'Amazon Music', icon: '♪', match: 'Amazon Music', url: 'https://music.amazon.com' },
    { id: 'deezer', drm: true, name: 'Deezer', icon: '♪', match: 'deezer', url: 'https://www.deezer.com' },
    { id: 'soundcloud', name: 'SoundCloud', icon: '☁', match: 'SoundCloud', url: 'https://soundcloud.com' },
    { id: 'pandora', drm: true, name: 'Pandora', icon: '♪', match: 'Pandora', url: 'https://www.pandora.com' },
    { id: 'strawberry', name: 'Strawberry', icon: '🍓', match: 'strawberry', apps: [{ cmd: 'strawberry', flat: 'org.strawberrymusicplayer.strawberry' }] },
    { id: 'elisa', name: 'Elisa', icon: '♪', match: 'elisa', apps: [{ cmd: 'elisa', flat: 'org.kde.elisa' }] }
  ]],
  ['Chat', [
    { id: 'discord', name: 'Discord', icon: '💬', match: 'discord|vesktop|webcord|equibop', apps: [{ cmd: 'discord', flat: 'com.discordapp.Discord' }, { cmd: 'vesktop', flat: 'dev.vencord.Vesktop' }], uri: 'discord:', url: 'https://discord.com/app' },
    { id: 'telegram', name: 'Telegram', icon: '✈', match: 'telegram', apps: [{ cmd: 'telegram-desktop', flat: 'org.telegram.desktop' }], url: 'https://web.telegram.org' },
    { id: 'whatsapp', name: 'WhatsApp', icon: '🟢', match: 'WhatsApp', url: 'https://web.whatsapp.com' },
    { id: 'signal', name: 'Signal', icon: '🔵', match: 'signal', apps: [{ cmd: 'signal-desktop', flat: 'org.signal.Signal' }] },
    { id: 'slack', name: 'Slack', icon: '#', match: 'slack', apps: [{ cmd: 'slack', flat: 'com.slack.Slack' }], url: 'https://app.slack.com' },
    { id: 'teamspeak', name: 'TeamSpeak', icon: '🎙', match: 'teamspeak', apps: [{ cmd: 'teamspeak3', flat: 'com.teamspeak.TeamSpeak' }] }
  ]],
  ['Tools', [
    { id: 'files', name: 'Files', icon: '🗂', match: 'dolphin|nautilus|thunar|nemo|pcmanfm|caja|explorer', apps: [{ cmd: 'dolphin' }, { cmd: 'nautilus' }, { cmd: 'thunar' }, { cmd: 'nemo' }, { cmd: 'pcmanfm' }], home: true, label: 'Files (your file manager)' },
    { id: 'obs', name: 'OBS', icon: '⏺', match: 'obs', apps: [{ cmd: 'obs', flat: 'com.obsproject.Studio' }] },
    { id: 'custom', name: '', icon: '', match: '', label: 'Something else…' }
  ]]
];
const DOCK_PRESET = Object.fromEntries(DOCK_APPS.flatMap(([, l]) => l).map((x) => [x.id, x]));
const DOCK_DEFAULTS = ['youtube', 'music', 'discord', 'files'];
// Browsers that can run a web page as an app window of its own have `app`.
const BROWSERS = [
  { id: 'bladedeck', name: "Bladedeck's own app windows (no tabs or address bar)", inApp: true, list: [] },
  { id: 'firefox', name: 'Firefox', list: [{ cmd: 'firefox' }, { flat: 'org.mozilla.firefox' }] },
  { id: 'chrome', name: 'Google Chrome', app: true, list: [{ cmd: 'google-chrome-stable' }, { cmd: 'google-chrome' }, { flat: 'com.google.Chrome' }] },
  { id: 'chromium', name: 'Chromium', app: true, list: [{ cmd: 'chromium' }, { flat: 'org.chromium.Chromium' }] },
  { id: 'brave', name: 'Brave', app: true, list: [{ cmd: 'brave' }, { cmd: 'brave-browser' }, { flat: 'com.brave.Browser' }] },
  { id: 'edge', name: 'Microsoft Edge', app: true, list: [{ cmd: 'microsoft-edge-stable' }, { flat: 'com.microsoft.Edge' }] },
  { id: 'vivaldi', name: 'Vivaldi', app: true, list: [{ cmd: 'vivaldi-stable' }, { cmd: 'vivaldi' }, { flat: 'com.vivaldi.Vivaldi' }] },
  { id: 'opera', name: 'Opera', app: true, list: [{ cmd: 'opera' }, { flat: 'com.opera.Opera' }] },
  { id: 'librewolf', name: 'LibreWolf', list: [{ cmd: 'librewolf' }, { flat: 'io.gitlab.librewolf-community' }] },
  { id: 'zen', name: 'Zen', list: [{ cmd: 'zen-browser' }, { flat: 'app.zen_browser.zen' }] }
];
const fromPreset = (id) => { const p = DOCK_PRESET[id] || DOCK_PRESET.custom; const { label, ...x } = p; return { ...x, pick: p.id }; };

const Dock = (() => {
  const el = document.getElementById('dock');
  const np = document.getElementById('np');
  let wins = [], webs = [], live = false, focus = -1;
  const keyOf = (s) => String(s.pick && s.pick !== 'custom' ? s.pick : s.name).replace(/[^\w-]/g, '').slice(0, 40);

  const cfg = () => {
    const st = S.lib.settings;
    if (!st.dock) st.dock = { on: true, slots: DOCK_DEFAULTS.map(fromPreset) };
    // The first dock had fixed apps; give those slots their place in the catalogue.
    for (const [k, sl] of st.dock.slots.entries()) if (!sl.pick) st.dock.slots[k] = ({ YouTube: fromPreset('youtube'), Music: fromPreset('music'), Discord: fromPreset('discord'), Files: fromPreset('files') })[sl.name] || { ...sl, pick: 'custom' };
    return st.dock;
  };
  const slots = () => cfg().slots;
  const on = () => cfg().on !== false && slots().length > 0;
  const re = (m) => { try { return new RegExp(m, 'i'); } catch { return /$^/; } };
  // Each open window belongs to the first slot it matches, by app name or window title.
  function windowsOf(i) {
    const all = slots();
    return [...webs.filter((w) => w.key === keyOf(all[i])),
      ...wins.filter((w) => all.findIndex((s) => re(s.match).test(w.cls) || re(s.match).test(w.caption)) === i)];
  }
  window.bladedeck.onWebapps((l) => { webs = l || []; live = true; draw(); });

  window.bladedeck.onPeek((ev) => {
    if (ev.kind !== 'windows') return;
    try { wins = JSON.parse(ev.caption) || []; } catch { wins = []; }
    live = true;
    draw();
  });

  // "Song — Strawberry" reads as just the song; "Video - YouTube — Mozilla Firefox" as just the video.
  const BROWSER_TAIL = /\s+[—–-]\s+(Mozilla Firefox|Firefox|Google Chrome|Chromium|Brave|Microsoft\u200b? Edge|Vivaldi|Opera|LibreWolf|Zen Browser)$/i;
  function tidy(c, s) {
    let t = c.replace(BROWSER_TAIL, '');
    const tail = new RegExp(`\\s+[—–|-]\\s+(${(s.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${s.match || '$^'})[^—–|-]*$`, 'i');
    try { t = t.replace(tail, ''); } catch { /* odd pattern */ }
    return t.trim() || c;
  }

  function draw() {
    el.hidden = !on();
    document.body.classList.toggle('dock-on', on());
    if (!on()) return;
    el.innerHTML = slots().map((s, i) => {
      const ws = windowsOf(i), w = ws.find((x) => x.active) || ws[0];
      const state = !w ? '' : w.active ? 'up' : w.min ? 'min' : 'open';
      // The title is the interesting part: "Song — Strawberry" reads as just the song.
      const what = w ? tidy(w.caption, s) : live ? 'Not open' : s.web || !(s.apps || []).length ? 'Opens in your browser' : 'Open';
      return `<button type="button" class="dk ${state} ${i === focus ? 'hl' : ''}" data-i="${i}" aria-label="${esc(s.name)}">
        <i class="dk-ic">${esc(s.icon || s.name[0])}</i>${ws.length > 1 ? `<em class="dk-n">${ws.length}</em>` : ''}
        <span class="dk-card"><b>${esc(s.name)}</b><span>${esc(what)}</span>
          ${w ? `<span class="dk-acts"><i data-a="min" title="Minimize">–</i><i data-a="close" title="Close">✕</i></span>` : ''}</span>
      </button>`;
    }).join('') + `<button type="button" class="dk dk-edit" data-edit="1" aria-label="Edit dock"><i class="dk-ic">⋯</i><span class="dk-card"><b>Edit dock</b><span>Pick your apps</span></span></button>`;
    place();
  }

  // Under the now-playing view when it is out, otherwise a slim strip down the left edge.
  function place() {
    const under = document.body.classList.contains('np-on') && !np.hidden;
    el.classList.toggle('row', under);
    el.style.top = under ? `${Math.round(np.getBoundingClientRect().bottom + 12)}px` : '';
  }
  new ResizeObserver(place).observe(np);
  new MutationObserver(place).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // The browser web pages open in, from Edit dock. Nothing means the system's default browser.
  const browserId = () => (cfg().browser === undefined ? 'bladedeck' : cfg().browser);
  function browser() {
    const b = BROWSERS.find((x) => x.id === browserId() && !x.inApp);
    return b ? { list: b.list, app: !!(b.app && cfg().appWindow) } : null;
  }
  // Web apps open in Bladedeck's own windows; returns true when one opened.
  function webapp(s) {
    if (!s.url) return false;
    api.webappOpen({ key: s.pick && s.pick !== 'custom' ? s.pick : s.name, name: s.name, url: s.url, tv: s.pick === 'youtube' && cfg().ytTv !== false });
    return true;
  }

  async function act(i, a) {
    const s = slots()[i]; if (!s) return;
    const ws = windowsOf(i), w = ws.find((x) => x.active) || ws[0];
    Sound.play('tick');
    if (a === 'min' || a === 'close') { if (w) api.winAct(w.id, a); return; }
    if (!w) {
      const r = await api.dockOpen({ ...s, browser: browser(), inApp: browserId() === 'bladedeck' });
      if (r === 'webapp') { webapp(s); toast(`Opening ${s.name}…`); }
      else if (r) toast(`Opening ${s.name}…${s.drm && browserId() === 'bladedeck' ? ' It needs your browser to play protected music and video.' : ''}`);
      else toast(`Couldn't find ${s.name}. Pick the app in Edit dock.`, 'err');
      return;
    }
    // Several windows of one app: each press brings up the next.
    if (w.active && ws.length > 1) { const k = ws.indexOf(w); api.winAct(ws[(k + 1) % ws.length].id, 'show'); return; }
    api.winAct(w.id, w.active ? 'min' : 'show');
  }

  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-edit]')) { edit(); return; }
    const b = ev.target.closest('.dk'); if (!b) return;
    act(+b.dataset.i, ev.target.closest('[data-a]')?.dataset.a);
  });

  /* -------------------------------------------------------------- controller */
  const count = () => slots().length + 1;
  function edge() { if (!on()) return false; focus = 0; draw(); Sound.play('tick'); return true; }
  function leave() { focus = -1; draw(); }
  function handle(a) {
    if (focus < 0) return false;
    const row = el.classList.contains('row');
    const prev = row ? 'left' : 'up', next = row ? 'right' : 'down';
    if (a === prev) { if (focus > 0) { focus--; draw(); Sound.play('tick'); } else if (row) { leave(); NowPlaying.edge(); } }
    else if (a === next) { if (focus < count() - 1) { focus++; draw(); Sound.play('tick'); } else if (row) leave(); }
    else if (a === 'a') { if (focus === count() - 1) edit(); else act(focus, null); }
    else if (a === 'x') act(focus, 'min');
    else if (a === 'y') act(focus, 'close');
    else if (a === 'b' || (!row && a === 'right') || (row && a === 'up')) { leave(); if (row && a === 'up') NowPlaying.edge(); }
    return true;
  }

  /* -------------------------------------------------------------- editing */
  // Which apps and browsers are installed, asked once per Edit dock.
  async function installed() {
    const presets = Object.values(DOCK_PRESET).filter((p) => p.apps);
    const flat = [...presets.flatMap((p) => p.apps), ...BROWSERS.flatMap((b) => b.list)];
    const got = await api.dockDetect(flat);
    const has = new Map(flat.map((x, k) => [x, got[k]]));
    return {
      app: Object.fromEntries(presets.map((p) => [p.id, p.apps.some((x) => has.get(x))])),
      browser: Object.fromEntries(BROWSERS.map((b) => [b.id, b.list.some((x) => has.get(x))]))
    };
  }

  async function edit() {
    leave();
    const have = await installed();
    const list = slots().map((s) => ({ ...s }));
    const c = { on: cfg().on !== false, browser: browserId(), appWindow: !!cfg().appWindow, ytTv: cfg().ytTv !== false };
    const appOpt = (p, cur) => `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${esc(p.label || p.name)}${have.app[p.id] ? '  ✓' : ''}${!p.apps && p.url ? '  (web)' : ''}</option>`;
    const rowHtml = (s, i) => {
      const p = DOCK_PRESET[s.pick] || DOCK_PRESET.custom, custom = p.id === 'custom';
      const both = !custom && p.apps && p.url;
      return `<div class="dk-row ${custom ? 'custom' : ''}" data-r="${i}">
        <input type="text" name="icon" value="${esc(s.icon || '')}" maxlength="3" aria-label="Icon" class="dk-in-ic">
        <select name="pick" aria-label="App">${DOCK_APPS.map(([g, l]) => `<optgroup label="${esc(g)}">${l.map((x) => appOpt(x, p.id)).join('')}</optgroup>`).join('')}</select>
        <input type="text" name="name" value="${esc(s.name)}" placeholder="Name" aria-label="Name">
        ${both ? `<label class="dk-web" title="Open the website in your browser even when the app is installed"><input type="checkbox" name="web" ${s.web ? 'checked' : ''}> Website</label>` : '<span></span>'}
        <button type="button" data-del="${i}" aria-label="Remove">✕</button>
        ${custom ? `<div class="dk-more">
          <input type="text" name="cmd" value="${esc((s.apps || []).map((a) => a.cmd || a.flat).filter(Boolean).join(', '))}" placeholder="Programs to try, e.g. discord, vesktop" aria-label="Programs">
          <input type="text" name="url" value="${esc(s.url || (s.home ? '~' : ''))}" placeholder="Else open this web page (or ~ for your home folder)" aria-label="Web page">
          <input type="text" name="match" value="${esc(s.match || '')}" placeholder="Window names it owns, e.g. discord|vesktop" aria-label="Matches"></div>` : ''}
      </div>`;
    };
    const browsers = BROWSERS.filter((b) => b.inApp || have.browser[b.id] || b.id === c.browser);
    const body = () => `<div class="checks"><label><input type="checkbox" name="dockOn" ${c.on ? 'checked' : ''}> Show the dock</label></div>
      <div class="row2"><label>Web pages open in<select name="browser">${browsers.filter((b) => b.inApp).map((b) => `<option value="${b.id}" ${b.id === c.browser ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}<option value="" ${c.browser === '' ? 'selected' : ''}>Your default browser</option>${browsers.filter((b) => !b.inApp).map((b) => `<option value="${b.id}" ${b.id === c.browser ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
        ${c.browser === 'bladedeck' ? `<label class="dk-appwin"><span><input type="checkbox" name="ytTv" ${c.ytTv ? 'checked' : ''}> YouTube in its TV mode, made for controllers</span></label>` : `<label class="dk-appwin ${BROWSERS.find((b) => b.id === c.browser)?.app ? '' : 'off'}"><span><input type="checkbox" name="appWindow" ${c.appWindow ? 'checked' : ''}> Give each web app its own window, without tabs</span></label>`}</div>
      <p class="note">Up to six apps. One press opens the app, brings it up, or tucks it away. ✓ means it's installed and opens as an app; the rest open as websites. Pick "Something else…" for anything not listed.</p>
      <div class="dk-rows">${list.map(rowHtml).join('')}</div>
      <div style="display:flex;gap:8px"><button type="button" data-add="1" ${list.length >= 6 ? 'disabled' : ''}>Add an app</button><button type="button" data-reset="1">Back to the four defaults</button></div>`;
    const read = (root) => $$('.dk-row', root).map((r) => {
      const v = (n) => $(`[name=${n}]`, r)?.value.trim() || '';
      const pick = v('pick');
      if (pick !== 'custom') return { ...fromPreset(pick), name: v('name') || DOCK_PRESET[pick].name, icon: v('icon'), web: !!$('[name=web]', r)?.checked };
      const url = v('url');
      return { pick, name: v('name') || 'App', icon: v('icon'), match: v('match') || v('name').toLowerCase(),
        apps: v('cmd').split(/[,\s]+/).filter(Boolean).map((x) => (/^[\w-]+(\.[\w-]+){2,}$/.test(x) ? { flat: x } : { cmd: x })),
        url: url === '~' ? '' : url, home: url === '~' };
    });
    openModal({
      title: 'Dock', wide: true, html: `<div class="dk-edit-body">${body()}</div>`,
      buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: (root) => {
        Object.assign(cfg(), { on: $('[name=dockOn]', root).checked, browser: $('[name=browser]', root).value, appWindow: !!$('[name=appWindow]', root)?.checked, ytTv: $('[name=ytTv]', root) ? $('[name=ytTv]', root).checked : c.ytTv, slots: read(root).slice(0, 6) });
        save(); draw();
      } }],
      onOpen: (root) => {
        const wrap = $('.dk-edit-body', root);
        const keep = () => { Object.assign(c, { on: $('[name=dockOn]', root).checked, browser: $('[name=browser]', root).value, appWindow: !!$('[name=appWindow]', root)?.checked, ytTv: $('[name=ytTv]', root) ? $('[name=ytTv]', root).checked : c.ytTv }); list.splice(0, list.length, ...read(root)); };
        const redraw = (focusSel) => { wrap.innerHTML = body(); if (focusSel) $(focusSel, root)?.focus(); };
        root.addEventListener('change', (ev) => {
          const r = ev.target.closest('.dk-row');
          if (ev.target.name === 'pick' && r) {
            // A new app brings its own name and icon.
            const i = +r.dataset.r, p = DOCK_PRESET[ev.target.value];
            keep(); list[i] = { ...fromPreset(p.id), name: p.name, icon: p.icon }; redraw(`[data-r="${i}"] [name=pick]`);
          } else if (ev.target.name === 'browser') { keep(); redraw('[name=browser]'); }
        });
        root.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-add]')) { keep(); list.push(fromPreset('custom')); redraw(`[data-r="${list.length - 1}"] [name=pick]`); }
          else if (ev.target.closest('[data-del]')) { keep(); list.splice(+ev.target.closest('[data-del]').dataset.del, 1); redraw(); }
          else if (ev.target.closest('[data-reset]')) { keep(); list.splice(0, list.length, ...DOCK_DEFAULTS.map(fromPreset)); redraw(); }
        });
      }
    });
  }

  return { draw, edge, handle, edit, browser, windows: () => [...webs, ...wins], slotFor: (w) => slots().find((s, i) => windowsOf(i).includes(w)), active: () => focus >= 0 };
})();
