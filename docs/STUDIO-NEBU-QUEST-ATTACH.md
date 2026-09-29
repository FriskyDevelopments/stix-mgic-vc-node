# studio.nebu.quest attach checklist

How the consumer studio goes live — without touching production, DNS, tunnels, or
live env until the owner says go. This is the Phase D deliverable for the NEBU MVP
program (order A, then D+C, then B): the attach runbook for `studio.nebu.quest`.

Status: DOCUMENT ONLY. Every step below is gated on explicit owner approval, and
step 0 is a hard stop: production (`vc.friskydev.com`), DNS, tunnels, and
`/opt/vc-node.env` stay untouched until then.

---

## 0. Hard gates (read before anything else)

- NEVER publish to production or touch live `nebu.quest`, `vc.friskydev.com`, DNS,
  tunnels, or live env. The studio attach changes all four — it does not start
  without owner OK.
- NEVER commit secrets. `BOT_TOKEN` rotation, OAuth clients, and the Telegram
  number are owner-held; infra values below are placeholders, not values.
- Do not rsync a dirty working tree to hermes (`DEPLOY.md`). The attach assumes a
  clean tree on the merge commit the owner approved.
- `studio.nebu.quest` / `app.nebu.quest` / `vc.nebu.quest` currently return **525**
  (Cloudflare DNS, no origin). That stays true until step 2.

## 1. What the code already guarantees (verified 2026-09-28, branch `feat/mvp-rooms-dj`)

- `POST /v1/rooms` + `ws /v1/signal` admit anonymous guests ONLY when
  `AUTH_REQUIRED=true` AND `PUBLIC_ROOMS_ENABLED=true` — an explicit opt-in, never
  a default (`server/app.ts` rooms middleware, `server/signaling.ts` upgrade
  authenticator, `server/env.ts` production guard).
- The signaling relay scopes every `offer` / `answer` / `ice` / `host-control`
  message to the sender's own room; cross-room injection is refused with
  `peer_not_found` (`server/signaling.ts`, covered by
  `server/signaling.test.ts` "completes a public-room signaling exchange").
- A room UUID is the invitation capability: with public rooms on, any guest who
  holds the UUID can read the room and join it over the socket; nothing else is
  listable (`GET /v1/rooms` stays per-operator).
- TURN/ICE credentials are minted per admission and never disclosed to a socket
  that has not joined a room (`welcome` carries no `iceServers`).
- `POST /v1/media/sfu/session` (Cloudflare Realtime bootstrap) requires a proven
  operator identity and answers 401 — never 503 — to anonymous callers, so the
  SFU configuration is not probeable from the public internet.
- Telemetry is clamped to finite numbers in physical range before storage; peers
  cannot push NaN/Infinity into other browsers' room views.

## 2. Attach steps (owner executes or explicitly delegates each one)

### Step 1 — Tunnel hostname (owner: Cloudflare + hermes)

Point a cloudflared tunnel hostname `studio.nebu.quest` at the SAME hermes
`vc-node` container that serves `vc.friskydev.com` (127.0.0.1:8797). No new
container, no new port — one process, one TLS terminator, one tunnel config entry.

Verify (no browser needed):

```bash
curl -fsS https://studio.nebu.quest/healthz | jq '{ok, publicRoomsEnabled}'
```

Expected before step 3: `ok: true`, `publicRoomsEnabled: false`. The studio UI
loads but a second anonymous tab gets 403 on the room — correct until step 3.

Rollback: remove the hostname from the tunnel config. `vc.friskydev.com` is
unaffected throughout.

### Step 2 — Supabase redirect allow-list (owner: Supabase dashboard)

Add `https://studio.nebu.quest/**` to the FriskyDev project's Redirect URLs
(Dashboard → Authentication → URL Configuration → Redirect URLs), alongside the
existing `https://vc.friskydev.com/**` and
`https://stix-mgic-vc-node.zeabur.app/**` entries (`DEPLOY.md` § Identity).

Until this is set, Supabase resolves the OAuth callback to the project Site URL
(`https://www.myfenrir.com`) and sign-in dead-ends. Verify with the same
`generate_link` probe as `DEPLOY.md`, pointed at `studio.nebu.quest`:

```bash
curl -s -X POST "$SB/auth/v1/admin/generate_link" \
  -H "apikey: $SR" -H "authorization: Bearer $SR" -H 'content-type: application/json' \
  -d '{"type":"magiclink","email":"<throwaway>","redirect_to":"https://studio.nebu.quest/"}' \
  | grep -o 'redirect_to=[^&"]*'
```

