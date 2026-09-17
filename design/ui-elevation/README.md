# VC Node UI entry

The user requested real functionality only. `main.tsx` now redirects port 5186 to the live same-origin entry:

https://vc.friskydev.com/assets/studio-20260908c.html

The old fixture files below remain as review artifacts and are not imported by the active entry. Do not restore a simulated account or sample player to the user-facing page.

The reviewed, durable source is `/Users/friskypup/Documents/Codex/2026-09-06/he/work/vc-ui-release-20260908c/source`. The main `/` URL has not been cut over; the versioned entry runs against the existing live backend without restarting it.

---

## Historical isolated preview notes

# Isolated VC Node design preview

This preview imports the real current `StudioMasthead`, `StudioMonitor`,
`MediaDisclosure`, `SpotifyPlayer`, React Bits adapters, and application CSS.
It is a design and interaction fixture, not an authenticated media test.

From `/Users/friskypup/stix-mgic-vc-node`:

```sh
node node_modules/vite/bin/vite.js --config design/ui-elevation/vite.config.ts
```

Open `http://127.0.0.1:5186`. The server binds only that loopback address and
requires that exact port. This starts only the isolated frontend; no API or
broadcast server is launched.

To preview a reviewed release checkout instead of the canonical checkout, set
`VC_UI_SOURCE_ROOT` to that checkout's root directory (the parent of `src`) before
the same command. Both component aliases and the main CSS import resolve against
that checkout. The fourth Video rundown source appears when its StudioMonitor
supports it. This variable selects local source files; it does not load secrets.

To build the isolated preview only:

```sh
node node_modules/vite/bin/vite.js build --config design/ui-elevation/vite.config.ts
```

The preview output stays in `design/ui-elevation/dist`. Do not deploy it as the
production app. Production configuration and entry points are not modified.

## What to try

- All native disclosures begin collapsed. The Music shortcut opens Spotify.
- The sample player supports pause/play, next/previous, volume, device selection
  with provider-style readback, track search, and playlist/track selection.
- The recovered player's queue endpoint returns an empty sample queue plus the
  current sample track. Ordered setlist playback requests remain local fixtures.
- Search `Afterglow`, `Slow`, `Blue`, or `sample`. Use Your playlists to browse
  the two sample collections. Selecting a song does not play it until Play song.
- Restore sample music resets local fixtures. View disconnected shows the real
  disconnected player with Connect Spotify disabled.
- Select Camera, Screen, or Video & mix. Setup buttons update a local note.
  All streams stay null; there is no camera, microphone, or screen request.

## Isolation and limitations

The fixture replaces `window.fetch` before production component modules load.
It has no saved original fetch and never forwards requests. Recognized Spotify
paths operate solely on in-memory fixtures; unknown paths return a local 403.
Runtime config has no Spotify client ID, identity, Telegram bot, or media plane.
The Vite config does not load `.env` and replaces build environment values with
an explicit credential-free object. There is no production API proxy.

The preview also blocks ordinary external-link navigation and popup opening.
CSP permits only local scripts/styles/assets and the loopback Vite websocket;
remote images, media playback, frames, and external API connections are blocked.
Permissions Policy disables camera, microphone, and display capture.

Sample artwork is an SVG data URL generated here. There are no remote images,
audio files, credentials, or provider logins. The library uses its production
icon fallback because its HTTPS artwork validator deliberately rejects data URLs.

Controls simulate state only: no sound is rendered, no WebRTC room is created,
no group is contacted, no moderation or chat posting occurs, and real Spotify,
Apple Music, camera, and Telegram media behavior remain unverified by this page.
