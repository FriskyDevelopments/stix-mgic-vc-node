# stix-mgic-vc-node

STIX MΛGIC VC NODE — a browser-based operator console for managing live voice and media sessions across Telegram and Discord. Built with React 19, Vite, and Tailwind CSS (generated with GitHub Spark).

## Status

Active scaffold with a working UI. The interface (session controls, audio visualizer, device selector, live preview, Spotify track picker, RTMP stream config) is implemented and runnable.

**Note:** the platform authentication in `src/lib/auth.ts` is currently a MOCK. Telegram and Discord login returns hardcoded demo users and does not verify identity or perform a real OAuth token exchange. Do not use the connected state to gate access to real infrastructure until a real server-side auth flow is added.

## Configuration

Set these environment variables (e.g. in a gitignored `.env` file): `VITE_DISCORD_CLIENT_ID` (Discord OAuth client ID) and `VITE_SPOTIFY_CLIENT_ID` (Spotify client ID, public, PKCE flow).

## Intended purpose

A unified command surface for routing, monitoring, and managing live session presence across Telegram and Discord, with OBS integration, RTMP streaming, session management, and real-time diagnostics.

## Related repos

stixmagic-bot and stixmagic-web (both under the FriskyDevelopments organization).
