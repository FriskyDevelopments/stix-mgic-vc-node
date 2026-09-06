# Apple Music widget (Folio-sourced, v1)

Spotify artwork is static jpeg and Canvas only plays inside Spotify's own app, so there is no animated artwork to pull for overlays. Apple Music has the same limitation on the public embed side. For v1 we reuse the **Folio** widget pattern: store a music source id once, render from that id, swap the provider later without touching the dashboard.

---

## The Folio move

Folio's pattern (from the existing ClipsFlow / Folio integration) is:

1. Operator pastes or picks a **source id** (playlist / album / station id).
2. The node stores that id against the tenant.
3. Launch and overlay rendering resolve artwork + metadata from the id at runtime.
4. Swapping providers (Spotify → Apple Music → own catalog) is a config change, not a UI rewrite.

We apply that exact pattern to Apple Music now, with Folio's stored id as the seed.

---

## v1 implementation

- **Source id**: reuse the Folio-stored Apple Music id (album or playlist). No new OAuth in v1 — the id is enough for public artwork via the Apple Music embed / iTunes lookup endpoint (`itunes.apple.com/lookup?id=`).
- **Artwork**: fetched server-side, cached on the node volume at `/data/artwork/<id>.jpg`, served to the dashboard and to the sticker/overlay pipeline as a static image source.
- **Now-playing text**: title + artist resolved from the same lookup, shown in the DJ panel.
- **Overlay**: the cached artwork is a valid `image` or `sticker` item in the video pipeline (see VIDEO-PIPELINE.md), so it composites onto the active video automatically.

```json
{
  "music": {
    "provider": "apple_music",
    "source_id": "<folio-stored-id>",
    "artwork_url": "/data/artwork/<id>.jpg",
    "title": "...",
    "artist": "..."
  }
}
```

---

## Later (own provider)

When we ship our own Apple Music integration:

- Replace the iTunes lookup with MusicKit + developer token.
- Add live now-playing via the MusicKit JS API (requires the operator's Apple Music login in the browser).
- Animated artwork still won't exist on the public side — Canvas-equivalent motion requires the Apple Music app, same trap as Spotify. Motion overlays stay webm loops.
- The Folio-stored id remains the migration key: old tenants keep working, new tenants get the richer provider.

---

## What this is not

- Not a live sync of the operator's personal Apple Music queue. v1 is id → artwork, not now-playing → overlay.
- Not OBS-sourced. The artwork is a node-served image, not a browser source the operator has to add in OBS.
- Not free forever. The iTunes lookup is free; a future MusicKit integration needs a $99/yr Apple Developer account, priced into the Pro tier.
