'use strict';
// The phone message bubble's window (phonemsg.js): only what it needs.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bubble', {
  onShow: (fn) => ipcRenderer.on('bubble-show', (_e, m) => fn(m)),
  done: (r) => ipcRenderer.send('bubble-done', r),
  idle: () => ipcRenderer.send('bubble-idle'),
  snap: () => ipcRenderer.invoke('bubble-snap')
});
