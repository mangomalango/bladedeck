#!/bin/bash
# Run the night shift (nightly.sh) every night at 01:00 as a systemd user timer.
#   scripts/nightly/install-timer.sh          install and turn on
#   scripts/nightly/install-timer.sh off      turn off and remove
#   systemctl --user list-timers bladedeck-nightly.timer    when it runs next
# The PC has to be awake (or wake by itself) at 01:00; once running, the shift keeps it awake.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
UNIT="$HOME/.config/systemd/user"
if [ "${1:-}" = "off" ]; then
  systemctl --user disable --now bladedeck-nightly.timer 2>/dev/null || true
  rm -f "$UNIT/bladedeck-nightly.timer" "$UNIT/bladedeck-nightly.service"
  systemctl --user daemon-reload
  echo "Night shift turned off."
  exit 0
fi
mkdir -p "$UNIT"
cat > "$UNIT/bladedeck-nightly.service" <<EOF
[Unit]
Description=Bladedeck night shift (Gemini reviews, Claude verifies and fixes)

[Service]
Type=oneshot
# The PATH from when this was installed, so claude, gemini, node and git are found.
Environment="PATH=$PATH"
ExecStart=$HERE/nightly.sh
TimeoutStartSec=8h
EOF
cat > "$UNIT/bladedeck-nightly.timer" <<EOF
[Unit]
Description=Bladedeck night shift at 01:00

[Timer]
OnCalendar=*-*-* 01:00:00
Persistent=false

[Install]
WantedBy=timers.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now bladedeck-nightly.timer
systemctl --user list-timers bladedeck-nightly.timer --no-pager
