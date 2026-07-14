# stix-mgic-vc-node

STIX MΛGIC VC NODE — a browser-based operator console for managing live voice and media sessions across Telegram and Discord. Built with React 19, Vite, and Tailwind CSS (generated with GitHub Spark).

## Alpha status

**Alpha — local demo only.** This build demonstrates the operator control surface end-to-end in the browser. Session metrics, RTMP uplink, ClipsFlow intake, and most “connected to Telegram/Discord infrastructure” signals are **simulated**. Do not treat this as production session control.

| Layer | Status |
|-------|--------|
| Operator UI loop (platform → protocol → start/stop → diagnostics) | Working (client-side) |
| Virtual camera preview | Real browser `getUserMedia` |
| Telegram / Discord auth | **Mock** — demo identity only |
| Spotify personal source | Optional real PKCE when `VITE_SPOTIFY_CLIENT_ID` is set |
| Telegram / Discord / RTMP infrastructure | Not connected |

## Run (alpha)

```bash
npm install
npm run dev
```

Open the URL Vite prints (default port **5000**). No env vars are required for the core demo loop.

### Optional env

Copy `.env.example` to `.env` and set:

- `VITE_DISCORD_CLIENT_ID` — enables Discord OAuth redirect (callback still completes with a mock demo user until real token exchange exists)
- `VITE_SPOTIFY_CLIENT_ID` — enables Spotify PKCE login for personal DJ audio

Redirect URIs for local alpha:

- `http://localhost:5000/auth/discord/callback`
- `http://localhost:5000/spotify-callback`

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local alpha server |
| `npm run build` | Production bundle |
| `npm run preview` | Preview built assets |
| `npm run lint` | ESLint |
| `npm test` | Unit / smoke tests |
| `npm run test:ci` | CI test run |

## Intended purpose

A unified command surface for routing, monitoring, and managing live session presence across Telegram and Discord, with OBS integration, RTMP streaming, session management, and real-time diagnostics.

## Related repos

stixmagic-bot and stixmagic-web (both under the FriskyDevelopments organization).
