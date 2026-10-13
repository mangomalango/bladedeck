'use strict';
/* Bladedeck play extras: per-game tasks and the looks they unlock (Tasks), clips and
   screenshots playing behind the menu (Showcase), gameplay recording (Recorder),
   poking friends (Friends) and the Steam downloads tray (Downloads).
   Loaded before app.js; uses S, $, $$, esc, save, toast, openModal, fileUrl and api at call time. */

/* ================================================================ Tasks */
const TASKS = [
  { id: 'first',   name: 'Fire it up',           text: 'Launch it from Bladedeck',                          auto: (e) => !!e.lastPlayed },
  { id: 'five',    name: 'Five good minutes',    text: 'Play 5 minutes in one sitting',                     auto: (e) => (e.bestSession || 0) >= 300 },
  { id: 'clip',    name: 'Roll camera',          text: 'Record 5 minutes of gameplay',                      auto: (e) => (e.media || []).some((m) => m.rec && m.secs >= 285), act: 'record' },
  { id: 'view',    name: 'Nice view',            text: 'Add a screenshot of a nice view (Steam F12 shots count)', auto: (e) => (e.media || []).some((m) => m.kind === 'image'), act: 'image' },
  { id: 'mission', name: 'Past the first mission', text: 'Get through the first mission, then check this off', act: 'claim' },
  { id: 'boss',    name: 'Boss down',            text: 'Add a clip or picture of a hard boss going down',   auto: (e) => (e.media || []).some((m) => m.tag === 'boss'), act: 'boss' },
  { id: 'hour',    name: 'Settling in',          text: 'Play for an hour in total',                         auto: (e) => (e.playtime || 0) >= 3600 },
  { id: 'again',   name: 'Coming back',          text: 'Play on two different days',                        auto: (e) => (e.days || []).length >= 2 },
  { id: 'poke',    name: 'Bring a friend',       text: 'Poke or challenge a friend about this game',        auto: (e) => !!e.poked, act: 'poke' }
];

// Background looks, unlocked per game by finishing its tasks.
const LOOKS = [
  { id: 'clean',    name: 'Clean',          need: 0 },
  { id: 'blur',     name: 'Blur',           need: 0 },
  { id: 'vignette', name: 'Vignette',       need: 1 },
  { id: 'bw',       name: 'Black & white',  need: 2 },
  { id: 'grime',    name: '360-era grime',  need: 3 },
  { id: 'glow',     name: 'Bloom + scanlines', need: 5 }
];

