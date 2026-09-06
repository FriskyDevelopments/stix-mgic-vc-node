# Video pipeline — playlist, schedule, sticker overlay

How to queue videos, keep track of what plays next, overlay stickers, and launch a DJ set without the OBS/RTMP/media-url maze.

---

## The problem this solves

The join form currently asks for three URLs (OBS stream relay, media URL, RTMP URL) before you can enter a room. That is an implementation detail leaking into the operator surface. This pipeline collapses it to: **pick a group, load a playlist, go live.**

---

## 1. Playlist — the queue that keeps track

A playlist is an ordered list of media items. Each item is one of:

- `video` — a file path or URL (mp4/webm)
- `audio` — a file or URL (mp3/aac), played as the room audio track
- `image` — a static slide (png/jpg), shown for `duration_ms`
- `sticker` — an overlay asset (png/webp with alpha) composited on top of the current video

```json
{
  "id": "pl_dj_set_01",
  "name": "Friday set",
  "loop": false,
  "items": [
    { "type": "video", "src": "/media/intro.mp4" },
    { "type": "audio", "src": "/media/track1.mp3", "duck_video": true },
    { "type": "video", "src": "/media/v2.mp4" },
    { "type": "sticker", "src": "/media/logo.webp", "x": 24, "y": 24, "w": 160, "until": "end" },
    { "type": "image",  "src": "/media/slide.png", "duration_ms": 8000 }
  ]
}
```

**Tracking rules:**

- The node stores `current_index` and `status` (`idle | playing | paused | ended`) per active room.
- `GET /v1/rooms/:id/playlist` returns the full queue + pointer.
- On item end, advance to `current_index + 1`. When the list ends: stop (default) or loop to 0 if `loop: true`.
- Skipping, reordering, and inserting are all just mutations of the `items` array + pointer — no separate "next video" concept.

**Storage:** playlists live at `/data/playlists/<id>.json` on the node volume (same volume as the MTProto session). They are tenant-scoped in hosted mode.

---

## 2. Schedule — timed drops

A schedule is a playlist bound to wall-clock times. Use it to auto-start a set or drop a video at a known moment.

```json
{
  "id": "sch_fri",
  "playlist_id": "pl_dj_set_01",
  "room_id": "room_abc",
  "entries": [
    { "at": "2026-09-06T21:00:00-04:00", "action": "start" },
    { "at": "2026-09-06T21:45:00-04:00", "action": "skip_to", "index": 3 },
    { "at": "2026-09-06T22:30:00-04:00", "action": "stop" }
  ]
}
```

The node runs a single scheduler loop (one timer per entry, recomputed on mutation). Missed entries are skipped, never replayed — a DJ set that starts late does not rewind.

Hosted: schedules are API-driven. The Automations connector can also fire a "start this playlist" prompt on a cadence if you want the *decision* outside the node, but the actual playback stays on the node.

---

## 3. Sticker overlay

Stickers are alpha PNGs/WebPs composited by ffmpeg onto the active video item. They are playlist items of type `sticker` (see above) **or** a global overlay applied to every item:

```json
{
  "overlay": {
    "src": "/media/brand.webp",
    "x": "W-w-24", "y": 24,
    "opacity": 0.9
  }
}
```

Position strings accept `W`/`H` (frame size) and `w`/`h` (overlay size), evaluated at composite time. Updates to the overlay take effect on the next item boundary (no mid-frame tearing).

There is no animated-GIF sticker path in v1 — spotify artwork is static jpeg and canvas only plays inside spotify's own app, so the overlay is intentionally static. If you need motion, export a short webm loop and add it as a `video` item with `loop: true` behind the main content.

---

## 4. Simplified DJ launch (the Folio move)

The join form stops asking for URLs. One action: **load playlist + join group**. Internally the node:

1. Reads the playlist.
2. Resolves the RTMP publish URL from its own config (the operator never types it).
3. Starts ffmpeg compositing playlist → RTMP.
4. Joins the Telegram group call via the MTProto adapter and attaches the RTMP source.
5. Returns the room as `live`.

Operator-facing steps become:

1. Open Studio → **DJ**.
2. Pick the group from the dropdown (you already have it).
3. Pick a playlist (or "start blank").
4. Hit **Go live**.

No relay URL, no media URL, no RTMP key on screen. Those stay in `/v1/config` for the rare manual override.

The Folio pattern — store the music source id once, launch from that id — applies here: the playlist id is the thing you remember, not the transport.

---

## 5. API surface (v1)

| Method | Path | What |
|---|---|---|
| `GET` | `/v1/playlists` | list |
| `POST` | `/v1/playlists` | create |
| `GET` | `/v1/playlists/:id` | get + pointer |
| `PATCH` | `/v1/playlists/:id` | reorder / insert / replace items |
| `DELETE` | `/v1/playlists/:id` | delete |
| `POST` | `/v1/rooms/:id/playlist/start` | begin playback in a room |
| `POST` | `/v1/rooms/:id/playlist/skip` | advance pointer |
| `POST` | `/v1/rooms/:id/playlist/pause` | pause |
| `GET` | `/v1/schedules` | list |
| `POST` | `/v1/schedules` | create |
| `DELETE` | `/v1/schedules/:id` | delete |

All playlist and schedule mutations are authorized with the operator token. Playlist bytes never leave the node volume unauthenticated.

---

## 6. What this is not

- Not a replacement for OBS. If you want a full NDI/SRT director's console, keep OBS pointed at the node's RTMP ingest and drive it from there — the playlist is the *simple* path, OBS remains the *power* path.
- Not generative. No AI video, no auto-ducking beyond the `duck_video` flag on audio items.
- Not multi-room. One active playlist per room; cross-room scheduling is a later add-on.
