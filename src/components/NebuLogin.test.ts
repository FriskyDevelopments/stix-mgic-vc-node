import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('NebuLogin brand surface', () => {
  const source = readFileSync(resolve(__dirname, 'NebuLogin.tsx'), 'utf8')
  const motion = readFileSync(resolve(__dirname, '../styles/nebu-motion.css'), 'utf8')

  it('uses NEBU brand colors and copy', () => {
    expect(source).toContain('NEBU_BRAND')
    expect(source).toContain('nebuBrandStyle')
    expect(source).toContain('NEBU_BRAND.night')
    expect(source).toContain('NEBU_BRAND.yellow')
    expect(source).toContain('NEBU')
    expect(source).toContain('nebu.quest')
    expect(source).toContain('Welcome back.')
    expect(source).toContain('NEBU product login')
    expect(source).not.toContain('#9026ff')
  })

  it('wires Google, Apple, and Microsoft social buttons', () => {
    expect(source).toContain("'google'")
    expect(source).toContain("'microsoft'")
    expect(source).toContain("'apple'")
    expect(source).toContain('Continue with Google')
  })

  it('keeps studio Authentik / OIDC out of the NEBU login CTA path', () => {
    expect(source).not.toContain('/v1/auth/oidc/start')
    expect(source).not.toContain('https://vc.friskydev.com')
    expect(source).toContain('nebu-login-panel')
    expect(source).toContain('nebu-rise')
    expect(motion).toContain('nebu-login-panel')
    expect(motion).toContain('prefers-reduced-motion')
  })
})
