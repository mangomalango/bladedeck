'use strict';
/* Windows: the controller's Ctrl+M (View + Menu together) while a game has the screen.
   Chromium stops reading controllers once Bladedeck is hidden behind a game, so on Windows a
   small PowerShell helper reads XInput (Xbox-style pads, and any pad Steam Input presents as
   one) and says "chord" when both buttons go down together. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PS1 = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BDPad {
  [StructLayout(LayoutKind.Sequential)] public struct State { public uint packet; public ushort buttons; public byte lt, rt; public short lx, ly, rx, ry; }
  [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")] static extern int Get14(int i, out State s);
  [DllImport("xinput9_1_0.dll", EntryPoint = "XInputGetState")] static extern int Get91(int i, out State s);
  static bool old = false;
  public static int Buttons() {
    int all = 0;
    for (int i = 0; i < 4; i++) {
      State s; int r;
      try { r = old ? Get91(i, out s) : Get14(i, out s); } catch (DllNotFoundException) { old = true; r = Get91(i, out s); }
      if (r == 0) all |= s.buttons;
    }
    return all;
  }
}
'@
$was = $false
while ($true) {
  $b = [BDPad]::Buttons()
  # BACK is 0x20, START is 0x10.
  $now = (($b -band 0x30) -eq 0x30)
  if ($now -and -not $was) { [Console]::Out.WriteLine('chord'); [Console]::Out.Flush() }
  $was = $now
  Start-Sleep -Milliseconds 40
}
`;

let proc = null;
function start(dir, onChord) {
  if (process.platform !== 'win32' || proc) return;
  const file = path.join(dir, 'bladedeck-pad.ps1');
  try { fs.writeFileSync(file, PS1); } catch { return; }
  proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => { if (/chord/.test(d)) onChord(); });
  proc.on('exit', () => { proc = null; });
  proc.on('error', () => { proc = null; });
}
function stop() { if (proc) { try { proc.kill(); } catch { /* gone */ } proc = null; } }

module.exports = { start, stop };
