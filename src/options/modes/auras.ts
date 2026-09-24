import type { ModeContent } from '../discs'

/** Stub — real 7-aura body lands in Task 3. Signature is frozen. */
export function aurasContent(): ModeContent {
  return {
    mode: 'auras',
    discs: [],
    palette: { sky: '#0B0614', ribbon: '#C084FC', particle: '192, 132, 252' },
    headline: 'Aura Discs',
    subcopy: 'Seven auras.',
  }
}
