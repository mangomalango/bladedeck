'use strict';
/* Water: for a moment the whole menu turns to water. A snapshot of the window is drawn on a
   WebGL canvas that bends it like a surface hit by a drop, then fades away over the real menu.
   Two styles: clear water (slow, glassy, colourless) and the secret rainbow splash (fast, loud).
   Uses fxOn, api, S, Sound and Secrets at call time. */

const Water = (() => {
  const c = document.getElementById('water');
  const gl = c.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false });
  const none = { ok: false, prepare() {}, splash: () => Promise.resolve(), busy: () => false, cancel() {} };
  if (!gl) return none;

  const VS = `attribute vec2 a; varying vec2 v; void main() { v = vec2(a.x * .5 + .5, .5 - a.y * .5); gl_Position = vec4(a, 0., 1.); }`;
  const FS = `
precision highp float;
varying vec2 v;
uniform sampler2D tex;
uniform vec2 res;
uniform float t, speed, wl, life, push;
uniform int mode;
uniform vec3 drops[4];

vec3 hue(float h) { return clamp(abs(mod(h * 6. + vec3(0., 4., 2.), 6.) - 3.) - 1., 0., 1.); }

void main() {
  vec2 p = v * res;
  vec2 off = vec2(0.);
  float crest = 0., height = 0., ring = 0., calm = 1.;
  for (int i = 0; i < 4; i++) {
    vec3 d = drops[i];
    if (d.z < 0.) continue;
    float age = t - d.z;
    if (age < 0. || age > life) continue;
    vec2 dv = p - d.xy;
    float r = length(dv);
    vec2 dir = r > .001 ? dv / r : vec2(0.);
    float R = speed * age;
    float fade = 1. - age / life; fade *= fade;
    calm = min(calm, 1. - fade);
    float k = 6.28318 / wl;
    float ph = (r - R) * k;
    // the leading ring, and smaller rings left behind it that settle down
    float front = exp(-pow((r - R) / (wl * 1.6), 2.));
    float wake = step(r, R) * exp(-(R - r) / (wl * 3.)) * .55;
    float amp = (front + wake) * fade / (1. + r / 1100.);
    height += sin(ph) * amp;
    float sl = cos(ph) * amp;
    off += dir * sl * push;
    crest += max(0., sl);
    ring += front * fade;
    // the dimple where the drop went in
    float cr = exp(-r * r / 1400.) * exp(-age * 5.);
    off -= dir * cr * push * 1.4;
  }
  // the whole surface sways a little while it settles, so the menu reads as liquid
  float sway = (1. - calm);
  off += vec2(sin(p.y * .013 + t * 2.1), cos(p.x * .011 + t * 1.7)) * 2.2 * sway;

  vec2 uv = clamp((p + off) / res, 0., 1.);
  vec3 col;
  if (mode == 1) {
    vec2 sp = off / res * .9;
    col = vec3(texture2D(tex, clamp(uv + sp, 0., 1.)).r, texture2D(tex, uv).g, texture2D(tex, clamp(uv - sp, 0., 1.)).b);
    vec3 rb = hue(fract(length(p - drops[0].xy) / (wl * 4.) - t * 1.8));
    col = mix(col, col * .5 + rb * .9, clamp(crest * .9 + ring * .25, 0., .85));
    col += rb * pow(max(0., height), 2.) * .5;
  } else {
    col = texture2D(tex, uv).rgb;
    // clear water: no colour of its own, just light catching the crests and shade in the troughs
    col += vec3(pow(max(0., height), 2.2)) * .55;
    col *= 1. - max(0., -height) * .16;
  }
  gl_FragColor = vec4(col, 1.);
}`;

  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) { console.warn('water disabled', err); return none; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
  const U = {}; for (const n of ['tex', 'res', 't', 'speed', 'wl', 'life', 'push', 'mode', 'drops']) U[n] = gl.getUniformLocation(prog, n);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, val] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, val);

  const STYLES = [
    { speed: 430, wl: 64, life: 2.4, push: 13 },  // clear: gentle and soothing
    { speed: 1500, wl: 34, life: 1.05, push: 20 } // rainbow: colourful and fast
  ];
  let pending = null, drops = [], mode = 0, t0 = 0, running = null, raf = 0, soft = 1, fading = false;

  async function grab() {
    // Let anything that just changed reach the screen first, or the snapshot shows the old menu.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const jpg = await api.snap();
    if (!jpg) return null;
    return createImageBitmap(new Blob([jpg], { type: 'image/jpeg' }));
  }

  // Taking the snapshot early (as a launch starts) means the splash begins without a pause.
  function prepare() { if (fxOn()) pending = { at: performance.now(), p: grab() }; }

  // style 0 is clear water, 1 the rainbow splash. A light splash (menu picks, the orb) is smaller and shorter.
  async function splash(pt, style = 0, { light = false } = {}) {
    if (!fxOn() || document.hidden) return;
    const now = performance.now() / 1000;
    if (running) { addDrop(pt, now); return running.done; }
    const snap = pending && performance.now() - pending.at < 1500 ? pending.p : grab();
    pending = null;
    const bmp = await snap.catch(() => null);
    if (!bmp || document.hidden) return;
    mode = style; soft = light ? 0.6 : 1; fading = false; t0 = performance.now() / 1000;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr);
    gl.viewport(0, 0, c.width, c.height);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
    bmp.close?.();
    drops = [];
    addDrop(pt, 0);
    let resolve; const done = new Promise((r) => { resolve = r; });
    running = { done, resolve };
    // Draw the first frame before showing the canvas, or it flashes black for a frame.
    frame(true);
    c.classList.remove('out'); c.hidden = false;
    Sound.play('drop');
    return done;
  }

  function addDrop(pt, at) {
    const t = at === 0 ? 0 : performance.now() / 1000 - t0;
    if (drops.length >= 4) drops.shift();
    drops.push({ x: pt?.x ?? innerWidth / 2, y: pt?.y ?? innerHeight / 2, t });
    if (at !== 0) Sound.play('drop');
  }

  function frame() {
    const base = STYLES[mode], st = { ...base, life: base.life * soft, push: base.push * soft };
    const t = performance.now() / 1000 - t0;
    const last = Math.max(...drops.map((d) => d.t));
    if (t > last + st.life || document.hidden) return end();
    // While the last waves die down, cross-fade to the live menu so there is no jump at the end.
    if (!fading && t > last + st.life * 0.6) { fading = true; c.classList.add('out'); }
    const arr = new Float32Array(12).fill(-1);
    drops.forEach((d, i) => { arr[i * 3] = d.x; arr[i * 3 + 1] = d.y; arr[i * 3 + 2] = d.t; });
    gl.uniform1i(U.tex, 0); gl.uniform2f(U.res, innerWidth, innerHeight); gl.uniform1f(U.t, t);
    gl.uniform1f(U.speed, st.speed); gl.uniform1f(U.wl, st.wl); gl.uniform1f(U.life, st.life); gl.uniform1f(U.push, st.push);
    gl.uniform1i(U.mode, mode); gl.uniform3fv(U.drops, arr);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    raf = requestAnimationFrame(frame);
  }

  function end() {
    cancelAnimationFrame(raf);
    const r = running; running = null;
    c.classList.add('out');
    setTimeout(() => { if (!running) c.hidden = true; }, 500);
    r?.resolve();
  }

  // Touching the water while it moves drops another stone in, and finds a secret.
  addEventListener('pointerdown', (ev) => {
    if (!running) return;
    fading = false; c.classList.remove('out');
    addDrop({ x: ev.clientX, y: ev.clientY }, 1);
    Secrets.unlock('rainbow', 'Secret found: the rainbow splash. Turn it on in Secret options.');
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) end(); });

  return { ok: true, prepare, splash, busy: () => !!running, cancel: () => running && end() };
})();
