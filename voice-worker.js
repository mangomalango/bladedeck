'use strict';
/* The speech-to-text helper for voice commands, run as its own process by voice.js so the
   speech model only takes memory while voice is being used. It hears 16 kHz audio from
   Bladedeck and answers with the words. Nothing leaves the computer. */
const path = require('path');
let rec = null;

function load(dir) {
  const so = require('sherpa-onnx');
  const f = (n) => path.join(dir, n);
  rec = so.createOfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: { moonshine: { encoder: f('encoder_model.ort'), mergedDecoder: f('decoder_model_merged.ort') }, tokens: f('tokens.txt'), numThreads: 2, provider: 'cpu', debug: 0 }
  });
}

process.parentPort.on('message', (ev) => {
  const m = ev.data || {};
  try {
    if (m.kind === 'load') { if (!rec) load(m.dir); process.parentPort.postMessage({ id: m.id, ok: true }); return; }
    if (m.kind === 'hear') {
      if (!rec) load(m.dir);
      const s = rec.createStream();
      s.acceptWaveform(16000, new Float32Array(m.samples));
      rec.decode(s);
      const text = String(rec.getResult(s).text || '').trim();
      if (s.free) s.free();
      process.parentPort.postMessage({ id: m.id, ok: true, text });
    }
  } catch (err) { process.parentPort.postMessage({ id: m.id, ok: false, error: String(err.message || err) }); }
});
