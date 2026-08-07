# Media plane

The control plane was ready and the media plane was a boolean pinned to `false`, so an
operator could start a "session" that carried nothing. This document is what the media
plane is now, what it deliberately is not, and what it would take to close the rest.

---

## What carries a call today: WebRTC rooms

```
  browser A ──┐                                    ┌── browser B
              │  WS /v1/signal  (SDP + ICE only)   │
              └──────────▶  VC NODE  ◀─────────────┘
                              │
                              │  REST /v1/rooms, /v1/media/status
                              ▼
                        room registry (in process)

  audio + video: A ⇄ B directly. Never through the node.
```

- **Rooms** — `POST /v1/rooms` opens one and answers with the room *and* the signalling
  details, so a client never guesses an ICE configuration the node may have changed.
  `GET /v1/rooms` lists **only the caller's own** rooms; there is no route that enumerates
  every room on the node, because a room id is a capability.
- **Signalling** — one WebSocket at `/v1/signal`. It relays `offer`, `answer` and `ice`
  between participants of the same room and forwards nothing else. It never parses SDP.
- **Topology** — full mesh, capped at 8 participants (default 4). A mesh costs each client
  *(n−1)* uploads; past a handful of people it does not degrade, it collapses. An SFU is a
  separate product decision, not a config change.
- **Telemetry** — reported upward from `RTCPeerConnection.getStats()`, never invented.

### Authorization

Two checks, and the second one is the one that matters:

1. The operator token is verified at **upgrade**. With `AUTH_REQUIRED=true` an unauthenticated
   socket is refused before the handshake completes, so it never exists.
2. A relayed message may only address a participant of the **same room the sender joined**.
   Without this, knowing any participant id would let an outsider inject an offer into
   someone else's call.

Plus: message size cap, schema validation on every frame, a flood throttle that closes the
socket (4429), and heartbeats that terminate a half-open connection — a dead socket that
lingers holds a seat in a room that only has a few.

### Telemetry is measured, not modelled

Frame rate, bitrate and packet loss only exist inside a peer connection. The node cannot
see them, so participants `POST /v1/rooms/:id/telemetry` with what `getStats()` measured and
the session snapshot serves that back with its age. Nothing measuring means zeros and
`telemetrySource: "unavailable"`.

Before this, `/v1/sessions/start` answered 92% signal, 42 ms latency and 2500 kbps with
nothing connected at all, while reporting `source: "live-api"`. The README's promise that
adapters were "not faked as live" was true of the adapters and false of the metrics
printed beside them.

---

## What does not carry a call, and why

`GET /v1/media/status` reports **per adapter**, because one boolean cannot say "can host a
WebRTC room, cannot join a Telegram group call". Each unavailable adapter carries its reason.

| Adapter | State | Why |
|---|---|---|
| `webrtc` | `ready` with TURN, `degraded` without | Without a relay, peers behind symmetric NAT or a restrictive firewall never connect |
| `telegram-vc` | `not_implemented` | Joining a Telegram group call is **MTProto**, not the Bot API. A bot token cannot do it at all — it needs a **user session**, a real account credential with real account risk |
| `discord-voice` | `not_implemented` | Reachable with `@discordjs/voice`, but **audio only**: Discord grants bots no camera or screen share |
| `rtmp` | `not_implemented` | Needs `ffmpeg` on the host, and for Telegram the stream key itself comes from MTProto |

A false `ready` here sends an operator into a live session that will never connect, which
is why none of these is stubbed to look available.

---

## Owner decisions

1. **TURN, or accept that some callers cannot connect.** STUN alone covers most home and
   office networks and nothing else. A relay costs bandwidth — that is the trade, and it is
   a budget decision, not a technical one. *Recommendation:* run coturn on the same box the
   node is on; put the credentials in the Secret Center and set `TURN_*`.
2. **Telegram video chat: is a user session acceptable?** This is the one that decides
   whether "VC" ever means a Telegram group call rather than a browser room. It needs an
   MTProto user session — an account that can be rate-limited or banned — plus a Node
   binding or a Python sidecar (`pytgcalls`). *Recommendation:* do not put the founder's
   account behind it; if this goes ahead, a dedicated account, and treat the session string
   as a top-severity secret.
3. **Discord: worth it for audio only?** DJ Mode would work; video never will.
   *Recommendation:* build it only if DJ Mode is the point of Discord support.
4. **Mesh or SFU.** The cap is 8 and honest. Anything larger — an audience, a broadcast —
   is an SFU (LiveKit, mediasoup), which is a service to run, not a library to add.

---

## Verifying it

```bash
npm test            # rooms, signalling, media status, telemetry, the browser client
npm run dev         # api on :8787, web on :5000
```

The signalling suite runs a real HTTP server with real WebSocket clients and drives a full
offer / answer / ICE exchange, including the case where a stranger tries to address a
participant of a room they are not in.
