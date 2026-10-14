'use strict';
/* Live view that remembers: on Linux with Wayland, the live panel's picture comes from the
   desktop's screen-share portal through a small helper (Python with GStreamer), asked for with
   "remember this" (persist_mode 2). The portal hands back a restore token, kept per game in
   live-tokens.json, so the second time a game is shown live the picker never opens: the live
   view just starts. Frames come out of the helper as small raw pictures, become JPEGs here, and
   the page draws them into a canvas whose stream feeds the panel's <video>, so the rest of the
   live view works the same as before.
   Without Wayland, or without GStreamer's PipeWire plugin, the page uses getDisplayMedia instead. */
const { app, ipcMain, nativeImage } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const HELPER = `
import dbus, dbus.mainloop.glib, json, sys, struct, random
import gi
gi.require_version('Gst', '1.0')
from gi.repository import GLib, Gst
dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
Gst.init(None)
opt = json.loads(sys.argv[1])
bus = dbus.SessionBus()
loop = GLib.MainLoop()
out = sys.stdout.buffer
def msg(o):
    b = json.dumps(o).encode()
    out.write(b'M' + struct.pack('<I', len(b)) + b); out.flush()
portal = bus.get_object('org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop')
sc = dbus.Interface(portal, 'org.freedesktop.portal.ScreenCast')
props = dbus.Interface(portal, 'org.freedesktop.DBus.Properties')
me = bus.get_unique_name()[1:].replace('.', '_')
state = {'session': None, 'pipe': None}
def fail(why):
    msg({'error': str(why)}); loop.quit()
def request(call, args, opts, then):
    tok = 'bd%d' % random.randint(1, 1 << 30)
    opts['handle_token'] = tok
    p = '/org/freedesktop/portal/desktop/request/%s/%s' % (me, tok)
    def got(code, res):
        rm.remove()
        if code != 0: fail('cancelled' if code == 1 else 'refused')
        else: then(res)
    rm = bus.add_signal_receiver(got, 'Response', 'org.freedesktop.portal.Request', 'org.freedesktop.portal.Desktop', p)
    try: call(*args, dbus.Dictionary(opts, signature='sv'))
    except Exception as e: fail(e)
def created(res):
    state['session'] = res['session_handle']
    o = {'types': dbus.UInt32(opt.get('types', 2)), 'multiple': False, 'persist_mode': dbus.UInt32(2)}
    try:
        if int(props.Get('org.freedesktop.portal.ScreenCast', 'AvailableCursorModes')) & 1: o['cursor_mode'] = dbus.UInt32(1)
    except Exception: pass
    if opt.get('token'): o['restore_token'] = opt['token']
    request(sc.SelectSources, [state['session']], o, selected)
def selected(_res):
    msg({'asking': True})
    request(sc.Start, [state['session'], ''], {}, started)
def started(res):
    streams = res.get('streams', [])
    if not streams: return fail('no stream')
    msg({'token': str(res.get('restore_token', '')), 'started': True})
    fd = sc.OpenPipeWireRemote(state['session'], dbus.Dictionary({}, signature='sv')).take()
    node = int(streams[0][0])
    w, fps = int(opt.get('width', 640)), int(opt.get('fps', 15))
    pipe = Gst.parse_launch('pipewiresrc name=src do-timestamp=true ! videoconvert ! videoscale ! videorate ! video/x-raw,format=BGRA,width=%d,pixel-aspect-ratio=1/1,framerate=%d/1 ! appsink name=sink emit-signals=true max-buffers=1 drop=true sync=false' % (w, fps))
    src = pipe.get_by_name('src')
    src.set_property('fd', fd)
    for k, v in (('target-object', str(node)), ('path', str(node)), ('keepalive-time', 500)):
        try: src.set_property(k, v)
        except Exception: pass
    def frame(sink):
        s = sink.emit('pull-sample'); b = s.get_buffer(); st = s.get_caps().get_structure(0)
        ok, mi = b.map(Gst.MapFlags.READ)
        if ok:
            try:
                out.write(b'F' + struct.pack('<III', st.get_value('width'), st.get_value('height'), mi.size) + bytes(mi.data)); out.flush()
            except Exception: loop.quit()
            b.unmap(mi)
        return Gst.FlowReturn.OK
    pipe.get_by_name('sink').connect('new-sample', frame)
    gb = pipe.get_bus(); gb.add_signal_watch()
    gb.connect('message::error', lambda _b, m: fail(m.parse_error()[0].message))
    gb.connect('message::eos', lambda *_: fail('ended'))
    state['pipe'] = pipe
    pipe.set_state(Gst.State.PLAYING)
GLib.io_add_watch(sys.stdin.fileno(), GLib.IO_IN | GLib.IO_HUP | GLib.IO_ERR, lambda *a: loop.quit())
request(sc.CreateSession, [], {'session_handle_token': 'bds%d' % random.randint(1, 1 << 30)}, created)
loop.run()
if state['pipe']: state['pipe'].set_state(Gst.State.NULL)
`;

