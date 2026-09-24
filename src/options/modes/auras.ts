import type { ModeContent } from '../discs'
import { AURA_SOURCES } from '../vendor/auras'

export function aurasContent(): ModeContent {
  return {
    mode: 'auras',
    discs: AURA_SOURCES.map((a) => ({
      id: `aura-${a.aura}`,
      title: a.label,
      subtitle: `${a.aura} aura`,
      imageUrl: a.imageUrl,
      accent: a.accent,
    })),
    palette: { sky: '#0B0614', ribbon: '#C084FC', particle: '192, 132, 252' },
    headline: 'Aura Discs',
    subcopy: 'Seven auras. Pick a disc to dock it.',
  }
}
