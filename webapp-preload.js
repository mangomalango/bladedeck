'use strict';
/* Web app windows: a controller drives the page with real key presses. The d-pad or left stick
   are the arrow keys, A is Enter, B goes back (TV YouTube wants Escape for that), X plays and
   pauses, the shoulders page up and down, and View or the home button hop back to Bladedeck. */
const { ipcRenderer } = require('electron');
const tv = /SMART-TV/.test(navigator.userAgent);
const prev = {}, rep = {};
function poll(now) {
  requestAnimationFrame(poll);
  if (!document.hasFocus()) return;
  const p = [...(navigator.getGamepads?.() || [])].find(Boolean); if (!p) return;
  const b = (i) => !!p.buttons[i]?.pressed;
  const st = { Up: b(12) || p.axes[1] < -0.6, Down: b(13) || p.axes[1] > 0.6, Left: b(14) || p.axes[0] < -0.6, Right: b(15) || p.axes[0] > 0.6,
    Enter: b(0), back: b(1), Space: b(2), PageUp: b(4), PageDown: b(5), deck: b(8) || b(16) };
  for (const k in st) {
    const dir = k === 'Up' || k === 'Down' || k === 'Left' || k === 'Right';
    if (st[k] && !prev[k]) { send(k); rep[k] = now + 400; }
    else if (st[k] && dir && now > rep[k]) { send(k); rep[k] = now + 110; }
    prev[k] = st[k];
  }
}
function send(k) {
  if (k === 'back' && tv) k = 'Escape';
  if (k === 'Space' && tv) k = 'MediaPlayPause';
  ipcRenderer.send('webapp-key', k);
}
requestAnimationFrame(poll);
