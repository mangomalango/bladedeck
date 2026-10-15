'use strict';
// The phone message bubble's window (phonemsg.js): only what it needs.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bubble', {
  onShow: (fn) => ipcRenderer.on('bubble-show', (_e, m) => fn(m)),
  done: (r) => ipcRenderer.send('bubble-done', r),
  idle: () => ipcRenderer.send('bubble-idle'),
  snap: () => ipcRenderer.invoke('bubble-snap'),
  // The combo is held (the game freezes) or let go (it runs again).
  hold: (on) => ipcRenderer.send('bubble-hold', !!on),
  // A bubble or the choice is on screen: the menu leaves LB, RB, LT and RT alone.
  up: (on) => ipcRenderer.send('bubble-up', !!on)
});
