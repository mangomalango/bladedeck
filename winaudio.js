'use strict';
/* Windows sound for the sound card: volume and mute for every output, which one plays, the
   microphone, and each app's own volume. Windows keeps these in its Core Audio COM interfaces,
   which PowerShell can reach through a little C#. One PowerShell process stays running and
   answers one line per request, so moving a slider does not start a new process each time.
   Commands:  state | out|<id>|<vol 0-100 or ->|<1/0 or -> | mic|<id>|<vol>|<mute>
              app|<pid>|<vol>|<mute> | default|<id>
   Every answer is one line of JSON, the same shape soundState gives on Linux. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CS = String.raw`
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace BD {
  public enum EDataFlow { Render = 0, Capture = 1, All = 2 }
  public enum ERole { Console = 0, Multimedia = 1, Communications = 2 }

  [StructLayout(LayoutKind.Sequential)] public struct PropKey { public Guid fmtid; public int pid; }
  [StructLayout(LayoutKind.Explicit)] public struct PropVar {
    [FieldOffset(0)] public short vt;
    [FieldOffset(8)] public IntPtr p;
    [FieldOffset(8)] public long a;
    [FieldOffset(16)] public long b;
  }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(EDataFlow flow, int mask, out IMMDeviceCollection devices);
    [PreserveSig] int GetDefaultAudioEndpoint(EDataFlow flow, ERole role, out IMMDevice device);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
  }
  [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceCollection {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int Item(int i, out IMMDevice device);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
    [PreserveSig] int OpenPropertyStore(int access, out IPropertyStore store);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetState(out int state);
  }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPropertyStore {
    [PreserveSig] int GetCount(out int n);
    [PreserveSig] int GetAt(int i, out PropKey k);
    [PreserveSig] int GetValue(ref PropKey k, out PropVar v);
  }
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioEndpointVolume {
    [PreserveSig] int RegisterControlChangeNotify(IntPtr n);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr n);
    [PreserveSig] int GetChannelCount(out int n);
    [PreserveSig] int SetMasterVolumeLevel(float db, ref Guid ctx);
    [PreserveSig] int SetMasterVolumeLevelScalar(float v, ref Guid ctx);
    [PreserveSig] int GetMasterVolumeLevel(out float db);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float v);
    [PreserveSig] int SetChannelVolumeLevel(int ch, float db, ref Guid ctx);
    [PreserveSig] int SetChannelVolumeLevelScalar(int ch, float v, ref Guid ctx);
    [PreserveSig] int GetChannelVolumeLevel(int ch, out float db);
    [PreserveSig] int GetChannelVolumeLevelScalar(int ch, out float v);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }
  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioSessionManager2 {
    [PreserveSig] int GetAudioSessionControl(IntPtr guid, int flags, out IntPtr ctl);
    [PreserveSig] int GetSimpleAudioVolume(IntPtr guid, int flags, out IntPtr vol);
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e);
  }
  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioSessionEnumerator {
    [PreserveSig] int GetCount(out int n);
    [PreserveSig] int GetSession(int i, out IAudioSessionControl2 s);
  }
  [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioSessionControl2 {
    [PreserveSig] int GetState(out int state);
    [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid ctx);
    [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
    [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid ctx);
    [PreserveSig] int GetGroupingParam(out Guid g);
    [PreserveSig] int SetGroupingParam(ref Guid g, ref Guid ctx);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr n);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr n);
    [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetProcessId(out int pid);
    [PreserveSig] int IsSystemSoundsSession();
  }
  [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface ISimpleAudioVolume {
    [PreserveSig] int SetMasterVolume(float v, ref Guid ctx);
    [PreserveSig] int GetMasterVolume(out float v);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }
  // Not documented, but it is how Windows' own sound settings change the default device.
  [ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPolicyConfig {
    [PreserveSig] int GetMixFormat(string id, IntPtr f);
    [PreserveSig] int GetDeviceFormat(string id, int b, IntPtr f);
    [PreserveSig] int ResetDeviceFormat(string id);
    [PreserveSig] int SetDeviceFormat(string id, IntPtr a, IntPtr b);
    [PreserveSig] int GetProcessingPeriod(string id, int b, IntPtr a, IntPtr c);
    [PreserveSig] int SetProcessingPeriod(string id, IntPtr p);
    [PreserveSig] int GetShareMode(string id, IntPtr m);
    [PreserveSig] int SetShareMode(string id, IntPtr m);
    [PreserveSig] int GetPropertyValue(string id, IntPtr k, IntPtr v);
    [PreserveSig] int SetPropertyValue(string id, IntPtr k, IntPtr v);
    [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, ERole role);
    [PreserveSig] int SetEndpointVisibility(string id, int visible);
  }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class MMDeviceEnumerator { }
  [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")] public class PolicyConfigClient { }

  public static class Audio {
    static Guid IID_EPV = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
    static Guid IID_ASM2 = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
    static Guid NoCtx = Guid.Empty;
    const int CLSCTX_ALL = 23, ACTIVE = 1;

    static IMMDeviceEnumerator En() { return (IMMDeviceEnumerator)new MMDeviceEnumerator(); }

    static string Name(IMMDevice d) {
      IPropertyStore st; if (d.OpenPropertyStore(0, out st) != 0) return "";
      PropKey k = new PropKey(); k.fmtid = new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"); k.pid = 14;
      PropVar v; if (st.GetValue(ref k, out v) != 0 || v.vt != 31) return "";
      return Marshal.PtrToStringUni(v.p) ?? "";
    }
    static string Id(IMMDevice d) { string id; d.GetId(out id); return id ?? ""; }
    static IAudioEndpointVolume Vol(IMMDevice d) { object o; d.Activate(ref IID_EPV, CLSCTX_ALL, IntPtr.Zero, out o); return (IAudioEndpointVolume)o; }
    static string DefaultId(EDataFlow f) { IMMDevice d; return En().GetDefaultAudioEndpoint(f, ERole.Multimedia, out d) == 0 ? Id(d) : ""; }

    static string J(string s) {
      StringBuilder b = new StringBuilder("\"");
      foreach (char c in s ?? "") {
        if (c == '"' || c == '\\') { b.Append('\\'); b.Append(c); }
        else if (c < 32 || c > 126) b.Append("\\u" + ((int)c).ToString("x4"));
        else b.Append(c);
      }
      return b.Append('"').ToString();
    }
    static int Pct(float v) { return (int)Math.Round(v * 100); }

    static List<IMMDevice> Devices(EDataFlow f) {
      List<IMMDevice> list = new List<IMMDevice>();
      IMMDeviceCollection col; if (En().EnumAudioEndpoints(f, ACTIVE, out col) != 0) return list;
      int n; col.GetCount(out n);
      for (int i = 0; i < n; i++) { IMMDevice d; if (col.Item(i, out d) == 0) list.Add(d); }
      return list;
    }

    // Every app session on every output, so a game on the HDMI output still shows.
    static List<KeyValuePair<int, ISimpleAudioVolume>> Sessions() {
      List<KeyValuePair<int, ISimpleAudioVolume>> list = new List<KeyValuePair<int, ISimpleAudioVolume>>();
      foreach (IMMDevice d in Devices(EDataFlow.Render)) {
        object o; if (d.Activate(ref IID_ASM2, CLSCTX_ALL, IntPtr.Zero, out o) != 0) continue;
        IAudioSessionEnumerator e; if (((IAudioSessionManager2)o).GetSessionEnumerator(out e) != 0) continue;
        int n; e.GetCount(out n);
        for (int i = 0; i < n; i++) {
          IAudioSessionControl2 s; if (e.GetSession(i, out s) != 0) continue;
          if (s.IsSystemSoundsSession() == 0) continue;
          int state; s.GetState(out state); if (state == 2) continue; // expired
          int pid; s.GetProcessId(out pid); if (pid == 0) continue;
          list.Add(new KeyValuePair<int, ISimpleAudioVolume>(pid, (ISimpleAudioVolume)s));
        }
      }
      return list;
    }

    public static string State() {
      StringBuilder b = new StringBuilder("{\"outputs\":[");
      string def = DefaultId(EDataFlow.Render); bool first = true;
      foreach (IMMDevice d in Devices(EDataFlow.Render)) {
        IAudioEndpointVolume v = Vol(d); float lv; bool m; v.GetMasterVolumeLevelScalar(out lv); v.GetMute(out m);
        string id = Id(d), name = Name(d);
        if (!first) b.Append(','); first = false;
        b.Append("{\"name\":" + J(id) + ",\"label\":" + J(name) + ",\"port\":" + J(name) + ",\"volume\":" + Pct(lv) + ",\"mute\":" + (m ? "true" : "false") + ",\"on\":" + (id == def ? "true" : "false") + "}");
      }
      b.Append("],\"apps\":[");
      Dictionary<int, bool> seen = new Dictionary<int, bool>(); first = true;
      foreach (KeyValuePair<int, ISimpleAudioVolume> s in Sessions()) {
        if (seen.ContainsKey(s.Key)) continue; seen[s.Key] = true;
        string label = "App", what = "";
        try { Process p = Process.GetProcessById(s.Key); label = p.ProcessName; what = p.MainWindowTitle;
              try { string desc = p.MainModule.FileVersionInfo.FileDescription; if (!String.IsNullOrEmpty(desc)) label = desc; } catch { } } catch { }
        float lv; bool m; s.Value.GetMasterVolume(out lv); s.Value.GetMute(out m);
        if (!first) b.Append(','); first = false;
        b.Append("{\"id\":" + s.Key + ",\"label\":" + J(label) + ",\"what\":" + J(what) + ",\"volume\":" + Pct(lv) + ",\"mute\":" + (m ? "true" : "false") + "}");
      }
      b.Append("],\"mic\":");
      IMMDevice mic;
      if (En().GetDefaultAudioEndpoint(EDataFlow.Capture, ERole.Communications, out mic) == 0) {
        IAudioEndpointVolume v = Vol(mic); float lv; bool m; v.GetMasterVolumeLevelScalar(out lv); v.GetMute(out m);
        b.Append("{\"name\":" + J(Id(mic)) + ",\"label\":" + J(Name(mic)) + ",\"volume\":" + Pct(lv) + ",\"mute\":" + (m ? "true" : "false") + "}");
      } else b.Append("null");
      return b.Append('}').ToString();
    }

    static void SetEndpoint(string id, string vol, string mute) {
      IMMDevice d; if (En().GetDevice(id, out d) != 0) return;
      IAudioEndpointVolume v = Vol(d);
      if (vol != "-") v.SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, int.Parse(vol))) / 100f, ref NoCtx);
      if (mute != "-") v.SetMute(mute == "1", ref NoCtx);
    }
    static void SetApp(int pid, string vol, string mute) {
      foreach (KeyValuePair<int, ISimpleAudioVolume> s in Sessions()) {
        if (s.Key != pid) continue;
        if (vol != "-") s.Value.SetMasterVolume(Math.Max(0, Math.Min(100, int.Parse(vol))) / 100f, ref NoCtx);
        if (mute != "-") s.Value.SetMute(mute == "1", ref NoCtx);
      }
    }
    static void SetDefault(string id) {
      IPolicyConfig pc = (IPolicyConfig)new PolicyConfigClient();
      pc.SetDefaultEndpoint(id, ERole.Console); pc.SetDefaultEndpoint(id, ERole.Multimedia); pc.SetDefaultEndpoint(id, ERole.Communications);
    }

    public static string Run(string line) {
      string[] a = line.Split('|');
      if (a[0] == "out" || a[0] == "mic") SetEndpoint(a[1], a[2], a[3]);
      else if (a[0] == "app") SetApp(int.Parse(a[1]), a[2], a[3]);
      else if (a[0] == "default") SetDefault(a[1]);
      return State();
    }
  }
}
`;

const PS1 = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${CS}
'@
[Console]::Out.WriteLine('{"ready":true}'); [Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  try { $r = [BD.Audio]::Run($line) } catch { $r = '{"error":' + (ConvertTo-Json ([string]$_.Exception.Message)) + '}' }
  [Console]::Out.WriteLine($r); [Console]::Out.Flush()
}
`;

let proc = null, ready = null, queue = Promise.resolve(), buf = '', waiters = [];

function start(dir) {
  if (ready) return ready;
  const file = path.join(dir || os.tmpdir(), 'bladedeck-sound.ps1');
  fs.writeFileSync(file, PS1);
  proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line && line[0] === '{') { const w = waiters.shift(); if (w) w(line); }
    }
  });
  const dead = () => { proc = null; ready = null; for (const w of waiters.splice(0)) w('{"error":"Windows sound stopped answering."}'); };
  proc.on('exit', dead); proc.on('error', dead);
  ready = new Promise((res) => waiters.push(() => res()));
  return ready;
}

// Send one command and wait for its line. Commands go one at a time.
function ask(cmd, dir) {
  const job = queue.then(async () => {
    await start(dir);
    if (!proc) throw new Error('Windows sound is not available.');
    const line = await new Promise((res) => { waiters.push(res); proc.stdin.write(cmd.replace(/[\r\n]/g, '') + '\n'); });
    const j = JSON.parse(line);
    if (j.error) throw new Error(j.error);
    return j;
  });
  queue = job.catch(() => {});
  return job;
}

function stop() { if (proc) { try { proc.stdin.end(); proc.kill(); } catch { /* gone */ } proc = null; ready = null; } }

module.exports = { ask, stop };
