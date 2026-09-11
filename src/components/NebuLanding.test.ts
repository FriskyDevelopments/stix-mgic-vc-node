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
    expect(motion).toContain('nebu-panel-in')
    expect(motion).toContain('animation: none')
  })

  it('routes studio CTA to NEBU /login (not vc.friskydev.com)', () => {
    expect(source).toContain("const STUDIO_URL = '/login'")
    expect(source).not.toContain('https://vc.friskydev.com')
  })

  it('includes donate promo copy and donation link', () => {
    expect(source).toContain('Keep the scene running.')
    expect(source).toContain('https://ko-fi.com/friskypup')
    expect(source).toContain('https://nowpayments.io/donation/Frisky')
    expect(source).toContain('id="support"')
  })

  it('links Ashy’s mega-easy walkthrough', () => {
    expect(source).toContain('/units/ashy')
    expect(source).toContain('Like Ashy’s room')
  })
})
