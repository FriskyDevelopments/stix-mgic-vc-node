import { describe, expect, it } from 'vitest'
import { AURA_SOURCES } from '../vendor/auras'
import { aurasContent } from './auras'

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
