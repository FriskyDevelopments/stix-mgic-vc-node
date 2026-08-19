# stix-mgic-vc-node

STIX MΛGIC VC NODE — production control-plane for multi-platform session operations (Telegram + Discord). React 19 + Vite UI served by a Hono Node API.

## Production readiness

| Layer | Status |
|-------|--------|
| Control-plane API (`/v1/sessions`, `/v1/auth/*`, `/healthz`) | **Ready** |
| Production server (`npm start` → `0.0.0.0:$PORT`, serves `dist` + API) | **Ready** |
| Discord OAuth code exchange (server secret) | **Ready** when `DISCORD_CLIENT_*` set |
| Telegram Login Widget HMAC verify + signed `/vc` bot webhook | **Ready** when `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` are set |
| Operator session tokens (HMAC) | **Ready** |
| Static deploy (Vercel) / Render blueprint / Docker | **Ready** |
| Media plane — WebRTC rooms + signalling (`/v1/rooms`, `ws /v1/signal`) | **Ready** (`degraded` without a TURN relay) |
| Media plane — Telegram VC join (paired MTProto operator) | **Ready** — operator-only controls at `/v1/telegram-vc/*` |
| Media plane — authenticated RTMP ingest | **Ready** — MediaMTX sidecar, one protected `vc` path; endpoint is operator-only at `/v1/rtmp/publish` |
| Media plane — Discord voice | Audio-only platform limitation; deliberately not offered as a video/screen-share transport |

Default production mode uses the **live control plane**. A browser-to-browser call works
today: open a room, share the id, and the node relays the negotiation while audio and video
travel peer to peer. Telegram group calls run through the separately paired MTProto operator;
an RTMP source can be published to the protected VC Node ingest and selected in Studio.

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
| `VITE_POSTHOG_PROJECT_TOKEN` | Optional PostHog project token (blank = analytics off) |
| `VITE_POSTHOG_HOST` | PostHog API host (default `https://us.i.posthog.com`) |

### Server (secrets — never prefix with `VITE_`)
| Var | Purpose |
|-----|---------|
| `OPERATOR_TOKEN_SECRET` | Required in production |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_REDIRECT_URI` | Real Discord exchange |
| `DISCORD_APPLICATION_PUBLIC_KEY` | Enables signed Discord Interactions at `POST /v1/discord/interactions` |
| `DISCORD_APPLICATION_ID` / `DISCORD_BOT_TOKEN` | Enables `npm run discord:register-commands` (an explicit global `/vc`, `/studio`, `/status` registration) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` | Telegram Login Widget verify and command replies |
| `TELEGRAM_WEBHOOK_SECRET` | Required to authenticate Telegram Bot API webhook delivery |
| `AUTH_REQUIRED` | Require operator bearer token for sessions |
| `MEDIA_PLANE_ENABLED` | Enables the live media-plane controls |
| `RTMP_INGEST_ENABLED` | Enables the authenticated MediaMTX ingest sidecar |
| `RTMP_PUBLIC_HOST` | Public host or IP reachable by OBS/ffmpeg publishers |
| `RTMP_PUBLISH_USER` / `RTMP_PUBLISH_PASSWORD` | Server-side RTMP publisher credential; never expose publicly |
| `RTMP_PATH` | RTMP path (production uses `vc`) |

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | API + Vite concurrently |
| `npm run build` | Build SPA |
| `npm start` | Production control plane |
| `npm run typecheck` | Client + server types |
| `npm run test:ci` | Vitest (UI + API) |
| `npm run lint` | ESLint |

## Identity layers

1. **FriskyDev account (primary)** — register/sign in via `/v1/account/*`
2. **Telegram / Discord (layer 2)** — verified login, then linked to FriskyDev:
   - Telegram Login Widget → `POST /v1/account/link/telegram`
   - Discord OAuth → `POST /v1/account/link/discord`

Required secrets for real platform login:
- `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` (+ matching `VITE_DISCORD_CLIENT_ID`)
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_USERNAME` (+ `VITE_TELEGRAM_BOT_USERNAME`)

## Related

stixmagic-bot / stixmagic-web — media-plane adapters report through `/v1/media/*`.