It must echo `studio.nebu.quest`. If it echoes `www.myfenrir.com`, stop — do not
proceed to step 3.

### Step 3 — Enable public rooms in the live env (owner: hermes)

Set `PUBLIC_ROOMS_ENABLED=true` in `/opt/vc-node.env` and RECREATE the container
(`docker restart` does not re-read `--env-file` — `DEPLOY.md` § Identity).

Verify from the CLI:

```bash
curl -fsS https://studio.nebu.quest/healthz | jq '{publicRoomsEnabled}'
# → true
```

Then the two-tab proof from `NEBU-MVP.md`: open
`https://studio.nebu.quest/studio` in two browsers, create a room in one, open
the `/studio?room=<uuid>` invite in the other. Both join; media is peer to peer.

Rollback: set `PUBLIC_ROOMS_ENABLED` back (or unset), recreate the container.
Existing rooms drain through the normal empty-room TTL; the kept
`vc-node-previous` path in `DEPLOY.md` still applies.

### Step 4 — coturn TURN relay (owner: hermes + Secret Center/1Password)

STUN alone connects most home/office networks. Peers behind symmetric NAT or a
restrictive corporate firewall need TURN, which relays media and costs bandwidth
(`MVP-VIDEOCHAT.md` § "TURN — the one decision that gates all callers").

1. Run **coturn** on the same hermes box as the node (same-host recommendation
   from `MVP-VIDEOCHAT.md` and `MEDIA-PLANE.md`).
2. Put the credentials in the Secret Center / 1Password — never in git — and
   inject as env (`op:// → env`).
3. Set `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` in `/opt/vc-node.env` and
   recreate the container. (`CLOUDFLARE_TURN_KEY_ID` +
   `CLOUDFLARE_TURN_KEY_API_TOKEN` is the alternative: per-call minted relay
   credentials, no static secret in the browser path. Either one flips
   `/v1/media/status` `webrtc` from `degraded` to `ready`.)
4. Verify: `GET /v1/media/status` reports `webrtc: ready`; a call between a
   symmetric-NAT peer and a normal peer connects.

Without TURN the studio still works for most callers and says so honestly
(`webrtc: degraded` with the reason in plain language) rather than failing
silently. Shipping without TURN is a product decision, not a blocker.

### Step 5 — Landing CTA cutover (owner decision, separate OK)

Change landing CTAs from `vc.friskydev.com` to `studio.nebu.quest`. This touches
the `nebu-quest` bundle — it needs its own owner OK and its own `./verify.sh`
run; it is NOT covered by the approval for steps 1–4.

Also note: do NOT put the studio on the Pages apex. `nebu.quest` sends
`Permissions-Policy: camera=(), microphone=()` — camera/mic stay dead there by
browser policy (`NEBU-MVP.md` § Production attach).

## 3. Owner-supplied values (nothing below is in this repo)

| Needed for | Owner holds | Goes to (never git) |
|---|---|---|
| Telegram bot token rotation (`BOT_TOKEN` — all live tokens for bot 8113796108 revoked) | New token via @BotFather | `/opt/vc-node.env` on hermes + Zeabur env |
| OAuth clients (Google / Apple / Microsoft via Supabase + Better Auth) | Provider consoles + Supabase dashboard | Supabase project settings; `GOOGLE/APPLE/MICROSOFT_CLIENT_*` env |
| Telegram pairing number (MTProto operator account) | The operator's phone | `scripts/ashy_telethon_setup.py` pairing on the node |
| TURN credential (static coturn) or Cloudflare TURN key pair | Secret Center / 1Password | `TURN_*` or `CLOUDFLARE_TURN_KEY_*` env |
| Supabase service-role key (only for the `generate_link` verify probe) | Supabase dashboard | Shell env `$SR` for one command, never stored |

## 4. What "attached" means (exit criteria)

- `https://studio.nebu.quest/healthz` → `ok: true`, `publicRoomsEnabled: true`.
- Two anonymous browsers complete create → invite → join → media over the studio
  hostname, no operator token involved.
- `GET /v1/media/status` `webrtc` state is a conscious choice (`ready` with TURN,
  or `degraded` with the reason acknowledged).
- Supabase social sign-in on the studio hostname returns to the studio, not to
  `www.myfenrir.com`.
- No secret committed, no DNS/tunnel/live-env change beyond the four approved
  steps, rollback path (`vc-node-previous` + tunnel hostname removal) confirmed.
