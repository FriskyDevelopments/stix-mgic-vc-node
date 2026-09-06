# COPILOT-BRIEF — hand this to Gemini CLI or Copilot agent

Repo: FriskyDevelopments/stix-mgic-vc-node
Branch: main
Read these first, in order:
1. docs/DJ-SIMPLIFY.md — target UX, 3-step join, all 10 bugs
2. docs/VIDEO-PIPELINE.md — playlist queue + pointer + scheduler
3. docs/ROOM-ADMIN.md — mute/kick/pin/end + cam auto-on
4. docs/GHOST-JOIN-FIX.md — stdout line-drain bug
5. docs/APPLE-MUSIC-WIDGET.md — Folio ID + iTunes lookup
6. docs/OFFER-FREE.md — free admin + stickers pitch
7. PRD.md + MEDIA-PLANE.md for current architecture

## Implementation order (do not skip)

### PR-A: Ghost join fix (server/telegram-vc-adapter.ts)
- Current handler bails when `pending` is null, dropping the second JSON line.
- Replace with a line buffer that drains every complete line per data event.
- Log and drop stray replies instead of killing the next join.
- Add a unit test: two JSON lines in one chunk → both parsed.

### PR-B: Playlist queue API
- New routes under /v1/playlists:
  - POST / add file or url to queue
  - GET / current + upcoming
  - POST /:id/skip, /pause, /resume, /next
- Pointer tracks `currentIndex`, persists to /data/playlists/<tenantId>.json
- Scheduler loop advances on track end or manual skip.
- MediaMTX or ffmpeg pulls the next source automatically.

### PR-C: Sticker overlay
- POST /v1/stickers upload png/gif, stored per tenant
- ffmpeg filter_complex composites sticker onto outgoing video at configurable x/y/scale
- Dashboard: upload, position, toggle, live preview
- Default sticker ships in /assets/stickers/default.png

### PR-D: Room admin panel
- Dashboard section: mute, kick, pin message, end call
- Cam auto-on: on join, if participant cam is off, send nudge + attempt enable via pytgcalls
- Wire to existing adapter methods; add missing ones

### PR-E: Audio routing
- Expose mic source picker in dashboard (list input devices)
- Fix meter: show real RMS, not hardcoded 100%
- Ensure Spotify/media audio is mixed into the pytgcalls outgoing stream, not just local playback
- Add a test: play a file → adapter reports non-zero audio level

### PR-F: Pre-flight fix
- Current pre-flight returns 403 "anonymous version"
- Entitled nodes must pass; anonymous/self-host gets a soft warning, not a hard fail
- Move the check behind entitlement, not before

### PR-G: UI simplify
- Join flow collapses to: select group → select playlist → Go Live
- Relay URLs (OBS/RTMP/media) move under an Advanced disclosure
- ClipFlow file picker replaces raw URL field for media

### PR-H: Apple Music artwork
- Reuse Folio-stored track ID
- iTunes lookup API for cover art (no new OAuth)
- Fallback to static placeholder if lookup fails

### PR-I: Free offer
- Active $19 subs get room admin + stickers free
- Upsell stays on extra operator slots + dedicated VPS
- Update checkout copy accordingly

## Constraints
- Do not break the existing single-operator pairing path
- Do not put MTProto session in a Worker
- Tenant isolation: /data/mtproto/tenants/<id>/, /data/playlists/<id>.json
- Session encryption at rest (envelope)
- One connected account per $19 node
- Keep HOSTED=false path working for self-host template

## Done when
- All PRs merged or stacked
- `npm test` (or pytest) green
- Manual: join a test group, queue 3 videos, skip mid-play, upload a sticker, mute a participant, see real audio meter — all from the dashboard in under 3 clicks
