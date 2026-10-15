'use strict';
/* Voice: a few things you can say, Siri-simple, not an assistant. Tap the 🎤 at the top, press
   View + LB, or Ctrl+Alt+V (anywhere, even in a game) and talk; it stops listening by itself when
   you stop talking. The words are worked out on this computer (voice.js), then matched here:
     "open Hades", "play Metal Slug 3", "open YouTube", "open files", "open settings"
     "what's the weather", "weather in Paris"
     "set a timer for 10 minutes", "set an alarm for 7:30", "wake me up at 7 am", "cancel the timer"
     "pause the music", "play music", "next song", "previous song"
     "go to the menu", "what time is it"
   Timers and alarms ring here (and on a paired phone: the Bladedeck Android app shows them as
   notifications, even with the app closed).
   Uses S, api, esc, save, toast, openModal, closeModal, Sound, Music, Dock, Panels, launch,
   setBlade, Notify, Companion and $ at call time. */

const Voice = (() => {
  let listening = false, stopNow = null;
  const pill = document.createElement('div');
  pill.id = 'vc'; pill.hidden = true; pill.setAttribute('role', 'status');
  document.body.appendChild(pill);
  const say = (html, ms) => { pill.innerHTML = html; pill.hidden = false; pill.classList.add('on'); clearTimeout(say.t); if (ms) say.t = setTimeout(hide, ms); };
  // In a game the pill is behind it: say it as a desktop notification too, so a voice command
  // from inside a game is never silent.
  const away = () => !deckFocused();
  const notify = (title, body) => { if (!away()) return; try { new Notification(title, { body, silent: true }); } catch { /* optional */ } };
  const hide = () => { pill.classList.remove('on'); setTimeout(() => { if (!pill.classList.contains('on')) pill.hidden = true; }, 250); };

  /* -------------------------------------------------------------- setting up */
  async function setup() {
    openModal({
      title: 'Voice commands',
      html: `<p>Say things like <b>"open Hades"</b>, <b>"what's the weather"</b>, <b>"set a timer for 10 minutes"</b>, <b>"next song"</b> or <b>"go to the menu"</b>.</p>
        <p class="note">Your voice is turned into words on this computer by a small speech model (about 30 MB, downloaded once from the sherpa-onnx project on GitHub). Nothing you say is sent anywhere.</p>
        <label>Your town, for the weather<input type="text" name="vcTown" value="${esc(S.lib.settings.town || '')}" placeholder="for example Austin"></label>
        <div class="checks"><label><input type="checkbox" name="vcWake" ${S.lib.settings.voiceWake ? 'checked' : ''}> Active keyword: listen for "Hey Blade"</label></div>
        <p class="note">When on, say "Hey Blade" in the menu to talk hands-free. Stops during games to preserve performance.</p>
        <div class="vc-dl" hidden><i class="nc-bar"><b style="width:0%"></b></i><small>Downloading…</small></div>`,
      buttons: [{ label: 'Not now' }, { label: 'Turn on voice', primary: true, onClick: async (root, btn) => {
        S.lib.settings.town = $('[name=vcTown]', root).value.trim();
        S.lib.settings.voiceWake = !!$('[name=vcWake]', root)?.checked;
        save();
        btn.disabled = true; $('.vc-dl', root).hidden = false;
        const r = await api.voiceDownload();
        if (!r.ok) { toast(r.error, 'err'); btn.disabled = false; return false; }
        S.lib.settings.voice = true; save();
        toast('Voice is on. Say "Hey Blade" or press 🎤 (View + LB) and talk.', 'fun');
        api.voiceWarm();
        syncWake();
        return true;
      } }]
    });
  }
  window.bladedeck.onVoiceProgress((pct) => { const b = $('.vc-dl b'); if (b) { b.style.width = `${pct}%`; $('.vc-dl small').textContent = pct >= 100 ? 'Ready.' : `Downloading… ${pct}%`; } });

  /* -------------------------------------------------------------- wake word */
  let wakeStream = null, wakeCtx = null, wakeNode = null, wakeActive = false, wakeChecking = false, wakeMicWarned = false;

  async function startWake() {
    if (wakeActive || listening || !S.lib?.settings?.voice || !S.lib?.settings?.voiceWake || away()) return;
    const st = await api.voiceStatus?.().catch(() => ({ ready: false }));
    if (!st?.ready) return;
    wakeActive = true;
    try {
      let mic;
      if (S.lib.settings.padMic) {
        try { mic = (await navigator.mediaDevices.enumerateDevices()).find((d) => d.kind === 'audioinput' && /dualsense|wireless controller|sony|stadia/i.test(d.label))?.deviceId; } catch { /* default */ }
      }
      wakeStream = await navigator.mediaDevices.getUserMedia({ audio: { ...(mic ? { deviceId: { exact: mic } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      wakeCtx = new AudioContext({ sampleRate: 16000 });
      // Started without a click or key first, Chromium may hold it paused, and it would hear nothing.
      if (wakeCtx.state === 'suspended') wakeCtx.resume().catch(() => {});
      const src = wakeCtx.createMediaStreamSource(wakeStream);
      const hp = wakeCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85; hp.Q.value = 0.7;
      const lp = wakeCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7200; lp.Q.value = 0.7;
      wakeNode = wakeCtx.createScriptProcessor(2048, 1, 1);

      const preRoll = [];
      const maxPre = 3;
      let recording = false, speechChunks = [], quietMs = 0, floor = 0.003, tStart = 0;

      wakeNode.onaudioprocess = (ev) => {
        if (!wakeActive || listening || away()) { recording = false; speechChunks = []; return; }
        const d = new Float32Array(ev.inputBuffer.getChannelData(0));
        let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
        const rms = Math.sqrt(sum / d.length);

        if (!recording) {
          preRoll.push(new Float32Array(d));
          if (preRoll.length > maxPre) preRoll.shift();
          if (rms > Math.max(0.006, floor * 3.2)) {
            recording = true;
            speechChunks = [...preRoll.map((c) => new Float32Array(c)), new Float32Array(d)];
            quietMs = 0;
            tStart = performance.now();
          } else {
            floor = Math.min(Math.max(rms, 0.001), floor * 0.999 + rms * 0.001);
          }
        } else {
          speechChunks.push(new Float32Array(d));
          const dur = performance.now() - tStart;
          if (rms < Math.max(0.004, floor * 2)) quietMs += d.length / 16; else quietMs = 0;
          if (quietMs > 600 || dur > 5000) {
            recording = false;
            const toProcess = speechChunks;
            speechChunks = [];
            if (dur >= 400) checkWakeUtterance(toProcess);
          }
        }
      };

      src.connect(hp).connect(lp).connect(wakeNode);
      wakeNode.connect(wakeCtx.destination);
    } catch (e) {
      stopWake();
      // Said once, not swallowed: the microphone is blocked (Windows: Privacy & security, Microphone) or missing.
      if (!wakeMicWarned) {
        wakeMicWarned = true;
        const hint = /windows/i.test(navigator.userAgent) ? ' On Windows: Settings, Privacy & security, Microphone, let desktop apps use it.' : '';
        toast(e?.name === 'NotAllowedError' ? `"Hey Blade" cannot use the microphone: it is blocked.${hint}` : '"Hey Blade" found no microphone.', 'err');
      }
    }
  }

  function stopWake() {
    wakeActive = false;
    if (wakeNode) { try { wakeNode.disconnect(); } catch { /* ignore */ } wakeNode = null; }
    if (wakeCtx) { try { wakeCtx.close(); } catch { /* ignore */ } wakeCtx = null; }
    if (wakeStream) { try { wakeStream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ } wakeStream = null; }
  }

  async function checkWakeUtterance(chunks) {
    if (wakeChecking || listening || away()) return;
    wakeChecking = true;
    try {
      const len = chunks.reduce((n, c) => n + c.length, 0);
      const all = new Float32Array(len); let o = 0;
      for (const c of chunks) { all.set(c, o); o += c.length; }
      let mean = 0; for (let i = 0; i < all.length; i++) mean += all[i];
      mean /= (all.length || 1);
      for (let i = 0; i < all.length; i++) all[i] -= mean;
      let top = 0; for (let i = 0; i < all.length; i++) top = Math.max(top, Math.abs(all[i]));
      if (top > 0 && top < 0.5) { const g = Math.min(20, 0.7 / top); for (let i = 0; i < all.length; i++) all[i] *= g; }

      const r = await api.voiceHear(all);
      if (!r?.ok || !r?.text) return;
      const cleaned = clean(r.text);
      // Speech-to-text often hears it a little off (Hey Blades, Hey Blaid, Hi Blade): those count too.
      // "blade deck" comes first, or its "deck" would be taken as the start of the command.
      const match = cleaned.match(/^(hey |hi |ok |okay )?(blade deck|bladedeck|blades?|blaid|blayed)\b\s*(.*)$/);
      if (match) {
        Sound.play('pop');
        const rest = (match[3] || '').trim();
        if (rest) {
          say('<i class="vc-dot think"></i><b>…</b>');
          const out = await run(rest);
          say(`<span class="vc-q">“${esc(r.text)}”</span><b>${out}</b>`, 4500);
          notify(`“${r.text}”`, String(out).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
        } else {
          listen();
        }
      }
    } catch { /* ignore */ } finally { wakeChecking = false; }
  }

  function syncWake() {
    if (S.lib?.settings?.voice && S.lib?.settings?.voiceWake && !away() && deckFocused()) {
      startWake();
    } else {
      stopWake();
    }
  }
  // Listening starts with Bladedeck (it used to wait until Settings were saved once) and comes back
  // whenever Bladedeck is in front again, after a game or another window.
  setTimeout(() => { if (S.lib) syncWake(); }, 3000);
  for (const ev of ['focus', 'blur']) addEventListener(ev, () => setTimeout(syncWake, 300));
  document.addEventListener('deck-away', () => setTimeout(syncWake, 300));

  /* -------------------------------------------------------------- listening */
  // Records until you stop talking (or 8 seconds), at 16 kHz, then hands the sound over.
  async function listen() {
    if (listening) { stopNow?.(); return; }
    stopWake();
    const st = await api.voiceStatus();
    if (!st.ready || !S.lib.settings.voice) { setup(); return; }
    listening = true;
    let stream;
    // The controller's microphone (a DualSense over USB), if that is picked in Settings, Controllers.
    let mic;
    if (S.lib.settings.padMic) { try { mic = (await navigator.mediaDevices.enumerateDevices()).find((d) => d.kind === 'audioinput' && /dualsense|wireless controller|sony|stadia/i.test(d.label))?.deviceId; } catch { /* default */ } }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(mic ? { deviceId: { exact: mic } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch { listening = false; toast('No microphone was found, or it is turned off.', 'err'); setTimeout(syncWake, 400); return; }
    api.voiceWarm();
    Sound.play('pop');
    notify('Bladedeck is listening', 'Say a command, like "next song" or "set a timer for 10 minutes".');
    say('<i class="vc-dot"></i><b>Listening…</b><span class="vc-lv"><i></i><i></i><i></i><i></i><i></i></span>');
    const ctx = new AudioContext({ sampleRate: 16000 });
    const src = ctx.createMediaStreamSource(stream);
    // Bandpass pre-filtering: cut out controller motor rumble / handling touches (<85 Hz) and high-frequency hiss (>7.2 kHz)
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85; hp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7200; lp.Q.value = 0.7;
    const node = ctx.createScriptProcessor(2048, 1, 1);
    /* Speech is "loud" compared with the room. The room is the quietest moment of the first third
       of a second (people often start talking the instant they press), and the bar adapts to the
       microphone: a laptop's built-in one records far more quietly than a headset. */
    const chunks = []; let floor = Infinity, heard = false, quiet = 0, peak = 0, t0 = performance.now();
    const bars = pill.querySelectorAll('.vc-lv i');
    const done = new Promise((resolve) => {
      stopNow = () => resolve();
      node.onaudioprocess = (ev) => {
        const d = new Float32Array(ev.inputBuffer.getChannelData(0)); chunks.push(d);
        let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
        const rms = Math.sqrt(sum / d.length), ms = performance.now() - t0;
        if (ms < 300 || rms < floor) floor = Math.min(floor, Math.max(rms, 0.0005));
        peak = Math.max(peak, rms);
        const loud = rms > Math.max(0.004, floor * 3);
        bars.forEach((b, i) => { b.style.transform = `scaleY(${Math.min(1, 0.2 + (rms / Math.max(peak, 0.02)) * (0.6 + i * 0.1))})`; });
        if (loud) { heard = true; quiet = 0; } else if (heard) quiet += d.length / 16;
        if ((heard && quiet > 900) || ms > 8000 || (!heard && ms > 4500)) resolve();
      };
    });
    src.connect(hp).connect(lp).connect(node); node.connect(ctx.destination);
    await done;
    node.disconnect(); lp.disconnect(); hp.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close();
    listening = false; stopNow = null;
    // Something clearly above the room still counts, even if it never crossed the bar.
    if (!heard && peak > Math.max(0.003, floor * 2)) heard = true;
    if (!heard) { say('<b>Didn\'t hear anything.</b>', 2200); notify('Voice', 'Didn\'t hear anything. Check the microphone in Sound.'); setTimeout(syncWake, 400); return; }
    say('<i class="vc-dot think"></i><b>…</b>');
    const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0)); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    // Clean DC offset before amplification so the baseline is centered for the acoustic model.
    let mean = 0; for (let i = 0; i < all.length; i++) mean += all[i];
    mean /= (all.length || 1);
    for (let i = 0; i < all.length; i++) all[i] -= mean;
    // A quiet microphone is turned up before the words are worked out: the model hears loud,
    // clear speech far better (up to 20 times louder, never past full scale).
    let top = 0; for (let i = 0; i < all.length; i++) top = Math.max(top, Math.abs(all[i]));
    if (top > 0 && top < 0.5) { const g = Math.min(20, 0.7 / top); for (let i = 0; i < all.length; i++) all[i] *= g; }
    const r = await api.voiceHear(all);
    if (!r.ok) { say(`<b>${esc(r.error || 'Voice did not work.')}</b>`, 3500); setTimeout(syncWake, 400); return; }
    if (!r.text) { say('<b>Didn\'t catch that.</b>', 2500); notify('Voice', 'Didn\'t catch that.'); setTimeout(syncWake, 400); return; }
    const out = await run(r.text);
    say(`<span class="vc-q">“${esc(r.text)}”</span><b>${out}</b>`, 4500);
    notify(`“${r.text}”`, String(out).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
    setTimeout(syncWake, 400);
  }

  /* -------------------------------------------------------------- understanding */
  const NUM = { zero: 0, oh: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90 };
  // "twenty five" -> 25, "seven thirty" stays two numbers.
  function digits(text) {
    const w = text.split(' '), out = [];
    for (let i = 0; i < w.length; i++) {
      const v = NUM[w[i]];
      if (v == null) { out.push(w[i]); continue; }
      if (v >= 20 && v % 10 === 0 && NUM[w[i + 1]] != null && NUM[w[i + 1]] < 10 && NUM[w[i + 1]] > 0) { out.push(String(v + NUM[w[++i]])); continue; }
      out.push(['a', 'an'].includes(w[i]) && !/^(minute|second|hour|half)/.test(w[i + 1] || '') ? w[i] : String(v));
    }
    return out.join(' ');
  }
  const clean = (t) => digits(String(t).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9: ]+/g, ' ').replace(/\s+/g, ' ').trim());
  const roman = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
  const key = (t) => clean(t).split(' ').map((w) => roman[w] || w).filter((w) => !['the', 'a', 'of', 'and'].includes(w)).join(' ');
  // How alike two names are: shared pairs of letters (Dice), with a bonus when one contains the other.
  function alike(a, b) {
    a = key(a).replace(/ /g, ''); b = key(b).replace(/ /g, '');
    if (!a || !b) return 0;
    if (a === b) return 1;
    const pairs = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const p = s.slice(i, i + 2); m.set(p, (m.get(p) || 0) + 1); } return m; };
    const pa = pairs(a), pb = pairs(b); let hit = 0;
    for (const [p, n] of pa) hit += Math.min(n, pb.get(p) || 0);
    let score = (2 * hit) / (a.length + b.length - 2 || 1);
    if (b.startsWith(a) || a.startsWith(b)) score = Math.max(score, 0.75);
    return score;
  }

  const PLACES = [
    [/^(this pc|my pc|system|computer)$/, () => Panels.show({ kind: 'system', key: 'system', title: 'This PC', icon: '🖥' }), 'This PC'],
    [/^(settings|options)$/, () => openSettings(), 'Settings'],
    [/^(notifications?|downloads?)$/, () => Notify.open(), 'Notifications'],
    [/^(quick resume|running( apps| games)?)$/, () => Resume.open(), 'Quick Resume'],
    [/^(sound|volume|audio)$/, () => Volume.open(), 'Sound'],
    [/^(nearby|friends nearby)$/, () => Nearby.open(), 'Nearby'],
    [/^(phone( app)?|companion)$/, () => Companion.open(), 'Phone app'],
    [/^(captures?|clips?|recordings?)$/, () => Capture.gallery(), 'Captures'],
    [/^(get games|store|shop)$/, () => Shop.open(), 'Get games'],
    [/^(files?|file manager)$/, () => Panels.show({ kind: 'files', key: 'files', title: 'Files', icon: '🗂' }), 'Files'],
    [/^(storage|storage map|disk space|disk usage|how much space)$/, () => StorageMap.open(), 'Storage map'],
    [/^(music|my music|songs)$/, () => Music.open(), 'Music']
  ];
  function open(what) {
    for (const [re, fn, name] of PLACES) if (re.test(what)) { fn(); return `Opening ${name}.`; }
    // The dock's apps: YouTube, Spotify, Discord, the browser…
    for (const n of Dock.names()) if (alike(what, n) > 0.8) { Dock.openByName(n); return `Opening ${esc(n)}.`; }
    if (/^(browser|web|internet)$/.test(what) && Dock.openByName('browser')) return 'Opening the browser.';
    // Games and apps in the library.
    const list = S.lib.entries.filter((e) => !e.hidden);
    let best = null, score = 0;
    for (const e of list) { const s = alike(what, e.title); if (s > score) { score = s; best = e; } }
    if (best && score >= 0.5) { S.sel = best; launch(best); return `Starting ${esc(best.title)}.`; }
    return `Couldn't find “${esc(what)}” in your library.`;
  }

  // "10 minutes", "an hour and a half", "90 seconds", "1 hour 20 minutes" -> milliseconds.
  function duration(t) {
    let ms = 0;
    t.replace(/(\d+(?:\.\d+)?)\s*(hour|hr|minute|min|second|sec)s?/g, (_, n, u) => { ms += +n * (u.startsWith('h') ? 3600e3 : u.startsWith('m') ? 60e3 : 1e3); return ''; });
    if (/half (an )?hour|30 minutes?/.test(t) && !ms) ms = 1800e3;
    if (/and a half/.test(t)) { if (/hour/.test(t)) ms += 1800e3; else if (/minute/.test(t)) ms += 30e3; }
    return ms;
  }
  // "7", "7 30", "7:30", "730", "7 30 pm", "noon", "midnight" -> the next time it comes round.
  function clock(t) {
    if (/noon/.test(t)) t = '12:00 pm'; if (/midnight/.test(t)) t = '12:00 am';
    const m = t.match(/(\d{1,2})(?::|\s)?(\d{2})?\s*(am|pm|a m|p m|in the morning|in the evening|at night|tonight)?/);
    if (!m) return null;
    let h = +m[1], min = +(m[2] || 0); const ap = (m[3] || '').replace(/ /g, '');
    if (m[1].length > 2 || h > 24 || min > 59) return null;
    const now = new Date(), at = new Date(now);
    if (/pm|evening|night|tonight/.test(ap) && h < 12) h += 12;
    if (/am|morning/.test(ap) && h === 12) h = 0;
    at.setHours(h, min, 0, 0);
    // No am or pm: the next time that hour comes round.
    if (!ap && h <= 12) { while (at <= now) at.setTime(at.getTime() + 12 * 3600e3); } else if (at <= now) at.setDate(at.getDate() + 1);
    return at.getTime();
  }
  const when = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const span = (ms) => { const h = Math.floor(ms / 3600e3), m = Math.round(ms % 3600e3 / 60e3), s = Math.round(ms / 1000); return ms < 60e3 ? `${s} seconds` : `${h ? `${h} hour${h > 1 ? 's' : ''} ` : ''}${m ? `${m} minute${m > 1 ? 's' : ''}` : ''}`.trim(); };

  async function run(raw) {
    const cleaned = clean(raw);
    const t = cleaned.replace(/^(hey |ok |okay )?(bladedeck|blade deck|blade)\s*/, '').replace(/^(please |can you |could you )/, '').replace(/ please$/, '');
    let m;
    if (!t && /^(hey |ok |okay )?(blade|bladedeck|blade deck)$/.test(cleaned)) {
      return 'I\'m listening. Say “open Hades”, “weather”, “timer for 5 minutes” or “next song”.';
    }
    if (Alarms.ringing() && /^(stop|ok|okay|dismiss|turn it off|snooze)/.test(t)) { /snooze/.test(t) ? Alarms.snooze() : Alarms.stop(); return /snooze/.test(t) ? 'Snoozed for 5 minutes.' : 'Stopped.'; }
    if (/(cancel|stop|clear|delete|turn off)( the| my| all)? (timer|alarm)s?/.test(t)) { const n = Alarms.clear(/alarm/.test(t) ? 'alarm' : 'timer'); return n ? `Cancelled ${n === 1 ? 'it' : `all ${n}`}.` : 'There was nothing to cancel.'; }
    if (/timer/.test(t) || /^(remind me in|in \d)/.test(t)) {
      const ms = duration(t); if (!ms) return 'How long? Say “set a timer for 10 minutes”.';
      Alarms.add({ kind: 'timer', at: Date.now() + ms, label: `${span(ms)} timer` });
      return `Timer set for ${span(ms)}.`;
    }
    if ((m = t.match(/(alarm|wake me( up)?)( for| at)? (.+)/))) {
      const at = clock(m[4]); if (!at) return 'What time? Say “set an alarm for 7:30 am”.';
      Alarms.add({ kind: 'alarm', at, label: `Alarm, ${when(at)}` });
      return `Alarm set for ${when(at)}${new Date(at).getDate() !== new Date().getDate() ? ' tomorrow' : ''}.`;
    }
    if (/weather|temperature|is it (going to )?(rain|snow)|how (hot|cold)/.test(t)) {
      const place = (t.match(/ in ([a-z ]+)$/) || [])[1] || S.lib.settings.town;
      if (!place) { setup(); return 'Set your town first.'; }
      return Weather.show(place);
    }
    if (/what time|whats the time|what day|whats the date|todays date/.test(t)) return new Date().toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    if (/^(next|skip)( song| track| one)?$|skip (this )?(song|track)/.test(t)) { Music.next(); return 'Next song.'; }
    if (/^(previous|last|go back a|back a)( song| track)?$|previous (song|track)/.test(t)) { Music.prev(); return 'Previous song.'; }
    if (/^(pause|stop)( the)?( music| song)?$/.test(t)) { if (Music.playing()) Music.toggle(); return 'Paused.'; }
    if (/^(play|resume|start)( the| some| my)? (music|songs?)$|^resume$/.test(t)) { if (!Music.playing()) Music.toggle(); return 'Playing.'; }
    if (/^(go |take me )?(back )?(to )?(the )?(menu|home|main menu|bladedeck|dashboard)$/.test(t)) {
      if (away()) api.peekToggle(); else { closeModal(); if (S.mode === 'console') setBlade(0); }
      return 'Here you go.';
    }
    if ((m = t.match(/^(open|launch|start|play|run|load|go to|show( me)?) (.+)$/))) return open(m[3].replace(/^(the|my) /, '').replace(/ (app|game)$/, ''));
    return 'Try “open Hades”, “weather”, “timer for 5 minutes” or “next song”.';
  }

  window.bladedeck.onPeek((ev) => { if (ev.kind === 'voice') listen(); });
  document.addEventListener('deck-away', (ev) => {
    if (ev.detail) stopWake();
    else setTimeout(syncWake, 500);
  });
  window.addEventListener('focus', () => syncWake());
  window.addEventListener('blur', () => stopWake());
  setTimeout(() => syncWake(), 3000);
  return { listen, setup, run, alike, syncWake, startWake, stopWake };
})();

/* Weather: a small card for your town (Open-Meteo, no account). */
const Weather = (() => {
  const SKY = [[0, '☀️', 'Clear'], [1, '🌤️', 'Mostly clear'], [2, '⛅', 'Partly cloudy'], [3, '☁️', 'Cloudy'], [45, '🌫️', 'Fog'], [48, '🌫️', 'Fog'], [51, '🌦️', 'Drizzle'], [61, '🌧️', 'Rain'], [66, '🌧️', 'Freezing rain'], [71, '🌨️', 'Snow'], [77, '🌨️', 'Snow grains'], [80, '🌦️', 'Showers'], [85, '🌨️', 'Snow showers'], [95, '⛈️', 'Thunderstorms']];
  const sky = (c) => SKY.filter(([n]) => n <= c).pop() || SKY[0];
  async function show(place) {
    const w = await api.weather(place);
    if (!w.ok) return esc(w.error);
    const c = w.current, [, ic, word] = sky(c.weather_code), d = w.daily;
    const day = (i) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(d.time[i] + 'T12:00').toLocaleDateString([], { weekday: 'long' }));
    openModal({
      title: `Weather · ${w.place}`,
      html: `<div class="wx"><div class="wx-now"><span class="wx-ic">${ic}</span><b>${Math.round(c.temperature_2m)}${w.unit}</b><div><span>${word}</span><small>Feels like ${Math.round(c.apparent_temperature)}${w.unit} · wind ${Math.round(c.wind_speed_10m)} ${w.wind}</small></div></div>
        <div class="wx-days">${d.time.map((_, i) => `<div><b>${day(i)}</b><span class="wx-ic">${sky(d.weather_code[i])[1]}</span><span>${Math.round(d.temperature_2m_max[i])}° / ${Math.round(d.temperature_2m_min[i])}°</span><small>${d.precipitation_probability_max[i] ?? 0}% rain</small></div>`).join('')}</div>
        <p class="note">From Open-Meteo. Change the town in Settings.</p></div>`,
      buttons: [{ label: 'Close', primary: true }]
    });
    return `${Math.round(c.temperature_2m)}${w.unit} and ${word.toLowerCase()} in ${esc(w.place.split(',')[0])}.`;
  }
  return { show, sky };
})();

/* Timers and alarms: kept in settings so they survive a restart, checked once a second only while
   there are some. When one is due it rings here and is sent to paired phones. */
const Alarms = (() => {
  let tick = 0, ring = null, beeper = null;
  const list = () => (S.lib.settings.alarms = S.lib.settings.alarms || []);
  function sync() {
    clearInterval(tick); tick = 0;
    if (list().length) tick = setInterval(check, 1000);
    window.bladedeck.companionAlarms?.(list());
    draw();
  }
  function add(a) { list().push({ id: Math.random().toString(36).slice(2, 9), ...a }); save(); sync(); }
  function clear(kind) { const n = list().filter((a) => a.kind === kind).length; S.lib.settings.alarms = list().filter((a) => a.kind !== kind); save(); sync(); return n; }
  function check() {
    const now = Date.now(), due = list().filter((a) => a.at <= now);
    if (!due.length) { draw(); return; }
    S.lib.settings.alarms = list().filter((a) => a.at > now); save(); sync();
    for (const a of due) fire(a);
  }
  function beep() {
    if (beeper) return;
    const ctx = new AudioContext(); let n = 0;
    const one = () => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = n++ % 2 ? 988 : 784; g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35); o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4); };
    one(); beeper = { ctx, t: setInterval(one, 500), end: setTimeout(stop, 60000) };
  }
  function fire(a) {
    ring = a; beep();
    toast(`⏰ ${a.label}`, 'fun');
    api.companionRing?.({ title: a.kind === 'timer' ? 'Timer done' : 'Alarm', text: a.label });
    openModal({ title: a.kind === 'timer' ? '⏰ Time\'s up' : '⏰ Alarm', html: `<p class="wx-ring">${esc(a.label)}</p>`,
      buttons: [{ label: 'Snooze 5 min', onClick: () => { snooze(); } }, { label: 'Stop', primary: true, onClick: () => { stop(); } }] });
  }
  function stop() { if (beeper) { clearInterval(beeper.t); clearTimeout(beeper.end); beeper.ctx.close(); beeper = null; } if (ring && $('.wx-ring')) closeModal(); ring = null; }
  function snooze() { const a = ring; stop(); if (a) add({ kind: a.kind, at: Date.now() + 5 * 60e3, label: `${a.label} (snoozed)` }); }
  // A small chip at the top while any are set.
  const chip = document.createElement('button'); chip.type = 'button'; chip.id = 'al-chip'; chip.hidden = true;
  document.getElementById('clock')?.before(chip);
  chip.addEventListener('click', () => {
    openModal({ title: 'Timers and alarms', html: list().length ? list().sort((x, y) => x.at - y.at).map((a) => `<div class="ph-dev"><b>${esc(a.label)}</b><span>${a.kind === 'timer' ? `${Math.max(0, Math.ceil((a.at - Date.now()) / 60e3))} min left` : new Date(a.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span><button type="button" data-al="${a.id}">Cancel</button></div>`).join('') : '<p class="note">None.</p>',
      buttons: [{ label: 'Close', primary: true }],
      onOpen: (root) => root.addEventListener('click', (ev) => { const b = ev.target.closest('[data-al]'); if (b) { S.lib.settings.alarms = list().filter((a) => a.id !== b.dataset.al); save(); sync(); b.closest('.ph-dev').remove(); } }) });
  });
  function draw() {
    const next = list().slice().sort((a, b) => a.at - b.at)[0];
    chip.hidden = !next;
    if (!next) return;
    const left = next.at - Date.now();
    chip.textContent = `⏰ ${next.kind === 'timer' ? (left < 60e3 ? `${Math.max(0, Math.ceil(left / 1000))} s` : `${Math.ceil(left / 60e3)} min`) : when(next.at)}${list().length > 1 ? ` +${list().length - 1}` : ''}`;
  }
  const when = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  setTimeout(() => { if (S.lib) { check(); sync(); } }, 2500);
  return { add, clear, stop, snooze, list, ringing: () => !!ring, sync };
})();
document.getElementById('vc-btn')?.addEventListener('click', () => Voice.listen());