const tokFile = () => path.join(app.getPath('userData'), 'live-tokens.json');
const tokens = () => { try { return JSON.parse(fs.readFileSync(tokFile(), 'utf8')) || {}; } catch { return {}; } };
function setToken(key, v) { const t = tokens(); if (v == null) delete t[key]; else t[key] = v; try { fs.writeFileSync(tokFile(), JSON.stringify(t, null, 2)); } catch { /* optional */ } }

let able = null;
// Wayland, python3 with dbus, and GStreamer's PipeWire source.
function available() {
  if (able !== null) return Promise.resolve(able);
  if (process.platform !== 'linux' || !(process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY)) return Promise.resolve(able = false);
  return new Promise((res) => execFile('python3', ['-c', "import dbus, gi; gi.require_version('Gst','1.0'); from gi.repository import Gst; Gst.init(None); assert Gst.ElementFactory.find('pipewiresrc') and Gst.ElementFactory.find('appsink')"], { timeout: 10000 }, (err) => res(able = !err)));
}

let cur = null; // { key, proc, sender }
function stop() { if (cur) { try { cur.proc.stdin.end(); cur.proc.kill(); } catch { /* gone */ } cur = null; } }

/* Start the live picture for one game. ask: the picker may open (no token yet, or the window it
   remembered is gone). Without ask and without a token, nothing happens. */
async function start(sender, { key, ask = false, width = 640, fps = 15 } = {}) {
  key = String(key || ''); if (!key) return { ok: false };
  if (!(await available())) return { ok: false, unavailable: true };
  const token = tokens()[key];
  if (!token && !ask) return { ok: false, needsAsk: true };
  if (cur && cur.key === key) return { ok: true, already: true };
  stop();
  const proc = spawn('python3', ['-c', HELPER, JSON.stringify({ token: token || '', types: 2, width, fps })], { stdio: ['pipe', 'pipe', 'ignore'] });
  const me = { key, proc, sender };
  cur = me;
  let buf = Buffer.alloc(0), started = false;
  const send = (ch, d) => { if (!sender.isDestroyed()) sender.send(ch, d); };
  return new Promise((resolve) => {
    let done = false; const finish = (r) => { if (!done) { done = true; resolve(r); } };
    proc.stdout.on('data', (chunk) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      for (;;) {
        if (buf[0] === 0x4d && buf.length >= 5) { // M: a message
          const n = buf.readUInt32LE(1); if (buf.length < 5 + n) break;
          let m = {}; try { m = JSON.parse(buf.subarray(5, 5 + n).toString()); } catch { /* skip */ }
          buf = buf.subarray(5 + n);
          if (m.started) { started = true; if (m.token) setToken(key, m.token); finish({ ok: true }); }
          if (m.error) { if (m.error === 'cancelled') setToken(key, null); finish({ ok: false, error: m.error }); }
        } else if (buf[0] === 0x46 && buf.length >= 13) { // F: a frame
          const w = buf.readUInt32LE(1), h = buf.readUInt32LE(5), n = buf.readUInt32LE(9);
          if (buf.length < 13 + n) break;
          const px = buf.subarray(13, 13 + n); buf = buf.subarray(13 + n);
          if (cur !== me || n !== w * h * 4) continue;
          if (me.paused) { me.last = { px: Buffer.from(px), w, h }; continue; }
          try { send('live-frame', { key, jpeg: nativeImage.createFromBitmap(Buffer.from(px), { width: w, height: h }).toJPEG(72) }); } catch { /* bad frame */ }
        } else if (buf.length) { buf = Buffer.alloc(0); break; } else break;
      }
    });
    proc.on('exit', () => { if (cur === me) cur = null; send('live-ended', { key }); finish({ ok: false, error: started ? 'ended' : 'failed' }); });
    proc.on('error', () => finish({ ok: false, error: 'failed' }));
  });
}

// While a game has the screen nobody sees the panel: keep only the newest picture, unencoded.
function pause(on) {
  if (!cur) return false;
  cur.paused = !!on;
  if (!on && cur.last) { const { px, w, h } = cur.last; cur.last = null; try { if (!cur.sender.isDestroyed()) cur.sender.send('live-frame', { key: cur.key, jpeg: nativeImage.createFromBitmap(px, { width: w, height: h }).toJPEG(72) }); } catch { /* bad frame */ } }
  return true;
}

function register() {
  ipcMain.handle('live-pause', (_e, on) => pause(on));
  ipcMain.handle('live-available', () => available());
  ipcMain.handle('live-start', (e, o) => start(e.sender, o || {}));
  ipcMain.handle('live-stop', () => { stop(); return true; });
  ipcMain.handle('live-has', (_e, key) => !!tokens()[String(key)]);
  ipcMain.handle('live-forget', (_e, key) => { if (key === '*') { try { fs.rmSync(tokFile(), { force: true }); } catch { /* none */ } } else setToken(String(key), null); return true; });
}

module.exports = { register, stop };
