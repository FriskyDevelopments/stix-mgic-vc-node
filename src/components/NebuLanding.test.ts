import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('NebuLanding brand surface', () => {
  const source = readFileSync(resolve(__dirname, 'NebuLanding.tsx'), 'utf8')
  const motion = readFileSync(resolve(__dirname, '../styles/nebu-motion.css'), 'utf8')

  it('uses NEBU board colors and Set the scene copy', () => {
    expect(source).toContain('#0d081a')
    expect(source).toContain('#f5e000')
    expect(source).toContain('Set the')
    expect(source).toContain('scene')
    expect(source).toContain('Open your studio')
  })

  it('ships purposeful motion with reduced-motion fallback', () => {
    expect(source).toContain('nebu-float')
    expect(source).toContain('nebu-live-pulse')
    expect(source).toContain('nebu-card')
    expect(motion).toContain('prefers-reduced-motion')
  })

  it('routes studio CTA to vc.friskydev.com', () => {
    expect(source).toContain('https://vc.friskydev.com')
  })
})
