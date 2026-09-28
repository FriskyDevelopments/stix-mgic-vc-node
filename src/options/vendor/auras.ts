/**
 * Vendored LORE Aura data — copied, not imported.
 *
 * Sources (read 2026-09-24):
 * - aura names: `AURA_TYPES` in lore-frisky `shared/schema.ts`
 *   (solar, lunar, storm, ember, void, bloom, prism)
 * - labels + accentColor: lore-frisky `shared/aura-data.ts` AURA_META block
 * - ghost art pairing + mood accents: lore-frisky `shared/cover-banners.ts`
 *   (per-aura `ghostMood`) and `shared/ghost-moods.ts` (asset + accent)
 *
 * Void note: cover-banners overrides AURA_META's #6B7280 with #C7CDD6 at
 * banner scale ("goes muddy"); the same override applies on a disc.
 * Storm note: banner glow is MAGENTA to stay electric next to Bloom's teal.
 */

export interface AuraDiscSource {
  aura: string
  label: string
  accent: string
  glow: string
  imageUrl: string
}

export const AURA_SOURCES: AuraDiscSource[] = [
  // Vendored from lore-frisky shared/aura-data.ts (Solar, #F59E0B) +
  // cover-banners.ts ghostMood goodBoy (ghost-moods.ts: sleep.png, #f7d774).
  { aura: 'solar', label: 'Solar', accent: '#F59E0B', glow: 'rgba(245, 158, 11, 0.55)', imageUrl: '/options/auras/solar.png' },
  // Vendored from lore-frisky shared/aura-data.ts (Lunar, #93C5FD) +
  // cover-banners.ts ghostMood voidPeek (ghost-moods.ts: void-peek.svg).
  { aura: 'lunar', label: 'Lunar', accent: '#93C5FD', glow: 'rgba(147, 197, 253, 0.5)', imageUrl: '/options/auras/lunar.svg' },
  // Vendored from lore-frisky shared/aura-data.ts (Storm, #A78BFA);
  // banner glow MAGENTA per cover-banners.ts storm comment.
  { aura: 'storm', label: 'Storm', accent: '#A78BFA', glow: 'rgba(232, 121, 249, 0.5)', imageUrl: '/options/auras/storm.svg' },
  // Vendored from lore-frisky shared/aura-data.ts (Ember, #F97316) +
  // cover-banners.ts ghostMood happyDerp (ghost-moods.ts: hype.png).
  { aura: 'ember', label: 'Ember', accent: '#F97316', glow: 'rgba(249, 115, 22, 0.55)', imageUrl: '/options/auras/ember.png' },
  // Vendored from lore-frisky shared/cover-banners.ts void override (#C7CDD6,
  // not AURA_META #6B7280) + ghostMood mischievous (param-drawn, no asset —
  // disc uses the Void ring mark rendered in options.css).
  { aura: 'void', label: 'Void', accent: '#C7CDD6', glow: 'rgba(199, 205, 214, 0.45)', imageUrl: '/options/auras/void.svg' },
  // Vendored from lore-frisky shared/aura-data.ts (Bloom, #34D399) +
  // cover-banners.ts ghostMood puppy (ghost-moods.ts: focus.png, heart-eyes).
  { aura: 'bloom', label: 'Bloom', accent: '#34D399', glow: 'rgba(52, 211, 153, 0.5)', imageUrl: '/options/auras/bloom.png' },
  // Vendored from lore-frisky shared/aura-data.ts (Prism, #C084FC) +
  // cover-banners.ts ghostMood starryEyed (ghost-moods.ts: starry-eyed.svg).
  { aura: 'prism', label: 'Prism', accent: '#C084FC', glow: 'rgba(192, 132, 252, 0.55)', imageUrl: '/options/auras/prism.svg' },
]
