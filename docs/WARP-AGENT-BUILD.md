# WARP-AGENT-BUILD — hand this to Warp / Codex / Factory / Aggie

You are a coding agent with repo access. Repo: `FriskyDevelopments/stix-mgic-vc-node`, branch `main`.
Work on a feature branch `feat/dj-simplify`, open a PR when done. Do NOT force-push main.

## Read these first, in this order
1. `docs/DJ-SIMPLIFY.md` — target UX + all 10 bugs
2. `docs/VIDEO-PIPELINE.md` — playlist queue + pointer + scheduler
3. `docs/ROOM-ADMIN.md` — mute/kick/pin/end + cam auto-on
4. `docs/APPLE-MUSIC-WIDGET.md` — Folio id + iTunes lookup
5. `docs/OFFER-FREE.md` — free admin+stickers, upsell slots
6. `docs/GHOST-JOIN-FIX.md` — stdout line-drain bug
7. `PRD.md` + `MEDIA-PLANE.md` — architecture
8. `server/telegram-vc-adapter.ts` — TS bridge (already has line drain)
9. `scripts/telegram_vc_adapter.py` — python side, the real bug lives here
10. `server/app.ts` — routes, pre-flight, auth

## The actual bugs (code, not vibes)

### 1. Ghost join — python side, NOT the TS side
`server/telegram-vc-adapter.ts` already drains every complete line. The real bug is `scripts/telegram_vc_adapter.py`:

```python
for line in sys.stdin:
    try:
        request = json.loads(line)
        ...
        output({"ok": True, "result": result})
    except Exception as error:
        output({"ok": False, "error": str(error)[:240]})
```

`for line in sys.stdin` is **block-buffered**. If two JSON replies flush close together, or a partial line arrives, the next `json.loads` can fail or the reply can land on the wrong pending promise. Fix:

- Replace the `for line in sys.stdin` loop with an explicit line buffer that reads `sys.stdin.buffer`, splits on `\n`, and only `json.loads` complete lines.
- Wrap the whole request handler in `try/finally` so **exactly one** reply is emitted per input line, even on exception.
- Add a unit test: feed two JSON lines in one chunk → two replies, no poison.

### 2. No playback controls
Add to `telegramVcAdapter` + python `Adapter`:
- `pause()` → `self.calls.pause(self.chat_id)`
- `resume()` → `self.calls.resume(self.chat_id)`
- `skip()` → leave current, advance playlist pointer, play next
- `stop()` → `self.calls.leave_call(self.chat_id)` + clear source
Routes: `POST /v1/telegram-vc/pause`, `/resume`, `/skip`, `/stop`. Dashboard buttons wired.

### 3. Video queue + pointer
New module `server/playlist-store.ts`:
- `GET /v1/playlists` → list
- `POST /v1/playlists` → create {name}
- `POST /v1/playlists/:id/items` → {file|url, duration?}
- `GET /v1/playlists/:id` → {items, currentIndex, playing}
- `POST /v1/playlists/:id/play` → start from index 0
- `POST /v1/playlists/:id/next` → advance pointer
Persist to `/data/playlists/<tenantId>.json`. On `ended` event (pytgcalls), auto-advance and call `source(next)`.

### 4. Sticker overlay
- `POST /v1/stickers` (multipart) → store `/data/stickers/<tenantId>/<id>.png`
- `GET /v1/stickers` → list
- ffmpeg `filter_complex` composites sticker onto outgoing video before RTMP publish. Position/size/opacity from Studio.
- Default sticker: `/assets/stickers/default.png` (ship a simple one).

### 5. Cam auto-on
In `Adapter.join`, use `AudioVideoPiped` (or `calls.join(..., stream=...)`) so the operator joins with camera enabled by default. Add `POST /v1/telegram-vc/cam {on:bool}`.
Also: if a *participant's* cam is off, send a one-time group nudge "cam check" (rate-limited, not spam).

### 6. Audio routing lie
The node plays an RTMP/file source; it does **not** capture the host mic or Spotify desktop. Add `GET /v1/audio/devices` (PulseAudio/BlackHole list) and a source picker in Studio: `mic | system | file | rtmp`. Fix the meter to show real RMS, not hardcoded 100%. Document virtual sink setup in `DEPLOY.md`.

### 7. Pre-flight 403 "anonymous version"
`POST /v1/auth/anonymous` returns 403 when `AUTH_REQUIRED=true`. Pre-flight must:
- If entitled (real operator session present) → pass, skip anonymous.
- If self-host (`HOSTED=false`) → soft warning, not hard fail.
- Never show "Unable to be an anonymous version" as a blocking error.
Gate the check behind entitlement, move it after session check.

### 8. Room admin panel
Dashboard card: Mute / Kick / Pin / End call. Wire to existing routes from `ROOM-ADMIN.md`. Add cam toggle.

### 9. UI simplify — 3 steps
Studio join flow collapses to:
1. Select group (dropdown, exists)
2. Select playlist or upload file (new file picker → `/data/media/<tenantId>/`)
3. **Go Live**
Hide RTMP/OBS/media URL fields behind an "Advanced" disclosure. ClipFlow file picker replaces raw URL.

### 10. Apple Music artwork
Reuse Folio-stored track id. iTunes lookup `https://itunes.apple.com/lookup?id=<id>` for cover art. No new OAuth. Fallback placeholder. Do NOT pull from OBS.

## Constraints (non-negotiable)
- Do not break `beginPairing` / `confirmPairing` or session custody (`0600`, never returned by API).
- Do not put MTProto on Cloudflare Workers.
- Tenant paths: `/data/mtproto/tenants/<id>/`, `/data/playlists/<id>.json`, `/data/stickers/<id>/`.
- One connected account per $19 node.
- Keep `HOSTED=false` self-host path working.
- Add tests for every new route. `pnpm test` (or repo test cmd) must pass.
- No secrets in code. No `console.log` of session bytes.

## Acceptance
- [ ] `pnpm test` green
- [ ] Manual: join test group → queue 3 videos → skip mid-play → upload sticker → mute participant → see real audio meter — all from dashboard in under 3 clicks
- [ ] Pre-flight no longer 403s on entitled nodes
- [ ] Ghost join gone: two rapid joins both succeed
- [ ] PR opened, not force-pushed to main

## If stuck
- pytgcalls API unsure → check `pytgcalls` docs for `AudioVideoPiped`, `pause`, `resume`, `leave_call`.
- ffmpeg overlay unsure → `overlay=x:y:enable='between(t,0,10)'`.
- Don't invent new auth; reuse `mintOperatorToken` / `verifyOperatorToken`.
