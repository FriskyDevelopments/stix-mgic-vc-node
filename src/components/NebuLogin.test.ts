import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('NebuLogin brand surface', () => {
  const source = readFileSync(resolve(__dirname, 'NebuLogin.tsx'), 'utf8')

  it('uses NEBU brand colors and copy', () => {
    expect(source).toContain('#0d081a')
    expect(source).toContain('#F5E000')
    expect(source).toContain('NEBU')
    expect(source).toContain('nebu.quest')
    expect(source).toContain('Welcome back.')
  })

  it('wires Google, Apple, and Microsoft social buttons', () => {
    expect(source).toContain("'google'")
    expect(source).toContain("'microsoft'")
    expect(source).toContain("'apple'")
    expect(source).toContain('Continue with Google')
  })

  it('keeps studio Authentik out of the NEBU login CTA path', () => {
    expect(source).toContain('Authentik')
    expect(source).not.toContain('/v1/auth/oidc/start')
  })
})
