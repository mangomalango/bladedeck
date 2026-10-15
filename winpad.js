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
$was = $false; $wasY = $false; $wasX = $false; $wasRb = $false
while ($true) {
  $b = [BDPad]::Buttons()
  # BACK is 0x20, START is 0x10, Y is 0x8000.
  $now = (($b -band 0x30) -eq 0x30)
  if ($now -and -not $was) { [Console]::Out.WriteLine('chord'); [Console]::Out.Flush() }
  $was = $now
  $y = (($b -band 0x8020) -eq 0x8020)
  if ($y -and -not $wasY) { [Console]::Out.WriteLine('pip'); [Console]::Out.Flush() }
  $wasY = $y
  # BACK + X records, BACK + RB saves the replay.
  $x = (($b -band 0x4020) -eq 0x4020)
  if ($x -and -not $wasX) { [Console]::Out.WriteLine('rec'); [Console]::Out.Flush() }
  $wasX = $x
  $rb = (($b -band 0x0220) -eq 0x0220)
  if ($rb -and -not $wasRb) { [Console]::Out.WriteLine('clip'); [Console]::Out.Flush() }
  $wasRb = $rb
  Start-Sleep -Milliseconds 40
}
`;

let proc = null, again = null, tries = 0;
function start(dir, onChord, onPip = () => {}) {
  if (process.platform !== 'win32' || proc) return;
  // If the helper dies (sleep and resume, a crash), it starts again after a pause that grows each
  // time (2 s up to a minute), so View + Menu and the recording combos keep working.
  again = () => start(dir, onChord, onPip);
  const file = path.join(dir, 'bladedeck-pad.ps1');
  try { fs.writeFileSync(file, PS1); } catch { return; }
  proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => { if (/chord/.test(d)) onChord(); for (const k of ['pip', 'rec', 'clip']) if (new RegExp(k).test(d)) onPip(k); });
  const me = proc, t0 = Date.now();
  const dead = () => {
    if (proc !== me) return;
    proc = null;
    if (Date.now() - t0 > 60000) tries = 0;
    if (again) setTimeout(() => { if (again && !proc) again(); }, Math.min(60000, 2000 * 2 ** tries++));
  };
  proc.on('exit', dead); proc.on('error', dead);
}
function stop() { again = null; if (proc) { try { proc.kill(); } catch { /* gone */ } proc = null; } }

module.exports = { start, stop };
