'use strict';
/* Voice commands, the main-process side. Not an assistant: a short list of things you can say
   (open a game or app, weather, timers and alarms, music, back to the menu), matched by simple
   patterns in renderer/voice.js.
   Speech is turned into words on this computer by a small model (Moonshine tiny, about 30 MB),
   downloaded once when you turn voice on. It runs in its own process (voice-worker.js) that
   starts when you talk and quits after 90 seconds of quiet, so it costs nothing the rest of the
   time. Weather comes from Open-Meteo (no account), for the town you set. */
const fs = require('fs');
const path = require('path');
const { ipcMain, app, net, utilityProcess } = require('electron');

const MODEL = 'sherpa-onnx-moonshine-tiny-en-quantized-2026-02-27';
const URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${MODEL}.tar.bz2`;
const IDLE = 90000;
let child = null, idle = 0, seq = 0, waiting = new Map(), busy = null;

const base = () => path.join(app.getPath('userData'), 'voice');
const modelDir = () => path.join(base(), MODEL);
const ready = () => ['encoder_model.ort', 'decoder_model_merged.ort', 'tokens.txt'].every((f) => fs.existsSync(path.join(modelDir(), f)));

function worker() {
  clearTimeout(idle);
  idle = setTimeout(() => { if (child) { child.kill(); child = null; } }, IDLE);
  if (child) return child;
  child = utilityProcess.fork(path.join(__dirname, 'voice-worker.js'), [], { serviceName: 'Bladedeck voice' });
  child.on('message', (m) => { const f = waiting.get(m.id); if (f) { waiting.delete(m.id); f(m); } });
  child.on('exit', () => { child = null; for (const f of waiting.values()) f({ ok: false, error: 'The voice helper stopped.' }); waiting.clear(); });
  return child;
}
function call(msg, timeout = 30000) {
  const w = worker(), id = ++seq;
  return new Promise((res) => {
    const t = setTimeout(() => { waiting.delete(id); res({ ok: false, error: 'Voice took too long.' }); }, timeout);
    waiting.set(id, (m) => { clearTimeout(t); res(m); });
    w.postMessage({ ...msg, id, dir: modelDir() });
  });
}

async function download(progress) {
  if (ready()) return { ok: true };
  if (busy) return busy;
  busy = (async () => {
    fs.mkdirSync(base(), { recursive: true });
    const tmp = path.join(base(), 'model.tar.bz2');
    try {
      const r = await net.fetch(URL);
      if (!r.ok) return { ok: false, error: `The voice model did not download (${r.status}).` };
      const total = +r.headers.get('content-length') || 30e6;
      const out = fs.createWriteStream(tmp); let got = 0, last = 0;
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        got += value.length; out.write(Buffer.from(value));
        const pct = Math.min(99, Math.round(100 * got / total)); if (pct !== last) { last = pct; progress(pct); }
      }
      await new Promise((res) => out.end(res));
      // Unpacked in the voice helper, so the menus never freeze for it.
      const u = await call({ kind: 'unpack', tarball: tmp, dest: base() }, 180000);
      fs.rmSync(tmp, { force: true });
      if (!u.ok || !ready()) return { ok: false, error: 'The voice model could not be unpacked.' };
      progress(100);
      return { ok: true };
    } catch (err) { return { ok: false, error: String(err.message || err) }; } finally { busy = null; }
  })();
  return busy;
}

// Weather for a town: Open-Meteo's place search, then its forecast. No account, no key.
async function weather(place) {
  const q = String(place || '').trim(); if (!q) return { ok: false, error: 'Set your town in Settings for the weather.' };
  try {
    const g = await (await net.fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(q)}`)).json();
    const loc = g.results?.[0]; if (!loc) return { ok: false, error: `Could not find ${q}.` };
    const imperial = ['US', 'LR', 'MM'].includes(loc.country_code);
    const f = await (await net.fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=3&timezone=auto${imperial ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : ''}`)).json();
    return { ok: true, place: `${loc.name}${loc.admin1 ? `, ${loc.admin1}` : ''}`, unit: imperial ? '°F' : '°C', wind: imperial ? 'mph' : 'km/h', current: f.current, daily: f.daily };
  } catch { return { ok: false, error: 'The weather could not be reached. Is the internet on?' }; }
}

function register({ getWin }) {
  const send = (ch, d) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, d); };
  ipcMain.handle('voice-status', () => ({ ready: ready(), downloading: !!busy }));
  ipcMain.handle('voice-download', () => download((pct) => send('voice-progress', pct)));
  ipcMain.handle('voice-warm', async () => (ready() ? call({ kind: 'load' }, 60000) : { ok: false }));
  ipcMain.handle('voice-hear', async (_e, samples) => {
    if (!ready()) return { ok: false, error: 'Voice is not set up yet.' };
    const a = samples instanceof Float32Array ? samples : new Float32Array(samples || []);
    if (a.length < 1600 || a.length > 16000 * 15) return { ok: true, text: '' };
    return call({ kind: 'hear', samples: a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) });
  });
  ipcMain.handle('weather', (_e, place) => weather(place));
  app.on('will-quit', () => { if (child) child.kill(); });
}

module.exports = { register };