const Tasks = (() => {
  const isDone = (e, t) => !!e.tasks?.[t.id] || !!t.auto?.(e);
  const count = (e) => TASKS.filter((t) => isDone(e, t)).length;

  // Records auto tasks that just became true and celebrates them. Returns how many were new.
  function sync(e) {
    if (!e || e.run) return 0;
    e.tasks = e.tasks || {};
    const fresh = TASKS.filter((t) => !e.tasks[t.id] && t.auto?.(e));
    fresh.forEach((t) => { e.tasks[t.id] = Date.now(); });
    if (fresh.length) { save(); celebrate(e, fresh); }
    return fresh.length;
  }

  function celebrate(e, done) {
    const n = count(e);
    for (const t of done) toast(`Task done in ${e.title}: ${t.name}`, 'fun');
    const unlocked = LOOKS.filter((l) => l.need > n - done.length && l.need <= n && l.need > 0);
    for (const l of unlocked) toast(`New look for ${e.title}: ${l.name}. Pick it in Tasks.`, 'fun');
    if (n === TASKS.length) toast(`Every task in ${e.title} done. Mastered!`, 'fun');
    Sound.play('secret');
  }

  function claim(e, id) {
    e.tasks = e.tasks || {};
    if (e.tasks[id]) delete e.tasks[id];
    else { e.tasks[id] = Date.now(); celebrate(e, [TASKS.find((t) => t.id === id)]); }
    save();
  }

  async function addMedia(e, kind, tag) {
    const p = await api.pick({ kind: 'media' });
    if (!p) return false;
    const video = /\.(webm|mp4|mkv|mov|m4v)$/i.test(p);
    (e.media = e.media || []).push({ path: p, kind: video ? 'video' : 'image', tag, at: Date.now() });
    save(); sync(e); Showcase.show(e, true);
    return true;
  }

  const stars = (e) => '★'.repeat(count(e)) + '☆'.repeat(TASKS.length - count(e));

  function open(e) {
    if (!e || e.run) return;
    sync(e);
    let focus = 0;
    const draw = (root) => {
      const n = count(e);
      $('.dlg-body', root).innerHTML = `
        <div class="tasks-head"><span class="stars">${stars(e)}</span><p class="note">${n} of ${TASKS.length} done. Finished tasks unlock new looks for the clips and pictures that play behind this game.</p></div>
        ${TASKS.map((t, i) => {
          const done = isDone(e, t);
          const hint = done ? (e.tasks?.[t.id] ? new Date(e.tasks[t.id]).toLocaleDateString() : 'done')
            : t.act === 'record' ? (e.recordNext ? 'Records next launch' : 'Press to record next launch')
            : t.act === 'claim' ? 'Press when done' : t.act === 'image' || t.act === 'boss' ? 'Press to add' : t.act === 'poke' ? 'Press to poke' : '';
          return `<div class="task ${done ? 'done' : ''} ${i === focus ? 'focus' : ''}" tabindex="0" data-task="${t.id}"><i class="ck">${done ? '✓' : ''}</i><div><b>${esc(t.name)}</b><span>${esc(t.text)}</span></div><em>${esc(hint)}</em></div>`;
        }).join('')}
        <div class="side-h" style="margin:8px 0 0">Background look</div>
        <div class="looks">${LOOKS.map((l) => `<button type="button" class="look ${(e.look || 'blur') === l.id ? 'on' : ''}" data-look="${l.id}" ${n < l.need ? 'disabled' : ''}>${esc(l.name)}${n < l.need ? ` (${l.need}★)` : ''}</button>`).join('')}</div>
        <div class="side-h" style="margin:8px 0 0">Clips and pictures</div>
        ${(e.media || []).length ? `<div class="media-strip">${e.media.map((m, i) => `<div class="m">${m.kind === 'video' ? `<video src="${fileUrl(m.path)}" muted preload="metadata"></video>` : `<img src="${fileUrl(m.path)}" alt="">`}<button type="button" data-unmedia="${i}" aria-label="Remove">×</button></div>`).join('')}</div>` : '<p class="note">Nothing yet. Record a session, add your own clips and screenshots, or take screenshots in Steam with F12.</p>'}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-x="add">Add clip or picture</button><button type="button" data-x="rec">${e.recordNext ? 'Cancel recording' : 'Record next launch'}</button></div>`;
    };
    openModal({
      title: `Tasks: ${e.title}`, wide: true, html: '',
      buttons: [{ label: 'Done', primary: true }],
      onOpen: (root) => {
        draw(root);
        root.addEventListener('click', async (ev) => {
          const tk = ev.target.closest('[data-task]'), lk = ev.target.closest('[data-look]'), um = ev.target.closest('[data-unmedia]'), x = ev.target.closest('[data-x]')?.dataset.x;
          if (tk) {
            const t = TASKS.find((k) => k.id === tk.dataset.task); focus = TASKS.indexOf(t);
            if (t.act === 'claim') claim(e, t.id);
            else if (t.act === 'record' && !isDone(e, t)) { e.recordNext = !e.recordNext; save(); if (e.recordNext) toast('The next launch records 5 minutes. Your screen picker will ask which screen.'); }
            else if (t.act === 'image' && !isDone(e, t)) await addMedia(e);
            else if (t.act === 'boss' && !isDone(e, t)) await addMedia(e, 'boss');
            else if (t.act === 'poke') { closeModal(); Friends.poke(e); return; }
          } else if (lk && !lk.disabled) { e.look = lk.dataset.look; save(); Showcase.show(e, true); Sound.play('tick'); }
          else if (um) { e.media.splice(+um.dataset.unmedia, 1); save(); Showcase.show(e, true); }
          else if (x === 'add') await addMedia(e);
          else if (x === 'rec') { e.recordNext = !e.recordNext; save(); }
          else return;
          draw(root); refreshQuiet();
          $(`[data-task="${TASKS[focus]?.id}"]`, root)?.focus();
        });
      }
    });
  }

  return { open, sync, count, stars, isDone };
})();

