# Options Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/options` route in the VC node web app — picture-discs in formation over an animated canvas background, behind a branded Altcha captcha gate, with 3 switchable modes.

**Architecture:** New self-contained `src/options/` directory (route root, shared kit, per-mode adapters, styles) plus a lazy route hook in `src/main.tsx`. No backend changes; the gate reuses `GET /v1/altcha/challenge` and the existing verify pattern (`verifyAltcha` on a `{ altcha?: string }` body, 403 on failure).

**Tech Stack:** React 19, TypeScript, Tailwind v4, Canvas 2D (no three.js), `altcha` npm package (new — the visible `altcha-widget` web component; `altcha-lib` already present for solving), vitest + jsdom colocated tests, `sonner` toasts, `cn()` from `@/lib/utils`.

**Spec:** `docs/superpowers/specs/2026-09-24-options-discs-captcha-design.md`

## Global Constraints

- Route is additive: no changes to existing routes, control plane, `src/lib/altcha.ts`, or `server/altcha.ts`.
- No new animation dependencies. No three.js. No embla.
- Mode B vendors data: copy needed mood fields + SVG/PNG art files into the VC node repo under `src/options/vendor/` and `public/options/`; never import from `~/lore-frisky` at build time.
- `prefers-reduced-motion` freezes rotation and renders a still canvas frame.
- Decorative canvas layers are `aria-hidden`; discs are keyboard-focusable buttons with text labels; the gate announces state via `role="status"`.
- Challenge endpoint non-200 → gallery-only fallback with notice; page never dead-ends.
- Standing rule: real screenshots at final desktop + mobile widths (gate, unlocked formation, one mode switch) before done.
- Run `npm run typecheck` and `npm run build` green before finishing; `npm test` for touched suites.

## Review Focus

- Spotify logged out AND library empty simultaneously → formation must still render fallback discs, never an empty row.
- `altcha` package script failing to load (offline/blocked) → text fallback + gallery-only, gate must not hang on a spinner.
- `?mode=bogus` URL param → falls back to default `orbit`, never crashes or blanks.
- Rapid mode switching mid-verify → stale verification must not unlock the newly selected mode's discs incorrectly (gate state resets per mode switch).
- Canvas 2D context null (old browser/SSR) → static gradient poster frame, same palette, no exception.

---

### Task 1: Mode resolution helper + tests

**Files:**
- Create: `src/options/mode.ts`
- Test: `src/options/mode.test.ts`

**Interfaces:**
- Consumes: nothing (pure logic; `URLSearchParams` + `Storage` passed in for testability).
- Produces: `export type OptionsMode = 'orbit' | 'auras' | 'showcase'`, `export const OPTIONS_MODES: OptionsMode[]`, `export function resolveMode(search: string, storage: Pick<Storage,'getItem'> | null): OptionsMode`, `export const MODE_STORAGE_KEY = 'stix-vc-node:options-mode'`, `export function persistMode(storage: Pick<Storage,'setItem'> | null, mode: OptionsMode): void`.

**Contract:** URL `?mode=` wins when valid; else stored value when valid; else `'orbit'`. `persistMode` writes the key, no-ops on null storage or exceptions.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { persistMode, resolveMode, MODE_STORAGE_KEY } from './mode'

function memStore(initial: Record<string, string> = {}): Storage {
  const store: Record<string, string> = { ...initial }
  return {
    get length() { return Object.keys(store).length },
    key(i: number) { return Object.keys(store)[i] ?? null },
    getItem(k: string) { return store[k] ?? null },
    setItem(k: string, v: string) { store[k] = String(v) },
    removeItem(k: string) { delete store[k] },
    clear() { for (const k of Object.keys(store)) delete store[k] },
  }
}

