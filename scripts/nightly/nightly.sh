#!/bin/bash
# Bladedeck's night shift: Gemini reviews, then Claude verifies and fixes, while the owner sleeps.
# Each works in its own git worktree on its own branch (nightly/<date>-gemini, nightly/<date>-claude),
# never in the main folder, never on master, and pushes nothing. In the morning the Linux session
# reviews the branches and merges only what holds up (Linux leads; see WINDOWS.md Ground rules).
#   Run by the systemd user timer (scripts/nightly/install-timer.sh), or by hand:
#   scripts/nightly/nightly.sh            # both
#   scripts/nightly/nightly.sh claude     # only Claude
# Stops at 07:00, when an AI says there is nothing left, or when it hits its usage limit.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$REPO/scripts/nightly"
DAY="$(date +%F)"
WORK="$HOME/Downloads/bladedeck-nightly"
LOG="$WORK/logs/$DAY"
STOP_HOUR="${NIGHTLY_STOP_HOUR:-7}"
WHO="${1:-both}"
# Keep the PC awake for the shift; the inhibitor ends with this script.
if [ -z "${NIGHTLY_AWAKE:-}" ] && command -v systemd-inhibit >/dev/null; then
  NIGHTLY_AWAKE=1 exec systemd-inhibit --what=sleep:idle --who="Bladedeck night shift" --why="Claude and Gemini are checking Bladedeck" --mode=block "$0" "$@"
fi
mkdir -p "$LOG"
exec > >(tee -a "$LOG/nightly.log") 2>&1
say() { echo "[$(date +%T)] $*"; }

late() { [ "$(date +%H)" -ge "$STOP_HOUR" ] && [ "$(date +%H)" -lt 12 ]; }
limited() { grep -q -i -E "usage limit|rate limit|quota|resource.?exhausted|429|limit reached" "$1"; }

# A fresh worktree from the local master (what the Linux session last approved), with the main
# folder's node_modules linked in (Electron is unpacked there by hand on this PC).
worktree() {
  local name="$1" dir="$WORK/$DAY-$1" branch="nightly/$DAY-$1"
  if [ ! -d "$dir" ]; then
    git -C "$REPO" worktree add -q -B "$branch" "$dir" master || return 1
    ln -s "$REPO/node_modules" "$dir/node_modules"
  fi
  echo "$dir"
}

run_gemini() {
  command -v gemini >/dev/null || { say "gemini is not installed; skipping"; return; }
  local dir; dir="$(worktree gemini)" || { say "could not make the Gemini worktree"; return; }
  say "Gemini: review in $dir"
  ( cd "$dir" && timeout 3h gemini --skip-trust --approval-mode auto_edit -p "$(cat "$HERE/gemini-prompt.md")" ) > "$LOG/gemini.txt" 2>&1
  say "Gemini finished (exit $?)"; limited "$LOG/gemini.txt" && say "Gemini hit its usage limit"
  # Google retired Code Assist for individuals in this CLI; it then needs GEMINI_API_KEY.
  grep -q -E "IneligibleTierError|no longer supported" "$LOG/gemini.txt" && say "Gemini's sign-in is no longer accepted by the CLI: set GEMINI_API_KEY (Google AI Studio) to bring it back"
  ( cd "$dir" && git add -A -- . ':!node_modules' && git commit -q -m "Night shift ($DAY): Gemini review" ) && say "Gemini's work committed on nightly/$DAY-gemini"
}

run_claude() {
  command -v claude >/dev/null || { say "claude is not installed; skipping"; return; }
  local dir; dir="$(worktree claude)" || { say "could not make the Claude worktree"; return; }
  # Gemini's findings, for Claude to verify.
  [ -f "$WORK/$DAY-gemini/NIGHTLY-REVIEW-gemini.md" ] && cp "$WORK/$DAY-gemini/NIGHTLY-REVIEW-gemini.md" "$dir/"
  local allowed=(Read Edit Write Grep Glob
    "Bash(npm run check)" "Bash(npm run -s check)" "Bash(node --check:*)"
    "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)" "Bash(git add:*)" "Bash(git commit:*)"
    "Bash(grep:*)" "Bash(ls:*)" "Bash(cat:*)" "Bash(head:*)" "Bash(tail:*)" "Bash(wc:*)" "Bash(sed -n:*)")
  # Only the commands above run (anything else is refused, as nobody is there to approve it);
  # these are refused outright as well, to be plain about it.
  local denied=("Bash(git push:*)" "Bash(rm:*)" "Bash(npm install:*)" "Bash(npm run dist:*)" "Bash(sudo:*)" "WebFetch")
  local pass=1
  while :; do
    late && { say "07:00: Claude stops"; break; }
    say "Claude: pass $pass in $dir"
    local out="$LOG/claude-$pass.txt"
    ( cd "$dir" && timeout 2h claude -p "$(cat "$HERE/claude-prompt.md")

This is pass $pass of tonight. NIGHTLY-REPORT.md holds what earlier passes did; take the next item." \
        --permission-mode acceptEdits --allowedTools "${allowed[@]}" --disallowedTools "${denied[@]}" ) > "$out" 2>&1
    say "Claude pass $pass finished (exit $?)"
    ( cd "$dir" && git add -A -- . ':!node_modules' && git commit -q -m "Night shift ($DAY): Claude pass $pass" ) && say "committed on nightly/$DAY-claude"
    limited "$out" && { say "Claude hit its usage limit"; break; }
    grep -q "NOTHING LEFT" "$out" && { say "Claude says nothing is left"; break; }
    pass=$((pass + 1)); [ "$pass" -gt "${NIGHTLY_MAX_PASSES:-8}" ] && break
  done
}

say "Night shift for $DAY starts ($WHO). Base: master $(git -C "$REPO" rev-parse --short master)"
case "$WHO" in
  gemini) run_gemini ;;
  claude) run_claude ;;
  *) run_gemini; late || run_claude ;;
esac
say "Night shift done. Branches: $(git -C "$REPO" branch --list "nightly/$DAY-*" | tr -d ' *' | tr '\n' ' ')  Logs: $LOG"
