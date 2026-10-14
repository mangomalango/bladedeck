'use strict';
/* Players: controllers, and multi-screen play (players.js in main does the system side).
   Normal mode: every controller plugged in drives the menu, wired, wireless, Bluetooth or dongle.
   Multi-screen mode (turned on in Settings, Multi-screen, and only then): Player 1 keeps this
   Bladedeck on their screen; Player 2 gets a Bladedeck of their own, full screen on the other
   one. Each menu answers only its player's controller. A game started from a menu opens on that
   player's screen, plays on that player's sound output, and sees only that player's controller.
   View + Start pauses your game and brings up your menu; again, back to the game.
   Settings has a Controllers page (what is connected, how, battery, a rumble test, who is which
   player, DualSense sound) and a Multi-screen page. Uses S, api, esc, save, toast, Sound, Resume,
   Dock, winAct, openModal, closeModal and $ at call time. */

const Players = (() => {
  const me = new URLSearchParams(location.search).get('player') === '2' ? 2 : 1;
  let active = me === 2, inGame = false, claimingSlot = 0, moveTo = null;
  const cfg = () => (S.lib.settings.multi = S.lib.settings.multi || { p1: {}, p2: {} });
  const vpOf = (g) => { const m = /Vendor: (\w+) Product: (\w+)/.exec(g?.id || ''); return m ? `${m[1]}:${m[2]}`.toLowerCase() : ''; };
  const all = () => [...(navigator.getGamepads?.() || [])].filter(Boolean);
  /* The menu reads buttons by their standard places (A is 0, View 8, Menu 9). A controller the
     browser has no layout for reports them in another order, and with Steam running a Steam
     Controller shows up twice: raw (no layout) and as Steam's Xbox-style pad. So when any
     controller has the standard layout, the ones without it are left out. */
  const usable = (l) => { const std = l.filter((g) => g.mapping === 'standard'); return std.length ? std : l; };

  /* -------------------------------------------------------------- which controller is mine */
  function find(slot) {
    const want = cfg()[`p${slot}`]?.gp; if (!want) return null;
    const l = all();
    return l.find((g) => g.index === want.index && vpOf(g) === want.vp) || l.find((g) => vpOf(g) === want.vp && !taken(g, slot)) || null;
  }
  const taken = (g, slot) => { const o = cfg()[`p${slot === 1 ? 2 : 1}`]?.gp; return !!o && o.index === g.index && o.vp === vpOf(g); };
  // The controllers this window listens to.
  function pads() {
    if (claimingSlot) return []; // pressing A to claim a controller is not a menu press
    if (!active) return usable(all());
    const mine = find(me);
    if (mine) return [mine];
    // Player 1 without a claimed controller: any one that is not Player 2's.
    return me === 1 ? usable(all()).filter((g) => !find(2) || g.index !== find(2).index) : [];
  }
  // Whether this window's menu is the one being used (not a game in front of it).
  // A player whose games have all closed is back in their menu, however the game went away.
  const inMenu = () => (active ? !(inGame && (S.sessions || []).length) : null);

  /* -------------------------------------------------------------- games */
  /* This player's screen, by KDE's name (HDMI-A-1, eDP-1): the one picked in Settings, or else
     wherever this player's menu is. It used to be empty for "where Bladedeck is now", which sent
     Player 1's games wherever KWin liked (often Player 2's screen) and their sound to the TV. */
  let myScreen = '';
  async function conn() {
    const c = cfg()[`p${me}`]?.conn || (await api.msMyScreen().catch(() => '')) || '';
    myScreen = c; return c;
  }
  // What a launch needs to know in multi-screen: whose controller, which sound, which screen.
  async function launchOpts() {
    if (!active) return null;
    const c = cfg()[`p${me}`] || {}, screen = await conn();
    const r = await api.soundPlayerSink({ output: c.out || '', screen }).catch(() => ({}));
    return { multi: true, player: me, pads: c.pad ? [c.pad] : [], sink: r.ok ? r.data : '', screen };
  }
  /* A game started from this menu: its windows go to this player's screen as they open (for two
     minutes, every window it opens, since many games open a launcher or splash first), and its
     sound stays on this player's output for as long as it runs. Steam games are not our child
     processes, so they are known by their Steam app id instead. */
  const pinned = new Set();
  function launched(ses, e, player) {
    if (!active || !ses) return;
    inGame = true; ses.player = me;
    const appid = e?.type === 'steam' ? String(e.appid || '') : '';
    moveTo = { pid: ses.pid || 0, appid, conn: player?.screen || myScreen, until: Date.now() + 120000, seen: new Map() };
    if (player?.sink) { const key = `p${me}:${ses.id}`; pinned.add(key); api.msPinSound({ key, pid: ses.pid || 0, appid, sink: player.sink }); }
  }
  // Sound pins of games that ended let go.
  setInterval(() => {
    for (const key of pinned) if (!(S.sessions || []).some((x) => `p${me}:${x.id}` === key)) { pinned.delete(key); api.msPinSound({ key, sink: '' }); }
  }, 5000);
  async function isMine(w, t) {
    if (t.seen.has(w.id)) return t.seen.get(w.id);
    let ok = !!t.pid && w.pid === t.pid;
    const app = /^steam_app_(\d+)$/i.exec(w.cls || '');
    if (!ok && app) ok = app[1] === t.appid;
    else if (!ok) { const inf = await api.pidInfo(w.pid).catch(() => null); ok = (!!t.pid && !!inf?.ancestors?.includes(t.pid)) || (!!t.appid && String(inf?.appId || '') === t.appid); }
    t.seen.set(w.id, ok); return ok;
  }
  window.bladedeck.onPeek(async (ev) => {
    if (ev.kind !== 'windows' || !moveTo) return;
    if (Date.now() > moveTo.until) { moveTo = null; return; }
    const t = moveTo; if (!t.conn) return;
    let l; try { l = JSON.parse(ev.caption) || []; } catch { return; }
    for (const w of l) {
      if (!w.pid || w.web || w.panel || /bladedeck|^steam(webhelper)?$/i.test(w.cls || '') || t.seen.get(w.id) === 'moved') continue;
      if (!(await isMine(w, t))) continue;
      t.seen.set(w.id, 'moved');
      if (w.out !== t.conn) await api.winAct(w.id, `screen:${t.conn}`);
      api.winAct(w.id, 'show');
    }
  });
  function ended() { if (!active) return; if (!(S.sessions || []).length) inGame = false; api.msMenu(); }
  // In multi-screen, Running and Quick Resume show this player's things: their games, and windows
  // on their screen. Without this both menus listed both players' games.
  function owns(it) {
    if (!active) return true;
    if (it.e && (S.sessions || []).some((x) => x.id === it.e.id)) return true;
    if (it.e) return false;
    return !it.w?.out || !myScreen || it.w.out === myScreen;
  }

  // View + Start in multi-screen: pause the game and come to the menu, or back to the game.
  async function toggleMenu() {
    const ses = (S.sessions || []).find((x) => x.winPid || x.pid);
    if (!ses) { inGame = false; api.msMenu(); return; }
    const pid = ses.winPid || ses.pid;
    if (inGame) {
      await api.procFreeze(pid, true);
      inGame = false; await api.msMenu();
      const e = entryById(ses.id);
      toast(`${e?.title || 'Your game'} is paused. View + Start goes back to it.`);
      Sound.play('clank');
    } else {
      await api.procFreeze(pid, false);
      const it = (await Resume.snapshot()).items.find((x) => x.e && x.e.id === ses.id);
      inGame = true;
      if (it?.w) await winAct(it.w.id, 'show');
    }
  }

  /* -------------------------------------------------------------- multi-screen on and off */
  async function start() {
    const c = cfg();
    if (!c.p2?.screen) { toast('Pick Player 2\'s screen first.', 'err'); return false; }
    if (c.p1?.screen && c.p1.screen === c.p2.screen) { toast('The players need different screens.', 'err'); return false; }
    // Written now, not in a moment: Player 2's menu reads these from the file as it opens.
    await api.save(S.lib);
    if (c.p1?.screen) await api.msPlaceMain(c.p1.screen);
    const r = await api.msOpen(c.p2.screen);
    if (!r.ok) { toast(r.error, 'err'); return false; }
    active = true; document.body.classList.add('multi'); conn();
    toast('Multi-screen is on. Each player\'s menu answers only their own controller.', 'fun');
    return true;
  }
  let extended = false;
  async function stop() { await api.msClose(); if (extended) { await api.msExtend(false); extended = false; } active = false; inGame = false; document.body.classList.remove('multi'); toast('Multi-screen is off. Every controller drives this menu again.'); }
  window.bladedeck.onMsClosed?.(() => { if (me === 1 && active) { active = false; inGame = false; document.body.classList.remove('multi'); } });

  /* -------------------------------------------------------------- claiming a controller */
  // "Player N, press A": the system tells which device it was (so the game can get just that one),
  // and the page sees which pad it was (so the menu listens to just that one).
  async function claim(slot) {
    claimingSlot = slot;
    let gp = null;
    const watch = setInterval(() => { const g = all().find((x) => x.buttons.some((b) => b.pressed)); if (g && !gp) gp = { index: g.index, vp: vpOf(g) }; }, 30);
    // Windows: no system-side claim, so the controller is known only by the pad pressed in the page.
    let dev = WIN ? await new Promise((r) => { const t0 = Date.now(), i = setInterval(() => { if (gp || Date.now() - t0 > 8000) { clearInterval(i); r(gp ? { id: `gp:${gp.vp}:${gp.index}`, name: (all().find((x) => x.index === gp.index)?.id || 'Controller').replace(/\s*\(.*$/, '') } : null); } }, 50); }) : await api.padsClaim();
    await new Promise((r) => setTimeout(r, 120));
    clearInterval(watch);
    // Let go of the button before the menu listens again.
    setTimeout(() => { claimingSlot = 0; }, 400);
    if (!dev || !gp) return null;
    const c = cfg(); c[`p${slot}`] = { ...(c[`p${slot}`] || {}), pad: dev.id, gp, padName: dev.name };
    // One controller cannot be both players.
    const other = c[`p${slot === 1 ? 2 : 1}`];
    if (other?.pad === dev.id) { delete other.pad; delete other.gp; delete other.padName; }
    save();
    rumble(gp.index);
    return dev;
  }
  // Rumble strength (Settings, Controllers): Bladedeck's own rumble is scaled by it, and a DualSense
  // is told it too, so games rumble that hard as well.
  const strength = () => Math.max(0, Math.min(100, S.lib.settings.rumbleStrength ?? 100)) / 100;
  function shake(g, ms, strong, weak) {
    const k = strength(); if (!k) return;
    try { g?.vibrationActuator?.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong * k), weakMagnitude: Math.min(1, weak * k) }); } catch { /* no rumble */ }
  }
  function rumble(index, ms = 220) { shake(all().find((x) => x.index === index), ms, 0.7, 0.5); }
  // A little bump on menu moves, if that is turned on.
  function bump() { if (!S.lib.settings.padRumble) return; for (const g of pads()) shake(g, 40, 0, 0.35); }
  // The DualSense's own settings (sound path, volumes, rumble strength), sent again whenever it
  // connects, since the controller forgets them when it is switched off.
  async function applyPad() {
    const st = S.lib.settings;
    if (st.dsMode) await api.dsOutputs(st.dsMode, { speaker: st.dsSpeakerVol ?? 80, headphones: st.dsJackVol ?? 80 }).catch(() => {});
    if ((st.rumbleStrength ?? 100) !== 100) await api.dsSet({ rumble: Math.max(12, st.rumbleStrength) }).catch(() => {});
  }
  addEventListener('gamepadconnected', (ev) => { if (/054c/i.test(ev.gamepad.id) && me === 1) setTimeout(applyPad, 1500); });

  /* -------------------------------------------------------------- Settings: Controllers */
  const ICON = { DualSense: '🎮', 'DualSense Edge': '🎮', 'DualShock 4': '🎮', Xbox: '🎮', 'Xbox-style': '🎮', 'Switch Pro': '🕹', Nintendo: '🕹', '8BitDo': '🕹', Steam: '🎮', Stadia: '🎮', Controller: '🎮' };
  // Windows has no controller list of its own in main (Linux reads /sys): the page's gamepads are it.
  const WIN = navigator.userAgent.includes('Windows');
  const winPads = () => usable(all()).map((g) => ({ id: `gp:${vpOf(g)}:${g.index}`, name: g.id.replace(/\s*\(.*$/, '') || 'Controller', conn: 'Connected',
    kind: /054c/i.test(g.id) ? 'DualSense' : /045e|xinput|xbox/i.test(g.id) ? 'Xbox' : /057e/i.test(g.id) ? 'Nintendo' : /28de/i.test(g.id) ? 'Steam' : /18d1/i.test(g.id) ? 'Stadia' : 'Controller' }));
  async function drawControllers(box) {
    const [all0, ds, sd] = await Promise.all([api.padsList().catch(() => []), api.dsStatus().catch(() => ({})), api.stadiaStatus?.().catch(() => ({})) ?? {}]);
    const list = WIN && !all0.length ? winPads() : all0.filter((p) => !p.aux);
    const c = cfg(), st = S.lib.settings;
    const who = (p) => (c.p1?.pad === p.id ? 'Player 1' : c.p2?.pad === p.id ? 'Player 2' : '');
    box.innerHTML = `
      <div class="pl-list">${list.length ? list.map((p) => `<div class="pl-pad">
          <i class="pl-ic">${ICON[p.kind] || '🎮'}</i>
          <div class="pl-t"><b>${esc(p.name)}</b><span>${esc(p.kind)} · ${esc(p.conn)}${p.battery ? ` · 🔋 ${p.battery.pct}%${p.battery.charging ? ' charging' : ''}` : ''}${who(p) ? ` · <em>${who(p)}</em>` : ''}</span></div>
        </div>`).join('') : '<p class="note">No controller is connected. Plug one in with a cable, pair it over Bluetooth in System Settings, or plug in its wireless dongle.</p>'}</div>
      <div class="pl-acts"><button type="button" data-pl="claim1">Player 1: press a button…</button><button type="button" data-pl="claim2">Player 2: press a button…</button><button type="button" data-pl="rumble">Test rumble</button><button type="button" data-pl="refresh">Refresh</button></div>
      <div class="steam-sleep"></div>
      <h4 class="set-sub">Rumble</h4>
      <label class="range-row">Rumble strength <b class="rs-v">${st.rumbleStrength ?? 100}%</b><input type="range" name="rumbleStrength" min="0" max="100" step="12.5" value="${st.rumbleStrength ?? 100}"></label>
      <p class="note">Bladedeck's own rumble follows it on every controller. A DualSense also rumbles this hard in games (and its adaptive triggers push this hard), wired or Bluetooth.</p>
      <div class="checks"><label><input type="checkbox" name="padRumble" ${st.padRumble ? 'checked' : ''}> Rumble a little when moving through the menu</label></div>
      ${sd?.present ? `<h4 class="set-sub">Stadia controller</h4>
        <p class="note">${sd.usb ? `Connected by USB: buttons, ${sd.rumble ? 'rumble' : 'rumble (once Linux loads its driver, hid-google-stadiaff, which happens by itself when it is plugged in)'}, its headphone jack and its microphone work.` : 'Connected over Bluetooth: every button works. Linux gives it no rumble or sound over Bluetooth; a USB cable adds both.'}</p>
        <p class="note">Its own buttons: <b>Stadia</b> opens the sound card, <b>Assistant</b> asks Bladedeck by voice, <b>Capture</b> saves the last moments (hold it to start or stop recording). They work in games too. The headphone jack shows up in Sound as "Controller headphones".</p>` : ''}
      <h4 class="set-sub">DualSense sound and microphone</h4>
      ${WIN ? '<p class="note">On Windows a DualSense connected by <b>USB cable</b> is an ordinary sound device and microphone ("Wireless Controller"): pick it in the sound card. Separate speaker and headphone outputs are a Linux feature.</p>'
        : ds.present && ds.usb ? `<p class="note">Connected by USB: its speaker, headphone jack and microphone work.</p>
        <label>Sound from the controller<select name="dsMode">
          <option value="" ${!st.dsMode ? 'selected' : ''}>Leave it to the system (headphones when plugged in, else the speaker)</option>
          <option value="jack" ${st.dsMode === 'jack' ? 'selected' : ''}>Headphone jack (stereo)</option>
          <option value="speaker" ${st.dsMode === 'speaker' ? 'selected' : ''}>Speaker, even with headphones plugged in</option>
          <option value="both" ${st.dsMode === 'both' ? 'selected' : ''}>Both: speaker and headphones, each its own output</option></select></label>
        <div class="row2"><label class="range-row">Speaker volume<input type="range" name="dsSpeakerVol" min="0" max="100" step="5" value="${st.dsSpeakerVol ?? 80}"></label>
          <label class="range-row">Headphone volume<input type="range" name="dsJackVol" min="0" max="100" step="5" value="${st.dsJackVol ?? 80}"></label></div>
        <div class="pl-acts"><button type="button" data-pl="dstest">Play a test sound on the controller</button></div>
        <p class="note">They show up in Sound as "Controller speaker" and "Controller headphones", and can be a player's sound in Multi-screen. With "Both", headphones play in mono.</p>
        <div class="checks"><label><input type="checkbox" name="padMenuSounds" ${st.padMenuSounds ? 'checked' : ''}> Play menu sounds from the controller's speaker</label>
        <label><input type="checkbox" name="padMic" ${st.padMic ? 'checked' : ''}> Voice commands listen through the controller's microphone (a Stadia controller's too)</label></div>`
        : ds.present ? '<p class="note">Your DualSense is connected over Bluetooth: buttons, touchpad and rumble work (rumble strength too). Its speaker, headphone jack and microphone need a <b>USB cable</b> on Linux.</p>'
        : '<p class="note">No DualSense is connected. Its speaker, headphone jack and microphone work over a <b>USB cable</b>; over Bluetooth or a dongle Linux gives it buttons and rumble, but no sound.</p>'}`;
    drawSteamSleep(box);
  }
  // Steam's own layouts can put the PC to sleep from a button (steaminput.js in main).
  async function drawSteamSleep(box) {
    const el = $('.steam-sleep', box); if (!el) return;
    const l = await api.steamSleepScan().catch(() => []);
    if (!l.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<h4 class="set-sub">Steam puts the PC to sleep from a button</h4>
      <p class="note">${l.map((x) => `<b>${esc(x.press[0].toUpperCase() + x.press.slice(1))} ${esc(x.button)}</b> on a ${esc(x.layout)} controller (Steam's ${esc(x.app)} layout)`).join('<br>')}.
      Steam does this whenever no game is running, so in Bladedeck too, and holding Menu is half of View + Menu. Turning it off keeps a copy of each file. Steam has to be closed first.</p>
      <div class="pl-acts"><button type="button" data-pl="steamsleep">Turn off sleep from the controller</button></div>`;
  }
  async function wireControllers(box) {
    await drawControllers(box);
    box.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-pl]'); if (!b) return;
      const a = b.dataset.pl;
      if (a === 'claim1' || a === 'claim2') {
        const slot = a === 'claim1' ? 1 : 2, was = b.textContent;
        b.textContent = `Player ${slot}: press any button on your controller now`; b.classList.add('wait');
        const dev = await claim(slot);
        b.classList.remove('wait'); b.textContent = was;
        if (dev) { toast(`${dev.name} is Player ${slot}.`, 'fun'); Sound.play('pop'); } else toast('No button was pressed.', 'err');
        drawControllers(box);
      } else if (a === 'dstest') {
        const which = S.lib.settings.dsMode === 'jack' ? /controller headphones/i : /controller speaker|controller headphones|dualsense/i;
        if (!(await Sound.test(which))) toast('Pick where the controller\'s sound goes first.', 'err');
      } else if (a === 'rumble') { for (const g of all()) rumble(g.index, 400); if (!all().length) toast('No controller is connected.', 'err'); }
      else if (a === 'refresh') drawControllers(box);
      else if (a === 'steamsleep') {
        const r = await api.steamSleepFix();
        if (r.steamRunning) toast('Close Steam first (Steam menu, Exit), then press this again.', 'err');
        else if (!r.ok) toast(r.error || 'That did not work.', 'err');
        else { toast(r.left ? 'Some were left; Steam may have put them back.' : 'Done. The controller no longer puts the PC to sleep.', r.left ? 'err' : 'fun'); S.lib.settings.steamSleepSeen = true; save(); }
        drawSteamSleep(box);
      }
    });
    // Changes are heard and felt straight away, not only after Save.
    const vols = () => ({ speaker: +($('[name=dsSpeakerVol]', box)?.value ?? 80), headphones: +($('[name=dsJackVol]', box)?.value ?? 80) });
    box.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.name === 'rumbleStrength') { $('.rs-v', box).textContent = `${t.value}%`; S.lib.settings.rumbleStrength = +t.value; for (const g of all()) rumble(g.index, 250); api.dsSet({ rumble: Math.max(12, +t.value) }); }
      if (t.name === 'dsSpeakerVol' || t.name === 'dsJackVol') api.dsSet(vols());
    });
    box.addEventListener('change', async (ev) => {
      const t = ev.target;
      if (t.name === 'dsMode') {
        const r = await api.dsOutputs(t.value, vols());
        if (!r.ok) { toast(r.error, 'err'); t.value = S.lib.settings.dsMode || ''; return; }
        S.lib.settings.dsMode = t.value; save();
        toast({ '': 'The system decides where the controller\'s sound goes again.', jack: 'Controller sound: headphone jack.', speaker: 'Controller sound: speaker.', both: 'Controller speaker and headphones are two outputs now.' }[t.value]);
      }
    });
  }
  function readControllers(root) {
    const st = S.lib.settings, ch = (n) => !!$(`[name="${n}"]`, root)?.checked;
    if ($('[name=padRumble]', root)) st.padRumble = ch('padRumble');
    if ($('[name=padMenuSounds]', root)) st.padMenuSounds = ch('padMenuSounds');
    if ($('[name=padMic]', root)) st.padMic = ch('padMic');
    for (const n of ['rumbleStrength', 'dsSpeakerVol', 'dsJackVol']) if ($(`[name=${n}]`, root)) st[n] = +$(`[name=${n}]`, root).value;
    if ($('[name=dsMode]', root)) st.dsMode = $('[name=dsMode]', root).value;
    applySounds();
  }
  // Menu sounds from the controller speaker (or Player 2's window from their own output).
  function applySounds() {
    const st = S.lib.settings;
    if (st.padMenuSounds) Sound.setOutput(/controller speaker/i);
    else if (me === 2 && cfg().p2?.outLabel) Sound.setOutput(new RegExp(cfg().p2.outLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    else Sound.setOutput(null);
  }

  /* -------------------------------------------------------------- Settings: Multi-screen */
  async function drawMulti(box) {
    const [ds, all0, snd, mir] = await Promise.all([api.msDisplays().catch(() => []), api.padsList().catch(() => []), api.soundState().catch(() => ({})), api.msMirrored().catch(() => [])]);
    const list = all0.filter((p) => !p.aux);
    const c = cfg();
    const outs = (snd.ok ? snd.data.outputs : []).filter((o) => !o.unplugged);
    const scr = (slot) => `<select name="ms${slot}screen"><option value="">${slot === 1 ? 'Where Bladedeck is now' : 'Pick a screen'}</option>${ds.map((d) => `<option value="${d.id}" ${String(c[`p${slot}`]?.screen) === String(d.id) ? 'selected' : ''}>${esc(d.builtIn ? `Laptop screen (${d.name || d.label})` : d.name || d.label)} · ${d.bounds.width}×${d.bounds.height}</option>`).join('')}</select>`;
    const out = (slot) => `<select name="ms${slot}out"><option value="">That screen's own speakers</option>${outs.map((o) => `<option value="${esc(o.name)}" ${c[`p${slot}`]?.out === o.name ? 'selected' : ''}>${esc(o.port && !/^analog/i.test(o.port) ? o.port : o.label)}</option>`).join('')}</select>`;
    const pads0 = WIN && !list.length ? winPads() : list;
    const need = [[ds.length >= 2, `Two screens (${ds.length} connected)`], [pads0.length >= 2, `Two controllers (${pads0.length} connected)`],
      WIN ? [true, 'Windows puts each game on its player\'s screen'] : [NowPlaying.mode() === 'kwin', 'KDE Plasma (puts each game on its player\'s screen)']];
    box.innerHTML = `
      <p class="note">Two players, two screens, two games at once, each with their own menu, controller and sound. ${WIN
        ? 'On Windows each menu answers only its player\'s controller and each game opens on its player\'s screen, but games see every controller and play on the default sound output: those two need Linux.'
        : 'Games Bladedeck starts itself (PC games, emulators, ports) get only their player\'s controller; a Steam game started through Steam sees every controller.'}</p>
      <ul class="sp-need">${need.map(([ok, t]) => `<li class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${esc(t)}</li>`).join('')}</ul>
      ${mir.length ? `<div class="ph-fw"><b>Your screens show the same picture</b><p>${esc(mir.map((m) => `${m.name} copies ${m.source}`).join(', '))}. For two players they need to be side by side. Bladedeck can do that now and put them back when multi-screen is turned off.</p><button type="button" data-ms="extend">Use them as two screens</button></div>` : ''}
      <div class="row2"><div class="ms-p"><b>Player 1</b><label>Screen${scr(1)}</label><label>Sound${out(1)}</label><small>${esc(c.p1?.padName || 'Controller: not picked (any that is not Player 2\'s)')}</small></div>
        <div class="ms-p"><b>Player 2</b><label>Screen${scr(2)}</label><label>Sound${out(2)}</label><small>${esc(c.p2?.padName || 'Controller: not picked yet')}</small></div></div>
      <p class="note">Pick each player's controller on the Controllers page. View + Start pauses your game and brings up your own menu.</p>
      <div class="pl-acts">${active ? '<button type="button" data-ms="stop">Turn multi-screen off</button>' : `<button type="button" class="primary" data-ms="start" ${ds.length >= 2 ? '' : 'disabled'}>Turn multi-screen on</button>`}</div>`;
    box.__ds = ds; box.__outs = outs;
  }
  function readMulti(root) {
    const box = $('.ms-box', root); if (!box?.__ds) return;
    const c = cfg();
    for (const slot of [1, 2]) {
      const id = $(`[name=ms${slot}screen]`, root)?.value || '', d = box.__ds.find((x) => String(x.id) === id), o = $(`[name=ms${slot}out]`, root)?.value || '';
      const outObj = box.__outs.find((x) => x.name === o);
      c[`p${slot}`] = { ...(c[`p${slot}`] || {}), screen: id ? +id : '', conn: d?.name || '', out: o, outLabel: outObj ? outObj.label : '' };
    }
  }
  async function wireMulti(box, root) {
    await drawMulti(box);
    box.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-ms]'); if (!b) return;
      if (b.dataset.ms === 'extend') {
        if (!(await confirmAsk({ title: 'Set the screens side by side?', text: 'Each screen gets its own picture. Turning multi-screen off puts them back to showing the same thing.', yes: 'Set them side by side' }))) { openSettingsAt('multi'); return; }
        const r = await api.msExtend(true);
        if (!r.ok) toast(r.error, 'err'); else { extended = true; toast('The screens are side by side now.'); }
        openSettingsAt('multi'); return;
      }
      if (b.dataset.ms === 'start') { readMulti(root); b.disabled = true; if (await start()) closeModal(); else b.disabled = false; }
      else { await stop(); drawMulti(box); }
    });
  }

  if (me === 2) { document.body.classList.add('p2', 'multi'); setTimeout(conn, 1500); }
  // Once: tell the player if Steam's layout can put the PC to sleep from the controller.
  if (me === 1) setTimeout(async () => {
    if (!S.lib || S.lib.settings.steamSleepSeen) return;
    const l = await api.steamSleepScan().catch(() => []);
    if (!l.length) return;
    S.lib.settings.steamSleepSeen = true; save();
    const x = l.find((y) => y.button === 'Menu') || l[0];
    toast(`Steam puts this PC to sleep when you ${x.press} ${x.button} on the controller. Settings, Controllers can turn that off.`, 'err');
  }, 9000);

  return { me, pads, inMenu, launchOpts, launched, ended, owns, applyPad, shake, toggleMenu, bump, applySounds, on: () => active, isP2: () => me === 2,
    wireControllers, readControllers, wireMulti, readMulti, claiming: () => !!claimingSlot };
})();
