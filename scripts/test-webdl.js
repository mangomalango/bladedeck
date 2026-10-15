#!/usr/bin/env node
'use strict';
/* Test for webdl.extractWhenDone (BD-048, webdl.js): npm run test-webdl.
   Verifies:
   1. extractWhenDone returns false for unknown files.
   2. Arms extractWhenDone = true and sets note on in-progress archive downloads.
   3. Duplicate extractWhenDone calls are idempotent and stay armed.
   4. Non-archive downloads (.pdf) are not armed.
   5. Game downloads (with unpack: true) are not double-armed.
   6. Cancelling or interrupting a download clears extractWhenDone.
   7. Completing a download triggers extraction. */
const EventEmitter = require('events');
const path = require('path');
const os = require('os');
const Module = require('module');

let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };

// Stub Electron
class FakeSession extends EventEmitter {
  constructor() {
    super();
  }
  downloadURL(url) {
    this.lastDownloadURL = url;
  }
}
const defaultSession = new FakeSession();
const webappsSession = new FakeSession();

const ipcHandlers = {};
let extractedFiles = [];

const electron = {
  app: {
    getPath: () => os.tmpdir(),
    whenReady: () => Promise.resolve()
  },
  ipcMain: {
    handle: (ch, fn) => { ipcHandlers[ch] = fn; }
  },
  session: {
    defaultSession,
    fromPartition: () => webappsSession
  },
  Notification: class {
    static isSupported() { return false; }
    show() {}
  },
  shell: {},
  dialog: {}
};

// Stub archive.js
const archive = {
  extract: async (file, id) => {
    extractedFiles.push(file);
    return { ok: true, out: path.dirname(file) };
  }
};

const load = Module._load;
Module._load = function (r, ...a) {
  if (r === 'electron') return electron;
  if (r === './archive' || r === path.join(__dirname, '..', 'archive')) return archive;
  return load.call(this, r, ...a);
};

const webdl = require('../webdl');

class FakeDownloadItem extends EventEmitter {
  constructor({ url, filename, totalBytes = 1000000 }) {
    super();
    this.url = url;
    this.filename = filename;
    this.totalBytes = totalBytes;
    this.receivedBytes = 0;
    this.savePath = path.join(os.tmpdir(), filename);
    this.paused = false;
  }
  getURL() { return this.url; }
  getURLChain() { return [this.url]; }
  getFilename() { return this.filename; }
  getTotalBytes() { return this.totalBytes; }
  getReceivedBytes() { return this.receivedBytes; }
  isPaused() { return this.paused; }
  setSavePath(p) { this.savePath = p; }
}

(async () => {
  webdl.register({ getWin: () => null, getSettings: () => ({ dlDir: os.tmpdir() }) });
  await electron.app.whenReady();

  // Test 1: Unknown file
  ok(webdl.extractWhenDone('/path/to/nonexistent/file.zip') === false, 'unknown file returns false');

  // Test 2: In-progress archive download
  const item1 = new FakeDownloadItem({ url: 'https://example.com/archive1.zip', filename: 'archive1.zip' });
  defaultSession.emit('will-download', {}, item1, { getURL: () => 'https://example.com/archive1.zip' });

  let list = await ipcHandlers['web-dl-list']();
  let rec1 = list.find((r) => r.name === 'archive1.zip');
  ok(!!rec1, 'download record created on will-download');
  ok(rec1.state === 'progressing', 'initial state is progressing');
  ok(rec1.extractWhenDone === false, 'extractWhenDone is false initially');

  const armed = webdl.extractWhenDone(item1.savePath);
  ok(armed === true, 'extractWhenDone returned true for active download');

  list = await ipcHandlers['web-dl-list']();
  rec1 = list.find((r) => r.name === 'archive1.zip');
  ok(rec1.extractWhenDone === true, 'rec.extractWhenDone marked true');
  ok(rec1.note === 'Extracts as soon as it finishes downloading.', 'rec.note set to extraction notice');

  // Test 3: Duplicate call (idempotent)
  const armedAgain = webdl.extractWhenDone(item1.savePath);
  ok(armedAgain === true, 'duplicate extractWhenDone returns true');
  list = await ipcHandlers['web-dl-list']();
  rec1 = list.find((r) => r.name === 'archive1.zip');
  ok(rec1.extractWhenDone === true, 'extractWhenDone remains true on duplicate call');

  // Test 4: Non-archive file (.pdf)
  const item2 = new FakeDownloadItem({ url: 'https://example.com/manual.pdf', filename: 'manual.pdf' });
  defaultSession.emit('will-download', {}, item2, { getURL: () => 'https://example.com/manual.pdf' });

  const armedPdf = webdl.extractWhenDone(item2.savePath);
  ok(armedPdf === true, 'extractWhenDone returns true for known file');
  list = await ipcHandlers['web-dl-list']();
  const rec2 = list.find((r) => r.name === 'manual.pdf');
  ok(rec2.extractWhenDone === false, 'non-archive file is not armed for extraction');

  // Test 5: Game download (already has unpack: true)
  // Trigger web-dl-start with kind: 'game'
  await ipcHandlers['web-dl-start']({}, { url: 'https://example.com/game.zip', kind: 'game', title: 'Test Game' });
  const item3 = new FakeDownloadItem({ url: 'https://example.com/game.zip', filename: 'game.zip' });
  defaultSession.emit('will-download', {}, item3, { getURL: () => 'https://example.com/game.zip' });

  list = await ipcHandlers['web-dl-list']();
  const rec3 = list.find((r) => r.name === 'game.zip');
  ok(rec3.game === true, 'game download has game = true');

  webdl.extractWhenDone(item3.savePath);
  list = await ipcHandlers['web-dl-list']();
  const rec3After = list.find((r) => r.name === 'game.zip');
  ok(rec3After.extractWhenDone === false, 'game download with unpack: true does not double-arm extractWhenDone');

  // Test 6: Cancelled / Interrupted download clears extractWhenDone
  const item4 = new FakeDownloadItem({ url: 'https://example.com/cancelled.zip', filename: 'cancelled.zip' });
  defaultSession.emit('will-download', {}, item4, { getURL: () => 'https://example.com/cancelled.zip' });
  webdl.extractWhenDone(item4.savePath);

  list = await ipcHandlers['web-dl-list']();
  let rec4 = list.find((r) => r.name === 'cancelled.zip');
  ok(rec4.extractWhenDone === true, 'item4 is armed for extraction');

  // Emit done with state 'cancelled'
  item4.emit('done', {}, 'cancelled');
  list = await ipcHandlers['web-dl-list']();
  rec4 = list.find((r) => r.name === 'cancelled.zip');
  ok(rec4.extractWhenDone === false, 'cancelled download clears extractWhenDone');
  ok(rec4.note === '', 'cancelled download clears note');

  // Test 7: Completed download triggers extraction when armed
  ok(extractedFiles.length === 0, 'no extractions yet');
  item1.emit('done', {}, 'completed');
  // extractNow is called synchronously inside 'done'
  ok(extractedFiles.includes(item1.savePath), 'completed armed download triggered extractNow');

  console.log(`\nWebdl test finished with ${fails} failure(s).`);
  process.exit(fails > 0 ? 1 : 0);
})();
