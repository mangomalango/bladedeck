'use strict';
// The phone message bubble's window (phonemsg.js): only what it needs.
const { contextBridge, ipcRenderer, webFrame } = require('electron');
// A test copy (main.js TEST) never sees the owner's controller here either (preload.js does the same).
if (ipcRenderer.sendSync('bd-test')) webFrame.executeJavaScript('navigator.getGamepads = () => [];');
contextBridge.exposeInMainWorld('bubble', {
  onShow: (fn) => ipcRenderer.on('bubble-show', (_e, m) => fn(m)),
  done: (r) => ipcRenderer.send('bubble-done', r),
  idle: () => ipcRenderer.send('bubble-idle'),
  snap: () => ipcRenderer.invoke('bubble-snap'),
  // The combo is held (the game freezes) or let go (it runs again).
  hold: (on) => ipcRenderer.send('bubble-hold', !!on),
  // A bubble or the choice is on screen: the menu leaves LB, RB, LT and RT alone.
  up: (on, face) => ipcRenderer.send('bubble-up', { on: !!on, face: !!face }),
  // A quick reply by its number (0-3: up, down, right, left on the right stick); main holds the words. True once it is queued.
  reply: (id, pick) => ipcRenderer.invoke('bubble-reply', { id: String(id), pick: pick | 0 })
});
