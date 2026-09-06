# Video pipeline

## Playlist queue

- `/v1/playlists` — create, list, reorder
- pointer tracks what's currently playing
- next/prev/skip endpoints
- timed schedules: queue a video at HH:MM, auto-advance

## Sticker overlay

- ffmpeg composite over the RTMP stream
- position, opacity, duration configurable per sticker
- no OBS source swap needed

## Simplified DJ launch

1. pick group
2. pick playlist
3. hit go live

No more typing three relay URLs. The node handles RTMP, media, and overlay internally.

## Status

Spec only. Routes and scheduler loop not coded yet.