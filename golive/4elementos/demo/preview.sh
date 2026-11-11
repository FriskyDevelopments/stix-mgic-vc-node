#!/usr/bin/env bash
# Build the 4 Elementos demo bundle and, with --dev, start a local Worker.
# This script never deploys and never changes DNS.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"
CONFIG="golive/4elementos/demo/wrangler.jsonc"

if [[ "${1:-}" == "--deploy" || "${1:-}" == "deploy" ]]; then
  echo "refusing to deploy: the 4 Elementos demo stays off production and off the client domain." >&2
  echo "When Francisco says GO, with a Cloudflare API token only in the environment:" >&2
  echo "  npx wrangler deploy --config ${CONFIG}" >&2
  exit 2
fi

npx tsx golive/4elementos/demo/config-check.ts
npx vite build --config golive/4elementos/demo/vite.config.ts

if [[ "${1:-}" == "--dev" ]]; then
  exec npx wrangler dev --config "$CONFIG" --port 8788 --ip 127.0.0.1
fi

echo "Demo bundle is in golive/4elementos/demo/dist."
echo "Local preview (no deploy, no DNS):"
echo "  ./golive/4elementos/demo/preview.sh --dev"
echo "Cloudflare preview deploy is not run here. It needs Francisco's GO and a Cloudflare API token:"
echo "  npx wrangler deploy --config ${CONFIG}"
