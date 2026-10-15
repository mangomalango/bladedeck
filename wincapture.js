'use strict';
/* Windows recording and the replay, the way GPU Screen Recorder does them on Linux: ffmpeg grabs
   the screen through Desktop Duplication (ddagrab) and encodes on the graphics card (AV1 or H.264
   with AMD, NVIDIA or Intel; the processor only when none works). ffmpeg cannot hear the desktop
   on Windows, so a small PowerShell helper reads the speakers' loopback through WASAPI and hands
   ffmpeg plain samples over a named pipe; silence is written while nothing plays, so the sound
   stays in step with the picture.
   The replay is ffmpeg's segment muxer writing 5-second pieces in a ring; saving joins the last
   pieces into one file. A full recording is a second ffmpeg of its own. ffmpeg stops cleanly on
   "q" (the file is finished properly), which is why the sound does not come in on stdin. */
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const CS = String.raw`
using System; using System.IO; using System.Threading; using System.Diagnostics; using System.Runtime.InteropServices;
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int NotImpl1(); [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev); }
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioClient {
  [PreserveSig] int Initialize(int share, int flags, long dur, long period, IntPtr fmt, IntPtr session);
  [PreserveSig] int GetBufferSize(out uint n); [PreserveSig] int GetStreamLatency(out long l); [PreserveSig] int GetCurrentPadding(out uint n);
  [PreserveSig] int IsFormatSupported(int share, IntPtr fmt, out IntPtr closest); [PreserveSig] int GetMixFormat(out IntPtr fmt);
  [PreserveSig] int GetDevicePeriod(out long d, out long m); [PreserveSig] int Start(); [PreserveSig] int Stop(); [PreserveSig] int Reset();
  [PreserveSig] int SetEventHandle(IntPtr h); [PreserveSig] int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object o);
}
[ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioCaptureClient {
  [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong pos, out ulong qpc);
  [PreserveSig] int ReleaseBuffer(uint frames); [PreserveSig] int GetNextPacketSize(out uint n);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
public static class BDLoop {
  static IAudioClient Open(out int rate, out int ch, out int bits) {
    IMMDevice dev; ((IMMDeviceEnumerator)new MMDeviceEnumerator()).GetDefaultAudioEndpoint(0, 0, out dev);
    Guid iid = typeof(IAudioClient).GUID; object o; Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 23, IntPtr.Zero, out o));
    IAudioClient c = (IAudioClient)o; IntPtr f; Marshal.ThrowExceptionForHR(c.GetMixFormat(out f));
    ch = Marshal.ReadInt16(f, 2); rate = Marshal.ReadInt32(f, 4); bits = Marshal.ReadInt16(f, 14);
    Marshal.ThrowExceptionForHR(c.Initialize(0, 0x00020000, 10000000, 0, f, IntPtr.Zero));
    return c;
  }
  public static string Format() { int r, c, b; Open(out r, out c, out b); return r + " " + c + " " + b; }
  public static void Run() {
    int rate, ch, bits; IAudioClient c = Open(out rate, out ch, out bits);
    Guid iid = typeof(IAudioCaptureClient).GUID; object o; Marshal.ThrowExceptionForHR(c.GetService(ref iid, out o));
    IAudioCaptureClient cap = (IAudioCaptureClient)o; int block = ch * bits / 8;
    Stream outp = Console.OpenStandardOutput();
    Stopwatch sw = Stopwatch.StartNew(); long written = 0; byte[] buf = new byte[0];
    c.Start();
    while (true) {
      uint n; cap.GetNextPacketSize(out n);
      while (n > 0) {
        IntPtr d; uint frames, flags; ulong p, q; cap.GetBuffer(out d, out frames, out flags, out p, out q);
        int len = (int)frames * block; if (buf.Length < len) buf = new byte[len];
        if ((flags & 2) != 0) Array.Clear(buf, 0, len); else Marshal.Copy(d, buf, 0, len);
        cap.ReleaseBuffer(frames); outp.Write(buf, 0, len); written += frames; cap.GetNextPacketSize(out n);
      }
      // Nothing playing sends no packets at all: fill the gap with silence so the clock keeps going.
      long due = sw.ElapsedMilliseconds * rate / 1000 - written;
      if (due > rate / 20) { int len = (int)due * block; byte[] z = new byte[len]; outp.Write(z, 0, len); written += due; }
      outp.Flush(); Thread.Sleep(10);
    }
  }
}
`;

