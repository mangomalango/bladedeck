'use strict';
/* PadKeys (Windows only): one press, one action. With Steam running and no game in front, Steam
   drives every controller with its desktop layout, which turns buttons into keys and clicks
   (Xbox: A Enter, B Space, X PageUp, Y PageDown, Menu Escape, View Tab, LB Ctrl, RB Alt, the
   triggers mouse clicks; Steam Deck: A Enter, B Escape, Y Space). The menu already reads the
   controller itself, so each press counted twice, and B (Space) asked for a voice command.
   This runs before every other key and click handler and drops the ones a controller just sent.
   Steam can send the key a few milliseconds before the browser sees the button, so a key that
   could be Steam's waits 50 ms while a controller is plugged in; if no button moved, it goes on.
   A controller Bladedeck cannot see (a Steam Deck with only keys bound) still works by its keys.
   Loaded before every other script. Linux: does nothing. */

const PadKeys = (() => {
  if (!navigator.userAgent.includes('Windows')) return { busy: () => false };
  const STEAM = new Set(['Enter', 'Escape', ' ', 'Tab', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Control', 'Alt', 'Shift', 'Meta']);
  const WAIT = 50, BEFORE = 150;
  const pads = () => [...(navigator.getGamepads?.() || [])].filter(Boolean);
  let lastAt = -1e9, sig = '';
  // Is a controller being touched now? Also notes when one last changed (a press or a let-go).
  function look() {
    const now = performance.now(); let busy = false; const s = [];
    for (const g of pads()) {
      for (const b of g.buttons) { const on = b.pressed || b.value > 0.1; if (on) busy = true; s.push(on ? 1 : 0); }
      for (const a of g.axes) { const d = a > 0.3 ? 1 : a < -0.3 ? -1 : 0; if (d) busy = true; s.push(d); }
    }
    const j = s.join(); if (j !== sig) { sig = j; lastAt = now; }
    if (busy) lastAt = now;
    return busy;
  }
  (function tick() { requestAnimationFrame(tick); look(); })();
  const since = (t) => look() || lastAt >= t;
  const eat = (ev) => { ev.preventDefault(); ev.stopImmediatePropagation(); };
  const typing = (t) => /INPUT|TEXTAREA|SELECT/.test(t?.tagName || '') || !!t?.isContentEditable;

  const held = new Set(); // keys dropped on the way down: their repeats and let-go go too
  addEventListener('keydown', (ev) => {
    if (!ev.isTrusted || !STEAM.has(ev.key) || !pads().length) return;
    const t0 = performance.now();
    if (held.has(ev.code) || since(t0 - BEFORE)) { held.add(ev.code); eat(ev); return; }
    if (typing(ev.target)) return; // typing in a box stays instant
    eat(ev);
    const init = { key: ev.key, code: ev.code, location: ev.location, repeat: ev.repeat, ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, metaKey: ev.metaKey, bubbles: true, cancelable: true, composed: true };
    const t = ev.target;
    setTimeout(() => {
      if (since(t0 - BEFORE)) return; // it was the controller
      // View, sent by Steam as Tab while the controller is what is being used: the menu's View.
      if (ev.key === 'Tab' && typeof S !== 'undefined' && S.pad && typeof handle === 'function' && !S.modal) { handle('back'); return; }
      // Otherwise it is a key like any other, and (as a key always did) the menu leaves controller mode.
      if (typeof S !== 'undefined') S.pad = false;
      const ok = t.dispatchEvent(new KeyboardEvent('keydown', init));
      // A held-back Enter or Space no longer presses the focused button by itself.
      if (ok && (ev.key === 'Enter' || ev.key === ' ') && t.isConnected && /^(BUTTON|A|SUMMARY)$/.test(t.tagName)) t.click();
    }, WAIT);
  }, true);
  addEventListener('keyup', (ev) => { if (ev.isTrusted && held.delete(ev.code)) eat(ev); }, true);

  // The triggers (and a Steam Deck's trackpads) click the mouse: drop a click made while a controller is in use.
  let eatPtr = false;
  addEventListener('pointerdown', (ev) => { if (!ev.isTrusted) return; eatPtr = pads().length > 0 && since(performance.now() - BEFORE); if (eatPtr) eat(ev); }, true);
  for (const k of ['mousedown', 'pointerup', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu']) addEventListener(k, (ev) => { if (eatPtr && ev.isTrusted) eat(ev); }, true);
  addEventListener('pointermove', (ev) => { if (ev.isTrusted && !ev.buttons) eatPtr = false; }, true);

  return { busy: look };
})();