/* ================================================================ Showcase */
const Showcase = (() => {
  const root = document.getElementById('showcase');
  const layers = [...root.querySelectorAll('.layer')];
  let front = 0, key = null, timer = 0, cycle = 0, steamChecked = {};

  function show(e, now) {
    clearTimeout(timer);
    timer = setTimeout(() => apply(e), now ? 0 : 260);
  }

  async function apply(e) {
    if (e && e.type === 'steam' && e.appid && Date.now() - (steamChecked[e.id] || 0) > 60000) {
      steamChecked[e.id] = Date.now();
      const shots = await api.steamShots(e.appid);
      const have = new Set((e.media || []).map((m) => m.path));
      const add = shots.filter((p) => !have.has(p));
      if (add.length) { (e.media = e.media || []).push(...add.map((p) => ({ path: p, kind: 'image', src: 'steam', at: Date.now() }))); save(); Tasks.sync(e); }
      if (S.sel !== e) return;
    }
    const media = (e && !e.run && S.lib.settings.showcase !== false ? e.media || [] : []).filter((m) => m.path);
    const k = `${e?.id}|${media.length}|${e?.look}`;
    if (k === key) return;
    key = k; clearInterval(cycle);
    root.className = '';
    if (!media.length) { document.body.classList.remove('has-show'); fadeAll(); return; }
    root.style.setProperty('--sc-alpha', S.lib.settings.showcaseAlpha ?? 0.6);
    root.classList.add('on', 'f-' + (e.look || 'blur'));
    document.body.classList.add('has-show');
    // Start on a random item so glancing past a game looks different each time.
    let i = (Math.random() * media.length) | 0;
    put(media[i]);
    if (media.length > 1) cycle = setInterval(() => put(media[++i % media.length]), 14000);
  }

  function put(m) {
    const next = layers[front ^ 1], prev = layers[front];
    next.innerHTML = ''; next.style.backgroundImage = ''; next.classList.remove('kb');
    if (m.kind === 'video') {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.src = fileUrl(m.path);
      v.addEventListener('loadedmetadata', () => { if (isFinite(v.duration) && v.duration > 20) v.currentTime = Math.random() * (v.duration - 15); }, { once: true });
      next.appendChild(v);
      if (!document.hidden) v.play().catch(() => {});
    } else {
      next.style.backgroundImage = `url("${fileUrl(m.path)}")`;
      void next.offsetWidth; next.classList.add('kb');
    }
    next.classList.add('front'); prev.classList.remove('front');
    front ^= 1;
    setTimeout(() => { if (!prev.classList.contains('front')) { prev.innerHTML = ''; prev.style.backgroundImage = ''; } }, 1000);
  }

  function fadeAll() {
    layers.forEach((l) => l.classList.remove('front'));
    setTimeout(() => { if (!root.classList.contains('on')) layers.forEach((l) => { l.innerHTML = ''; l.style.backgroundImage = ''; }); }, 1000);
  }

  // Nothing decodes video while a game has the screen.
  document.addEventListener('visibilitychange', () => {
    for (const v of root.querySelectorAll('video')) document.hidden ? v.pause() : v.play().catch(() => {});
  });

  return { show, reset: () => { key = null; } };
})();

