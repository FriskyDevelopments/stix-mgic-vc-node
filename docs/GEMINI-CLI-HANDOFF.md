# Gemini CLI handoff — VC Node DJ simplify

Use this with `gemini` CLI or any coding agent. Repo: FriskyDevelopments/stix-mgic-vc-node, branch main.

## Context
- Product: STIX MΛGIC VC NODE — Telegram VC control plane (MTProto user session, not Bot API).
- Runtime: Little Creek VPS (hermes), Cloudflare control plane.
- Commercial: $19/mo hosted = 1 node + 1 operator account + managed hosting. Telegram account is customer-supplied.
- State split (never collapse): subscription ≠ node ≠ telegram connection ≠ adapter.

## Specs already on main (read these first)
- docs/DJ-SIMPLIFY.md — target UX, 3-step launch, bug list
- docs/VIDEO-PIPELINE.md — playlist queue + video schedule
- docs/ROOM-ADMIN.md — mute/kick/pin/end/cam
- docs/APPLE-MUSIC-WIDGET.md — Folio id + iTunes lookup
- docs/OFFER-FREE.md — free admin+stickers, upsell slots
- docs/HOSTED-SKU.md — commercial boundary

## Bugs to fix (priority order)
1. **Ghost join** — `server/telegram-vc-adapter.ts` `handleStdoutLine` drops unmatched replies; multiple JSON lines in one chunk can poison the next join. Fix: queue of pending promises, drain every complete line.
2. **No playback controls** — no pause/skip/stop for media. Add playlist queue API.
3. **No video queue** — add timed schedule with pointer tracking next file.
4. **Hardcoded sticker** — add upload + active sticker, ffmpeg composite.
5. **Cam never on** — auto-enable camera on join via pytgcalls.
6. **Audio routing lie** — Spotify at 100% not reaching voice chat; expose mic source selection.
7. **Pre-flight 403** — `/v1/auth/anonymous` blocked when AUTH_REQUIRED; degrade gracefully.
8. **No room admin panel** — dashboard missing mute/kick/pin/end/cam toggle.
9. **Raw URL fields** — replace with group picker + playlist picker, 3-step launch.
10. **Apple Music** — reuse Folio-stored track id, iTunes artwork lookup, no new OAuth.

## Constraints
- Do not break existing pairing (`beginPairing`/`confirmPairing`) or session custody.
- Do not put MTProto on Cloudflare Workers.
- Keep `HOSTED=false` self-host path working.
- Add tests for every new route.
- Commit to a feature branch, open PR, do not force-push main.

## Acceptance
- `pnpm test` (or repo test command) passes
- New routes documented in README
- No secrets in code
