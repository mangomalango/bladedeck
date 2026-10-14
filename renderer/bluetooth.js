'use strict';
/* Bluetooth, from the couch (bluetooth.js in main does the system side): switch it on, connect
   or disconnect what is paired (controllers, headphones), pair something new, and keep it on at
   start so controllers reconnect by themselves.
   Also the Stadia controller over USB: its headphone jack can take the sound by itself when it is
   plugged in, and give it back when it is unplugged. Over Bluetooth the Stadia controller carries
   buttons only (no sound, by its design), and its Wi-Fi only ever talked to Google's Stadia
   servers, which closed in 2023, so a cable is the way to its jack and microphone.
   Uses S, api, esc, toast, save, openModal, closeModal, Sound and $ at call time. */

const Bluetooth = (() => {
  const ICON = { controller: '🎮', audio: '🎧', phone: '📱', other: '◆' };
  let busy = false;

  function card(st) {
    if (!st.supported) return st.windows ? '<p class="note">Windows pairs controllers and headphones in its own Bluetooth settings.</p><div class="btns"><button type="button" data-bt="winsettings">Open Bluetooth settings</button></div>' : '<p class="note">Bluetooth is not available here.</p>';
    if (!st.present) return '<p class="note">This PC has no Bluetooth adapter.</p>';
    const s = S.lib.settings;
    const list = (st.devices || []).sort((a, b) => (a.kind === 'controller' ? -1 : 0) - (b.kind === 'controller' ? -1 : 0));
    return `<p class="note">Bluetooth is <b>${st.on ? 'on' : 'off'}</b>.${st.hard ? ' A hardware switch or key has it off.' : ''}</p>
      <div class="btns"><button type="button" data-bt="power" class="${st.on ? '' : 'primary'}">${st.on ? 'Turn Bluetooth off' : 'Turn Bluetooth on'}</button>${st.on ? '<button type="button" data-bt="scan">Pair something new…</button>' : ''}</div>
      <div class="checks"><label><input type="checkbox" name="btAtStart" ${s.btAtStart ? 'checked' : ''}> Turn Bluetooth on when Bladedeck starts, so paired controllers reconnect when you press their home button</label></div>
      <h4 class="set-sub">Paired with this PC</h4>
      ${list.length ? list.map((d) => `<div class="bt-dev"><i>${ICON[d.kind]}</i><div><b>${esc(d.name)}</b><span>${d.connected ? 'Connected' : st.on ? 'Not connected' : 'Waiting for Bluetooth'}${d.battery ? ` · 🔋 ${d.battery}%` : ''}${/stadia/i.test(d.name) ? ' · buttons only over Bluetooth' : ''}</span></div>
        ${st.on ? `<button type="button" data-bt="${d.connected ? 'off' : 'on'}" data-mac="${esc(d.mac)}">${d.connected ? 'Disconnect' : 'Connect'}</button>` : ''}</div>`).join('') : '<p class="note">Nothing is paired yet.</p>'}
      <div class="bt-found"></div>
      ${stadiaHtml()}`;
  }
  function stadiaHtml() {
    const s = S.lib.settings;
    return `<h4 class="set-sub">Stadia controller</h4>
      <p class="note"><b>Bluetooth:</b> buttons, and Bladedeck's Stadia, Assistant and Capture buttons. To pair it, hold <b>Stadia + Y</b> until the light flashes orange, then Pair something new.<br>
      <b>USB cable:</b> also rumble, its <b>3.5 mm headphone jack</b> and its <b>microphone</b>. The controller cannot send sound over Bluetooth, and its Wi-Fi only worked with Google's Stadia servers (closed in 2023), so the cable is the way to its jack.</p>
      <div class="checks"><label><input type="checkbox" name="stadiaJack" ${s.stadiaJack ? 'checked' : ''}> When the Stadia controller is plugged in by USB, play sound through its headphone jack (back to before when it is unplugged)</label>
      <label><input type="checkbox" name="padMic" ${s.padMic ? 'checked' : ''}> Voice commands listen through the controller's microphone</label></div>`;
  }

  async function draw(root) {
    const box = $('.bt-box', root); if (!box) return;
    const st = await api.btStatus().catch(() => ({ supported: false }));
    if (box.isConnected) box.innerHTML = card(st);
  }

  async function act(root, b) {
    if (busy) return; busy = true;
    const a = b.dataset.bt, was = b.textContent;
    try {
      if (a === 'winsettings') { api.btSettings(); return; }
      if (a === 'power') {
        const on = /on$/.test(was); b.textContent = on ? 'Turning on…' : 'Turning off…';
        const r = await api.btPower(on); if (!r.ok) toast(r.error || 'That did not work.', 'err');
      } else if (a === 'on' || a === 'off') {
        b.textContent = a === 'on' ? 'Connecting…' : 'Disconnecting…';
        const r = await api.btConnect(b.dataset.mac, a === 'on');
        toast(r.ok ? (a === 'on' ? 'Connected.' : 'Disconnected.') : r.error, r.ok ? 'fun' : 'err');
      } else if (a === 'scan') {
        b.textContent = 'Looking for 20 seconds…';
        const r = await api.btScan();
        const found = $('.bt-found', root);
        if (found) found.innerHTML = r.found?.length ? `<h4 class="set-sub">Found nearby</h4>${r.found.map((d) => `<div class="bt-dev"><i>${ICON[d.kind]}</i><div><b>${esc(d.name)}</b></div><button type="button" data-bt="pair" data-mac="${esc(d.mac)}">Pair</button></div>`).join('')}` : '<p class="note">Nothing new showed up. Put it in pairing mode and look again.</p>';
        b.textContent = was; return;
      } else if (a === 'pair') {
        b.textContent = 'Pairing…';
        const r = await api.btPair(b.dataset.mac);
        toast(r.ok ? 'Paired and connected. It reconnects by itself from now on.' : r.error, r.ok ? 'fun' : 'err');
        if (r.ok) Sound.play('pop');
      }
      await draw(root);
    } finally { busy = false; }
  }

  function open() {
    openModal({
      title: 'Bluetooth',
      html: '<div class="bt-box"><p class="note">Looking at Bluetooth…</p></div>',
      buttons: [{ label: 'Done', primary: true, onClick: (root) => {
        const s = S.lib.settings;
        const c = (n) => !!$(`[name="${n}"]`, root)?.checked;
        if ($('[name=btAtStart]', root)) Object.assign(s, { btAtStart: c('btAtStart'), stadiaJack: c('stadiaJack'), padMic: c('padMic') });
        save(); stadiaWatch();
      } }],
      onOpen: (root) => {
        draw(root);
        root.addEventListener('click', (ev) => { const b = ev.target.closest('[data-bt]'); if (b) act(root, b); });
      }
    });
  }

  /* -------------------------------------------------------------- Stadia jack over USB */
  let jack = null; // { prev: output name before, mine: Stadia output name }
  const stadiaPad = () => [...(navigator.getGamepads?.() || [])].some((g) => g && /18d1.*9400|stadia/i.test(g.id));
  async function stadiaWatch() {
    if (!S.lib?.settings.stadiaJack) { if (jack) restore(); return; }
    const here = stadiaPad();
    if (here && !jack) {
      const ss = await api.stadiaStatus?.().catch(() => null);
      if (!ss?.present || !ss.usb) return;
      const r = await api.soundState().catch(() => null); if (!r?.ok) return;
      const outs = r.data.outputs || [];
      const mine = outs.find((o) => /stadia|google.*controller/i.test(`${o.name} ${o.label}`));
      if (!mine) return;
      const prev = outs.find((o) => o.on);
      if (prev && prev.name === mine.name) return;
      const res = await api.soundSet({ kind: 'default', id: mine.name });
      if (res?.ok) { jack = { prev: prev?.name || '', mine: mine.name }; toast('Sound: the Stadia controller\'s headphone jack.'); }
    } else if (!here && jack) restore();
  }
  async function restore() {
    const j = jack; jack = null;
    if (j?.prev) { const r = await api.soundSet({ kind: 'default', id: j.prev }).catch(() => null); if (r?.ok) toast('Sound is back where it was.'); }
  }
  addEventListener('gamepadconnected', () => setTimeout(stadiaWatch, 1500));
  addEventListener('gamepaddisconnected', () => setTimeout(stadiaWatch, 500));
  setInterval(stadiaWatch, 5000);

  return { open, stadiaWatch };
})();