/* ================================================================ Recorder */
const Recorder = (() => {
  let rec = null, stream = null, key = null, entry = null, started = 0, stopTimer = 0, chain = Promise.resolve();
  const LIMIT = 5 * 60 * 1000;

  async function start(e) {
    if (rec) return;
    const id = await api.captureSource();
    if (!id) { toast('Recording was cancelled, so this session is not recorded.', 'err'); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxFrameRate: 30, maxWidth: 1920, maxHeight: 1080 } } });
    } catch { toast('The screen could not be recorded.', 'err'); return; }
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    key = await api.clipOpen(e.id); entry = e; started = Date.now(); chain = Promise.resolve();
    rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4e6 });
    const k = key;
    rec.ondataavailable = (ev) => { if (ev.data.size) chain = chain.then(() => ev.data.arrayBuffer()).then((b) => api.clipChunk(k, b)); };
    rec.onstop = finish;
    stream.getVideoTracks()[0].addEventListener('ended', stop);
    rec.start(4000);
    document.getElementById('rec').hidden = false;
    stopTimer = setTimeout(stop, LIMIT + 2000);
  }

  function stop() {
    clearTimeout(stopTimer);
    if (rec && rec.state !== 'inactive') rec.stop();
  }

  async function finish() {
    const e = entry, secs = Math.round((Date.now() - started) / 1000);
    await chain;
    stream?.getTracks().forEach((t) => t.stop());
    const file = await api.clipClose(key);
    rec = null; stream = null; key = null; entry = null;
    document.getElementById('rec').hidden = true;
    if (!file || !e) return;
    (e.media = e.media || []).push({ path: file, kind: 'video', rec: true, secs, at: Date.now() });
    save();
    toast(`Saved a ${Math.max(1, Math.round(secs / 60))} minute clip of ${e.title}.`, 'fun');
    Tasks.sync(e);
    if (S.sel === e) Showcase.show(e, true);
  }

  return { start, stop, busy: () => !!rec, since: () => (rec ? Date.now() - started : 0) };
})();

/* ================================================================ Friends + pokes */
const POKES = [
  { id: 'poke',      name: 'Poke',            sub: 'A friendly nudge',            msg: (f, g, me) => `👉 *poke* ${f}! ${me} wants you in ${g}. Hop on?` },
  { id: 'challenge', name: 'Challenge',       sub: 'First one past mission one',  msg: (f, g, me) => `⚔️ ${f}, ${me} challenges you: get past the first mission of ${g} before I do. Loser picks the next game.` },
  { id: 'time',      name: 'Beat my time',    sub: 'Hours played, on the line',   msg: (f, g, me, e) => `⏱️ ${me} has ${e.playtime ? (e.playtime / 3600).toFixed(1) + ' hours' : 'a head start'} in ${g}. Bet you can't catch up, ${f}.` },
  { id: 'opinion',   name: 'Second opinion',  sub: 'Get them curious',            msg: (f, g, me) => `🤔 ${f}, have you played ${g}? ${me} needs a second opinion. Tonight?` }
];

