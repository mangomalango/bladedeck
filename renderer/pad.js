'use strict';
/* Pad: everything works from a controller or a TV remote alone.
   PadNav moves a highlight around any panel by where things are on screen, so grids of covers,
   rows of tabs and forms all go the way the d-pad points. Text boxes are highlighted but never
   focused while you use a controller: a focused text box is what makes Steam (and other
   overlays) throw up their own on-screen keyboard. Pressing A on one opens Bladedeck's keyboard
   instead, which types into the box without focusing it.
   Uses S, Sound and $ at call time. */

const PadNav = (() => {
  const FOCUSABLE = 'button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), .task, [data-pad]';
  let hl = null, lastIndex = 0;
  const isText = (el) => !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|password|url|email|number|)$/i.test(el.type)));
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const list = (root) => [...root.querySelectorAll(FOCUSABLE)].filter(shown);

  function mark(el) {
    if (hl && hl !== el) hl.classList.remove('pad-hl');
    hl = el;
    if (!el) return;
    el.classList.add('pad-hl');
    // Text boxes only light up; everything else takes real focus (so Enter and screen readers work).
    if (isText(el)) { if (document.activeElement && document.activeElement !== document.body && !OSK.isOpen()) document.activeElement.blur(); }
    else el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function current(root) {
    const l = list(root); if (!l.length) return null;
    const a = document.activeElement;
    if (a && root.contains(a) && l.includes(a) && a !== hl) { mark(a); return a; }
    if (hl && hl.isConnected && l.includes(hl)) return hl;
    const el = l[Math.min(lastIndex, l.length - 1)];
    mark(el); return el;
  }
  function start(root) {
    const l = list(root); lastIndex = 0;
    // Start on the first thing you can act on; a text box first only if that is all there is.
    mark(l.find((el) => !isText(el)) || l[0] || null);
  }

  // A checkbox counts as its whole label: the box alone is a tiny target to aim at.
  const rect = (el) => ((el.type === 'checkbox' || el.type === 'radio') && el.closest('label') ? el.closest('label') : el).getBoundingClientRect();
  const gap = (a1, a2, b1, b2) => Math.max(0, Math.max(a1, b1) - Math.min(a2, b2));

  // The nearest thing in the direction pressed, preferring what lines up with where you are.
  function move(root, dir) {
    const l = list(root), cur = current(root);
    if (!cur) return false;
    const r = rect(cur), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, score = Infinity;
    for (const el of l) {
      if (el === cur) continue;
      const q = rect(el), x = q.left + q.width / 2, y = q.top + q.height / 2;
      let main, side;
      // Side distance is how far apart the two are across the move: none when they overlap.
      if (dir === 'down') { if (q.top < r.bottom - 6 && y <= cy + 6) continue; main = Math.max(1, q.top - r.top); side = gap(r.left, r.right, q.left, q.right) + Math.abs(q.left - r.left) * 0.05; }
      else if (dir === 'up') { if (q.bottom > r.top + 6 && y >= cy - 6) continue; main = Math.max(1, r.bottom - q.bottom); side = gap(r.left, r.right, q.left, q.right) + Math.abs(q.left - r.left) * 0.05; }
      else if (dir === 'right') { if (q.left < r.right - 6 && x <= cx + 6) continue; main = x - cx; side = gap(r.top, r.bottom, q.top, q.bottom) * 3; }
      else { if (q.right > r.left + 6 && x >= cx - 6) continue; main = cx - x; side = gap(r.top, r.bottom, q.top, q.bottom) * 3; }
      if (main <= 0) continue;
      const s = main + side * 2;
      if (s < score) { score = s; best = el; }
    }
    // Nothing that way: left and right still step through the list, as before.
    if (!best && (dir === 'left' || dir === 'right')) best = l[(l.indexOf(cur) + (dir === 'right' ? 1 : l.length - 1)) % l.length];
    if (!best) return false;
    lastIndex = l.indexOf(best);
    mark(best); Sound.play('tick');
    return true;
  }

  function press(el) {
    if (!el) return;
    if (isText(el)) { OSK.open(el); return; }
    if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('input', { bubbles: true })); Sound.play('tick'); return; }
    el.click();
  }

  // One step for any panel: returns true when it used the input.
  function input(root, a) {
    const cur = current(root);
    if (cur?.tagName === 'SELECT' && (a === 'left' || a === 'right')) {
      cur.selectedIndex = Math.max(0, Math.min(cur.options.length - 1, cur.selectedIndex + (a === 'right' ? 1 : -1)));
      cur.dispatchEvent(new Event('change', { bubbles: true })); cur.dispatchEvent(new Event('input', { bubbles: true })); Sound.play('tick'); return true;
    }
    if (cur?.type === 'range' && (a === 'left' || a === 'right')) {
      a === 'right' ? cur.stepUp() : cur.stepDown();
      cur.dispatchEvent(new Event('input', { bubbles: true })); cur.dispatchEvent(new Event('change', { bubbles: true })); Sound.play('tick'); return true;
    }
    if (a === 'up' || a === 'down' || a === 'left' || a === 'right') { move(root, a); return true; }
    if (a === 'a') { press(cur); return true; }
    // Shoulder buttons jump a screenful through long lists.
    if (a === 'lb' || a === 'rb') { for (let i = 0; i < 5; i++) move(root, a === 'rb' ? 'down' : 'up'); return true; }
    return false;
  }

  function clear() { hl?.classList.remove('pad-hl'); hl = null; lastIndex = 0; }

  return { start, move, press, input, current, clear, isText, mark };
})();

/* OSK: Bladedeck's own on-screen keyboard. It types into a text box without focusing it, so no
   other keyboard pops up over it. A types the key, X deletes, Y adds a space, LB and RB move
   the cursor, Start (or Done) finishes, B closes. A physical keyboard still works the normal way. */
