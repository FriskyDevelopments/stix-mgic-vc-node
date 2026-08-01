# Telegram VC Adapter

Join Telegram group calls (voice chats) from the VC node with audio streamed from a file, RTMP ingest, or a WebRTC room relay.

## Prerequisites

1. **A dedicated Telegram account** — not your personal one. Bots cannot join group calls; this requires a MTProto user session.
2. **ffmpeg** installed on the host (for media transcoding).
3. **A Telegram API app** — create one at https://my.telegram.org/apps to get `api_id` and `api_hash`.

## Generating the session string

Run once interactively to log in:

```bash
npx teleproto
```

Follow the prompts (phone number, verification code, optional 2FA password). It prints a session string — that string **is** the account. Store it in 1Password / Frisky Secret Center immediately.

## Environment variables

All three are required for the adapter to activate. If any is missing, the adapter stays disabled and `/v1/telegram-vc/*` returns 503.

| Variable | Description |
|----------|-------------|
| `TELEGRAM_VC_API_ID` | Integer API ID from my.telegram.org |
| `TELEGRAM_VC_API_HASH` | Hex API hash from my.telegram.org |
| `TELEGRAM_VC_SESSION_STRING` | The session string from the step above. **Secret.** |
| `TELEGRAM_VC_DEFAULT_CHAT_ID` | Optional. Default chat/channel ID to join. |
| `TELEGRAM_VC_FFMPEG_TIMEOUT_SECONDS` | Optional. Max runtime for an ffmpeg process (default: 300). |

Provision through 1Password / Secret Center → env injection. Never commit values.

## API

All routes sit under `/v1/telegram-vc/` and require operator auth (same `Authorization: Bearer <token>` as rooms).

### GET /v1/telegram-vc/status

Returns adapter and call state.

```json
{
  "adapter": "telegram-vc",
  "client": { "connected": true, "userId": "123456", "username": "vc_operator" },
  "call": {
    "state": "active",
    "chatId": "9876543210",
    "ssrc": 42981234,
    "activeSource": "file",
    "error": null,
    "joinedAt": 1722534800000,
    "hasTransport": true
  }
}
```

### POST /v1/telegram-vc/join

Join the group call in a chat. The chat must have an active voice chat (started from Telegram).

```json
{ "chatId": "9876543210" }
```

### POST /v1/telegram-vc/leave

Leave the current call. Stops the active media source.

### POST /v1/telegram-vc/source

Switch the active media source. The call must be active.

**File source** — stream a local audio file (loops optional):
```json
{ "type": "file", "config": { "path": "/data/audio/hold-music.mp3", "loop": "true" } }
```

**RTMP source** — ingest from an RTMP endpoint (e.g., OBS → nginx-rtmp):
```json
{ "type": "rtmp", "config": { "url": "rtmp://relay.example.com:1935/live/stream-key" } }
```

**WebRTC relay** — bridge audio from a VC node room into the Telegram call:
```json
{ "type": "webrtc-relay", "config": { "roomId": "uuid-of-the-room" } }
```

### POST /v1/telegram-vc/audio

Push raw PCM audio chunks (for the WebRTC relay source). Binary body, `application/octet-stream`, max 64KB per chunk. Format: s16le, mono, 48kHz.

## Architecture

```
┌─────────────┐         ┌──────────────────┐
│  Operator   │ HTTP    │   VC Node        │
│  (browser)  │────────▶│                  │
└─────────────┘         │  /v1/telegram-vc │
                        │        │         │
                        │        ▼         │
                        │  ┌───────────┐   │     ┌──────────────────┐
                        │  │ MTProto   │   │     │ Telegram SFU     │
                        │  │ Client    │───────▶│ (group call)     │
                        │  └───────────┘   │     └──────────────────┘
                        │        │         │
                        │        ▼         │
                        │  ┌───────────┐   │
                        │  │  ffmpeg   │   │
                        │  │ transcode │   │
                        │  └───────────┘   │
                        │        ▲         │
                        │        │         │
                        │  ┌─────┴─────┐   │
                        │  │  Source   │   │
                        │  │ file/rtmp │   │
                        │  │ /relay    │   │
                        │  └───────────┘   │
                        └──────────────────┘
```

## Security notes

- The session string is equivalent to the account password. If it leaks, the account is compromised. Treat it as a tier-1 secret.
- RTMP URLs are validated: only `rtmp://` and `rtmps://` schemes accepted. Localhost is blocked in production (SSRF prevention).
- File paths are passed directly to ffmpeg. In production, restrict to a known media directory via your deployment config (e.g., mount only `/data/audio`).
- The adapter is single-tenant: one call at a time per node instance. Multiple concurrent calls would need multiple user sessions (multiple accounts).

## Risks

- **Account ban**: Telegram may ban accounts used for automation. Use a dedicated account you're prepared to lose.
- **ffmpeg resource usage**: Each active source spawns an ffmpeg process. The timeout (`TELEGRAM_VC_FFMPEG_TIMEOUT_SECONDS`) prevents runaway processes.
- **No video (yet)**: The current implementation streams audio only. Video requires additional work on the SFU transport layer (rawvideo framing with correct SSRC groups).

## Verifying locally

```bash
# Set env (use actual values from 1Password)
export TELEGRAM_VC_API_ID=12345
export TELEGRAM_VC_API_HASH=your_api_hash
export TELEGRAM_VC_SESSION_STRING=your_session_string

# Start the server
npm run dev

# Check adapter status
curl http://localhost:8787/v1/telegram-vc/status

# Join a group call (chat must have voice chat active)
curl -X POST http://localhost:8787/v1/telegram-vc/join \
  -H "Content-Type: application/json" \
  -d '{"chatId": "YOUR_CHAT_ID"}'

# Start streaming a file
curl -X POST http://localhost:8787/v1/telegram-vc/source \
  -H "Content-Type: application/json" \
  -d '{"type": "file", "config": {"path": "/path/to/audio.mp3", "loop": "true"}}'

# Leave
curl -X POST http://localhost:8787/v1/telegram-vc/leave
```