const Friends = (() => {
  const list = () => (S.lib.settings.friends = S.lib.settings.friends || []);
  const inbox = () => (S.lib.settings.inbox = S.lib.settings.inbox || []);
  const color = (name) => `hsl(${hash(name) % 360} 55% 45%)`;
  const link = (f) => f.link || '';
  const live = {};   // friend id -> what their Bladedeck said last, or false when it did not answer
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(); };

  function statusOf(f) {
    if (!f.ts) return esc(link(f) || 'No link: pokes are copied for you to paste');
    const h = live[f.id];
    if (h === undefined) return `Tailscale ${esc(f.ts)} · checking…`;
    if (!h) return `Tailscale ${esc(f.ts)} · offline`;
    return `<span class="on-dot"></span>Online${h.playing ? ` · playing <b>${esc(h.playing)}</b>` : ' · in the menu'}`;
  }

  async function check(f, after) {
    if (!f.ts) return;
    live[f.id] = (await api.netHello(f.ts)) || false;
    after?.();
  }

  function manage() {
    let found = null, looking = false;
    const draw = (root) => {
      const ib = inbox().slice(-6).reverse();
      $('.dlg-body', root).innerHTML = `
        ${ib.length ? `<div class="side-h" style="margin:0">Pokes for you</div>${ib.map((p) => `<div class="friend"><i class="av" style="background:${color(p.from)}">${esc(initials(p.from))}</i><div><b>${esc(p.from)}</b><span>${esc(p.text)} · ${esc(ago(p.at))}</span></div>${gameFor(p) ? `<button type="button" data-play="${esc(gameFor(p).id)}">Play</button>` : ''}</div>`).join('')}` : ''}
        <div class="side-h" style="margin:${ib.length ? '10px' : '0'} 0 0">Friends</div>
        ${list().length ? list().map((f, i) => `<div class="friend"><i class="av" style="background:${color(f.name)}">${esc(initials(f.name))}</i><div><b>${esc(f.name)}</b><span>${statusOf(f)}</span></div><button type="button" data-rm="${i}">Remove</button></div>`).join('')
          : '<p class="note">No friends added yet.</p>'}
        <div class="side-h" style="margin:10px 0 0">On your Tailscale network</div>
        ${found === null ? `<div><button type="button" data-x="scan">${looking ? 'Looking…' : 'Look for Bladedecks'}</button></div>`
          : found.error ? `<p class="note">${esc(found.error)}</p>`
          : found.peers.length ? found.peers.map((p) => `<div class="friend"><i class="av" style="background:${color(p.host)}">${esc(initials(p.deck?.name || p.host))}</i><div><b>${esc(p.deck?.name || p.host)}</b><span>${p.deck ? `Bladedeck on ${esc(p.host)}${p.deck.playing ? ` · playing ${esc(p.deck.playing)}` : ''}` : `${esc(p.host)} · Bladedeck is not running there`}</span></div>${p.deck && !list().some((f) => f.ts === p.ip) ? `<button type="button" data-addts="${esc(p.ip)}" data-name="${esc(p.deck.name || p.host)}">Add</button>` : ''}</div>`).join('')
          : '<p class="note">No other machines are online on your tailnet right now.</p>'}
        <div class="side-h" style="margin:10px 0 0">Add by hand</div>
        <label>Name<input type="text" name="fname" placeholder="Sam"></label>
        <label>Tailscale address (optional)<input type="text" name="fts" placeholder="100.x.y.z or sams-pc"></label>
        <label>Link (optional)<input type="text" name="flink" placeholder="https://discord.com/users/... or sam@example.com"></label>
        <div><button type="button" data-x="add">Add friend</button></div>
        <p class="note">Friends running Bladedeck on your Tailscale network get pokes instantly and can see what you are playing. Anyone else gets the message copied for you to paste, and their link opened.</p>`;
    };
    openModal({
      title: 'Friends', wide: true, html: '', buttons: [{ label: 'Done', primary: true }],
      onOpen: (root) => {
        draw(root);
        list().forEach((f) => check(f, () => { if (S.modal && $('.dlg-body', root)) draw(root); }));
        root.addEventListener('click', async (ev) => {
          const rm = ev.target.closest('[data-rm]'), add = ev.target.closest('[data-addts]'), pl = ev.target.closest('[data-play]');
          const x = ev.target.closest('[data-x]')?.dataset.x;
          if (rm) { list().splice(+rm.dataset.rm, 1); save(); draw(root); return; }
          if (pl) { const g = S.lib.entries.find((e) => e.id === pl.dataset.play); closeModal(); if (g) { S.sel = g; launch(g); } return; }
          if (add) { const f = { id: uid(), name: add.dataset.name, ts: add.dataset.addts, link: '' }; list().push(f); save(); Sound.play('toast'); check(f, () => draw(root)); draw(root); return; }
          if (x === 'scan') { looking = true; draw(root); found = await api.netPeers(); looking = false; draw(root); return; }
          if (x === 'add') {
            const name = val(root, 'fname'); let l = val(root, 'flink'); const ts = val(root, 'fts');
            if (!name) { toast('Give your friend a name.', 'err'); return; }
            if (l && /^[^@\s]+@[^@\s]+$/.test(l)) l = 'mailto:' + l;
            const f = { id: uid(), name, link: l, ts };
            list().push(f); save(); draw(root); Sound.play('toast'); check(f, () => draw(root));
          }
        });
      }
    });
  }

  const gameFor = (p) => S.lib.entries.find((e) => !e.hidden && ((p.appid && String(e.appid) === p.appid) || e.title.toLowerCase() === String(p.game).toLowerCase()));

  function poke(e) {
    if (!e || e.run) return;
    if (!list().length) { toast('Add a friend first.'); manage(); return; }
    let fi = 0, ki = 0;
    const me = S.lib.settings.playerName || 'Player 1';
    const text = () => {
      let m = POKES[ki].msg(list()[fi].name, e.title, me, e);
      if (e.type === 'steam' && e.appid) m += `\nhttps://store.steampowered.com/app/${e.appid}`;
      return m;
    };
    const draw = (root) => {
      const f = list()[fi];
      $('.dlg-body', root).innerHTML = `
        <label>Who<select name="who">${list().map((x, i) => `<option value="${i}" ${i === fi ? 'selected' : ''}>${esc(x.name)}${x.ts ? (live[x.id] ? ' (online)' : live[x.id] === false ? ' (offline)' : '') : ''}</option>`).join('')}</select></label>
        <div class="poke-kinds">${POKES.map((p, i) => `<button type="button" class="${i === ki ? 'on' : ''}" data-kind="${i}"><b>${esc(p.name)}</b><span>${esc(p.sub)}</span></button>`).join('')}</div>
        <div class="poke-preview">${esc(text())}</div>
        <p class="note">${f.ts ? (live[f.id] === false ? `${esc(f.name)} looks offline, so the message will be copied for you instead.` : `Goes straight to ${esc(f.name)}'s Bladedeck over Tailscale.`) : 'Copied for you to paste.'}</p>`;
    };
    openModal({
      title: `Poke a friend about ${e.title}`, wide: true, html: '',
      buttons: [{ label: 'Cancel' }, { label: 'Send', primary: true, onClick: () => send(e, list()[fi], POKES[ki], text()) }],
      onOpen: (root) => {
        draw(root);
        list().forEach((f) => check(f, () => { if (S.modal && $('.dlg-body', root)) draw(root); }));
        root.addEventListener('change', (ev) => { if (ev.target.name === 'who') { fi = +ev.target.value; draw(root); } });
        root.addEventListener('click', (ev) => { const k = ev.target.closest('[data-kind]'); if (k) { ki = +k.dataset.kind; draw(root); Sound.play('tick'); } });
      }
    });
  }

  async function send(e, f, kind, text) {
    const me = S.lib.settings.playerName || 'Player 1';
    let direct = false;
    if (f.ts) direct = await api.netPoke(f.ts, { from: me, kind: kind.id, game: e.title, appid: e.type === 'steam' ? String(e.appid || '') : '', text });
    const l = link(f);
    if (!direct) {
      await api.copy(text);
      if (l.startsWith('mailto:')) api.openLink(`${l}?subject=${encodeURIComponent(`${kind.name}: ${e.title}`)}&body=${encodeURIComponent(text)}`);
      else if (l) api.openLink(l);
    }
    (S.lib.settings.pokes = S.lib.settings.pokes || []).push({ friend: f.name, game: e.title, kind: kind.id, at: Date.now(), direct });
    e.poked = Date.now(); save();
    const fly = document.createElement('div');
    fly.className = 'poke-fly'; fly.textContent = kind.id === 'challenge' ? '⚔️' : '👉';
    fly.style.left = '50%'; fly.style.top = '50%';
    document.body.appendChild(fly); setTimeout(() => fly.remove(), 1100);
    Sound.play('secret');
    toast(direct ? `Delivered! ${f.name} just got your ${kind.name.toLowerCase()}.`
      : f.ts ? `${f.name}'s Bladedeck did not answer, so it's copied. Paste it to them.`
      : l && !l.startsWith('mailto:') ? `Copied! Paste it to ${f.name}.` : l ? `Email to ${f.name} is ready.` : `Copied! Send it to ${f.name} however you like.`, 'fun');
    Tasks.sync(e); refreshQuiet();
  }

  // A poke from a friend's Bladedeck.
  let waiting = null;
  function received(p) {
    inbox().push(p); if (inbox().length > 30) inbox().shift(); save();
    toast(`${p.from} ${p.kind === 'challenge' ? 'challenged' : 'poked'} you about ${p.game}!`, 'fun');
    Sound.play('secret');
    waiting = p;
    if (!document.hidden) offer();
  }
  function offer() {
    const p = waiting; if (!p || S.modal || Crash.busy()) return;
    waiting = null;
    const g = gameFor(p);
    openModal({
      title: `${p.from} ${p.kind === 'challenge' ? 'challenges you' : 'poked you'}`,
      html: `<div class="poke-preview">${esc(p.text)}</div><p class="note">${g ? `You have ${esc(g.title)}.` : `You don't have ${esc(p.game)} in your library.`}</p>`,
      buttons: [{ label: 'Later' }, ...(g ? [{ label: `Play ${g.title}`, primary: true, onClick: () => { S.sel = g; setTimeout(() => launch(g), 0); } }] : [])]
    });
  }
  window.bladedeck.onPoked(received);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && waiting) setTimeout(offer, 900); });

  // Tell friends what we are up to.
  function presence() {
    const p = S.playing && S.lib.entries.find((e) => e.id === S.playing.id);
    api.presence({ name: S.lib.settings.playerName, playing: p ? p.title : null, since: S.playing?.t || null });
  }
  setInterval(() => { if (S.lib) presence(); }, 10000);

  return { manage, poke, presence };
})();

