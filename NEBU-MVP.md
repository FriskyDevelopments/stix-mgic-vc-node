# NEBU VC node MVP (nebu.quest)

A feasible video-chat MVP for NEBU: two browsers join a room, camera/mic (or listen-only) work, media is peer-to-peer, the node only signals.

Marketing stays at [nebu.quest](https://nebu.quest/). The live operator node stays at `vc.friskydev.com`. This MVP is the consumer studio.

## What “done” means

- Open `http://localhost:5001/studio`
- Start camera (or **Join without camera**)
- **Open a room**, copy the invite (`/studio?room=<uuid>`)
- A second browser opens that link, starts media, and the mesh connects
- `/ops` is still the operator control plane (Telegram / RTMP / identity)

Out of scope: SFU, Telegram group-call join, deploying over the current `studio.nebu.quest` 525, production env changes.

## Run locally

```bash
cp .env.example .env   # PUBLIC_ROOMS_ENABLED=true, MEDIA_PLANE_ENABLED=true
npm install
npm run dev            # API :8787, UI :5001
```

Open two tabs at `http://localhost:5001/studio`. Create in one, join in the other.

Without `PUBLIC_ROOMS_ENABLED=true`, a second anonymous tab cannot read the room (403). Production already treats a room UUID as an invitation when `AUTH_REQUIRED=true`; signaling still needs `PUBLIC_ROOMS_ENABLED=true` for guests who are not signed in.

## Architecture

```
browser A ── WS /v1/signal (SDP + ICE) ── VC NODE ── browser B
audio/video: A ⇄ B directly
```

- REST: `POST /v1/rooms`, `GET /v1/rooms/:id`
- Signaling: `ws /v1/signal`
- UI route: `/studio` on localhost; any `*.nebu.quest` host (except `/ops`) serves the studio

## Production attach (do not do this without approval)

`studio.nebu.quest` / `app.nebu.quest` / `vc.nebu.quest` currently return **525** (Cloudflare DNS, no origin). Do **not** put the studio on the Pages apex: `nebu.quest` sends `Permissions-Policy: camera=(), microphone=()`.

Suggested attach, after owner OK:

1. Point a Cloudflare tunnel hostname (`studio.nebu.quest`) at the same hermes `vc-node` as `vc.friskydev.com`
2. Set `PUBLIC_ROOMS_ENABLED=true` in `/opt/vc-node.env` and recreate the container
3. Add `https://studio.nebu.quest/**` to the FriskyDev Supabase redirect allow-list
4. Change landing CTAs from `vc.friskydev.com` to `studio.nebu.quest`

Rollback is the existing `vc-node-previous` path in `DEPLOY.md`. Do not rsync a dirty working tree.
