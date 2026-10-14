'use strict';
/* Atmosphere: the UI design direction from Nate's console research, around the blades (the blades
   themselves stay as they are).
   - Living background: the background brightens through the day and dims at night, warms at
     sunset, and takes a seasonal hue by month (cooler in winter, greener in spring, richer in
     summer, warmer in autumn). Settings, Look and sound turns it off.
   - TV safe zones: an overscan margin (Settings, Look and sound) keeps text and controls inside what
     a TV, CRT or plasma shows; while it is adjusted, corner marks show where the edge falls.
   - Elastic edges: pushing past the end of a list or the last blade stretches it a little instead
     of stopping dead.
   - Focus is never lost: with a controller, a dialog always has something highlighted.
   - Fixed anchors: each blade remembers the game you were on, across restarts, so you find things
     by memory.
   - Preview loop: a highlighted game's poster plays a short silent loop of your own clip of it.
   - Living widget: the weather for your town and today's date in the top bar; it opens a small
     forecast and a month calendar with your alarms and timers.
   Uses S, api, esc, fileUrl, save, toast, openModal, PadNav, Weather and $ at call time. */
const Atmos = (() => {
  const st = () => S.lib?.settings || {};
  const root = document.documentElement;

  /* -------------------------------------------------------------- living background */
  // Brightness across the day (hour -> level), with a warm tint around sunrise and sunset.
  const DAY = [[0, 0.72], [5, 0.74], [7, 0.9], [10, 1.02], [14, 1.04], [17, 0.96], [19, 0.86], [21, 0.78], [24, 0.72]];
  const SEASON = [[-14, 0.88], [-12, 0.9], [8, 1.02], [12, 1.06], [10, 1.08], [4, 1.12], [2, 1.14], [6, 1.1], [16, 1.04], [20, 1.0], [12, 0.94], [-10, 0.88]]; // [hue, saturation] by month
  function living() {
    if (st().livingBg === false) { root.style.removeProperty('--tod-filter'); return; }
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    let b = 1;
    for (let i = 0; i < DAY.length - 1; i++) if (h >= DAY[i][0] && h < DAY[i + 1][0]) { const k = (h - DAY[i][0]) / (DAY[i + 1][0] - DAY[i][0]); b = DAY[i][1] + (DAY[i + 1][1] - DAY[i][1]) * k; }
    const warm = Math.max(0, 1 - Math.min(Math.abs(h - 6.5), Math.abs(h - 19)) / 1.5) * 0.18;
    const [hue, sat] = SEASON[d.getMonth()];
    root.style.setProperty('--tod-filter', `brightness(${b.toFixed(3)}) saturate(${sat}) hue-rotate(${hue}deg) sepia(${warm.toFixed(3)})`);
  }
  setInterval(living, 5 * 60000);

  /* -------------------------------------------------------------- TV safe zones */
  function safe(pct) {
    const p = Math.max(0, Math.min(10, +(pct ?? st().tvSafe ?? 0)));
    root.style.setProperty('--sx', `${Math.round(innerWidth * p / 100)}px`);
    root.style.setProperty('--sy', `${Math.round(innerHeight * p / 100)}px`);
  }
  addEventListener('resize', () => safe());
  let marks = null, marksT = 0;
  // Corner marks at the safe edge, while the slider moves (they fade a few seconds after).
  function calibrate(pct) {
    safe(pct);
    if (!marks) { marks = document.createElement('div'); marks.id = 'safe-marks'; marks.innerHTML = '<i></i><i></i><i></i><i></i><b>Move it until the corner marks are fully on the screen</b>'; document.body.appendChild(marks); }
    marks.classList.add('on'); clearTimeout(marksT); marksT = setTimeout(() => marks.classList.remove('on'), 3500);
  }

  /* -------------------------------------------------------------- elastic edges */
  function bump(el, dir, axis = 'y') {
    if (!el || st().fx === false) return;
    const d = dir * (axis === 'y' ? 14 : 22);
    el.animate([{ transform: 'none' }, { transform: axis === 'y' ? `translateY(${d}px) scaleY(1.015)` : `translateX(${d}px)` }, { transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.3, 1.5, .5, 1)' });
  }

  /* -------------------------------------------------------------- focus is never lost */
  setInterval(() => {
    if (!S.pad) return;
    const m = document.querySelector('#modal.open');
    if (m && !m.querySelector('.pad-hl') && !m.querySelector('.osk')) PadNav.start(m);
  }, 700);

  /* -------------------------------------------------------------- fixed anchors */
  const KEY = 'bd-anchors';
  let anchors = {}; try { anchors = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { anchors = {}; }
  const bladeKey = (b) => b?.id || b?.name || '';
  function remember(b, e) {
    if (!b || !e || e.header) return;
    anchors[bladeKey(b)] = e.id;
    clearTimeout(remember.t); remember.t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(anchors)); } catch { /* private window */ } }, 800);
  }
  const anchorOf = (b) => anchors[bladeKey(b)] || null;

  /* -------------------------------------------------------------- preview loop */
  let pv = { id: null, t: 0 };
  function stopPreviews() {
    for (const v of document.querySelectorAll('.pv-loop')) {
      v.pause();
      v.removeAttribute('src');
      try { v.load(); } catch {}
      v.closest('.pv-on')?.classList.remove('pv-on');
      v.remove();
    }
  }
  function preview(e, poster) {
    clearTimeout(pv.t);
    stopPreviews();
    if (!poster || !e || e.run || st().previewLoop === false || document.body.classList.contains('away')) return;
    const clips = (e.media || []).filter((m) => m.kind === 'video' && m.path);
    if (!clips.length) return;
    const id = e.id;
    pv = { id, t: setTimeout(() => {
      if (S.sel?.id !== id || !poster.isConnected) return;
      stopPreviews();
      const m = clips.find((c) => c.tag === 'achievement') || clips[(Math.random() * clips.length) | 0];
      const v = document.createElement('video');
      v.className = 'pv-loop'; v.muted = true; v.playsInline = true; v.src = fileUrl(m.path);
      let from = 0;
      v.addEventListener('loadedmetadata', () => { from = isFinite(v.duration) && v.duration > 12 ? Math.random() * (v.duration - 10) : 0; v.currentTime = from; v.play().catch(() => {}); }, { once: true });
      // Eight seconds, again and again.
      v.addEventListener('timeupdate', () => { if (v.currentTime > from + 8) v.currentTime = from; });
      v.addEventListener('playing', () => poster.classList.add('pv-on'), { once: true });
      poster.appendChild(v);
    }, 1200) };
  }
  document.addEventListener('deck-away', (ev) => { if (ev.detail) stopPreviews(); });

  /* -------------------------------------------------------------- living widget */
  const chip = document.createElement('button');
  chip.id = 'wx-chip'; chip.type = 'button'; chip.setAttribute('aria-label', 'Weather and calendar');
  document.getElementById('clock')?.before(chip);
  let wx = null, wxAt = 0;
  async function widget() {
    const d = new Date();
    const date = d.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
    const town = st().town;
    if (town && Date.now() - wxAt > 30 * 60000 && !document.body.classList.contains('away')) {
      wxAt = Date.now();
      const w = await api.weather(town).catch(() => null);
      wx = w && w.ok ? w : null;
    }
    const sky = wx ? Weather.sky(wx.current.weather_code) : null;
    chip.innerHTML = `${sky ? `<span>${sky[1]}</span><b>${Math.round(wx.current.temperature_2m)}°</b>` : ''}<em>${esc(date)}</em>`;
    chip.hidden = st().widget === false;
  }
  setInterval(widget, 60000);
  chip.addEventListener('click', () => today());
  // Today: the forecast and a month calendar, with alarms and timers marked.
  function today() {
    const d = new Date(), y = d.getFullYear(), mo = d.getMonth();
    const first = new Date(y, mo, 1).getDay(), days = new Date(y, mo + 1, 0).getDate();
    const alarms = (st().alarms || []).filter((a) => a.at > Date.now()).sort((a, b) => a.at - b.at);
    const marked = new Set(alarms.filter((a) => new Date(a.at).getMonth() === mo).map((a) => new Date(a.at).getDate()));
    const cells = [...Array(first).fill(''), ...Array.from({ length: days }, (_, i) => i + 1)];
    const forecast = wx ? `<div class="td-days">${wx.daily.time.slice(0, 4).map((t, i) => `<div><b>${i ? new Date(t + 'T12:00').toLocaleDateString([], { weekday: 'short' }) : 'Today'}</b><span>${Weather.sky(wx.daily.weather_code[i])[1]}</span><small>${Math.round(wx.daily.temperature_2m_max[i])}° / ${Math.round(wx.daily.temperature_2m_min[i])}°</small></div>`).join('')}</div>`
      : `<p class="note">${st().town ? 'The weather could not be fetched right now.' : 'Add your town in Settings, General, for the weather here.'}</p>`;
    openModal({ title: d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }), wide: true,
      html: `<div class="td">${forecast}
        <div class="td-cal"><div class="td-month">${d.toLocaleDateString([], { month: 'long', year: 'numeric' })}</div>
          <div class="td-grid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<i>${x}</i>`).join('')}${cells.map((n) => `<span class="${n === d.getDate() ? 'now' : ''} ${marked.has(n) ? 'mark' : ''}">${n}</span>`).join('')}</div></div>
        <h4 class="set-sub">Alarms and timers</h4>
        ${alarms.length ? alarms.slice(0, 6).map((a) => `<div class="src-row"><i>${a.kind === 'timer' ? '⏲' : '⏰'}</i><div class="src-t"><b>${esc(a.label || (a.kind === 'timer' ? 'Timer' : 'Alarm'))}</b><small>${new Date(a.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</small></div></div>`).join('') : '<p class="note">None set. Say "wake me up at 7" or "timer for 10 minutes" (View + LB).</p>'}</div>`,
      buttons: [{ label: 'Close', primary: true }] });
  }

  /* -------------------------------------------------------------- display tuning
     Recommended settings per screen type. "Use them" sets what Bladedeck controls (the safe
     margin, a burn-in guard, a scanline look); the tips cover what only the screen or an emulator
     can change. Scaling here means integer scaling: whole-number zoom, so pixels stay square. */
  const SCREENS = {
    ips: { name: 'Laptop or desktop monitor (IPS)', safe: 0, guard: false, crt: false, tips: ['Nothing to change in Bladedeck.', 'Emulators: integer scaling on for 2D games keeps pixels even; 1080p screens suit 5x for SNES-era games.', 'Dark scenes can glow at the corners: lower the screen brightness rather than the game\'s.'] },
    va: { name: 'VA monitor or TV', safe: 0, guard: false, crt: false, tips: ['VA panels smear dark colours in motion: turn on the screen\'s overdrive (often "Response time: Fast").', 'Deep blacks: a dark theme (Aero Night, Blueprint) looks its best here.', 'Emulators: integer scaling on for 2D games.'] },
    oled: { name: 'OLED (TV, monitor or handheld)', safe: 0, guard: true, crt: false, tips: ['The burn-in guard dims and gently moves the menu after 3 minutes untouched.', 'Use the screen\'s own pixel refresh when it asks; do not leave a paused game on screen for hours.', 'Turn on game mode on the TV for the lowest delay; HDR games look best with HDR on in the system settings.', 'Emulators: black frame insertion (RetroArch, Dolphin) makes motion sharper on 120 Hz OLEDs.'] },
    tv: { name: 'LCD TV', safe: 2.5, guard: false, crt: false, tips: ['A 2.5% safe margin keeps menus off the edges older TVs cut off; set the TV to "Just scan" or "Screen fit" and lower it to 0.', 'Turn on game mode (lowest delay) and turn off motion smoothing and sharpness.', 'Emulators: integer scaling on; RetroArch\'s "CRT-Royale" or "Lottes" shaders imitate an old TV.'] },
    plasma: { name: 'Plasma TV', safe: 3, guard: true, crt: false, tips: ['Plasmas can keep a ghost of still images: the burn-in guard dims and moves the menu when it is left alone.', 'A 3% safe margin for the overscan most plasmas have; lower it if the TV has "Just scan".', 'Game mode on, and avoid playing with letterbox bars for very long sessions.'] },
    crt: { name: 'CRT TV or monitor', safe: 5, guard: false, crt: true, tips: ['A 5% safe margin: CRTs hide their edges behind the bezel.', 'Use 640x480 or 720x480 output and your emulator\'s native resolution, with no shaders (the real screen does the work).', 'Integer scaling off at low resolutions; turn on interlacing only for 480i games.', 'The scanline look adds a soft line pattern to the menu, to match the games.'] }
  };
  let idleT = 0, lastInput = Date.now(), shiftT = 0;
  function poke() {
    lastInput = Date.now();
    if (document.body.classList.contains('guarded')) { document.body.classList.remove('guarded'); root.style.removeProperty('--shift'); }
  }
  ['keydown', 'pointermove', 'pointerdown', 'wheel'].forEach((ev) => addEventListener(ev, poke, { passive: true, capture: true }));
  function screenTune() {
    const s = st();
    document.body.classList.toggle('crt-look', !!s.crtLook);
    clearInterval(idleT); clearInterval(shiftT);
    if (s.burnGuard) {
      idleT = setInterval(() => { if (Date.now() - lastInput > 180000 && !document.body.classList.contains('away')) document.body.classList.add('guarded'); }, 15000);
      shiftT = setInterval(() => { if (document.body.classList.contains('guarded')) root.style.setProperty('--shift', `${Math.round(Math.random() * 8 - 4)}px, ${Math.round(Math.random() * 8 - 4)}px`); }, 60000);
    }
  }
  function screenHtml() {
    const s = st(), cur = s.screenType || '';
    return `<label>Your screen<select name="screenType"><option value="">Not chosen</option>${Object.entries(SCREENS).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
      <div class="scr-tips">${cur ? `<ul>${SCREENS[cur].tips.map((t) => `<li>${t}</li>`).join('')}</ul>` : '<p class="note">Pick the kind of screen Bladedeck is on for settings that suit it.</p>'}</div>
      <div class="btns"><button type="button" data-x="screenUse" ${cur ? '' : 'disabled'}>Use the recommended settings</button></div>
      <div class="checks"><label><input type="checkbox" name="burnGuard" ${s.burnGuard ? 'checked' : ''}> Burn-in guard: dim and gently move the menu after 3 minutes untouched (OLED, plasma)</label><label><input type="checkbox" name="crtLook" ${s.crtLook ? 'checked' : ''}> Scanline look on the menu (CRT)</label></div>`;
  }
  // The recommended settings for a screen, put into the open Settings form (Save keeps them).
  function screenUse(root) {
    const k = root.querySelector('[name=screenType]').value, v = SCREENS[k]; if (!v) return;
    const set = (n, val) => { const el = root.querySelector(`[name=${n}]`); if (!el) return; if (el.type === 'checkbox') el.checked = val; else { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('tvSafe', v.safe); set('burnGuard', v.guard); set('crtLook', v.crt);
    toast(`Recommended settings for ${v.name} are filled in. Save keeps them.`);
  }
  function screenTips(root) { const k = root.querySelector('[name=screenType]').value; root.querySelector('.scr-tips').innerHTML = k ? `<ul>${SCREENS[k].tips.map((t) => `<li>${t}</li>`).join('')}</ul>` : ''; const b = root.querySelector('[data-x=screenUse]'); if (b) b.disabled = !k; }

  /* -------------------------------------------------------------- the game you are playing, behind the menu
     Back in the menu while a game runs: a blurred view of it behind everything. A small, slow loop
     of your own clip of it when the PC has room (processor under 60%), or a still picture (its
     background art, cover or a screenshot) when it is busy. Nothing plays while the game has the screen. */
  const pb = document.createElement('div');
  pb.id = 'playbg'; pb.hidden = true;
  document.getElementById('bg')?.after(pb);
  let pbFor = null;
  async function playingBg() {
    const p = S.playing, e = p && (typeof entryById === 'function' ? entryById(p.id) : null);
    if (!e || st().playingBg === false || document.body.classList.contains('away')) { stopPlayingBg(!e); return; }
    if (pbFor === e.id && !pb.hidden) { pb.querySelector('video')?.play().catch(() => {}); return; }
    pbFor = e.id;
    const m = await api.sysMini().catch(() => null);
    const busy = !m || (m.cpu ?? 100) > 60;
    const clip = !busy && (e.media || []).filter((x) => x.kind === 'video' && x.path).pop();
    const still = e.hero || e.background || (e.media || []).filter((x) => x.kind === 'image' && x.path).map((x) => x.path).pop() || e.cover;
    pb.innerHTML = '';
    if (clip) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.playbackRate = 0.75; v.src = fileUrl(clip.path);
      v.addEventListener('loadedmetadata', () => { if (isFinite(v.duration) && v.duration > 20) v.currentTime = Math.random() * (v.duration - 15); v.play().catch(() => {}); }, { once: true });
      pb.appendChild(v);
    } else if (still) pb.style.backgroundImage = `url("${fileUrl(still)}")`;
    else { stopPlayingBg(true); return; }
    pb.classList.toggle('still', !clip);
    pb.hidden = false; requestAnimationFrame(() => pb.classList.add('on'));
  }
  function stopPlayingBg(forget) {
    const v = pb.querySelector('video');
    if (forget) { pb.classList.remove('on'); setTimeout(() => { if (!pb.classList.contains('on')) { if (v) { v.pause(); v.removeAttribute('src'); v.load(); } pb.innerHTML = ''; pb.style.backgroundImage = ''; pb.hidden = true; pbFor = null; } }, 800); }
    else if (v) v.pause();
  }
  document.addEventListener('deck-away', (ev) => { if (ev.detail) stopPlayingBg(false); else setTimeout(playingBg, 600); });
  setInterval(() => { if (!S.playing && pbFor) stopPlayingBg(true); }, 5000);

  function apply() { living(); safe(); widget(); screenTune(); }
  return { apply, playingBg, living, safe, calibrate, bump, preview, remember, anchorOf, today, poke, screenHtml, screenUse, screenTips };
})();
