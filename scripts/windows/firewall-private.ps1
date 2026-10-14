# Bladedeck through Windows Firewall on Private networks only (the owner's choice, 2026-10-14).
# Run it yourself in an administrator PowerShell; it changes security settings, so no assistant does.
#   powershell -ExecutionPolicy Bypass -File scripts\windows\firewall-private.ps1            rules only
#   ... -HomePrivate     also marks the network you are on now as Private, so Nearby keeps working
# Backs up every firewall rule first; to undo: netsh advfirewall import "<the before.wfw it prints>"
param([switch] $HomePrivate)
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole('Administrators')) {
  Write-Host 'Run this from an administrator PowerShell (right-click PowerShell, Run as administrator).'; exit 1
}
$dir = Join-Path $env:USERPROFILE ("Downloads\bladedeck-backups\{0:yyyy-MM-dd}-firewall" -f (Get-Date))
New-Item -ItemType Directory -Force $dir | Out-Null
netsh advfirewall export (Join-Path $dir 'before.wfw') | Out-Null
Write-Host "Backup: $dir\before.wfw"

# Windows' own "allow this app" prompt made these: every port, Private and Public. The installed
# Bladedeck, the built one in dist and the dev Electron (npm start) all become Private only; the dev
# Electron is kept rather than removed so Nearby still works when testing from source.
$rules = Get-NetFirewallApplicationFilter | Where-Object { $_.Program -match '\\bladedeck\.exe$|\\source\\bladedeck\\node_modules\\electron\\dist\\electron\.exe$' } | Get-NetFirewallRule
$rules | Set-NetFirewallRule -Profile Private
if ($HomePrivate) { Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' -and $_.InterfaceAlias -notmatch 'Tailscale' } | Set-NetConnectionProfile -NetworkCategory Private }

$rules | ForEach-Object { Get-NetFirewallRule -Name $_.Name } | ForEach-Object {
  [pscustomobject]@{ Program = ($_ | Get-NetFirewallApplicationFilter).Program; Protocol = ($_ | Get-NetFirewallPortFilter).Protocol; Profile = "$($_.Profile)"; Action = "$($_.Action)" }
} | Format-Table -AutoSize
Get-NetConnectionProfile | Select-Object Name, InterfaceAlias, NetworkCategory | Format-Table -AutoSize