const PS1 = (cmd) => `
Add-Type -TypeDefinition @'
${CS}
'@
${cmd}
`;

let helperFile = '', fmt = null, enc = null;
function helper(dir) {
  helperFile = path.join(dir, 'bladedeck-loopback.ps1');
  fs.writeFileSync(helperFile, PS1('if ($args[0] -eq "fmt") { [Console]::Out.WriteLine([BDLoop]::Format()) } else { [BDLoop]::Run() }'));
  return helperFile;
}
/* ffmpeg lives on if Bladedeck crashes (it only quits on "q"), so a small watcher kills it once Bladedeck
   is gone. It ends by itself when ffmpeg does. The sound helper needs none: it dies on the broken pipe. */
function watchdog(pid) {
  const code = `$f=Get-Process -Id ${pid | 0} -ErrorAction SilentlyContinue; $b=Get-Process -Id ${process.pid | 0} -ErrorAction SilentlyContinue; if(!$f -or !$b){ if($f){$f.Kill()}; exit }; while(!$f.HasExited -and !$b.HasExited){ Start-Sleep -Milliseconds 500 }; if(!$f.HasExited){ $f.Kill() }`;
  try { const w = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { stdio: 'ignore', windowsHide: true }); w.on('error', () => {}); return w; } catch { return null; }
}
const ps = (args, opts) => spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperFile, ...args], { windowsHide: true, ...opts });

// ffmpeg from the PATH, or where winget puts Gyan's build.
function find() {
  if (process.platform !== 'win32') return null;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) { const p = path.join(dir, 'ffmpeg.exe'); if (fs.existsSync(p)) return p; }
  const la = process.env.LOCALAPPDATA || '';
  const links = path.join(la, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'); if (fs.existsSync(links)) return links;
  const pk = path.join(la, 'Microsoft', 'WinGet', 'Packages');
  try {
    for (const d of fs.readdirSync(pk).filter((n) => /^Gyan\.FFmpeg/i.test(n))) {
      for (const b of fs.readdirSync(path.join(pk, d))) { const p = path.join(pk, d, b, 'bin', 'ffmpeg.exe'); if (fs.existsSync(p)) return p; }
    }
  } catch { /* not installed */ }
  return null;
}