describe('resolveMode', () => {
  it('prefers a valid ?mode= param', () => {
    expect(resolveMode('?mode=auras', memStore({ [MODE_STORAGE_KEY]: 'showcase' }))).toBe('auras')
  })
  it('falls back to stored mode when param is missing', () => {
    expect(resolveMode('', memStore({ [MODE_STORAGE_KEY]: 'showcase' }))).toBe('showcase')
  })
  it('falls back to orbit on bogus param and bogus storage', () => {
    expect(resolveMode('?mode=bogus', memStore({ [MODE_STORAGE_KEY]: 'nope' }))).toBe('orbit')
  })
  it('tolerates null storage', () => {
    expect(resolveMode('', null)).toBe('orbit')
    expect(() => persistMode(null, 'auras')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/options/mode.test.ts`
Expected: FAIL with "Failed to resolve import ./mode" (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
export type OptionsMode = 'orbit' | 'auras' | 'showcase'

export const OPTIONS_MODES: OptionsMode[] = ['orbit', 'auras', 'showcase']

export const MODE_STORAGE_KEY = 'stix-vc-node:options-mode'

function isMode(value: unknown): value is OptionsMode {
  return value === 'orbit' || value === 'auras' || value === 'showcase'
}

export function resolveMode(search: string, storage: Pick<Storage, 'getItem'> | null): OptionsMode {
  try {
    const param = new URLSearchParams(search).get('mode')
    if (isMode(param)) return param
  } catch {
    // Malformed query string: fall through to storage, then default.
  }
  try {
    const stored = storage?.getItem(MODE_STORAGE_KEY)
    if (isMode(stored)) return stored
  } catch {
    // Storage unavailable: fall through to default.
  }
  return 'orbit'
}

export function persistMode(storage: Pick<Storage, 'setItem'> | null, mode: OptionsMode): void {
  try {
    storage?.setItem(MODE_STORAGE_KEY, mode)
  } catch {
    // Private-mode / unavailable storage must never break the page.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/options/mode.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/options/mode.ts src/options/mode.test.ts
git commit -m "feat(options): mode resolution with URL/storage/default fallback"
```

---

### Task 2: Disc model + per-mode adapters (orbit/showcase first, auras stub)

**Files:**
- Create: `src/options/discs.ts`
- Create: `src/options/modes/showcase.ts`
- Create: `src/options/modes/orbit.ts`
- Test: `src/options/discs.test.ts`

**Interfaces:**
- Consumes: `OptionsMode` from `./mode`; `SpotifyTrack` type from `@/lib/spotify` (type-only import).
- Produces: `export interface Disc { id: string; title: string; subtitle: string; imageUrl: string; accent: string }`, `export interface ModeContent { mode: OptionsMode; discs: Disc[]; palette: { sky: string; ribbon: string; particle: string }; headline: string; subcopy: string }`, `export function showcaseContent(): ModeContent`, `export function orbitContent(nowPlaying: { title: string; subtitle: string; imageUrl: string } | null): ModeContent`.

**Contract:** Adapters never return an empty `discs` array. `orbitContent(null)` returns 5 STIX-library fallback discs (images under `/options/fallback/`). Showcase returns 7 curated discs (images under `/options/showcase/`, files land in Task 7). Auras adapter comes in Task 3 — this task exports a `aurasContent` stub returning 7 placeholder discs so the union type compiles (real data in Task 3 replaces the body, not the signature).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { orbitContent, showcaseContent } from './modes/orbit'
import { showcaseContent as showcase } from './modes/showcase'

describe('mode adapters', () => {
  it('orbit with no playback returns fallback discs, never empty', () => {
    const content = orbitContent(null)
    expect(content.mode).toBe('orbit')
    expect(content.discs.length).toBeGreaterThan(0)
    for (const d of content.discs) {
      expect(d.id.length).toBeGreaterThan(0)
      expect(d.imageUrl.startsWith('/options/fallback/')).toBe(true)
    }
  })
  it('orbit maps live playback art into the lead disc', () => {
    const content = orbitContent({ title: 'Neon Skyline', subtitle: 'Midnight Driver', imageUrl: 'https://i.scdn.co/x' })
    expect(content.discs[0].imageUrl).toBe('https://i.scdn.co/x')
    expect(content.discs[0].title).toBe('Neon Skyline')
  })
  it('showcase returns curated discs with palette and copy', () => {
    const content = showcase()
    expect(content.discs.length).toBeGreaterThanOrEqual(5)
    expect(content.palette.particle.length).toBeGreaterThan(0)
    expect(content.headline.length).toBeGreaterThan(0)
  })
})
```

(Note: `orbitContent` and `showcaseContent` live in `src/options/modes/orbit.ts` and `src/options/modes/showcase.ts`; `src/options/discs.ts` holds the shared `Disc`/`ModeContent` interfaces both import. Adjust the import paths in the test to `./modes/orbit`, `./modes/showcase`, and `./discs` accordingly — the failing run below pins the missing-files error first.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/options/discs.test.ts`
Expected: FAIL with unresolvable imports (none of the three modules exist yet).

- [ ] **Step 3: Write minimal implementation**

`src/options/discs.ts`:

```ts
export interface Disc {
  id: string
  title: string
  subtitle: string
  imageUrl: string
  accent: string
}

export type OptionsMode = 'orbit' | 'auras' | 'showcase'

export interface ModePalette {
  sky: string
  ribbon: string
  particle: string
}

export interface ModeContent {
  mode: OptionsMode
  discs: Disc[]
  palette: ModePalette
  headline: string
  subcopy: string
}
```

`src/options/modes/showcase.ts`:

```ts
import type { Disc, ModeContent } from '../discs'

const SHOWCASE_DISCS: Disc[] = [
  { id: 'show-1', title: 'Signal Bloom', subtitle: 'Showcase cut 01', imageUrl: '/options/showcase/show-1.jpg', accent: '#8FC1FF' },
  { id: 'show-2', title: 'Night Relay', subtitle: 'Showcase cut 02', imageUrl: '/options/showcase/show-2.jpg', accent: '#A78BFA' },
  { id: 'show-3', title: 'Static Bloom', subtitle: 'Showcase cut 03', imageUrl: '/options/showcase/show-3.jpg', accent: '#77F2D0' },
  { id: 'show-4', title: 'Low Orbit', subtitle: 'Showcase cut 04', imageUrl: '/options/showcase/show-4.jpg', accent: '#FB923C' },
  { id: 'show-5', title: 'Glass Static', subtitle: 'Showcase cut 05', imageUrl: '/options/showcase/show-5.jpg', accent: '#F472B6' },
  { id: 'show-6', title: 'Afterglow', subtitle: 'Showcase cut 06', imageUrl: '/options/showcase/show-6.jpg', accent: '#49D6FF' },
  { id: 'show-7', title: 'Last Light', subtitle: 'Showcase cut 07', imageUrl: '/options/showcase/show-7.jpg', accent: '#FACC15' },
]

export function showcaseContent(): ModeContent {
  return {
    mode: 'showcase',
    discs: SHOWCASE_DISCS,
    palette: { sky: '#07070F', ribbon: '#A78BFA', particle: '167, 139, 250' },
    headline: 'Showcase',
    subcopy: 'A curated set. Pick a disc to dock it.',
  }
}
```

`src/options/modes/orbit.ts`:

```ts
import type { Disc, ModeContent } from '../discs'

export interface NowPlaying {
  title: string
  subtitle: string
  imageUrl: string
}

const FALLBACK: Disc[] = [
  { id: 'stix-1', title: 'STIX Library 01', subtitle: 'House set', imageUrl: '/options/fallback/stix-1.jpg', accent: '#8FC1FF' },
  { id: 'stix-2', title: 'STIX Library 02', subtitle: 'House set', imageUrl: '/options/fallback/stix-2.jpg', accent: '#8FC1FF' },
  { id: 'stix-3', title: 'STIX Library 03', subtitle: 'House set', imageUrl: '/options/fallback/stix-3.jpg', accent: '#8FC1FF' },
  { id: 'stix-4', title: 'STIX Library 04', subtitle: 'House set', imageUrl: '/options/fallback/stix-4.jpg', accent: '#8FC1FF' },
  { id: 'stix-5', title: 'STIX Library 05', subtitle: 'House set', imageUrl: '/options/fallback/stix-5.jpg', accent: '#8FC1FF' },
]

export function orbitContent(nowPlaying: NowPlaying | null): ModeContent {
  const discs = [...FALLBACK]
  if (nowPlaying) {
    discs[0] = { id: 'now-playing', title: nowPlaying.title, subtitle: nowPlaying.subtitle, imageUrl: nowPlaying.imageUrl, accent: '#8FC1FF' }
  }
  return {
    mode: 'orbit',
    discs,
    palette: { sky: '#05070D', ribbon: '#8FC1FF', particle: '143, 193, 255' },
    headline: 'Orbit Room',
    subcopy: nowPlaying ? 'Live from your Spotify.' : 'Connect Spotify for live art — showing the house set.',
  }
}
```

`src/options/modes/auras.ts` (stub body replaced in Task 3, signature frozen):

```ts
import type { ModeContent } from '../discs'

export function aurasContent(): ModeContent {
  return {
    mode: 'auras',
    discs: [],
    palette: { sky: '#0B0614', ribbon: '#C084FC', particle: '192, 132, 252' },
    headline: 'Aura Discs',
    subcopy: 'Seven auras.',
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/options/discs.test.ts`
Expected: PASS. (The auras stub is intentionally empty-disc and untested until Task 3.)

- [ ] **Step 5: Commit**

```bash
git add src/options/discs.ts src/options/modes/ src/options/discs.test.ts
git commit -m "feat(options): disc model plus orbit and showcase adapters"
```

---

### Task 3: Auras adapter with vendored Aura data

**Files:**
- Create: `src/options/vendor/auras.ts`
- Modify: `src/options/modes/auras.ts` (replace stub body, keep signature)
- Test: `src/options/modes/auras.test.ts`

**Interfaces:**
- Consumes: `Disc`, `ModeContent` from `../discs`.
- Produces: `export interface AuraDiscSource { aura: string; label: string; accent: string; glow: string; imageUrl: string }`, `export const AURA_SOURCES: AuraDiscSource[]` (7 entries), `export function aurasContent(): ModeContent` (same signature as the Task 2 stub — 7 discs, one per aura).

**Contract:** 7 discs, ids `aura-solar` … `aura-prism` (solar, lunar, storm, ember, void, bloom, prism — verify the 7th name against `AURA_TYPES` in lore-frisky `shared/schema.ts` at build time; if it differs, use the real 7th name for both id and label). Images point at `/options/auras/<aura>.svg|png` (files land in Task 7; PNG ghost art for moods with `asset`, SVG marks otherwise — record the exact mapping in `AURA_SOURCES` comments). Accents copied from `aura-marks.tsx`/`ghost-moods.ts` values.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { AURA_SOURCES, aurasContent } from './auras'

describe('aurasContent', () => {
  it('returns exactly 7 aura discs with images and accents', () => {
    expect(AURA_SOURCES).toHaveLength(7)
    const content = aurasContent()
    expect(content.mode).toBe('auras')
    expect(content.discs).toHaveLength(7)
    for (const d of content.discs) {
      expect(d.id.startsWith('aura-')).toBe(true)
      expect(d.imageUrl.startsWith('/options/auras/')).toBe(true)
      expect(d.accent).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
  it('ids are unique', () => {
    const ids = aurasContent().discs.map((d) => d.id)
    expect(new Set(ids).size).toBe(7)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/options/modes/auras.test.ts`
Expected: FAIL — `aurasContent()` returns 0 discs (stub), so `toHaveLength(7)` fails.

- [ ] **Step 3: Write minimal implementation**

`src/options/vendor/auras.ts` — copy the 7 aura names, labels, accents/glows from lore-frisky (`shared/schema.ts` AURA_TYPES, `client/src/components/lore/aura-marks.tsx`, `shared/ghost-moods.ts`), each with a one-line `// Vendored from <lore-frisky path> on 2026-09-24` comment and its `/options/auras/` image path. Then `src/options/modes/auras.ts` maps `AURA_SOURCES` to `Disc[]` (title = label, subtitle = aura name, imageUrl + accent straight through).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/options/modes/auras.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/options/vendor/auras.ts src/options/modes/auras.ts src/options/modes/auras.test.ts
git commit -m "feat(options): auras adapter with vendored aura data"
```

---

### Task 4: MovingBackground canvas + reduced-motion still frame

**Files:**
- Create: `src/options/MovingBackground.tsx`
- Test: `src/options/MovingBackground.test.tsx`

**Interfaces:**
- Consumes: `ModePalette` from `./discs`.
- Produces: `export function MovingBackground({ palette, speed = 1 }: { palette: ModePalette; speed?: number }): JSX.Element` — full-absolute canvas, `aria-hidden="true"`, `data-testid="options-bg"`.

**Contract:** Renders aurora ribbons (2–3 sine ribbons in `palette.ribbon` at low alpha) + ~90 drifting particles in `palette.particle` (rgba string) on `palette.sky`, capped ~30fps via frame skipping, ResizeObserver sizing with the DPR guard pattern from `src/components/wow/ParticleField.tsx` (never write 0×0, bail when size unchanged). When `matchMedia('(prefers-reduced-motion: reduce)')` matches, draws exactly one frame and stops. Cleans up rAF + observer on unmount.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { MovingBackground } from './MovingBackground'

const palette = { sky: '#05070D', ribbon: '#8FC1FF', particle: '143, 193, 255' }

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('MovingBackground', () => {
  it('renders an aria-hidden canvas that fills its parent', () => {
    const { getByTestId } = render(<MovingBackground palette={palette} />)
    const canvas = getByTestId('options-bg')
    expect(canvas.tagName).toBe('CANVAS')
    expect(canvas.getAttribute('aria-hidden')).toBe('true')
    expect(canvas.className).toContain('absolute')
  })
  it('draws a still frame and stops when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {},
    }))
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    const { unmount } = render(<MovingBackground palette={palette} />)
    expect(raf).toHaveBeenCalledTimes(1)
    unmount()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/options/MovingBackground.test.tsx`
Expected: FAIL with unresolvable import `./MovingBackground`.

- [ ] **Step 3: Write minimal implementation**

Follow the `ParticleField.tsx` effect structure (refs for canvas/particles/rAF, ResizeObserver with DPR + 0×0 guards, cleanup). Draw: fill `palette.sky`; 3 sine ribbons stroked with `palette.ribbon` at 0.10–0.16 alpha, phase advanced by `speed`; particles as in ParticleField but colored `rgba(${palette.particle}, a)`. Frame-skip to ~30fps (`if (now - last < 33) { raf; return }`). If `window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches`, draw once and return before scheduling. Canvas element: `<canvas ref data-testid="options-bg" aria-hidden="true" className="absolute inset-0 h-full w-full pointer-events-none" />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/options/MovingBackground.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/options/MovingBackground.tsx src/options/MovingBackground.test.tsx
git commit -m "feat(options): aurora canvas background with reduced-motion still"
```

---

### Task 5: PictureDisc + DiscFormation

**Files:**
- Create: `src/options/PictureDisc.tsx`
- Create: `src/options/DiscFormation.tsx`
- Test: `src/options/DiscFormation.test.tsx`

**Interfaces:**
- Consumes: `Disc` from `./discs`; `cn` from `@/lib/utils`.
- Produces: `export function PictureDisc({ disc, size, spinning, selected, onSelect }: { disc: Disc; size: number; spinning: boolean; selected: boolean; onSelect: () => void }): JSX.Element` (a `<button>`, `aria-label={disc.title}`, `data-testid={disc-${disc.id}}`); `export function DiscFormation({ discs, locked }: { discs: Disc[]; locked: boolean }): JSX.Element` (`data-testid="disc-formation"`, docks selected disc center with metadata panel `data-testid="docked-disc"`).

**Contract:** Disc = circular `<img loading="lazy" draggable={false}>` under a vinyl overlay div (grooves `repeating-radial-gradient(circle at 50% 50%, rgba(0,0,0,.55) 0 2px, transparent 2px 5px)`, conic sheen, center label with `disc.title`, spindle hole), accent ring in `disc.accent`, rotation via inline `animation: spin Xs linear infinite` (12s, paused when `!spinning` or `locked` via `animationPlayState`), `@keyframes options-disc-spin` defined in `options.css` (Task 8 — add a `<style>` fallback comment if css lands later; formation must not crash without it). Formation lays discs in a shallow arc (flex row, `translateY` stagger by index), pointer 3D tilt on the docked disc only (keep it cheap: `onMouseMove` rotate ±6deg). Click selects/docks; docked panel shows title/subtitle + accent. `locked` renders discs `aria-disabled` + blurred (`blur-sm saturate-50`) and ignores clicks. Keyboard: buttons natively focusable; Enter/Space selects.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { DiscFormation } from './DiscFormation'
import type { Disc } from './discs'

const DISCS: Disc[] = [
  { id: 'a', title: 'Alpha', subtitle: 'first', imageUrl: '/options/showcase/show-1.jpg', accent: '#8FC1FF' },
  { id: 'b', title: 'Beta', subtitle: 'second', imageUrl: '/options/showcase/show-2.jpg', accent: '#A78BFA' },
]

describe('DiscFormation', () => {
  it('renders one button per disc with accessible names', () => {
    const { getByTestId } = render(<DiscFormation discs={DISCS} locked={false} />)
    expect(getByTestId('disc-formation')).toBeTruthy()
    expect(getByTestId('disc-a').getAttribute('aria-label')).toBe('Alpha')
    expect(getByTestId('disc-b').getAttribute('aria-label')).toBe('Beta')
  })
  it('docks the clicked disc with its metadata', () => {
    const { getByTestId } = render(<DiscFormation discs={DISCS} locked={false} />)
    fireEvent.click(getByTestId('disc-b'))
    expect(getByTestId('docked-disc').textContent).toContain('Beta')
  })
  it('ignores clicks while locked', () => {
    const { getByTestId, queryByTestId } = render(<DiscFormation discs={DISCS} locked />)
    fireEvent.click(getByTestId('disc-a'))
    expect(queryByTestId('docked-disc')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/options/DiscFormation.test.tsx`
Expected: FAIL with unresolvable import `./DiscFormation`.

- [ ] **Step 3: Write minimal implementation**

`PictureDisc.tsx`: button (`relative rounded-full overflow-hidden`, width/height `size`), img absolute cover, overlay div with the groove gradient + sheen + center label (accent dot + truncated title) + hole dot; style `{{ boxShadow: `0 0 24px ${disc.accent}55`, borderColor: selected ? disc.accent : 'transparent' }}`. `DiscFormation.tsx`: `useState<string | null>` selected id; arc via `style={{ transform: translateY(${Math.abs(i - (discs.length-1)/2) * 14}px) }}`; locked → wrapper `aria-disabled` + `blur-sm saturate-50 pointer-events-none`-ish (keep buttons focusable but clicks ignored: guard `onSelect` with `if (locked) return`). Docked panel below formation when selection exists.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/options/DiscFormation.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/options/PictureDisc.tsx src/options/DiscFormation.tsx src/options/DiscFormation.test.tsx
git commit -m "feat(options): vinyl picture discs in dockable arc formation"
```

---

### Task 6: CaptchaGate with visible altcha-widget

**Files:**
- Create: `src/options/CaptchaGate.tsx`
- Test: `src/options/CaptchaGate.test.tsx`

**Interfaces:**
- Consumes: `getAppEnv` from `@/lib/env` (for `apiBaseUrl`); nothing from `src/lib/altcha.ts` (that helper is the invisible solver — the widget solves itself).
- Produces: `export type GateState = 'checking' | 'ready' | 'verifying' | 'failed' | 'unavailable'`, `export function CaptchaGate({ onVerified }: { onVerified: (payload: string) => void }): JSX.Element` (root `data-testid="captcha-gate"`, `role="status"`).

**Contract:** Mount: `GET {apiBaseUrl}/v1/altcha/challenge`; non-200/network error → `'unavailable'` ("Verification unavailable — preview mode." + Continue button calling `onVerified('')`). 200 → lazy-import the `altcha` package (`await import('altcha')` so the widget chunk only loads here), render `<altcha-widget challengeurl=... debug={false}>` — NOTE: verify the exact props against the installed `altcha` package README in `node_modules/altcha/README.md` at implementation time (challenge URL prop, payload event name, custom-string attributes); if the README disagrees with this plan, follow the README and note the delta in the commit message. Style via CSS vars in `options.css` (dark skin, brand strings "Verifying you're pack…"). On widget solved event → `'verifying'`, POST payload to the existing verify pattern is NOT needed client-side (server verifies on use); call `onVerified(payload)` directly. On widget error/expire → `'failed'` with branded retry button ("Try again, pup") that refetches a fresh challenge; after 3 consecutive fails auto-refetch. Add `"altcha"` to `package.json` deps first (`npm i altcha` — record exact version in commit).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { CaptchaGate } from './CaptchaGate'

describe('CaptchaGate', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  it('goes unavailable with preview affordance when the challenge endpoint is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const onVerified = vi.fn()
    const { getByTestId, getByRole } = render(<CaptchaGate onVerified={onVerified} />)
    await waitFor(() => expect(getByTestId('captcha-gate').textContent).toContain('preview mode'))
    getByRole('button', { name: /continue/i }).click()
    expect(onVerified).toHaveBeenCalledWith('')
  })
  it('announces state via role=status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const { getByTestId } = render(<CaptchaGate onVerified={() => {}} />)
    expect(getByTestId('captcha-gate').getAttribute('role')).toBe('status')
    await waitFor(() => expect(getByTestId('captcha-gate').textContent).toContain('preview mode'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/options/CaptchaGate.test.tsx`
Expected: FAIL with unresolvable import `./CaptchaGate`.

- [ ] **Step 3: Write minimal implementation**

States per contract. `useEffect` on mount fetches challenge, `AbortController` cleanup. Widget element rendered via `dangerouslySetInnerHTML`? No — use a ref + `document.createElement('altcha-widget')` in an effect after the lazy import (avoids TSX unknown-element typing friction), set attributes from README, attach the solved listener, append to container div. Keep the solved listener cleanup on unmount. Failure counter in a ref; auto-refetch on 3rd fail.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/options/CaptchaGate.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/options/CaptchaGate.tsx src/options/CaptchaGate.test.tsx
git commit -m "feat(options): branded altcha gate with preview fallback"
```

---

### Task 7: OptionsPage + ModeSwitch + route hook

**Files:**
- Create: `src/options/OptionsPage.tsx`
- Create: `src/options/ModeSwitch.tsx`
- Modify: `src/main.tsx` (add lazy `/options` route beside `/overlay-studio`)
- Test: `src/options/OptionsPage.test.tsx`

**Interfaces:**
- Consumes: `resolveMode`/`persistMode`/`MODE_STORAGE_KEY` from `./mode`; `orbitContent`/`aurasContent`/`showcaseContent`; `MovingBackground`, `DiscFormation`, `CaptchaGate`; `useSpotifySession` from `@/hooks/use-spotify-session` + `getSpotifyPlayback` from `@/lib/spotify` (for Mode A live art); `toast` from `sonner`.
- Produces: `export function OptionsPage(): JSX.Element` (`data-testid="options-page"`), `export function ModeSwitch({ mode, onChange }: { mode: OptionsMode; onChange: (m: OptionsMode) => void }): JSX.Element`.

**Contract:** Page resolves mode (URL → storage → orbit), holds `verified: boolean` gate state PER MODE (switching mode resets to locked — pins the Review Focus item), renders BG + locked formation blurred behind `CaptchaGate`, unlocks on `onVerified`. ModeSwitch is three buttons (`data-testid="mode-orbit"` etc., `aria-pressed`), persists + updates URL param via `history.replaceState`, fires toast on switch. Orbit adapter input: fetch playback with the session access token when present (`getSpotifyPlayback(token)` → `item.album.images[0].url` + track/artist names), else `null` → fallback discs + "Connect Spotify" hint linking to `#spotify-controls` pattern? No — link to `/` Spotify controls is out of scope; hint text only. `main.tsx`: `const OptionsPage = lazy(() => import('./options/OptionsPage').then(m => ({ default: m.OptionsPage })))` + `if (path === '/options') return <Suspense fallback={<p>Opening Options…</p>}><OptionsPage /></Suspense>` before the final `return <App />`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { OptionsPage } from './OptionsPage'

describe('OptionsPage', () => {
  it('renders the gate locked and all three mode buttons', () => {
    const { getByTestId } = render(<OptionsPage />)
    expect(getByTestId('options-page')).toBeTruthy()
    expect(getByTestId('mode-orbit')).toBeTruthy()
    expect(getByTestId('mode-auras')).toBeTruthy()
    expect(getByTestId('mode-showcase')).toBeTruthy()
    expect(getByTestId('captcha-gate')).toBeTruthy()
  })
  it('switching mode resets the gate to locked', async () => {
    const { getByTestId } = render(<OptionsPage />)
    fireEvent.click(getByTestId('mode-showcase'))
    expect(getByTestId('mode-showcase').getAttribute('aria-pressed')).toBe('true')
    expect(getByTestId('captcha-gate')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/options/OptionsPage.test.tsx`
Expected: FAIL with unresolvable import `./OptionsPage`.

- [ ] **Step 3: Write minimal implementation**

Per contract. Spotify: `const { accessToken } = useSpotifySession()` then `useEffect` → `getSpotifyPlayback(accessToken)` on token set, store `{title, subtitle, imageUrl} | null` in state, pass to `orbitContent`. Guard everything in try/catch → null. Layout: `<div data-testid="options-page" className="options-page">` with BG absolute, header (headline + ModeSwitch), formation section, gate overlay section when `!verified`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/options/OptionsPage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/options/OptionsPage.tsx src/options/ModeSwitch.tsx src/options/OptionsPage.test.tsx src/main.tsx
git commit -m "feat(options): options page with per-mode gate and route"
```

---

### Task 8: options.css + image assets + visual proof

**Files:**
- Create: `src/options/options.css` (imported by `OptionsPage.tsx`)
- Create: `public/options/fallback/stix-1..5.jpg`, `public/options/showcase/show-1..7.jpg`, `public/options/auras/*` (exact files per `AURA_SOURCES` mapping)

**Interfaces:** None (static assets + styles). `options.css` defines `@keyframes options-disc-spin`, `.options-page` layout, vinyl overlay classes, altcha-widget CSS vars (dark skin), `.options-gate` overlay, reduced-motion overrides.

**Contract:** Every `imageUrl` referenced by the three adapters resolves to a real file (write a quick loop test in the shell: for each path, `curl -s -o /dev/null -w` after `npm run dev`, or simpler — `ls` each file). Discs spin at 12s/rev, pause on hover/focus (`:hover`, `:focus-visible` → `animation-play-state: paused`). Reduced-motion media query kills animation + hides canvas motion (JS still-frame already handled). Then: `npm run dev`, screenshot gate state + unlocked formation + one mode switch at 1440px desktop and 390px mobile widths with headless Chrome; attach/verify readability before committing.

- [ ] **Step 1: Verify every referenced image exists**

Run: `for f in $(grep -rhoE '/options/[a-z0-9/._-]+' src/options --include='*.ts' | sort -u); do [ -f "public$f" ] || echo "MISSING: $f"; done`
Expected before assets land: list of MISSING lines. Generate/collect the images (brand-styled abstract art + vendored aura art; 5 fallback + 7 showcase + 7 aura files), re-run until silent.

- [ ] **Step 2: Write options.css**

Keyframes, formation arc helpers, gate overlay, widget vars (check `node_modules/altcha/README.md` for the exact custom-property names; fall back to generic `--altcha-*` only if documented), focus-visible rings, reduced-motion block.

- [ ] **Step 3: Typecheck + build + full options test run**

Run: `npm run typecheck && npm run build && npx vitest run src/options`
Expected: all green.

- [ ] **Step 4: Visual proof screenshots**

Run dev server + headless Chrome screenshots (gate, unlocked, mode switch × desktop/mobile). Confirm: discs circular with pictures, formation aligned, BG animated (two frames differ), gate branded, no layout breakage at 390px.

- [ ] **Step 5: Commit**

```bash
git add src/options/options.css public/options src/options/OptionsPage.tsx
git commit -m "feat(options): styles, artwork, and visual proof"
```
