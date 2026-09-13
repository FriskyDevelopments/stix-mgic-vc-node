# Ashy NEBU unit on Cloudflare Containers

`vc.friskydev.com` still runs on hermes (`DEPLOY.md`). This path is for **Ashy’s self-hosted NEBU unit**: the same Node image (`Dockerfile`) behind a Worker + Durable Object Container, not Pages/Workers-only and not a generic Docker host.

What the image already serves:

- `/units/ashy` — `NebuAshyWalkthrough`
- host chrome / studio / ops SPA from `dist`
- `/healthz` and `/v1/*`
- signalling WebSocket (`/v1/signal`) — proxied with `container.fetch()`, not `containerFetch()`

Cloudflare Realtime (TURN/SFU) stays in `server/cloudflare-realtime.ts`. Containers is only the **runtime** for the unit process. TURN/SFU credentials are still minted by that Node code using secrets you inject at start.

## Layout

| Piece | Role |
| --- | --- |
| `wrangler.jsonc` | Worker `nebu-ashy-unit`, container image `./Dockerfile`, DO class `AshyUnit` |
| `workers/ashy-unit.ts` | Proxies HTTP + WebSocket to the named instance `ashy` |
| `Dockerfile` | Node 22 multi-stage; listens on **port 10000**; Docker `HEALTHCHECK` curls `/healthz` |
| `.dev.vars.example` | Local secret names for `wrangler dev` (copy to `.dev.vars`, never commit) |

First request to a cold instance can take minutes while Cloudflare provisions the image. `/cf/ready` answers on the Worker even before the container is healthy. `/healthz` is the app probe.

## Ports and health

| Surface | Port / path |
| --- | --- |
| Container listen | `10000` (`ENV PORT=10000`, `EXPOSE 10000`, Worker `defaultPort`) |
| Docker HEALTHCHECK | `GET http://127.0.0.1:10000/healthz` every 30s, start period 45s |
| Cloudflare startup ping | `pingEndpoint = localhost/healthz` (same path, after the port is open) |
| Worker (not the app) | `GET /cf/ready` |
| Signalling | same origin, WebSocket upgrade on `/v1/signal` |

Inbound non-HTTP TCP/UDP is not available on Containers. **RTMP ingest (TCP 1935) stays on hermes / a generic Docker host.** WebRTC media is peer-to-peer or Cloudflare Realtime; it does not hairpin through port 10000.

Disk is ephemeral. When the instance sleeps (`sleepAfter = 1h`), the next start is a fresh filesystem. Do not treat Containers as a durable `/data` volume.

Instance size is `standard-1` (0.5 vCPU, 4 GiB, 8 GB disk) because the image includes Node, ffmpeg, and the Telegram Python stack. `lite` / `basic` will likely OOM or blow the disk limit.

## Owner login (no credentials in this repo)

Deploy needs a Cloudflare account on the **Workers Paid** plan (Containers) and a machine with Docker (or a Docker-compatible engine).

```bash
npx wrangler login          # browser OAuth; do this on your laptop, not in CI blindly
npx wrangler whoami         # confirm the account before the first deploy
```

Do not paste API tokens into the repo, chat, or `wrangler.jsonc`. For CI, the owner sets `CLOUDFLARE_API_TOKEN` in the secret store of the CI system.

## Secrets and env

`wrangler.jsonc` `vars` are **non-secret flags only** (`AUTH_REQUIRED=true`, `MEDIA_PLANE_ENABLED=true`, public STUN, issuer). Everything else is `wrangler secret put` (interactive prompt — do not `echo` values on the command line).

### Required for the container to boot in production

The Node process throws if these are missing when `NODE_ENV=production`:

| Name | Why |
| --- | --- |
| `OPERATOR_TOKEN_SECRET` | HMAC for operator sessions; min 16 chars |

`AUTH_REQUIRED` is already `"true"` in `vars`.

```bash
npx wrangler secret put OPERATOR_TOKEN_SECRET
```

### Strongly recommended for Ashy’s walkthrough (identity + dens)

| Name | Why |
| --- | --- |
| `SUPABASE_URL` | FriskyDev identity |
| `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY` | Public by design; still do not commit the live value |
| `TELEGRAM_BOT_TOKEN` | BYO Telegram. Hosted Ashy unit `8888816358` / `@kimi_Friskydev_bot` is FriskyDev-run — do not paste a BotFather token in the walkthrough UI |
| `TELEGRAM_BOT_USERNAME` | Login widget + bot display (not a secret; may be a var) |
| `TELEGRAM_WEBHOOK_SECRET` | Signed Telegram webhooks (min 24 chars) |
| `BETTER_AUTH_SECRET` | NEBU consumer login at `/login` if you enable it on this unit |
| `BETTER_AUTH_URL` | Public origin of this deployment |
| `DATABASE_URL` | Better Auth store (MySQL). Omit if you are not running NEBU login on this instance |

### Cloudflare Realtime (keep `server/cloudflare-realtime.ts`)

| Name | Why |
| --- | --- |
| `CLOUDFLARE_TURN_KEY_ID` + `CLOUDFLARE_TURN_KEY_API_TOKEN` | Mints short-lived ICE/TURN; without them WebRTC reports `degraded` |
| `CLOUDFLARE_REALTIME_APP_ID` + `CLOUDFLARE_REALTIME_APP_SECRET` | SFU sessions for rooms that cannot stay mesh |

These are **optional**. The unit boots without them; `/v1/media/status` tells the truth.

### Never

- Cloudflare **service-role** / Supabase service-role keys
- BotFather tokens in `/units/ashy` copy or Wrangler `vars`
- `account_id` or API tokens in `wrangler.jsonc`

Local:

```bash
cp .dev.vars.example .dev.vars   # fill values locally; gitignored
npx wrangler dev                 # needs Docker running; rebuild container with `r`
```

## Deploy

```bash
# 1. Auth
npx wrangler whoami || npx wrangler login

# 2. Secrets (repeat per name; interactive)
npx wrangler secret put OPERATOR_TOKEN_SECRET
# then any of the recommended names above

# 3. Docker engine must be up (linux/amd64 image)
docker info

# 4. Build image + upload Worker + roll out containers
npx wrangler deploy
```

After the first deploy, wait until the container is actually up:

```bash
npx wrangler containers list
curl -fsS "https://nebu-ashy-unit.<YOUR_SUBDOMAIN>.workers.dev/cf/ready"
curl -fsS "https://nebu-ashy-unit.<YOUR_SUBDOMAIN>.workers.dev/healthz"
# SPA + walkthrough
# https://nebu-ashy-unit.<YOUR_SUBDOMAIN>.workers.dev/units/ashy
```

Workers Builds: production branch must run `npx wrangler deploy` (not `wrangler versions upload`). Preview URLs are not generated for Durable Object / Containers Workers.

Custom domain (owner dashboard): attach e.g. a `*.nebu.quest` host to Worker `nebu-ashy-unit`, then add that origin to the Supabase redirect allow-list. Do not point `vc.friskydev.com` here unless you intend to cut hermes over.

## Related UI PRs

Ashy palette / landing chrome may still be landing via:

- #65 `feat/nebu-landing-admin`
- #66 `feat/nebu-admin-ashy`

This Containers packaging does not depend on those PRs.