// The first encoder that really works on this PC (listed is not enough: NVENC is listed everywhere).
async function pickEncoder(ff) {
  if (enc) return enc;
  const tries = [['av1_amf', 'mp4'], ['av1_nvenc', 'mp4'], ['av1_qsv', 'mp4'], ['h264_amf', 'mp4'], ['h264_nvenc', 'mp4'], ['h264_qsv', 'mp4'], ['libx264', 'mp4']];
  for (const [e] of tries) {
    const ok = await new Promise((res) => execFile(ff, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=s=320x240:d=0.2', '-c:v', e, '-f', 'null', '-'], { timeout: 15000, windowsHide: true }, (err) => res(!err)));
    if (ok) { enc = e; return enc; }
  }
  return (enc = 'libx264');
}
function encArgs(e, fps) {
  const g = ['-g', String(fps)];
  if (e === 'libx264') return ['-c:v', e, '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', ...g];
  if (/_amf$/.test(e)) return ['-c:v', e, '-quality', 'balanced', '-rc', 'vbr_peak', '-b:v', '30M', '-maxrate', '45M', ...g];
  if (/_nvenc$/.test(e)) return ['-c:v', e, '-preset', 'p4', '-rc', 'vbr', '-cq', '23', '-b:v', '0', ...g];
  return ['-c:v', e, '-global_quality', '23', ...g];
}

async function soundFormat() {
  if (fmt) return fmt;
  fmt = await new Promise((res) => {
    const p = ps(['fmt'], { stdio: ['ignore', 'pipe', 'ignore'] }); let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('exit', () => { const m = out.trim().split(/\s+/).map(Number); res(m.length === 3 && m[0] ? { rate: m[0], ch: m[1], bits: m[2] } : false); });
    p.on('error', () => res(false));
  });
  return fmt;
}

/* One capture: ffmpeg plus its sound helper. out is a file, or a pattern for the replay's ring.
   Returns { proc, stop() } or null. */
async function start({ dir, out, ring, fps = 60 }) {
  const ff = find(); if (!ff) return null;
  if (!helperFile) helper(dir);
  const e = await pickEncoder(ff);
  const snd = await soundFormat();
  const pipeName = `\\\\.\\pipe\\bladedeck-snd-${process.pid}-${Date.now()}`;
  let server = null, loop = null;
  const audioIn = [];
  if (snd) {
    // ffmpeg opens the pipe as a file; when it connects, the helper starts and its samples go in.
    server = net.createServer((sock) => {
      sock.on('error', () => {});
      loop = ps([], { stdio: ['ignore', 'pipe', 'ignore'] });
      loop.on('error', () => {});
      loop.stdout.pipe(sock);
    });
    await new Promise((res) => server.listen(pipeName, res));
    const fmtName = snd.bits === 32 ? 'f32le' : snd.bits === 24 ? 's24le' : 's16le';
    audioIn.push('-thread_queue_size', '4096', '-f', fmtName, '-ar', String(snd.rate), '-ac', String(snd.ch), '-i', pipeName);
  }
  // AMF takes the grabbed frames straight from the graphics card. Copying each 4K frame down to
  // the processor first cost most of a core (80% to 2% here); the others still need that copy.
  const video = `ddagrab=output_idx=0:framerate=${fps}:draw_mouse=0${/_amf$/.test(e) ? '' : ',hwdownload,format=bgra'}`;
  const outArgs = ring
    ? ['-f', 'segment', '-segment_time', '5', '-segment_wrap', String(ring), '-reset_timestamps', '1', '-segment_format', 'matroska', out]
    : ['-movflags', '+faststart', out];
  const args = ['-hide_banner', '-loglevel', 'error', '-y', ...audioIn, '-filter_complex', `${video}[v]`, '-map', '[v]', ...(snd ? ['-map', '0:a', '-c:a', 'aac', '-b:a', '192k'] : []), ...encArgs(e, fps), ...outArgs];
  const proc = spawn(ff, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let errText = ''; proc.stderr.on('data', (d) => { errText = (errText + d).slice(-2000); });
  proc.on('error', () => {});
  const dog = proc.pid ? watchdog(proc.pid) : null;
  proc.on('exit', () => { if (dog) try { dog.kill(); } catch { /* gone */ } });
  const stop = () => new Promise((res) => {
    if (proc.exitCode !== null) { cleanup(); return res(); }
    proc.once('exit', () => { cleanup(); res(); });
    try { proc.stdin.write('q'); } catch { /* gone */ }
    setTimeout(() => { if (proc.exitCode === null) try { proc.kill(); } catch { /* gone */ } }, 5000);
  });
  function cleanup() { if (loop) try { loop.kill(); } catch { /* gone */ } loop = null; if (server) try { server.close(); } catch { /* closed */ } server = null; }
  proc.on('exit', cleanup);
  return { proc, stop, encoder: e, sound: !!snd, err: () => errText };
}

/* Join the replay ring's newest pieces covering the last secs into one file. */
function saveRing(dir, secs, to) {
  const ff = find(); if (!ff) return Promise.resolve(false);
  let parts; try { parts = fs.readdirSync(dir).filter((f) => /^ring\d+\.mkv$/.test(f)).map((f) => ({ f: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs })); } catch { return Promise.resolve(false); }
  parts.sort((a, b) => a.t - b.t);
  const take = parts.slice(-(Math.ceil(secs / 5) + 1));
  if (!take.length) return Promise.resolve(false);
  const list = path.join(dir, 'join.txt');
  fs.writeFileSync(list, take.map((p) => `file '${p.f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  return new Promise((res) => execFile(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', to], { timeout: 60000, windowsHide: true }, (err) => res(!err && fs.existsSync(to))));
}

module.exports = { find, start, saveRing };
