'use strict';
/* Bladedeck sound. Everything is synthesised: a deep-ocean ambience (brown-noise swells,
   distant whale calls, bubble clusters) and small underwater UI sounds that share one reverb. */

const Sound = (() => {
  let ac = null, out = null, wet = null, amb = null, whaleTimer = 0, bubbleTimer = 0;
  const uiOn = () => !!S.lib?.settings.sounds;
  const ambOn = () => !!S.lib?.settings.ambient;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function ctx() {
    if (ac) return ac;
    ac = new AudioContext();
    out = ac.createGain(); out.gain.value = 0.9; out.connect(ac.destination);
    // Long, dark reverb from decaying noise: makes everything sound far away and underwater.
    const len = ac.sampleRate * 3.2, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const conv = ac.createConvolver(); conv.buffer = ir;
    const damp = ac.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2400;
    wet = ac.createGain(); wet.gain.value = 0.55;
    wet.connect(conv).connect(damp).connect(out);
    return ac;
  }

  // One voice: oscillator with a pitch glide and an envelope, sent dry and to the reverb.
  function voice({ f0, f1 = f0, dur = 0.12, type = 'sine', vol = 0.05, when = 0, rev = 0.5, attack = 0.005, filter }) {
    const a = ctx(), t = a.currentTime + when;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o.connect(g);
    if (filter) { const bq = a.createBiquadFilter(); bq.type = 'lowpass'; bq.frequency.value = filter; node = g.connect(bq); }
    node.connect(out);
    if (rev) { const s = a.createGain(); s.gain.value = rev; node.connect(s).connect(wet); }
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noiseBurst({ dur = 0.2, vol = 0.1, freq = 1800, q = 1, when = 0, rev = 0.3, type = 'bandpass' }) {
    const a = ctx(), t = a.currentTime + when;
    const len = Math.ceil(a.sampleRate * dur), b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = a.createBufferSource(); src.buffer = b;
    const bq = a.createBiquadFilter(); bq.type = type; bq.frequency.value = freq; bq.Q.value = q;
    const g = a.createGain(); g.gain.value = vol;
    src.connect(bq).connect(g).connect(out);
    if (rev) { const s = a.createGain(); s.gain.value = rev; g.connect(s).connect(wet); }
    src.start(t);
  }

  const bubble = (vol = 0.045, when = 0) => { const f = rnd(380, 620); voice({ f0: f, f1: f * rnd(2.2, 3), dur: rnd(0.05, 0.09), vol, when, rev: 0.35 }); };

  const ui = {
    tick: () => bubble(0.035),
    blade: () => { const f = rnd(840, 900); voice({ f0: f, f1: f * 0.98, dur: 0.9, vol: 0.03, rev: 1.2, attack: 0.01 }); voice({ f0: f * 1.5, dur: 0.5, vol: 0.008, rev: 1 }); },
    back: () => voice({ f0: 420, f1: 150, dur: 0.18, vol: 0.05, rev: 0.6 }),
    go: () => {
      voice({ f0: 110, f1: 440, dur: 0.7, vol: 0.05, rev: 0.9, attack: 0.08, type: 'triangle', filter: 1400 });
      for (let i = 0; i < 6; i++) bubble(0.03, 0.08 + i * 0.07);
    },
    ripple: () => {
      voice({ f0: 70, f1: 38, dur: 1.6, vol: 0.12, rev: 0.8, attack: 0.02 });
      noiseBurst({ dur: 1.2, vol: 0.06, freq: 300, q: 0.5, type: 'lowpass', rev: 0.8 });
      voice({ f0: 1320, f1: 1250, dur: 1.4, vol: 0.012, rev: 1.5, when: 0.05 });
    },
    toast: () => { bubble(0.03); bubble(0.025, 0.06); voice({ f0: 1046, dur: 0.35, vol: 0.012, rev: 1, when: 0.1 }); },
    error: () => { voice({ f0: 330, f1: 300, dur: 0.25, vol: 0.04, rev: 0.6 }); voice({ f0: 262, f1: 240, dur: 0.35, vol: 0.04, rev: 0.6, when: 0.14 }); },
    whip: () => noiseBurst({ dur: 0.35, vol: 0.18, freq: 900, q: 0.7, rev: 0.2, type: 'highpass' }),
    crash: () => {
      voice({ f0: 90, f1: 30, dur: 0.9, vol: 0.25, rev: 0.5, attack: 0.002, type: 'triangle' });
      noiseBurst({ dur: 0.9, vol: 0.3, freq: 600, q: 0.4, rev: 0.6, type: 'lowpass' });
      for (let i = 0; i < 9; i++) voice({ f0: rnd(2400, 5200), dur: rnd(0.08, 0.25), vol: 0.02, when: 0.05 + Math.random() * 0.5, rev: 0.6, type: 'triangle' });
    },
    clank: () => {
      const f = rnd(1150, 1400);
      voice({ f0: f, f1: f * 0.97, dur: 0.22, vol: 0.06, type: 'square', filter: 3200, rev: 0.4 });
      voice({ f0: f * 2.76, dur: 0.12, vol: 0.02, rev: 0.4 });
      noiseBurst({ dur: 0.06, vol: 0.12, freq: 3000, q: 1.5, rev: 0.1 });
    },
    fixed: () => [523, 659, 784, 1046].forEach((f, i) => voice({ f0: f, dur: 0.4, vol: 0.04, when: i * 0.09, rev: 0.8, type: 'triangle' })),
    talk: () => voice({ f0: rnd(500, 760), f1: rnd(400, 900), dur: 0.05, vol: 0.02, type: 'square', filter: 1800, rev: 0.1 }),
    // The game shrinking into its panel, and popping back out to full screen.
    shrink: () => { voice({ f0: 900, f1: 180, dur: 0.45, vol: 0.05, rev: 0.8, attack: 0.01, type: 'triangle', filter: 2200 }); bubble(0.025, 0.35); },
    bubblepop: () => { bubble(0.06); voice({ f0: rnd(1100, 1500), f1: rnd(380, 520), dur: 0.07, vol: 0.035, rev: 0.4, attack: 0.002 }); },
    pop: () => { voice({ f0: 160, f1: 1100, dur: 0.32, vol: 0.05, rev: 0.7, attack: 0.01, type: 'triangle', filter: 2600 }); voice({ f0: 1320, dur: 0.25, vol: 0.02, when: 0.28, rev: 1 }); },
    // A water drop: a quick falling 'bloop', then a bright plink as the surface closes.
    drop: () => {
      voice({ f0: 1500, f1: 320, dur: 0.14, vol: 0.06, rev: 0.9, attack: 0.002 });
      voice({ f0: 700, f1: 1800, dur: 0.09, vol: 0.025, when: 0.07, rev: 1.2 });
      bubble(0.02, 0.16); bubble(0.015, 0.24);
    },
    secret: () => [392, 523, 659, 880, 1175].forEach((f, i) => voice({ f0: f, dur: 0.9, vol: 0.025, when: i * 0.11, rev: 1.4 }))
  };

  function play(name) {
    if (!uiOn()) return;
    try { ui[name]?.(); } catch { /* audio is optional */ }
  }

  /* ---------------------------------------------------------------- ambience */
  function startAmbient() {
    if (amb || !ambOn()) return;
    try {
      const a = ctx();
      // Brown noise loop.
      const len = a.sampleRate * 6, b = a.createBuffer(2, len, a.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c); let last = 0;
        for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
      }
      const src = a.createBufferSource(); src.buffer = b; src.loop = true;
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.7;
      const swell = a.createGain(); swell.gain.value = 0.55;
      const master = a.createGain(); master.gain.value = 0.0001;
      src.connect(lp).connect(swell).connect(master).connect(out);
      // Slow swells: one LFO opens the filter, another breathes the volume.
      const lfo1 = a.createOscillator(), d1 = a.createGain(); lfo1.frequency.value = 0.07; d1.gain.value = 180; lfo1.connect(d1).connect(lp.frequency);
      const lfo2 = a.createOscillator(), d2 = a.createGain(); lfo2.frequency.value = 0.045; d2.gain.value = 0.3; lfo2.connect(d2).connect(swell.gain);
      src.start(); lfo1.start(); lfo2.start();
      amb = { src, lfo1, lfo2, master };
      setAmbientLevel(1);
      scheduleCreatures();
    } catch { amb = null; }
  }

  function setAmbientLevel(k, secs = 2.5) {
    if (!amb) return;
    const v = Math.max(0.0001, (S.lib?.settings.ambientVolume ?? 0.5) * 0.5 * k);
    const t = ac.currentTime;
    amb.master.gain.cancelScheduledValues(t);
    amb.master.gain.setValueAtTime(Math.max(0.0001, amb.master.gain.value), t);
    amb.master.gain.exponentialRampToValueAtTime(v, t + secs);
  }

  function whale() {
    const a = ctx(), t = a.currentTime;
    const base = rnd(140, 220), o = a.createOscillator(), g = a.createGain(), vib = a.createOscillator(), vd = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * rnd(1.3, 1.7), t + 1.6);
    o.frequency.exponentialRampToValueAtTime(base * rnd(0.6, 0.85), t + 3.8);
    vib.frequency.value = rnd(4, 6); vd.gain.value = 3; vib.connect(vd).connect(o.frequency);
    const lvl = 0.018 * (S.lib?.settings.ambientVolume ?? 0.5) * 2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(lvl, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    o.connect(g).connect(lp);
    const s = a.createGain(); s.gain.value = 1.6; lp.connect(s).connect(wet);
    lp.connect(out);
    o.start(t); vib.start(t); o.stop(t + 4.1); vib.stop(t + 4.1);
  }

  function scheduleCreatures() {
    clearTimeout(whaleTimer); clearTimeout(bubbleTimer);
    const w = () => { whaleTimer = setTimeout(() => { if (amb && !document.hidden) whale(); w(); }, rnd(22000, 55000)); };
    const bb = () => { bubbleTimer = setTimeout(() => {
      if (amb && !document.hidden) { const n = 3 + (Math.random() * 6 | 0); for (let i = 0; i < n; i++) bubble(0.008 * (S.lib?.settings.ambientVolume ?? 0.5) * 2, i * rnd(0.05, 0.14)); }
      bb(); }, rnd(6000, 16000)); };
    w(); bb();
  }

  function stopAmbient() {
    if (!amb) return;
    clearTimeout(whaleTimer); clearTimeout(bubbleTimer);
    const a = amb; amb = null;
    const t = ac.currentTime;
    a.master.gain.cancelScheduledValues(t); a.master.gain.setValueAtTime(Math.max(0.0001, a.master.gain.value), t);
    a.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    setTimeout(() => { try { a.src.stop(); a.lfo1.stop(); a.lfo2.stop(); } catch { /* already stopped */ } }, 900);
  }

  // Fade the sea out while a game has the screen, and back in when the player returns.
  function duck(on) { if (amb) setAmbientLevel(on ? 0.0002 : 1, on ? 0.6 : 2.5); }
  document.addEventListener('deck-away', (ev) => duck(ev.detail));

  /* Where Bladedeck's own sounds play: the system's default, or an output whose name matches
     (the controller's speaker, or Player 2's output in multi-screen). */
  let want = null;
  async function setOutput(match) {
    want = match;
    try {
      const a = ctx(); if (!a.setSinkId) return false;
      if (!match) { await a.setSinkId(''); return true; }
      const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput');
      const d = outs.find((x) => match.test(x.label));
      if (!d) return false;
      await a.setSinkId(d.deviceId);
      return true;
    } catch { return false; }
  }
  // An output that appears later (a controller plugged in) is picked up.
  navigator.mediaDevices?.addEventListener?.('devicechange', () => { if (want) setOutput(want); });

  // A short chime on one output (found by name), whatever Bladedeck's own sounds use.
  async function test(match) {
    try {
      const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput');
      const d = outs.find((x) => match.test(x.label)); if (!d) return false;
      const a = new AudioContext(); if (a.setSinkId) await a.setSinkId(d.deviceId);
      [523, 659, 784].forEach((f, i) => {
        const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + i * 0.16;
        o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.45);
      });
      setTimeout(() => a.close(), 1500);
      return true;
    } catch { return false; }
  }

  return { play, startAmbient, stopAmbient, setAmbientLevel, duck, whale, setOutput, test, sync() { ambOn() ? (startAmbient(), setAmbientLevel(1, 0.5)) : stopAmbient(); } };
})();
