# Frisky Design Retake — Magic Patterns + Figma Pack
Date: 2026-09-11
Source of truth: `FriskyDevelopments/frisky-design-system`
Lead surface this sprint: **STIX MΛGIC VC NODE** (`stix-mgic-vc-node`)
Also packed: LORE Aura Console · Cyberpup / GOONBROS · HostCasa MTY / Cuernavaca

Do not invent palettes. Tokens below are locked from brand books + shipping CSS.

## Loop (replaces Claude design)

1. Paste the Magic Patterns prompt for the product.
2. Generate React / Tailwind. Export.
3. Drop frames into Figma as the canonical file (one page per product).
4. Hand the export or a screenshot to Grok to wire into the existing Vite repo.
5. Do not rebuild APIs. Restyle shells only.

## A. STIX MΛGIC VC NODE (lead)

Repo: `FriskyDevelopments/stix-mgic-vc-node`
Live: `vc.friskydev.com`
Shell to restyle: `VcMvpShell` + `wow/` + `GlassCard`
Do **not** use consumer STIX violet `#B07DFF` on this surface.

Locked tokens already in `src/index.css`:
- bg `oklch(0.15 0.01 260)` matte charcoal
- card `oklch(0.25 0.02 260)`
- primary `oklch(0.55 0.18 250)` electric blue
- accent `oklch(0.75 0.14 195)` radiant cyan
- destructive `oklch(0.55 0.22 25)`
- success `oklch(0.65 0.15 145)`
- warning `oklch(0.70 0.15 70)`
- fg `oklch(0.95 0.01 260)`
- glass blur 12px, radius 0.75rem
- type Inter + JetBrains Mono

Hierarchy: Live Surface → Primary Action → Expandable System Panels.

Figma frames: Live Surface, Primary Action, DJ Mode active, Protocol drawer, Diagnostics, Identity gate, Mobile 390, Architecture strip.

See conversation artifact `MAGIC-PATTERNS-FIGMA-BRIEF.md` for full paste-ready prompts for LORE, Cyberpup, GOONBROS, and HostCasa v3 midnight/gold.
