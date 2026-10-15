#!/usr/bin/env node
'use strict';
/* npm run test-copy [-- --real] [-- --port 9333] [-- --seconds 120]
   Starts Bladedeck from source as a test copy (main.js TEST): its own scratch folder, no
   controller, and nothing that reaches outside it. With --real it starts from a copy of the
   owner's library.json (read, never written back), with the parts that would reach outside
   turned off. DevTools listen on --port for scripted checks. It quits by itself after --seconds
   (default 180), so a forgotten test copy never sits there reading anything. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const root = path.resolve(__dirname, '..');
const dir = path.resolve(arg('--dir', path.join(os.tmpdir(), `bladedeck-test-${Date.now()}`)));
fs.mkdirSync(dir, { recursive: true });

const real = process.platform === 'win32' ? path.join(process.env.APPDATA || '', 'bladedeck') : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'bladedeck');
let lib = { settings: {}, emulators: [], entries: [] };
if (process.argv.includes('--real')) { try { lib = JSON.parse(fs.readFileSync(path.join(real, 'library.json'), 'utf8')); } catch { console.log('No real library found; starting empty.'); } }
// Nothing that reaches outside, and no first-run tours in the way.
Object.assign(lib.settings ||= {}, { steamInput: false, bladedeckViaSteam: false, lanOn: false, discord: false, prewarmSteam: false, backupWeekly: false, tourSeen: 999, extrasSeen: true });
fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify(lib));

const electron = require(path.join(root, 'node_modules', 'electron'));
const port = arg('--port', '9333'), seconds = +arg('--seconds', '180');
// One test copy at a time on a port: two would answer each other's checks with old code.
const probe = require('net').createServer().once('error', () => { console.log(`Port ${port} is taken: another test copy is still running. Wait for it, or use --port.`); process.exit(1); });
probe.listen(+port, '127.0.0.1', () => probe.close(start));
function start() {
console.log(`Test copy in ${dir}, DevTools on ${port}, quits in ${seconds}s.`);
const p = spawn(electron, ['.', '--mute-audio', `--remote-debugging-port=${port}`], { cwd: root, stdio: 'inherit', env: { ...process.env, BLADEDECK_TEST: dir, BLADEDECK_TEST_SECONDS: String(seconds), BLADEDECK_TEST_PARENT: String(process.pid) } });
// Stopped from outside (Ctrl+C, a timeout): the copy goes too. It also checks for this process itself.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { p.kill('SIGKILL'); process.exit(1); });
const t = setTimeout(() => { console.log('Time is up: closing the test copy.'); p.kill(); setTimeout(() => p.kill('SIGKILL'), 3000).unref(); }, seconds * 1000);
p.on('exit', () => { clearTimeout(t); console.log(`Test copy closed. Its files: ${dir}`); });
}
