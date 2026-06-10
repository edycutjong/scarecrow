#!/usr/bin/env bash
#
# Capture polished dashboard screenshots with headless Chrome (same engine the
# judges/GitHub render with). Runs against the dashboard's offline SIMULATION
# (no server needed), which cycles person/dog/vehicle scenarios so we can grab
# the alert state with the detection bounding box.
#
# Usage:  bash scripts/capture-screenshots.sh
# Output: docs/screenshots/*.png  (2× retina)
#
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "Set \$CHROME to your Chrome/Chromium binary"; exit 1; }

OUT="docs/screenshots"; mkdir -p "$OUT"
URL="file://$PWD/src/web/index.html"
shoot() { # <virtual-ms> <name>
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=1280,880 --virtual-time-budget="$1" \
    --screenshot="$OUT/$2.png" "$URL" 2>/dev/null
  echo "  → $OUT/$2.png"
}

# Stop any running server so the page uses the SIMULATION (with alerts + bbox).
pkill -f "src/web/server.ts" 2>/dev/null || true; sleep 1

shoot 2500 dashboard-scanning   # vision/rules stage, beam sweeping
shoot 3600 dashboard-alert      # THREAT DETECTED + PERSON bounding box (hero)
shoot 5200 dashboard-clear      # perimeter clear / sleeping

echo "Done. For LIVE telemetry shots (real RSS, SIM badges), run on the Pi:"
echo "  npm start   # then screenshot http://192.168.4.1:8080"
