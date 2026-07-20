# Security Policy

## Scope

`stix-mgic-vc-node` ships a **production control-plane**:
- Hono API for auth exchange + session authority
- SPA served from the same Node process on `0.0.0.0:$PORT`

Media-plane adapters (live Telegram VC join / RTMP ingest) are intentionally deferred and reported as not ready.

## Reporting

Report vulnerabilities privately to **Frisky Developments** (`aroo@pupfrisky.com`). Do not open a public GitHub issue for sensitive findings.

## Secrets

Never commit:
- `OPERATOR_TOKEN_SECRET`
- `DISCORD_CLIENT_SECRET`
- `TELEGRAM_BOT_TOKEN`
- Spotify tokens / operator bearer tokens

Client `VITE_*` values are public. Server secrets must stay server-side only.
