#!/usr/bin/env bash
# Ashy for-dummies Telethon pairing. Dens/VC plane — not BotFather.
# See docs/ASHY-TELETHON-FOR-DUMMIES.md

root="$(cd "$(dirname "$0")/.." && pwd)"
script="$root/scripts/ashy_telethon_setup.py"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Could not pair: this machine needs python3." >&2
  echo "Install Python 3, then run: python3 scripts/ashy_telethon_setup.py" >&2
  exit 1
fi

if [ ! -f "$script" ]; then
  echo "Could not pair: missing $script" >&2
  exit 1
fi

exec python3 "$script" "$@"
