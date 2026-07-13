# stix-mgic-vc-node

STIX MΛGIC VC NODE — a browser-based operator console for managing live voice and media sessions across Telegram and Discord. Built with React 19, Vite, and Tailwind CSS.

## Production readiness

This SPA is **production-deployable** as an operator shell:

| Capability | Status |
|------------|--------|
| Static hosting (Vercel / Netlify / any SPA host) | Ready — `vercel.json` + `public/_redirects` |
| Persistence without Spark runtime | Ready — `localStorage` via `usePersistedState` |
| Session start/stop API seam | Ready — `src/lib/session-api.ts` (`VITE_API_BASE_URL`) |
| Demo mode (default) | Simulated sessions with honest in-app labeling |
| Live mode | Set `VITE_DEMO_MODE=false` + `VITE_API_BASE_URL` to a real session API |
| Platform auth (Telegram / Discord) | Still mock until server-side OAuth exists |
| Spotify personal source | Real PKCE + refresh when `VITE_SPOTIFY_CLIENT_ID` is set |

**Blocked on backend (not inventable in this SPA):** real Telegram/Discord identity verification, live VC join/relay, real RTMP ingest, ClipsFlow asset API, billing/entitlement truth.

## Run locally

```bash
cp .env.example .env
npm install
npm run dev
```

Default port: **5000**.

## Environment

| Variable | Purpose |
|----------|---------|
| `VITE_DEMO_MODE` | `true` (default) keeps simulated sessions; `false` requires API |
| `VITE_API_BASE_URL` | Live session API base (`POST /v1/sessions/start\|stop\|extend`) |
| `VITE_OPERATOR_TIER` | `free` or `premium` |
| `VITE_DISCORD_CLIENT_ID` | Optional Discord OAuth client ID |
| `VITE_SPOTIFY_CLIENT_ID` | Optional Spotify PKCE client ID |

Redirect URIs (local + production):

- `https://YOUR_DOMAIN/auth/discord/callback`
- `https://YOUR_DOMAIN/spotify-callback`

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local server |
| `npm run build` | Production bundle |
| `npm run preview` | Preview built assets |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript `--noEmit` |
| `npm test` / `npm run test:ci` | Vitest |

## Deploy

### Vercel

Connect the repo. `vercel.json` already configures SPA rewrites and security headers. Set env vars in the Vercel project settings.

### Netlify / static

`public/_redirects` maps OAuth callback paths and SPA fallback to `index.html`.

### GitHub Spark

Still supported for design-time Spark tooling, but runtime state no longer depends on `/_spark/kv`.

## Related repos

stixmagic-bot and stixmagic-web (FriskyDevelopments). Wire a session-control API to `VITE_API_BASE_URL` for live operator mode.
