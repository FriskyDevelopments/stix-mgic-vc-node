import { describe, expect, it } from 'vitest'
import { orbitContent } from './modes/orbit'
import { showcaseContent } from './modes/showcase'

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
    const content = showcaseContent()
    expect(content.discs.length).toBeGreaterThanOrEqual(5)
    expect(content.palette.particle.length).toBeGreaterThan(0)
    expect(content.headline.length).toBeGreaterThan(0)
  })
})
