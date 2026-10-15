# Bladedeck's night shift on Windows: Claude verifies and fixes while the owner sleeps or is at work.
# The Windows side of nightly.sh. Claude works in its own git worktree on its own branch
# (nightly/<date>-win-<shift>), never in the main folder, never on master or windows-fixes. When the
# shift ends, this script (not Claude) pushes that one branch so the Linux session can review it and
# merge only what holds up (Linux leads; see WINDOWS.md Ground rules).
#   Run by Task Scheduler (scripts/nightly/install-tasks.ps1), or by hand:
#   powershell -ExecutionPolicy Bypass -File scripts\nightly\nightly.ps1 -Shift night
#   ... -DryRun    makes the worktree and runs the check, without Claude and without pushing
# Stops at the shift's end hour, when Claude says there is nothing left, when it hits its usage
# limit, or after -MaxPasses passes (each pass spends usage, so the default is low).
param(
  [ValidateSet('night', 'work')] [string] $Shift = 'night',
  [int] $StopHour = 0,
  [int] $MaxPasses = 4,
  [switch] $DryRun
)
$ErrorActionPreference = 'Continue'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Here = $PSScriptRoot
$Day = Get-Date -Format 'yyyy-MM-dd'
$Work = Join-Path $env:USERPROFILE 'Downloads\bladedeck-nightly'
$Log = Join-Path $Work "logs\$Day-win-$Shift"
if (-not $StopHour) { $StopHour = if ($Shift -eq 'night') { 7 } else { 17 } }
# windows-fixes is where Windows work collects before the Linux session merges it into master.
$Base = 'origin/windows-fixes'
$Branch = "nightly/$Day-win-$Shift"
$Dir = Join-Path $Work "$Day-win-$Shift"
New-Item -ItemType Directory -Force $Log | Out-Null

function Say($m) {
  $line = '[{0:HH:mm:ss}] {1}' -f (Get-Date), $m
  Write-Host $line
  Add-Content -Path (Join-Path $Log 'nightly.log') -Value $line -Encoding UTF8
}
function Late { $h = (Get-Date).Hour; $h -ge $StopHour -and $h -lt $StopHour + 5 }
function Limited($file) { Select-String -Path $file -Quiet -Pattern 'usage limit|rate limit|spend limit|quota|limit reached|429' }

# Keep the PC awake for the shift (not the screen); Windows lets it sleep again when this exits.
Add-Type -Namespace BD -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
[BD.Power]::SetThreadExecutionState([uint32]'0x80000001') | Out-Null

$Claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $Claude) { $Claude = Join-Path $env:USERPROFILE '.local\bin\claude.exe' }
if (-not (Test-Path $Claude)) { Say 'claude is not installed; nothing to do'; exit 1 }

git -C $Repo fetch -q origin
Say "Shift '$Shift' for $Day starts, until $($StopHour):00. Base: $Base $(git -C $Repo rev-parse --short $Base)"
if (-not (Test-Path $Dir)) {
  git -C $Repo worktree add -q -B $Branch $Dir $Base
  if (-not (Test-Path $Dir)) { Say 'could not make the worktree'; exit 1 }
}

if ($DryRun) {
  Push-Location $Dir; npm run -s check; Pop-Location
  Say "Dry run: worktree $Dir on $Branch, $(& $Claude --version). Nothing run, nothing pushed."
  exit 0
}

# Only these run (anything else is refused, as nobody is there to approve it); the denied ones are
# refused outright as well, to be plain about it. Bladedeck, Electron and installs are never run:
# a running copy reads the owner's controller even in the background.
$allowed = @('Read', 'Edit', 'Write', 'Grep', 'Glob',
  'Bash(npm run check)', 'Bash(npm run -s check)', 'Bash(node --check:*)',
  'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)', 'Bash(git add:*)', 'Bash(git commit:*)',
  'Bash(grep:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(wc:*)', 'Bash(sed -n:*)')
$denied = @('Bash(git push:*)', 'Bash(rm:*)', 'Bash(npm install:*)', 'Bash(npm run dist:*)', 'Bash(npm start:*)',
  'Bash(npx:*)', 'PowerShell', 'WebFetch')
$prompt = Get-Content -Raw -Encoding UTF8 (Join-Path $Here 'claude-prompt-windows.md')

$pass = 1
while ($true) {
  if (Late) { Say "$($StopHour):00: Claude stops"; break }
  Say "Claude: pass $pass in $Dir"
  $out = Join-Path $Log "claude-$pass.txt"
  Push-Location $Dir
  "$prompt`n`nThis is pass $pass of this $Shift shift. NIGHTLY-REPORT-windows.md holds what earlier passes did; take the next item." |
    & $Claude -p --permission-mode acceptEdits --allowedTools $allowed --disallowedTools $denied 2>&1 |
    ForEach-Object { "$_" } | Out-File -FilePath $out -Encoding UTF8
  Pop-Location
  Say "Claude pass $pass finished"
  git -C $Dir add -A -- .
  git -C $Dir commit -q -m "Night shift ($Day, Windows $Shift): Claude pass $pass"
  if ($LASTEXITCODE -eq 0) { Say "committed on $Branch" }
  if (Limited $out) { Say 'Claude hit its usage limit'; break }
  if (Select-String -Path $out -Quiet -SimpleMatch 'NOTHING LEFT') { Say 'Claude says nothing is left'; break }
  $pass++
  if ($pass -gt $MaxPasses) { Say "$MaxPasses passes done"; break }
}

# Push the shift's branch only if Claude committed something, so the Linux session can see it.
$ahead = [int](git -C $Dir rev-list --count "$Base..HEAD")
if ($ahead -gt 0) {
  git -C $Dir push -q -u origin $Branch
  if ($LASTEXITCODE -eq 0) { Say "pushed $Branch ($ahead commits) for review" } else { Say "push of $Branch failed" }
} else { Say 'no commits this shift; nothing pushed' }
Say "Shift done. Logs: $Log"