/* ================================================================ Steam downloads tray */
const Downloads = (() => {
  let prev = null, list = [];
  const btn = document.getElementById('dl'), pop = document.getElementById('dl-pop');
  const gb = (n) => n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : (n / 1e6).toFixed(0) + ' MB';

  function update(next) {
    list = next || [];
    const ids = new Set(list.map((d) => d.appid));
    if (prev) {
      for (const d of list) if (!prev.has(d.appid)) toast(`Steam started downloading ${d.title}.`);
      const gone = [...prev.values()].filter((d) => !ids.has(d.appid));
      if (gone.length) finished(gone);
    }
    prev = new Map(list.map((d) => [d.appid, d]));
    draw();
  }

  async function finished(gone) {
    const r = await scanSteam(true);
    for (const d of gone) {
      if (!r?.games?.some((g) => String(g.appid) === String(d.appid))) continue;
      toast(`${d.title} finished downloading. Ready when you are!`, 'fun');
    }
  }

  function draw() {
    btn.hidden = !list.length;
    if (!list.length) { pop.hidden = true; return; }
    const done = list.reduce((a, d) => a + d.done, 0), total = list.reduce((a, d) => a + d.total, 0);
    btn.style.setProperty('--p', total ? (done / total * 100).toFixed(1) : 0);
    btn.querySelector('span').textContent = list.length > 1 ? `${list.length} downloads` : `${Math.floor(done / total * 100)}%`;
    pop.innerHTML = list.map((d) => `<div class="dl-row"><b>${esc(d.title)}</b><div class="dl-bar"><i style="width:${(d.done / d.total * 100).toFixed(1)}%"></i></div><span>${gb(d.done)} of ${gb(d.total)}${d.paused ? ', paused' : ''}</span></div>`).join('');
  }

  btn.addEventListener('click', () => { pop.hidden = !pop.hidden; });
  document.addEventListener('click', (ev) => { if (!ev.target.closest('#dl, #dl-pop')) pop.hidden = true; });

  return { update };
})();
