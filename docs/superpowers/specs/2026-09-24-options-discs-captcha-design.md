# "Options" — picture-discs over a moving background + branded captcha gate

Date: 2026-09-24. Status: design approved in chat (all three modes as options). Repo: `~/stix-mgic-vc-node`, branch `feat/supabase-identity-sync-20260916`.

## 1. What this is

One new route, `/options`, in the VC node web app. A full-viewport immersive
surface: circular **picture-discs** (real imagery under a vinyl treatment —
groove sheen, center label, spindle hole), aligned in formation and slowly
moving, floating over an animated canvas background. A **branded Altcha
captcha** is the entry gate: visitors verify before the discs unlock. Three
selectable modes share one kit and differ only in content source, palette,
and copy:

| Mode | Name | Disc pictures | BG mood | Brand voice |
|---|---|---|---|---|
| A | Orbit Room | Live Spotify album art (`useSpotifySession` / playback item image) + STIX library fallback | Ice `#8FC1FF` aurora on near-black | STIX MΛGIC / FR!SKY |
| B | Aura Discs | 29 LORE ghost moods (params + SVG art from `lore-frisky/shared/ghost-moods.ts`, vendored — no cross-repo import) | Aura-gradient wash, per-disc accent glow | LORE Auras |
| C | Showcase | Curated static set in `public/options/` (shipped images, no live source) | Neutral violet/cyan party wash | Generic pack |

Mode is chosen by a segmented control on the page (persisted in
localStorage). Deep-linkable: `/options?mode=orbit|auras|showcase`.

## 2. Non-goals

- No change to the existing invisible Altcha enforcement on
  signup/login/contact (`src/lib/altcha.ts`, `server/altcha.ts` stay as-is).
- No change to existing routes, control plane, or backend. No new API
  endpoints — the widget reuses `GET /v1/altcha/challenge` + the existing
  verify path.
- No three.js. No new animation deps (framer-motion already present for UI
  transitions only). No embla — the formation is bespoke, not a carousel.
- Mode B does not import from `~/lore-frisky` at build time; mood data +
  needed SVG art are vendored into the VC node repo.

## 3. Architecture

New, self-contained units under `src/options/` + one route hook in
`src/main.tsx` (`if (path === '/options') return <OptionsPage />`, lazy like
OverlayStudio). Shared kit + per-mode content adapters:

- `OptionsPage.tsx` — route root: mode switcher, gate state, layout.
- `ModeSwitch.tsx` — segmented control (orbit/auras/showcase), URL param +
  localStorage sync.
- `DiscFormation.tsx` — the aligned formation: shallow arc of 5–9 discs,
  slow rotation (~12s/rev, CSS), pointer 3D tilt, hover/focus pause, click to
  dock center + metadata panel. Pure presentational; takes `Disc[]`.
- `PictureDisc.tsx` — single disc: `<img>` under vinyl overlay
  (`repeating-radial-gradient` grooves + conic sheen, center label, hole).
- `MovingBackground.tsx` — canvas 2D aurora ribbons + grain/particles,
  ~30fps cap, pauses offscreen (IntersectionObserver), `aria-hidden`,
  per-mode palette prop.
- `CaptchaGate.tsx` — visible `altcha-widget` web component (new `altcha`
  npm package), FR!SKY-dark skin via CSS custom props, custom strings
  ("Verifying you're pack…"), brand footer + logo mark, styled failure
  state. Emits verified payload upward; page unlocks discs on success.
- `modes/orbit.ts`, `modes/auras.ts`, `modes/showcase.ts` — content
  adapters returning `Disc[]` + palette + copy. Orbit reads the Spotify
  session hook; unauthenticated → STIX library fallback discs.
- `options.css` — route styles. Honors `prefers-reduced-motion` (freeze
  rotation + canvas still frame).

Reuse: `ParticleField`/`AnimatedGradient` from `src/components/wow/` as the
particle layer inside `MovingBackground` where they fit; `GlassCard`,
`Toaster`/`sonner` for notices.

## 4. Data flow

1. Page loads → mode resolved (URL param → localStorage → default `orbit`).
2. Adapter supplies discs + palette; BG + formation render blurred/locked
   behind the gate.
3. `CaptchaGate` fetches challenge from `/v1/altcha/challenge`, widget
   solves, payload verified against the existing server path.
4. Verified → discs unlock (unlock animation), mode switcher enabled.
5. Challenge endpoint down/non-200 → gallery-only fallback with notice
   ("verification unavailable — preview mode"); the page never dead-ends.

Gate honesty note: the gate is a proof-of-work speed-bump, not an
enforcement boundary. The solved payload is not spent against a protected
action (there is none on this route — it only unlocks client-side content),
and `Continue to preview` bypasses it by design. If a future mode hides
real content or actions behind the gate, that work must POST the payload to
`verifyAltcha` server-side (same pattern as `/v1/account/register`) and
remove the bypass.

## 5. Error handling

- No images (Spotify logged out + empty library): fallback discs, notice
  toast, never empty formation.
- Widget scriptfails to load: text fallback ("verification unavailable"),
  gallery-only mode.
- Solve failure: branded retry state, no red error boxes; 3 fails → fresh
  challenge auto-fetched.
- Canvas unsupported: static gradient poster frame, same palette.

## 6. Testing

- Vitest + jsdom, colocated `*.test.ts(x)` like the repo does:
  mode-resolve logic (param/localStorage/default), adapter output shapes,
  gate state machine (locked → verifying → unlocked / fallback), reduced
  motion flag.
- `npm run typecheck`, `npm run build` green.
- Visual proof per standing rule: real screenshots at final desktop +
  mobile widths of gate state, unlocked formation, and one mode switch —
  taken before calling it done.

## 7. Rollout

- Route is additive and ungated; no env vars, no backend deploy needed.
  Prod Zeabur auto-deploys from main push as usual.
- Follow-up (out of scope): wire Mode A dock-to-center into DJ Mode audio
  source; promote `altcha` widget skin to a shared brand package.
