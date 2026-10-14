'use strict';
/* Night Drive: the background for the "Night Drive" theme. A car laps a figure-eight track (with
   a bridge where it crosses itself) on a rainy night, and the camera cuts slowly between shots:
   high above, down by the tyres, straight down, from the driver's seat, chasing behind, and from
   the side of the road. Rain falls, rings spread on the wet ground, and the lamps shine in it.
   The secret: Down, Down, Up, Up, Right, Left, Right, Left, A on the menu hands you the wheel.
   Left stick or arrows steer, RT/A or W go, LT or S brake and reverse, Y or C changes the camera,
   B or Esc gives the car back. Afterwards, System has "Take the wheel".
   Only draws while the theme is on and Bladedeck has the screen. Uses THREE (vendor/three.min.js),
   S, toast, Sound and Secrets at call time. */

const Drive = (() => {
  let on = false, ready = false, away = false, driving = false, raf = 0, last = 0, clock = 0;
  let R, scene, cam, car, wheels = [], steerWheel, curve, lamps = [], streaks = [], rain, ripples = [], head, tail;
  let shot = 0, shotT = 0, u = 0.12, carPos, carDir, carY = 0;
  const free = { x: 0, z: 0, yaw: 0, speed: 0, steer: 0, camera: 0 };
  const keys = new Set();
  let fade, hud, audio = null;
  const A = 46, B = 30, H = 5, W = 8; // track size, bridge height, road width
  const SHOTS = ['aerial', 'low', 'top', 'incar', 'chase', 'side'];
  const DRIVE_CAMS = ['chase', 'incar', 'low', 'top'];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -------------------------------------------------------------- building the world */
  function build() {
    const canvas = document.createElement('canvas');
    canvas.id = 'drive'; canvas.hidden = true;
    document.getElementById('scene').after(canvas);
    fade = document.createElement('div'); fade.id = 'drive-fade'; canvas.after(fade);
    hud = document.createElement('div'); hud.id = 'drive-hud'; hud.hidden = true; document.body.appendChild(hud);

    tmp = new THREE.Vector3(); tmp2 = new THREE.Vector3(); look = new THREE.Vector3();
    R = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
    R.setPixelRatio(Math.min(devicePixelRatio, 1) * 0.8);
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.45;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06090f);
    scene.fog = new THREE.FogExp2(0x070b12, 0.018);
    cam = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    scene.add(new THREE.HemisphereLight(0x3a4d72, 0x080a0e, 1.6));
    const moon = new THREE.DirectionalLight(0x9fb6e6, 0.9); moon.position.set(-30, 60, 20); scene.add(moon);

    // Wet ground: dark and smooth, so every light leaves a shine on it.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x12161c, roughness: 0.3, metalness: 0.15 }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);

    // The figure-eight, raised into a bridge where it crosses itself.
    const pts = [];
    for (let i = 0; i < 240; i++) {
      const t = (i / 240) * Math.PI * 2;
      pts.push(new THREE.Vector3(A * Math.sin(t), H * (1 + Math.cos(t)) / 2 + 0.03, B * Math.sin(t) * Math.cos(t) * 2));
    }
    curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const N = 600, pos = [], idx = [], up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= N; i++) {
      const p = curve.getPointAt((i % N) / N), tg = curve.getTangentAt((i % N) / N), side = new THREE.Vector3().crossVectors(tg, up).normalize().multiplyScalar(W / 2);
      pos.push(p.x - side.x, p.y, p.z - side.z, p.x + side.x, p.y, p.z + side.z);
      if (i < N) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
      // Pillars under the bridge, dashes down the middle, kerb lights on the bends.
      if (i % 20 === 0 && p.y > 1.2) {
        const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, p.y, 8), new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.8 }));
        pil.position.set(p.x, p.y / 2, p.z); scene.add(pil);
      }
      if (i % 6 === 0) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 1.6), new THREE.MeshBasicMaterial({ color: 0x8c8f80 }));
        dash.rotation.x = -Math.PI / 2; dash.rotation.z = -Math.atan2(tg.x, tg.z) + Math.PI; dash.position.set(p.x, p.y + 0.02, p.z); scene.add(dash);
      }
    }
    const road = new THREE.BufferGeometry();
    road.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); road.setIndex(idx); road.computeVertexNormals();
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.16, metalness: 0.35, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
    scene.add(new THREE.Mesh(road, roadMat));

    // Street lamps on the outside of the track, and their long smeared shine on the wet ground.
    const glow = streakTexture();
    for (let i = 0; i < 12; i++) {
      const s = (i + 0.5) / 12, p = curve.getPointAt(s), tg = curve.getTangentAt(s);
      const out = new THREE.Vector3(tg.z, 0, -tg.x).normalize();
      if (out.dot(new THREE.Vector3(p.x, 0, p.z)) < 0) out.negate();
      const base = p.clone().addScaledVector(out, W / 2 + 1.6);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7 + p.y, 6), new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.5, metalness: 0.6 }));
      pole.position.set(base.x, (7 + p.y) / 2, base.z); scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd29a }));
      bulb.position.set(base.x - out.x * 0.9, 7 + p.y, base.z - out.z * 0.9); scene.add(bulb);
      if (i % 2 === 0) { const l = new THREE.PointLight(0xffb873, 320, 34, 1.6); l.position.copy(bulb.position); scene.add(l); }
      lamps.push(bulb.position.clone());
      const st = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 14), new THREE.MeshBasicMaterial({ map: glow, color: 0xffb35c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      st.rotation.x = -Math.PI / 2; const g = new THREE.Group(); g.add(st); st.position.z = 6.5;
      g.position.set(bulb.position.x, p.y + 0.06, bulb.position.z); scene.add(g); streaks.push(g);
    }
    // Far-off city lights on the horizon.
    const city = new THREE.BufferGeometry(), cp = [];
    for (let i = 0; i < 500; i++) { const a = Math.random() * Math.PI * 2, r = 150 + Math.random() * 90; cp.push(Math.cos(a) * r, Math.random() ** 3 * 22, Math.sin(a) * r); }
    city.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    scene.add(new THREE.Points(city, new THREE.PointsMaterial({ color: 0xffc98a, size: 1.1, fog: false, transparent: true, opacity: 0.55 })));

    buildCar(); buildRain(); buildRipples();
    addEventListener('resize', size); size();
    ready = true;
  }

  function streakTexture() {
    const c = document.createElement('canvas'); c.width = 32; c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(16, 20, 0, 16, 20, 110);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 128);
    return new THREE.CanvasTexture(c);
  }

  function buildCar() {
    car = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: 0xc0121f, roughness: 0.22, metalness: 0.65 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0a1624, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.75 });
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); car.add(m); return m; };
    add(new THREE.BoxGeometry(2.0, 0.5, 4.4), paint, 0, 0.55, 0);           // body
    add(new THREE.BoxGeometry(1.96, 0.18, 1.5), paint, 0, 0.86, 1.35);      // hood
    const cab = new THREE.BoxGeometry(1.7, 0.55, 2.1);                      // cabin, narrower at the top
    const cp = cab.attributes.position; for (let i = 0; i < cp.count; i++) if (cp.getY(i) > 0) { cp.setX(i, cp.getX(i) * 0.86); cp.setZ(i, cp.getZ(i) * (cp.getZ(i) > 0 ? 0.62 : 0.85)); }
    cab.computeVertexNormals(); add(cab, glass, 0, 1.08, -0.3);
    add(new THREE.BoxGeometry(1.9, 0.08, 0.35), dark, 0, 1.12, -2.05);      // spoiler
    add(new THREE.BoxGeometry(0.08, 0.3, 0.08), dark, 0.7, 0.95, -2.05); add(new THREE.BoxGeometry(0.08, 0.3, 0.08), dark, -0.7, 0.95, -2.05);
    // Inside, for the driver's-seat shot.
    add(new THREE.BoxGeometry(1.6, 0.16, 0.34), dark, 0, 0.92, 0.6);
    steerWheel = add(new THREE.TorusGeometry(0.16, 0.022, 6, 18), dark, -0.4, 1.06, 0.3); steerWheel.rotation.x = -0.5;
    // Lights.
    const hl = new THREE.MeshBasicMaterial({ color: 0xf4f7ff }), tl = new THREE.MeshBasicMaterial({ color: 0xff1a2a });
    add(new THREE.BoxGeometry(0.5, 0.14, 0.05), hl, 0.68, 0.66, 2.21); add(new THREE.BoxGeometry(0.5, 0.14, 0.05), hl, -0.68, 0.66, 2.21);
    add(new THREE.BoxGeometry(1.7, 0.1, 0.05), tl, 0, 0.72, -2.21);
    head = new THREE.SpotLight(0xe8eeff, 900, 60, 0.5, 0.55, 1.4); head.position.set(0, 0.7, 2.0);
    head.target.position.set(0, 0, 14); car.add(head, head.target);
    tail = new THREE.PointLight(0xff2030, 25, 8, 2); tail.position.set(0, 0.7, -2.6); car.add(tail);
    // Wheels: front two steer.
    const tyre = new THREE.CylinderGeometry(0.4, 0.4, 0.32, 16); tyre.rotateZ(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(0.24, 0.24, 0.34, 8); rim.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.3, metalness: 0.9 });
    for (const [x, z] of [[0.98, 1.42], [-0.98, 1.42], [0.98, -1.42], [-0.98, -1.42]]) {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.4, z);
      const spin = new THREE.Group(); spin.add(new THREE.Mesh(tyre, dark), new THREE.Mesh(rim, rimMat)); pivot.add(spin);
      car.add(pivot); wheels.push({ pivot, spin, front: z > 0 });
    }
    // The car's own shine on the wet road.
    const glow = streakTexture();
    for (const [x, col, z] of [[0.68, 0xdfe8ff, 2.6], [-0.68, 0xdfe8ff, 2.6], [0, 0xff2030, -2.6]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 6), new THREE.MeshBasicMaterial({ map: glow, color: col, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = z > 0 ? Math.PI : 0; m.position.set(x, 0.05, z + Math.sign(z) * 2.5); car.add(m);
    }
    scene.add(car);
    carPos = new THREE.Vector3(); carDir = new THREE.Vector3(0, 0, 1);
  }

  // Rain: short streaks that fall around the camera and wrap round.
  const DROPS = 2600, BOX = 34;
  function buildRain() {
    const g = new THREE.BufferGeometry(), p = new Float32Array(DROPS * 6);
    for (let i = 0; i < DROPS; i++) { const x = (Math.random() - 0.5) * BOX * 2, y = Math.random() * 30, z = (Math.random() - 0.5) * BOX * 2; p.set([x, y, z, x, y + 0.7, z], i * 6); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9db3cf, transparent: true, opacity: 0.32, fog: true }));
    rain.frustumCulled = false; scene.add(rain);
  }
  function buildRipples() {
    const geo = new THREE.RingGeometry(0.82, 1, 24); geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 110; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xbfd2ea, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false; scene.add(m); ripples.push({ m, life: 0, max: 1 });
    }
  }

  /* -------------------------------------------------------------- each frame */
  function size() { if (!R) return; R.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }

  // Scratch vectors, made with the world (the 3D library loads only when the theme is on).
  let tmp, tmp2, look;
  function roadY(x, z) {
    // Height of the road under a free-driven car: the bridge only counts if you are on it and up there already.
    let best = 1e9, y = 0;
    for (let i = 0; i < 120; i++) { const p = curve.getPointAt(i / 120), d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) { best = d; y = p.y; } }
    if (best > (W / 2) ** 2 + 1) return 0;
    return Math.abs(y - carY) < 1.2 || y < 1 ? y - 0.03 : 0;
  }

  function moveCar(dt) {
    if (!driving) {
      u = (u + dt * 15 / curve.getLength()) % 1;
      curve.getPointAt(u, carPos); curve.getTangentAt(u, carDir);
      const ahead = curve.getTangentAt((u + 0.01) % 1, tmp2);
      free.steer = THREE.MathUtils.clamp(Math.atan2(carDir.x * ahead.z - carDir.z * ahead.x, carDir.dot(ahead)) * 9, -0.5, 0.5);
      free.speed = 15; carY = carPos.y;
      car.position.copy(carPos).setY(carPos.y - 0.03);
      car.lookAt(tmp.copy(car.position).add(carDir));
    } else {
      // Arcade handling: the stick turns, the triggers speed up and slow down.
      const pad = [...(navigator.getGamepads?.() || [])].find((p) => p && p.connected);
      let steer = -(keys.has('ArrowLeft') || keys.has('a') ? -1 : 0) - (keys.has('ArrowRight') || keys.has('d') ? 1 : 0);
      let gas = keys.has('ArrowUp') || keys.has('w') ? 1 : 0, brake = keys.has('ArrowDown') || keys.has('s') ? 1 : 0;
      if (pad) {
        const ax = pad.axes[0] || 0; if (Math.abs(ax) > 0.12) steer = -ax;
        gas = Math.max(gas, pad.buttons[7]?.value || 0, pad.buttons[0]?.pressed ? 1 : 0);
        brake = Math.max(brake, pad.buttons[6]?.value || 0);
      }
      free.steer += (steer * 0.55 - free.steer) * Math.min(1, dt * 8);
      if (gas) free.speed += gas * 22 * dt;
      if (brake) free.speed -= brake * (free.speed > 0 ? 34 : 12) * dt;
      free.speed -= free.speed * 0.35 * dt;
      free.speed = THREE.MathUtils.clamp(free.speed, -10, 48);
      free.yaw += free.steer * free.speed * dt * 0.34;
      free.x += Math.sin(free.yaw) * free.speed * dt; free.z += Math.cos(free.yaw) * free.speed * dt;
      const r = Math.hypot(free.x, free.z); if (r > 180) { free.x *= 180 / r; free.z *= 180 / r; free.speed *= 0.5; }
      carY += (roadY(free.x, free.z) - carY) * Math.min(1, dt * 6);
      car.position.set(free.x, carY, free.z); car.rotation.set(0, free.yaw, 0);
      carPos.copy(car.position); carDir.set(Math.sin(free.yaw), 0, Math.cos(free.yaw));
      hud.innerHTML = `<b>${Math.round(Math.abs(free.speed) * 3.6)}</b><span>km/h</span><small>B leave · Y camera</small>`;
    }
    for (const w of wheels) { w.spin.rotation.x += free.speed * dt / 0.4; if (w.front) w.pivot.rotation.y = free.steer; }
    steerWheel.rotation.z = free.steer * 2.2;
  }

  function placeCamera(dt, which) {
    const local = (x, y, z) => car.localToWorld(tmp.set(x, y, z));
    cam.up.set(0, 1, 0);
    if (which === 'aerial') { const a = clock * 0.05 + shot; cam.position.set(Math.cos(a) * 56, 30, Math.sin(a) * 56); look.lerp(carPos, Math.min(1, dt * 2)); cam.lookAt(look); cam.fov = 38; }
    else if (which === 'low') { cam.position.copy(local(1.45, 0.32, -3.1)); cam.lookAt(local(0.75, 0.45, 7)); cam.fov = 62; }
    else if (which === 'top') { cam.position.copy(carPos).add(tmp2.set(0, 26, 0)); cam.up.copy(carDir); cam.lookAt(carPos); cam.fov = 45; }
    else if (which === 'incar') { cam.position.copy(local(-0.4, 1.36, -0.62)); cam.lookAt(local(-0.3, 1.15, 10)); cam.fov = 72; }
    else if (which === 'chase') { const want = local(0, 2.3, -7.2); cam.position.lerp(want, Math.min(1, dt * 5)); cam.lookAt(local(0, 1, 4)); cam.fov = 55; }
    else { // side of the road: a fixed spot that turns to follow the car past it
      if (!placeCamera.spot || shotT < dt * 1.5) { placeCamera.spot = curve.getPointAt((u + 0.06) % 1).clone().add(tmp2.set(6, 1.2, 6)); }
      cam.position.copy(placeCamera.spot); cam.position.y = Math.max(cam.position.y, carPos.y + 1); cam.lookAt(carPos); cam.fov = 34;
    }
    cam.updateProjectionMatrix();
  }

  function weather(dt) {
    // Rain follows the camera.
    const p = rain.geometry.attributes.position.array, cx = cam.position.x, cz = cam.position.z, cy = cam.position.y;
    const fall = 26 * dt, wind = 3 * dt;
    for (let i = 0; i < DROPS * 6; i += 6) {
      p[i + 1] -= fall; p[i + 4] -= fall; p[i] += wind; p[i + 3] += wind;
      if (p[i + 1] < 0 || Math.abs(p[i] - cx) > BOX || Math.abs(p[i + 2] - cz) > BOX) {
        const x = cx + (Math.random() - 0.5) * BOX * 2, z = cz + (Math.random() - 0.5) * BOX * 2, y = Math.max(cy, 4) + Math.random() * 18;
        p[i] = x; p[i + 1] = y; p[i + 2] = z; p[i + 3] = x - 0.08; p[i + 4] = y + 0.75; p[i + 5] = z;
      }
    }
    rain.geometry.attributes.position.needsUpdate = true;
    // New rings near what the camera looks at, and old ones spread and fade.
    look.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const t = cam.position.y > 0.5 && look.y < -0.05 ? -cam.position.y / look.y : 14;
    const fx = cam.position.x + look.x * Math.min(t, 22), fz = cam.position.z + look.z * Math.min(t, 22);
    let n = Math.round(dt * 70);
    for (const r of ripples) {
      if (r.life > 0) { r.life -= dt; const k = 1 - r.life / r.max; r.m.scale.setScalar(0.05 + k * 0.55); r.m.material.opacity = 0.45 * (1 - k); if (r.life <= 0) r.m.visible = false; }
      else if (n > 0) { n--; r.life = r.max = 0.6 + Math.random() * 0.5; r.m.position.set(fx + (Math.random() - 0.5) * 30, 0.04, fz + (Math.random() - 0.5) * 30); r.m.visible = true; }
    }
    // Lamp shine always stretches toward the viewer, like real reflections on a wet road.
    for (const g of streaks) g.rotation.y = Math.atan2(cam.position.x - g.position.x, cam.position.z - g.position.z);
  }

  function frame(ts) {
    raf = 0;
    if (!on || away) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    if (!driving && ts - last < 22) return; // the cinematic is fine at ~45 fps; driving gets every frame
    last = ts; clock += dt; shotT += dt;
    moveCar(dt);
    if (!driving && shotT > (SHOTS[shot] === 'aerial' ? 14 : 10)) cut((shot + 1) % SHOTS.length);
    placeCamera(dt, driving ? DRIVE_CAMS[free.camera] : SHOTS[shot]);
    weather(dt);
    R.render(scene, cam);
  }
  function cut(next) {
    if (still) { shot = next; shotT = 0; return; }
    fade.classList.add('dark');
    shotT = -0.6;
    setTimeout(() => { shot = next; shotT = 0; placeCamera.spot = null; fade.classList.remove('dark'); }, 550);
  }
  function run() { if (!raf && on && !away) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  /* -------------------------------------------------------------- the sound of rain */
  function rainSound(play) {
    const st = S.lib?.settings || {};
    if (!play || st.ambient === false || st.sounds === false) { if (audio) audio.g.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.4); return; }
    if (!audio) {
      const ctx = new AudioContext(), len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lo = ctx.createBiquadFilter(); lo.type = 'lowpass'; lo.frequency.value = 2400;
      const hi = ctx.createBiquadFilter(); hi.type = 'highpass'; hi.frequency.value = 350;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(lo).connect(hi).connect(g).connect(ctx.destination); src.start();
      audio = { ctx, g };
    }
    audio.ctx.resume();
    audio.g.gain.setTargetAtTime(0.09 * (st.ambientVolume ?? 0.5) * 2, audio.ctx.currentTime, 0.8);
  }

  /* -------------------------------------------------------------- on, off, and the wheel */
  /* The 3D library (670 KB) is only loaded the first time the theme is turned on, not with every
     start of Bladedeck. */
  let loading = null;
  function three() {
    if (typeof THREE !== 'undefined') return Promise.resolve(true);
    return (loading = loading || new Promise((res) => {
      const sc = document.createElement('script'); sc.src = 'vendor/three.min.js';
      sc.onload = () => res(true); sc.onerror = () => { loading = null; res(false); };
      document.head.appendChild(sc);
    }));
  }
  function set(enable) {
    on = !!enable;
    if (on && !ready && typeof THREE === 'undefined') { three().then((ok) => { if (ok && on) set(true); else if (!ok) on = false; }); return; }
    if (on && !ready) build();
    if (!ready) return;
    R.domElement.hidden = !on; fade.hidden = !on;
    if (!on) { if (driving) stopDriving(); cancelAnimationFrame(raf); raf = 0; }
    rainSound(on && !away);
    run();
  }
  document.addEventListener('deck-away', (ev) => { away = ev.detail; if (ready) rainSound(on && !away); run(); });

  function startDriving() {
    if (!on) { const t = S.themes.find((x) => x.scene === 'drive'); if (t) { applyTheme(t.id); save(); } }
    if (!on || driving) return;
    // The theme was just turned on and its 3D library is still loading: take the wheel once it is.
    if (!ready) { three().then((ok) => { if (ok) setTimeout(() => { if (ready) startDriving(); }, 200); }); return; }
    driving = true;
    free.x = carPos.x; free.z = carPos.z; free.yaw = Math.atan2(carDir.x, carDir.z); free.speed = 0; free.camera = 0;
    R.setPixelRatio(Math.min(devicePixelRatio, 1)); size();
    document.body.classList.add('driving'); hud.hidden = false;
    Sound.play('go');
    toast('You have the wheel. Stick or arrows steer, RT goes, LT brakes, Y changes camera, B hands it back.', 'fun');
  }
  function stopDriving() {
    driving = false; keys.clear();
    R.setPixelRatio(Math.min(devicePixelRatio, 1) * 0.8); size();
    // Back to the track at the nearest point.
    let best = 1e9; for (let i = 0; i < 200; i++) { const d = curve.getPointAt(i / 200).distanceToSquared(carPos); if (d < best) { best = d; u = i / 200; } }
    document.body.classList.remove('driving'); hud.hidden = true;
    Sound.play('back');
  }
  // Menu actions while driving: only a few mean anything; everything else is eaten.
  function handle(a) {
    if (!driving) return false;
    if (a === 'b' || a === 'start' || a === 'back') stopDriving();
    else if (a === 'y' || a === 'x') free.camera = (free.camera + 1) % DRIVE_CAMS.length;
    return true;
  }
  addEventListener('keydown', (ev) => {
    if (!driving) return;
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (k === 'Escape') stopDriving(); else if (k === 'c') free.camera = (free.camera + 1) % DRIVE_CAMS.length; else keys.add(k);
    ev.preventDefault(); ev.stopImmediatePropagation();
  }, true);
  addEventListener('keyup', (ev) => { keys.delete(ev.key.length === 1 ? ev.key.toLowerCase() : ev.key); }, true);

  return { set, handle, start: startDriving, driving: () => driving, on: () => on, shot: (n) => { shot = n % SHOTS.length; shotT = 0; placeCamera.spot = null; } };
})();
