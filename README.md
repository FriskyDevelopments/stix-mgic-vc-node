# stix-mgic-vc-node

STIX MΛGIC VC NODE — production control-plane for multi-platform session operations (Telegram + Discord). React 19 + Vite UI served by a Hono Node API.

## Production readiness

| Layer | Status |
|-------|--------|
| Control-plane API (`/v1/sessions`, `/v1/auth/*`, `/healthz`) | **Ready** |
| Production server (`npm start` → `0.0.0.0:$PORT`, serves `dist` + API) | **Ready** |
| Discord OAuth code exchange (server secret) | **Ready** when `DISCORD_CLIENT_*` set |
| Telegram Login Widget HMAC verify | **Ready** when `TELEGRAM_BOT_TOKEN` set |
| Operator session tokens (HMAC) | **Ready** |
| Static deploy (Vercel) / Render blueprint / Docker | **Ready** |
| Media plane — WebRTC rooms + signalling (`/v1/rooms`, `ws /v1/signal`) | **Ready** (`degraded` without a TURN relay) |
| Media plane — Telegram VC join / Discord voice / RTMP ingest | **Deferred**, per adapter, with the reason on `/v1/media/status` — see [MEDIA-PLANE.md](MEDIA-PLANE.md) |

Default production mode uses the **live control plane**. A browser-to-browser call works
today: open a room, share the id, and the node relays the negotiation while audio and video
travel peer to peer. Joining a *Telegram* group call does not, and cannot without MTProto —
`/v1/media/status` reports that per adapter rather than implying otherwise.

Session telemetry is measured by the participants and reported upward; with nothing
connected it reads zero and `telemetrySource: "unavailable"`, never an invented bitrate.

## Local development

```bash
cp .env.example .env
npm install
npm run dev
```

This runs:
- API on `127.0.0.1:8787`
- Vite UI on `http://localhost:5000` (proxies `/v1` + `/healthz`)

## Production

```bash
npm run build
OPERATOR_TOKEN_SECRET=... NODE_ENV=production npm start
```

Binds `0.0.0.0:$PORT` (Render/Fly/Docker compatible).

### Render

`render.yaml` included. Set Discord/Telegram secrets in the dashboard.

### Docker

```bash
docker build -t stix-mgic-vc-node .
docker run --rm -p 10000:10000 -e PORT=10000 -e OPERATOR_TOKEN_SECRET=... stix-mgic-vc-node
```

## Environment

### Client (`VITE_*`)
| Var | Purpose |
|-----|---------|
| `VITE_DEMO_MODE` | `true` forces client-side simulation; unset/`false` uses API |
| `VITE_API_BASE_URL` | Optional absolute API origin (blank = same-origin) |
| `VITE_DISCORD_CLIENT_ID` | Public Discord OAuth client id |
| `VITE_SPOTIFY_CLIENT_ID` | Optional Spotify PKCE |
| `VITE_OPERATOR_TIER` | `free` \| `premium` |
| `VITE_AUTH_REQUIRED` | UI hint when anonymous operators are disabled |

### Server (secrets — never prefix with `VITE_`)
| Var | Purpose |
|-----|---------|
| `OPERATOR_TOKEN_SECRET` | Required in production |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_REDIRECT_URI` | Real Discord exchange |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` | Telegram Login Widget verify |
| `AUTH_REQUIRED` | Require operator bearer token for sessions |
| `MEDIA_PLANE_ENABLED` | Feature flag only; adapters not wired yet |

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | API + Vite concurrently |
| `npm run build` | Build SPA |
| `npm start` | Production control plane |
| `npm run typecheck` | Client + server types |
| `npm run test:ci` | Vitest (UI + API) |
| `npm run lint` | ESLint |

## Related

stixmagic-bot / stixmagic-web — future media-plane adapters attach behind `/v1/media/*`.
