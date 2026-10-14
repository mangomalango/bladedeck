#!/usr/bin/env node
'use strict';
/* npm run sweep [-- --empty]
   Starts a test copy (scripts/testcopy.js: a copy of the owner's library unless --empty, no
   controller, nothing outward), then walks through Bladedeck the way a player would, over DevTools:
   every System item, every blade and every game, controller moves, every Settings tab, and each
   game type's windows in PC mode. It prints what broke (errors in the page, errors.log) and closes
   the copy. Nothing is launched: the test copy refuses it. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 9334; // apart from a test copy someone has open on 9333
const dir = path.join(os.tmpdir(), `bladedeck-sweep-${Date.now()}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// What runs inside the page. Skips anything that opens a system dialog, quits, or records.
const PAGE = `(() => { window.__sw = { done: false, at: '', out: [], errs: [] }; (async () => {
  const sw = window.__sw, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  window.addEventListener('error', (e) => sw.errs.push([sw.at, e.message, (e.filename || '').split('/').pop() + ':' + e.lineno]));
  window.addEventListener('unhandledrejection', (e) => sw.errs.push([sw.at, String(e.reason && (e.reason.stack || e.reason)).slice(0, 300)]));
  const ce = console.error; console.error = (...a) => { sw.errs.push([sw.at, a.map(String).join(' ').slice(0, 300)]); ce(...a); };
  const step = async (id, fn, ms = 400) => { sw.at = id; try { await Promise.race([Promise.resolve(fn()), wait(4000)]); } catch (err) { sw.errs.push([id, String(err.stack || err).slice(0, 300)]); } await wait(ms); };
  const closeAll = () => { if (S.modal) closeModal(); if (Tour.isOpen?.()) Tour.close(); for (const p of Panels.list?.() || []) Panels.act(p.key, 'close'); };
  const SKIP = /^(sys-romfile|sys-exit|sys-pc|sys-up|sys-rec|sys-drive)$/;
  for (const a of allSystemActions()) { if (SKIP.test(a.id)) continue; await step(a.id, a.run, 1200); sw.out.push(a.id); closeAll(); await wait(250); }
  for (let i = 0; i < S.blades.length; i++) { await step('blade ' + i, () => setBlade(i, true)); for (let j = 0; j < (S.items || []).length; j++) await step('blade ' + i + ' item ' + j + ' ' + (S.items[j]?.title || ''), () => setItem(j, true), 100); }
  for (const a of ['right', 'right', 'down', 'down', 'up', 'left', 'lb', 'rb', 'x', 'x', 'b', 'b']) await step('pad ' + a, () => handle(a), 150);
  closeAll();
  await step('settings', () => openSettings(), 800);
  const root = document.querySelector('[name=playerName]')?.closest('dialog, [class*=modal]') || document;
  for (let i = 0; i < 8; i++) await step('settings tab ' + i, () => settingsTab(root, i), 400);
  closeAll();
  await step('pc mode', () => setMode('pc'), 1200);
  for (const e of S.lib.entries.filter((x, k, l) => l.findIndex((y) => y.type === x.type) === k)) {
    await step('pc ' + e.type, () => pcSelect(e), 300);
    for (const act of ['tasks', 'art', 'edit', 'mods', 'ach']) { const b = document.querySelector('#drawer [data-act=' + act + ']'); if (!b) continue; await step('pc ' + e.type + ' ' + act, () => b.click(), 900); closeAll(); await wait(200); }
  }
  await step('console mode', () => setMode('console'), 800);
  sw.done = true;
})(); return 'started'; })()`;

async function cdp(expr) {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const pg = list.find((t) => t.type === 'page' && /index\.html/.test(t.url));
  if (!pg) throw new Error('the page is not up yet');
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const res = await new Promise((r) => { ws.onmessage = (m) => r(JSON.parse(m.data)); ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })); });
  ws.close();
  return res.result?.result?.value;
}

(async () => {
  const args = [path.join(__dirname, 'testcopy.js'), '--dir', dir, '--port', String(PORT), '--seconds', '600', ...(process.argv.includes('--empty') ? [] : ['--real'])];
  const tc = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; tc.stdout.on('data', (d) => { log += d; }); tc.stderr.on('data', (d) => { log += d; });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { await wait(1000); try { up = (await cdp('typeof allSystemActions === "function" && !!S.lib')) === true; } catch { /* starting */ } }
  if (!up) { console.error('The test copy did not come up.\n' + log); tc.kill(); process.exit(1); }
  await wait(4000);
  await cdp(PAGE);
  let st = {};
  for (let i = 0; i < 120; i++) { await wait(5000); st = JSON.parse(await cdp('JSON.stringify(window.__sw)') || '{}'); process.stdout.write(`\r${st.at || ''}`.padEnd(70)); if (st.done) break; }
  console.log('\n');
  const errLog = (() => { try { return fs.readFileSync(path.join(dir, 'errors.log'), 'utf8').trim(); } catch { return ''; } })();
  tc.kill(); await wait(1500);
  console.log(`System items opened: ${st.out?.length || 0}. ${st.done ? 'Finished.' : 'Did not finish (stuck at ' + st.at + ').'}`);
  if (st.errs?.length) { console.log(`\nPage errors (${st.errs.length}):`); for (const e of st.errs) console.log(' ✗ ' + e.join(' · ')); }
  if (errLog) console.log('\nerrors.log:\n' + errLog);
  console.log(`\nMain process said: ${(log.match(/\[test copy\] blocked [\w-]+/g) || []).length} outward calls blocked.`);
  process.exit(st.done && !st.errs?.length && !errLog ? 0 : 1);
})();
