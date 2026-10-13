'use strict';
/* Sound: a console-style sound card that slides up from the bottom. It has:
   - The main volume, with mute.
   - Where the sound plays (speakers, HDMI, headphones, Bluetooth). Switching moves what is
     already playing too.
   - The microphone, with mute.
   - A volume for every app playing sound right now (a game, Discord, the browser...).
   - Bladedeck's own music and ambience.
   The home button on a controller (Stadia, PS, Xbox) or V opens it; - and = nudge the volume
   from anywhere in the menus with a little volume pill. System sound goes through pactl, so it
   works with PipeWire and PulseAudio; on Windows winaudio.js does the same through Core Audio.
   Uses S, api, esc, save, Sound, Music and $ at call time. */

const Volume = (() => {
  const el = document.getElementById('vol');
  const pill = document.getElementById('vol-pill');
  let on = false, state = null, row = 0, chip = 0, timer = 0, sys = true, pending = {}, pillT = 0;

  const ICON = (v, m) => (m || v === 0 ? '🔇' : v < 34 ? '🔈' : v < 67 ? '🔉' : '🔊');
  const outIcon = (o) => (/hdmi|displayport/i.test(o.label + o.port) ? '🖥' : /bluez|bluetooth|headset|airpods|buds/i.test(o.name + o.label) ? '🎧' : /headphone/i.test(o.port) ? '🎧' : /usb/i.test(o.name) ? '🔌' : '🔈');
  const short = (o) => (o.port && !/^analog/i.test(o.port) ? o.port : o.label).replace(/ Output$/, '').replace(/^.*?(HDMI|DisplayPort)/, '$1');

  async function load() {
    const r = await api.soundState();
    sys = r.ok; state = r.ok ? r.data : null;
  }

  // The rows the controller moves through, in order.
  function rows() {
    const out = state?.outputs.find((o) => o.on);
    const list = [];
    if (out) list.push({ k: 'master', label: 'Volume', v: out.volume, m: out.mute, id: out.name });
    if (state && state.outputs.length > 1) list.push({ k: 'outputs' });
    if (state?.mic) list.push({ k: 'mic', label: 'Microphone', v: state.mic.volume, m: state.mic.mute, id: state.mic.name });
    for (const a of state?.apps || []) list.push({ k: 'app', label: a.label, sub: a.what !== a.label ? a.what : '', v: a.volume, m: a.mute, id: a.id });
    list.push({ k: 'music', label: 'Bladedeck music', v: Math.round((S.lib.settings.musicVolume ?? 0.7) * 100) });
    list.push({ k: 'amb', label: 'Bladedeck ambience', v: Math.round((S.lib.settings.ambientVolume ?? 0.5) * 100) });
    return list;
  }

  function draw() {
    const rs = rows();
    row = Math.max(0, Math.min(rs.length - 1, row));
    const slider = (r, i) => `<div class="vo-row ${r.k} ${i === row ? 'hl' : ''} ${r.m ? 'm' : ''}" data-r="${i}">
        <button type="button" class="vo-mute" data-mute="${i}" aria-label="Mute">${r.k === 'mic' ? '🎙' : ICON(r.v, r.m)}</button>
        <div class="vo-mid"><b>${esc(r.label)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}
          <input type="range" min="0" max="100" step="1" value="${Math.min(100, r.v)}" data-sl="${i}" aria-label="${esc(r.label)}" style="--v:${Math.min(100, r.v)}%" ${r.m ? 'class="muted"' : ''}></div>
        <span class="vo-n">${r.m ? 'Muted' : `${r.v}%`}</span></div>`;
    const outs = state?.outputs || [];
    const body = rs.map((r, i) => {
      if (r.k === 'outputs') {
        return `<div class="vo-row outputs ${i === row ? 'hl' : ''}" data-r="${i}"><div class="vo-mid"><b>Play sound on</b>
          <div class="vo-chips">${outs.map((o, j) => `<button type="button" class="${o.on ? 'on' : ''} ${i === row && j === chip ? 'cur' : ''}" data-out="${j}"><i>${outIcon(o)}</i>${esc(short(o))}</button>`).join('')}</div></div></div>`;
      }
      const head = r.k === 'app' && (i === 0 || rs[i - 1].k !== 'app') ? '<div class="vo-h">Apps playing sound</div>' : r.k === 'music' ? '<div class="vo-h">Bladedeck</div>' : '';
      return head + slider(r, i);
    }).join('');
    el.innerHTML = `<div class="vo-card"><div class="vo-top"><b>Sound</b><span>${sys ? '' : 'System sound controls are not available on this computer.'}</span><button type="button" class="vo-x" data-close="1" aria-label="Close">✕</button></div>
      <div class="vo-list">${body}</div>
      <p class="vo-tip"><i class="pad k">↕</i> choose <i class="pad k">↔</i> change <i class="pad a">A</i> mute <i class="pad b">B</i> close</p></div>`;
    el.querySelector('.vo-row.hl')?.scrollIntoView({ block: 'nearest' });
  }

  /* -------------------------------------------------------------- changing things */
  // Slider drags fire fast; send the latest value at most every 60 ms per control.
  function send(r, patch) {
    const key = `${r.k}:${r.id}`;
    const p = pending[key] || (pending[key] = { o: { kind: r.k === 'master' ? 'output' : r.k, id: r.id } });
    Object.assign(p.o, patch);
    if (p.t) return;
    p.t = setTimeout(async () => {
      delete pending[key];
      const res = await api.soundSet(p.o);
      if (res.ok && !Object.keys(pending).length) { state = res.data; if (on) draw(); }
    }, 60);
  }
  function setLevel(i, v) {
    const r = rows()[i]; if (!r || r.k === 'outputs') return;
    v = Math.max(0, Math.min(100, Math.round(v)));
    if (r.k === 'music') { Music.setVolume(v / 100); }
    else if (r.k === 'amb') { S.lib.settings.ambientVolume = v / 100; save(); Sound.setAmbientLevel(1, 0.2); }
    else {
      // Show it straight away; the system catches up a moment later.
      const t = r.k === 'master' ? state.outputs.find((o) => o.on) : r.k === 'mic' ? state.mic : state.apps.find((a) => a.id === r.id);
      if (t) { t.volume = v; if (v > 0) t.mute = false; }
      send(r, { volume: v, ...(v > 0 && r.m ? { mute: false } : {}) });
    }
    if (r.k === 'master') showPill(v, false);
    if (on) draw();
  }
  function toggleMute(i) {
    const r = rows()[i]; if (!r || r.k === 'outputs' || r.k === 'music' || r.k === 'amb') { if (r && (r.k === 'music' || r.k === 'amb')) setLevel(i, r.v ? 0 : 70); return; }
    const t = r.k === 'master' ? state.outputs.find((o) => o.on) : r.k === 'mic' ? state.mic : state.apps.find((a) => a.id === r.id);
    if (t) t.mute = !t.mute;
    send(r, { mute: !r.m });
    Sound.play('tick'); draw();
  }
  async function useOutput(j) {
    const o = state?.outputs[j]; if (!o || o.on) return;
    const res = await api.soundSet({ kind: 'default', id: o.name });
    if (res.ok) { state = res.data; Sound.play('pop'); draw(); }
  }

  /* -------------------------------------------------------------- the volume pill */
  function showPill(v, m) {
    pill.innerHTML = `<i>${ICON(v, m)}</i><span><b style="width:${m ? 0 : Math.min(100, v)}%"></b></span><em>${m ? 'Muted' : v}</em>`;
    pill.classList.add('on'); clearTimeout(pillT); pillT = setTimeout(() => pill.classList.remove('on'), 1400);
  }
  // - and = from anywhere: nudge the main volume like the buttons on a console's controller.
  async function nudge(d) {
    if (!state) await load();
    const o = state?.outputs.find((x) => x.on); if (!o) return;
    const v = Math.max(0, Math.min(100, o.volume + d));
    o.volume = v; o.mute = false;
    send({ k: 'master', id: o.name }, { volume: v, mute: false });
    showPill(v, false); Sound.play('tick');
    if (on) draw();
  }

  /* -------------------------------------------------------------- open / close / input */
  async function open() {
    if (on) return;
    on = true; row = 0; await load(); chip = Math.max(0, state?.outputs.findIndex((o) => o.on) ?? 0);
    draw(); el.hidden = false; requestAnimationFrame(() => el.classList.add('open'));
    Sound.play('pop');
    // Apps start and stop playing; keep the list current while it is open.
    timer = setInterval(async () => { if (!Object.keys(pending).length && !el.matches(':active')) { await load(); if (on) draw(); } }, 1500);
  }
  function close() {
    if (!on) return;
    on = false; clearInterval(timer); el.classList.remove('open'); Sound.play('back');
    setTimeout(() => { if (!on) el.hidden = true; }, 300);
  }
  const toggle = () => (on ? close() : open());

  function handle(a) {
    if (a === 'vol') { toggle(); return true; }
    if (!on) return false;
    const rs = rows(), r = rs[row];
    if (a === 'b' || a === 'start' || a === 'back') close();
    else if (a === 'up') { row = Math.max(0, row - 1); Sound.play('tick'); draw(); }
    else if (a === 'down') { row = Math.min(rs.length - 1, row + 1); Sound.play('tick'); draw(); }
    else if (a === 'left' || a === 'right') {
      if (r.k === 'outputs') { chip = Math.max(0, Math.min(state.outputs.length - 1, chip + (a === 'right' ? 1 : -1))); Sound.play('tick'); draw(); }
      else setLevel(row, r.v + (a === 'right' ? 5 : -5));
    }
    else if (a === 'lb' || a === 'rb') { if (r.k !== 'outputs') setLevel(row, r.v + (a === 'rb' ? 20 : -20)); }
    else if (a === 'a' || a === 'x') { if (r.k === 'outputs') useOutput(chip); else toggleMute(row); }
    return true;
  }

  el.addEventListener('input', (ev) => { const s = ev.target.dataset.sl; if (s != null) { row = +s; ev.target.style.setProperty('--v', `${ev.target.value}%`); setLevel(+s, +ev.target.value); } });
  el.addEventListener('click', (ev) => {
    const t = ev.target.closest('button'); if (!t) return;
    if (t.dataset.close) close();
    else if (t.dataset.mute != null) { row = +t.dataset.mute; toggleMute(row); }
    else if (t.dataset.out != null) { chip = +t.dataset.out; useOutput(chip); }
  });
  addEventListener('pointerdown', (ev) => { if (on && !el.contains(ev.target) && !ev.target.closest('#vol-btn')) close(); }, true);
  addEventListener('keydown', (ev) => {
    if (S.modal || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName) && ev.target.type !== 'range') return;
    if (ev.key === '-' || ev.key === '_') { ev.preventDefault(); nudge(-5); }
    if (ev.key === '=' || ev.key === '+') { ev.preventDefault(); nudge(5); }
  });
  document.getElementById('vol-btn')?.addEventListener('click', toggle);

  return { open, close, toggle, handle, nudge, isOpen: () => on };
})();
