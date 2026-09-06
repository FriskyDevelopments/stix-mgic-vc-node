# DJ Simplify — hand this to ChatGPT / Copilot

Goal: turn the Studio DJ flow from "type three URLs, pray" into "pick group, pick playlist, hit go live." Every bug below is a real failure observed in the live node.

## Bugs observed (fix these first)

1. **Ghost join** — adapter joins, then silently leaves. Root cause: `server/telegram-vc-adapter.ts` `handleStdoutLine` bails when `pending` is null, so a second JSON reply arriving while a request is in flight gets dropped and poisons the next join. Fix: drain every complete line (already partially done in `658aff8`); also make the python side never emit more than one reply per request.
2. **No playback controls** — once a ClipFlow/RTMP file is playing there is no pause, skip, or stop button in the dashboard. Add `POST /v1/telegram-vc/pause`, `/resume`, `/skip`, `/stop` wired to pytgcalls `pause`/`resume`/`stop`.
3. **No video queue** — operator cannot drop "next video file" and have it auto-advance. Add a playlist queue with a pointer: `GET/POST /v1/playlists`, `POST /v1/playlists/:id/items`, `POST /v1/playlists/:id/play`. On `ended` event, advance pointer and call `source()` with the next file.
4. **Sticker overlay is hardcoded/ugly** — no way to upload a custom sticker. Add `POST /v1/stickers` (upload png/webp), store under `/data/stickers/<tenantId>/`, composite via ffmpeg overlay on the media source before RTMP publish. Expose position/size/opacity in Studio.
5. **Cam never turns on for the joining account** — pytgcalls joins audio-only by default. Call `calls.join(chatId, stream=AudioVideoPiped(...))` or explicitly enable camera; default to camera-on for the operator.
6. **Audio routing wrong** — Spotify shows 100% but the VC hears nothing. The node plays an RTMP/file source, it does not capture the host mic or the Spotify desktop app. Add an explicit **audio source picker** in Studio: `mic` | `system` | `file` | `rtmp`, defaulting to the selected playlist. Mic capture needs a virtual sink (PulseAudio/BlackHole) documented in DEPLOY.md.
7. **Pre-flight fails: "Unable to be an anonymous version"** — `POST /v1/auth/anonymous` returns 403 when `AUTH_REQUIRED=true`. Pre-flight must not attempt anonymous auth in hosted mode; gate pre-flight on the real operator session and surface a clear "sign in first" instead of a cryptic error.
8. **Room admin commands missing from dashboard** — mute / kick / pin / end call exist as API routes (`ROOM-ADMIN.md`) but no UI panel. Add a Room Admin card to Studio with those four actions.
9. **Apple Music artwork** — reuse Folio's stored playlist id + iTunes lookup API for cover art (no new OAuth). See `APPLE-MUSIC-WIDGET.md`. Do NOT pull from OBS; OBS is only the preview sink.
10. **ClipFlow file input** — replace the raw URL field with a file picker that uploads to `/data/media/<tenantId>/` and returns a local path the adapter can `play()`.

## Target UX (3 steps, not 9)

1. Select group (dropdown, already exists).
2. Select playlist or upload file (new).
3. Hit **Go Live**. Camera on, sticker on, audio routed, pre-flight green.

Everything else (RTMP URL, media URL, relay URL) is hidden behind an "Advanced" disclosure.

## Out of scope for this pass

- Billing, tenant isolation, encryption at rest (separate PRs).
- Rewriting pytgcalls; only wire the missing methods.