const OSK = (() => {
  const el = document.createElement('div');
  el.id = 'osk'; el.hidden = true;
  document.body.appendChild(el);
  const ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', "'"],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ':', '/'],
    ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '?'],
    ['sym', 'space', 'back', 'done']
  ];
  const SYM = { 1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '&', 7: '*', 8: '(', 9: ')', 0: '_', '-': '+', "'": '"', ':': ';', '/': '\\', ',': '<', '.': '>', '?': '=' };
  const WIDE = { shift: 1.5, sym: 1.5, space: 5, back: 2, done: 2 };
  const LABEL = { shift: '⇧', sym: '#+=', space: 'Space', back: '⌫', done: 'Done' };
  let target = null, sel = '', caret = 0, r = 1, c = 0, shift = false, sym = false;
  // Panels redraw as you type (a search refreshing its results); keep typing into the new box.
  const live = () => { if (target && !target.isConnected && sel) target = document.querySelector(sel) || target; return target; };

  const isOpen = () => !el.hidden;
  const keyAt = (rr, cc) => ROWS[rr][Math.min(cc, ROWS[rr].length - 1)];
  const show = (k) => (LABEL[k] || (sym && SYM[k] ? SYM[k] : shift ? k.toUpperCase() : k));

  function draw() {
    const v = target.value;
    const pre = esc(v.slice(0, caret)), post = esc(v.slice(caret));
    el.innerHTML = `<div class="osk-card">
      <div class="osk-top"><b>${esc(target.placeholder || target.getAttribute('aria-label') || target.name || 'Type')}</b></div>
      <div class="osk-line">${pre}<i class="osk-caret"></i>${post || (v ? '' : '<span class="osk-ph"></span>')}</div>
      ${ROWS.map((row, i) => `<div class="osk-row">${row.map((k, j) => `<button type="button" data-k="${k}" class="${i === r && j === Math.min(c, row.length - 1) ? 'cur' : ''} ${(k === 'shift' && shift) || (k === 'sym' && sym) ? 'on' : ''}" style="flex:${WIDE[k] || 1}">${esc(show(k))}</button>`).join('')}</div>`).join('')}
      <p class="osk-tip"><i class="pad a">A</i>type <i class="pad x">X</i>delete <i class="pad y">Y</i>space <i class="pad k">LB RB</i>move <i class="pad k">Start</i>done <i class="pad b">B</i>close</p></div>`;
  }

  function put(text) {
    live();
    const v = target.value;
    target.value = v.slice(0, caret) + text + v.slice(caret);
    caret += text.length; changed();
  }
  function del() {
    live();
    if (!caret) return;
    const v = target.value;
    target.value = v.slice(0, caret - 1) + v.slice(caret); caret--; changed();
  }
  function changed() { target.dispatchEvent(new Event('input', { bubbles: true })); draw(); }

  function hit(k) {
    Sound.play('tick');
    if (k === 'shift') { shift = !shift; draw(); }
    else if (k === 'sym') { sym = !sym; draw(); }
    else if (k === 'space') put(' ');
    else if (k === 'back') del();
    else if (k === 'done') done();
    else { put(sym && SYM[k] ? SYM[k] : shift ? k.toUpperCase() : k); if (shift && !sym) { shift = false; draw(); } }
  }

  function open(input) {
    target = input; caret = input.value.length;
    sel = input.name ? `[name="${input.name}"]` : input.className ? '.' + [...input.classList].filter((k) => k !== 'pad-hl').join('.') : ''; r = 1; c = 0; shift = false; sym = false;
    el.hidden = false; draw();
    requestAnimationFrame(() => el.classList.add('open'));
    Sound.play('pop');
  }
  function close() {
    if (!isOpen()) return;
    el.classList.remove('open');
    setTimeout(() => { if (!el.classList.contains('open')) el.hidden = true; }, 200);
    target?.dispatchEvent(new Event('change', { bubbles: true }));
    target = null;
  }
  function done() {
    const t = target; close();
    // Searches act on Enter, so send one.
    t?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }

  function handle(a) {
    if (!isOpen()) return false;
    if (a === 'up') { r = (r + ROWS.length - 1) % ROWS.length; draw(); Sound.play('tick'); }
    else if (a === 'down') { r = (r + 1) % ROWS.length; draw(); Sound.play('tick'); }
    else if (a === 'left') { const n = ROWS[r].length; c = (Math.min(c, n - 1) + n - 1) % n; draw(); Sound.play('tick'); }
    else if (a === 'right') { const n = ROWS[r].length; c = (Math.min(c, n - 1) + 1) % n; draw(); Sound.play('tick'); }
    else if (a === 'a') hit(keyAt(r, c));
    else if (a === 'x') { del(); Sound.play('tick'); }
    else if (a === 'y') put(' ');
    else if (a === 'lb') { caret = Math.max(0, caret - 1); draw(); }
    else if (a === 'rb') { caret = Math.min(target.value.length, caret + 1); draw(); }
    else if (a === 'start') done();
    else if (a === 'b') close();
    return true;
  }

  el.addEventListener('pointerdown', (ev) => ev.preventDefault());
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k;
    r = ROWS.findIndex((row) => row.includes(k)); c = ROWS[r].indexOf(k);
    hit(k);
  });
  // Someone reached for a real keyboard: hand the box over to it.
  addEventListener('keydown', (ev) => {
    if (!isOpen() || ev.isTrusted === false) return;
    if (/^(Shift|Control|Alt|Meta)$/.test(ev.key)) return;
    const t = target; close(); t?.focus();
  }, true);

  return { open, close, handle, isOpen };
})();
