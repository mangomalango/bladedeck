'use strict';
/* Console (capture card): another console (an Xbox 360, a PS2) plays through an HDMI capture card
   inside Bladedeck. Capture cards (Elgato, Cam Link, the USB "video capture" sticks) are cameras to
   the computer, so the picture comes from the camera API and the sound from its audio input, played
   straight to the speakers with as little delay as the browser allows.
   While it is on screen the PC's controller drives Bladedeck, not the console: B brings up a small
   overlay (Record, Walkthrough, YouTube, switch device, back to the menu); floating panels sit over
   the picture, so walkthroughs and YouTube work alongside it. Recordings go to
   Videos/Bladedeck/Console, where Captures finds them. The device picked is remembered.
   Uses S, api, esc, save, toast, Sound, Panels, walkthrough, openModal, closeModal, PadNav and $ at call time. */
const Hdmi = (() => {
  const el = document.createElement('div');
  el.id = 'hdmi'; el.hidden = true;
  el.innerHTML = '<video playsinline muted></video><div class="hd-bar" hidden></div><p class="hd-tip">B for the menu</p>';
  document.body.appendChild(el);
  const video = el.querySelector('video'), bar = el.querySelector('.hd-bar');
  let stream = null, ac = null, rec = null, recKey = null, on = false, menu = false, sel = 0;
  const cfg = () => (S.lib.settings.hdmi = S.lib.settings.hdmi || {});
  const LIKE = /capture|elgato|cam ?link|hd60|4k60|game|usb video|ms2109|uvc|avermedia|hdmi|razer ripsaw|live gamer/i;

  // The cameras and microphones there are, with names (asking once unlocks the names).
  async function devices() {
    try { const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); s.getTracks().forEach((t) => t.stop()); } catch { /* no camera yet */ }
    const l = await navigator.mediaDevices.enumerateDevices();
    return { video: l.filter((d) => d.kind === 'videoinput'), audio: l.filter((d) => d.kind === 'audioinput') };
  }

  async function open() {
    const d = await devices();
    if (!d.video.length) { toast('No capture card was found. Plug it in by USB (or install its driver), then try again.', 'err'); return; }
    const c = cfg();
    if (c.video && d.video.some((x) => x.deviceId === c.video)) { start(); return; }
    pick(d);
  }
  // Pick the card and its sound (the card's own audio input is chosen for you when it is clear).
  function pick(d) {
    const v0 = d.video.find((x) => LIKE.test(x.label)) || d.video[0];
    const a0 = d.audio.find((x) => x.groupId && x.groupId === v0?.groupId) || d.audio.find((x) => LIKE.test(x.label));
    openModal({ title: 'Console (capture card)', wide: true,
      html: `<p class="note">Plug the console's HDMI into the capture card and the card into this PC. Pick it below; Bladedeck remembers it.</p>
        <label>Picture<select name="hdV">${d.video.map((x) => `<option value="${esc(x.deviceId)}" ${x === v0 ? 'selected' : ''}>${esc(x.label || 'Camera')}</option>`).join('')}</select></label>
        <label>Sound<select name="hdA"><option value="">No sound</option>${d.audio.map((x) => `<option value="${esc(x.deviceId)}" ${x === a0 ? 'selected' : ''}>${esc(x.label || 'Microphone')}</option>`).join('')}</select></label>
        <label>Name (for recordings)<input type="text" name="hdN" value="${esc(cfg().name || 'Console')}" placeholder="Xbox 360"></label>
        <p class="note">Most cards send their sound over the same USB cable; it shows up here as a microphone with the card's name.</p>`,
      buttons: [{ label: 'Cancel' }, { label: 'Play', primary: true, onClick: (root) => {
        Object.assign(cfg(), { video: $('[name=hdV]', root).value, audio: $('[name=hdA]', root).value, name: $('[name=hdN]', root).value.trim().slice(0, 40) || 'Console' }); save();
        setTimeout(start, 0);
      } }] });
  }

  async function start() {
    stop(true);
    const c = cfg();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: c.video }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
        audio: c.audio ? { deviceId: { exact: c.audio }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, latency: 0 } : false
      });
    } catch (err) { toast(`The capture card did not start (${err.name || 'error'}). Is another app using it?`, 'err'); return; }
    video.srcObject = stream; video.play().catch(() => {});
    // Its sound straight to the speakers: through Web Audio, the shortest path the page has.
    if (stream.getAudioTracks().length) { ac = new AudioContext({ latencyHint: 'interactive' }); ac.createMediaStreamSource(stream).connect(ac.destination); }
    on = true; menu = false; el.hidden = false; document.body.classList.add('hdmi-on');
    requestAnimationFrame(() => el.classList.add('in'));
    Sound.duck?.(true);
    const t = stream.getVideoTracks()[0], st = t.getSettings();
    toast(`${c.name || 'Console'}: ${st.width || '?'}×${st.height || '?'} at ${Math.round(st.frameRate || 0)} fps. B for the menu.`);
    t.addEventListener('ended', () => { toast('The capture card was unplugged.', 'err'); stop(); });
  }

  function stop(quiet) {
    if (rec) stopRec();
    stream?.getTracks().forEach((t) => t.stop()); stream = null;
    if (ac) { ac.close().catch(() => {}); ac = null; }
    video.srcObject = null;
    if (on) { Sound.duck?.(false); if (!quiet) Sound.play('back'); }
    on = false; menu = false; bar.hidden = true;
    el.classList.remove('in'); document.body.classList.remove('hdmi-on');
    setTimeout(() => { if (!on) el.hidden = true; }, 300);
  }

  /* -------------------------------------------------------------- recording */
  async function startRec() {
    if (!stream || rec) return;
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    recKey = await api.clipOpenVideos(cfg().name || 'Console');
    if (!recKey) { toast('Recording could not start.', 'err'); return; }
    rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12e6 });
    rec.ondataavailable = async (ev) => { if (ev.data.size) await api.clipChunk(recKey, await ev.data.arrayBuffer()); };
    rec.onstop = async () => { const k = recKey; recKey = null; const f = await api.clipClose(k); toast(f ? `Recording saved to Videos/Bladedeck/${cfg().name || 'Console'}.` : 'The recording was too short to keep.', f ? 'fun' : 'ok'); };
    rec.start(2000); el.classList.add('rec'); toast('Recording.'); draw();
  }
  function stopRec() { if (!rec) return; const r = rec; rec = null; el.classList.remove('rec'); try { r.stop(); } catch { /* already */ } draw(); }

  /* -------------------------------------------------------------- the overlay */
  const ITEMS = () => [
    [rec ? '■ Stop recording' : '● Record', () => (rec ? stopRec() : startRec())],
    ['📺 Walkthrough', () => { toggleMenu(false); walkthrough(); }],
    ['▶ YouTube', () => { toggleMenu(false); Panels.show({ kind: 'web', key: 'youtube', title: 'YouTube', icon: '▶', url: 'https://www.youtube.com' }); }],
    ['⇄ Switch device', async () => { toggleMenu(false); const d = await devices(); stop(true); pick(d); }],
    ['⏻ Back to the menu', () => stop()]
  ];
  function draw() {
    if (!menu) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = `<b>${esc(cfg().name || 'Console')}</b>${ITEMS().map(([n], i) => `<button type="button" class="${i === sel ? 'cur' : ''}" data-i="${i}">${esc(n)}</button>`).join('')}`;
  }
  function toggleMenu(want) { menu = want ?? !menu; sel = 0; draw(); Sound.play(menu ? 'pop' : 'back'); }
  bar.addEventListener('click', (ev) => { const b = ev.target.closest('[data-i]'); if (b) ITEMS()[+b.dataset.i][1](); });
  el.addEventListener('click', (ev) => { if (!ev.target.closest('.hd-bar')) toggleMenu(); });

  // While it is on screen it takes every press (a focused panel still gets its own first).
  function handle(a) {
    if (!on) return false;
    if (!menu) { if (a === 'b' || a === 'start' || a === 'a') toggleMenu(true); return true; }
    const n = ITEMS().length;
    if (a === 'left' || a === 'up') { sel = (sel + n - 1) % n; draw(); Sound.play('tick'); }
    else if (a === 'right' || a === 'down') { sel = (sel + 1) % n; draw(); Sound.play('tick'); }
    else if (a === 'a') ITEMS()[sel][1]();
    else if (a === 'b' || a === 'start') toggleMenu(false);
    return true;
  }
  return { open, stop, handle, isOn: () => on };
})();
