# Run the Windows night shift (nightly.ps1) from Task Scheduler: every night at 01:00 until 07:00,
# and weekdays at 09:00 until 17:00 while the owner is at work. The Windows side of install-timer.sh.
#   powershell -ExecutionPolicy Bypass -File scripts\nightly\install-tasks.ps1          install
#   ... -Night 02:00 -Work 08:30      other start times     ... -NoWork    nights only
#   ... -Off                          turn both off and remove them
# Runs as the signed-in user (Claude's sign-in lives there), so the PC must stay signed in; it is
# woken from sleep for each shift, and the shift keeps it awake until it ends.
param([string] $Night = '01:00', [string] $Work = '09:00', [switch] $NoWork, [switch] $Off)
$names = @('Bladedeck night shift', 'Bladedeck work shift')
foreach ($n in $names) { Unregister-ScheduledTask -TaskName $n -Confirm:$false -ErrorAction SilentlyContinue }
if ($Off) { 'Night and work shifts turned off.'; return }

$script = Join-Path $PSScriptRoot 'nightly.ps1'
function Add-Shift($name, $shift, $trigger) {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory (Split-Path (Split-Path $PSScriptRoot)) `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -Shift $shift"
  $settings = New-ScheduledTaskSettingsSet -WakeToRun -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 9) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  $who = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $who `
    -Description "Bladedeck: Claude reviews and fixes the Windows code ($shift shift) and pushes nightly/<date>-win-$shift for review." | Out-Null
}
Add-Shift $names[0] 'night' (New-ScheduledTaskTrigger -Daily -At $Night)
if (-not $NoWork) { Add-Shift $names[1] 'work' (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At $Work) }
Get-ScheduledTask -TaskName 'Bladedeck *' | Get-ScheduledTaskInfo | Select-Object TaskName, NextRunTime | Format-Table -AutoSize
