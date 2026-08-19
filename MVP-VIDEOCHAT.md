# VC NODE — Video-chat MVP (browser WebRTC rooms)

This is the **arranque** doc for the video-chat MVP: two or more people join a room and get
stable bidirectional audio/video, with the node acting only as the **signaling** authority
(SDP + ICE relay). Media travels **peer to peer**, never through the node.

> Scope note: "VC NODE" also carries a control plane (Telegram/Discord auth, sessions) and
> a set of **deferred** media adapters (Telegram VC / Discord voice / RTMP). Those are NOT
> part of this MVP — see `MEDIA-PLANE.md`. This doc is only the browser-to-browser call.

## MVP cut (what "done" means)

In scope — the minimum for a real call:

- Create a room (`POST /v1/rooms`) and join by id.
- Signaling over one WebSocket (`ws /v1/signal`): relays `offer` / `answer` / `ice`,
  scoped to the sender's own room; never parses SDP.
- ICE with STUN by default; **TURN optional** (documented below) for symmetric-NAT peers.
- Publish local camera/mic to every peer and subscribe to their tracks (full mesh, cap 8,
  default 4).
- Perfect-negotiation glare handling + early-ICE-candidate queueing (in `webrtc-client.ts`).
- Clean leave / teardown, and **basic signaling reconnection** (added here).

Out of scope (nice-to-have, explicitly deferred):

- SFU / large rooms (mesh collapses past a handful of peers — an SFU is a separate product).
- Telegram VC join, Discord voice, RTMP ingest (need MTProto / ffmpeg — see `MEDIA-PLANE.md`).
- Renegotiation on mid-call device/track changes (tracks are attached at join).
- Media-level metrics beyond the participant-reported `getStats()` telemetry.

## Run it locally

```bash
cp .env.example .env      # optional; sensible dev defaults exist
npm install
npm run dev               # API on 127.0.0.1:8787, UI on http://localhost:5000
```

Production-style single process:

```bash
npm run build
OPERATOR_TOKEN_SECRET=... NODE_ENV=production npm start   # binds 0.0.0.0:$PORT
```

## Verify it works (evidence, not "should work")

1. **Automated** — `npm test`. The WebRTC path is fully green:
   - `src/lib/webrtc-client.test.ts` — 28 tests, the full client state machine,
     including distinct anonymous identities for separate browser tabs.
   - `src/lib/webrtc-reconnect.test.ts` — 3 tests, the reconnection added here.
   - `server/signaling.test.ts` (25) + `server/rooms.test.ts` (24) — real HTTP + real
     WebSocket clients driving a full offer/answer/ICE exchange, including a stranger being
     refused from a room it never joined.
   - Current result: **116/116 tests pass** across 9 files.

2. **Two live peers through the running node** (headless signaling proof):
   start the API, `POST /v1/rooms`, open two `ws /v1/signal` clients with distinct
   `clientId`s, join, and drive `offer → answer → ice`. Expect the node to relay
   `peer-joined`, `offer(from A)`, `answer(from B)`, `ice(from A)` and to refuse a
   non-member addressing a participant. (This was run and passed.)

3. **Two browser tabs (visual A/V)** — open `http://localhost:5000` in two tabs (or two
   machines), create a room in one, join it by id in the other, allow camera/mic in both.
   Each tab should show the other's video. Behind symmetric NAT this needs TURN (below).

## Environment & secrets

Client (`VITE_*`) and server vars are documented in `README.md`. For the call itself:

| Var | Purpose |
|-----|---------|
| `STUN_URLS` | Comma-separated STUN URLs. Defaults to Google STUN. |
| `TURN_URLS` / `TURN_USERNAME` / `TURN_CREDENTIAL` | Optional TURN relay for NAT traversal. |
| `OPERATOR_TOKEN_SECRET` | Required in production; signs operator tokens. |
| `AUTH_REQUIRED` | `true` forces an operator token on the signaling upgrade. |

**Secrets are not in this repo and must not be.** TURN credentials and any API secrets live
in the **Secret Center / 1Password** and are injected as env at deploy time
(`op:// → env`). This MVP ships **no** TURN credential — `GET /v1/media/status` honestly
reports `webrtc: degraded` until one is configured.

### TURN — the one decision that gates "all callers can connect"

STUN alone connects most home/office networks. It does **not** connect peers behind
symmetric NAT or restrictive firewalls; those need a TURN relay. Recommended: run **coturn**
on the same host as the node, put its credentials in the Secret Center, and set the `TURN_*`
vars. Without it the call still works for most people and says so, rather than failing
silently.

## Deployment (proposal — do NOT deploy to prod without approval)

The media plane is **stateful**: an in-process room registry plus long-lived WebSocket
connections. That shapes where it can run.

- **Static UI** → Cloudflare Pages or Vercel (already wired: `vercel.json`). Fine on the
  Cloudflare account (`e2a7eccb`).
- **Signaling node** → needs a persistent Node process with WebSocket support. Plain
  Cloudflare **Workers cannot** run this `ws` server as-is; a Workers port would mean
  rewriting the room registry + signaling onto **Durable Objects** (real work, not a config
  flip). The pragmatic MVP path is to run the existing Node server on a **stateful host**
  — one of the off-GCP boxes (e.g. **hermes** or **Ragnar**) — with Cloudflare in front for
  DNS/TLS/proxy. `render.yaml` and `Dockerfile` are already present for a container deploy.
- **TURN (coturn)** → same host as the node, credentials from the Secret Center.

Suggested first target: Node server + coturn on hermes/Ragnar, Cloudflare-proxied hostname,
static UI on Cloudflare Pages/Vercel. Ship to prod only after owner approval.

## What changed in this branch

- `src/lib/webrtc-client.ts` — added opt-in signaling **reconnection**: on an unexpected
  socket drop the client re-opens and re-joins the same room with capped exponential
  backoff, tearing down and rebuilding the mesh from the fresh `joined` snapshot; an
  intentional `close()` never reconnects.
- `src/components/CallStage.tsx` — enabled `reconnect` for the live call UI.
- `src/lib/webrtc-reconnect.test.ts` — tests for reconnect, intentional-close, and the
  attempt cap.
- `src/App.tsx` — exposes the real browser-room panel during local development while the
  deferred Telegram/Discord control surfaces remain simulated.
- `vite.config.ts` — proxies WebSocket upgrades to the signaling node in development.
- `src/lib/webrtc-client.ts` — gives every anonymous browser tab a distinct,
  reconnect-stable client identity.
