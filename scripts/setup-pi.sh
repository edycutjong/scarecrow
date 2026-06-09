#!/usr/bin/env bash
#
# Scarecrow — Raspberry Pi provisioning script
# Prepares a fresh Raspberry Pi OS (Bookworm, 64-bit) for the off-grid AI sentry:
#   camera, audio/TTS, Node.js, deps, and an optional Wi-Fi access point.
#
# Usage:  bash scripts/setup-pi.sh [--ap]
#   --ap   also configure the 'Scarecrow-AP' hotspot (dashboard at 192.168.4.1:8080)
#
set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; AMBER='\033[0;33m'; NC='\033[0m'
log()  { echo -e "${CYAN}[setup]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok ]${NC} $*"; }
warn() { echo -e "${AMBER}[warn]${NC} $*"; }

SETUP_AP=0
[[ "${1:-}" == "--ap" ]] && SETUP_AP=1

# ── 0. Sanity ────────────────────────────────────────────────────────────────
if ! grep -qiE "raspberry|raspbian|debian" /etc/os-release 2>/dev/null; then
  warn "This doesn't look like a Raspberry Pi / Debian host. Continuing anyway."
fi

# ── 1. System packages ───────────────────────────────────────────────────────
log "Updating apt and installing system packages (camera, audio, build tools)..."
sudo apt-get update -y
sudo apt-get install -y \
  libcamera-apps \
  alsa-utils \
  espeak-ng \
  python3 python3-pip \
  git curl build-essential
ok "System packages installed."

# ── 2. Node.js (20 LTS) ──────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
ok "Node $(node -v) / npm $(npm -v)"

# ── 3. Camera ────────────────────────────────────────────────────────────────
log "Verifying camera stack (libcamera-still)..."
if command -v libcamera-still >/dev/null 2>&1; then
  ok "libcamera-still present (capture path ready)."
else
  warn "libcamera-still not found — enable the camera via 'sudo raspi-config'."
fi

# ── 4. Project dependencies ──────────────────────────────────────────────────
log "Installing npm dependencies..."
npm ci || npm install
ok "Dependencies installed."

# ── 5. Optional: Wi-Fi access point ──────────────────────────────────────────
if [[ "$SETUP_AP" == "1" ]]; then
  log "Configuring 'Scarecrow-AP' hotspot via NetworkManager..."
  if command -v nmcli >/dev/null 2>&1; then
    sudo nmcli device wifi hotspot ssid Scarecrow-AP password scarecrow123 || \
      warn "Hotspot setup failed — configure manually if needed."
    ok "Hotspot 'Scarecrow-AP' configured (dashboard → http://192.168.4.1:8080)."
  else
    warn "nmcli not available — skipping hotspot. Install network-manager to enable."
  fi
fi

# ── 6. Smoke checks ──────────────────────────────────────────────────────────
log "Running offline verification + readiness checks..."
python3 scripts/verify_offline.py || warn "verify_offline reported issues."

echo
ok "Scarecrow setup complete."
echo -e "  Next:  ${GREEN}npm start${NC}   # sentry loop + dashboard"
echo -e "         ${GREEN}npm run sentry${NC}   # headless sentry only"
