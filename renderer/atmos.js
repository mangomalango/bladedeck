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

  function apply() { living(); safe(); widget(); }
  return { apply, living, safe, calibrate, bump, preview, remember, anchorOf, today };
})();
