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

// The model arrives as a .tar.bz2; unpacked here (not with the system's tar, which not every
// Windows has), and only the files the model needs, only inside the voice folder.
function unpack(tarball, dest) {
  const fs = require('fs');
  const tar = require('seek-bzip').decode(fs.readFileSync(tarball));
  const want = /(^|\/)(encoder_model\.ort|decoder_model_merged\.ort|tokens\.txt|LICENSE)$/;
  let n = 0;
  for (let o = 0; o + 512 <= tar.length;) {
    const h = tar.subarray(o, o + 512);
    if (h.every((b) => b === 0)) break;
    const str = (a, b) => h.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
    const name = (str(345, 500) ? `${str(345, 500)}/` : '') + str(0, 100);
    const size = parseInt(str(124, 136).trim() || '0', 8), type = String.fromCharCode(h[156] || 48);
    o += 512;
    if ((type === '0' || type === '\0') && want.test(name)) {
      const to = path.resolve(dest, name);
      if (to.startsWith(path.resolve(dest) + path.sep)) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, tar.subarray(o, o + size)); n++; }
    }
    o += Math.ceil(size / 512) * 512;
  }
  return n;
}

process.parentPort.on('message', (ev) => {
  const m = ev.data || {};
  try {
    if (m.kind === 'unpack') { const n = unpack(m.tarball, m.dest); process.parentPort.postMessage({ id: m.id, ok: n >= 3, error: n >= 3 ? '' : 'The voice model was incomplete.' }); return; }
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
