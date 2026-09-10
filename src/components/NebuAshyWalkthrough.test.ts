import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('NebuAshyWalkthrough surface', () => {
  const source = readFileSync(resolve(__dirname, 'NebuAshyWalkthrough.tsx'), 'utf8')
  const css = readFileSync(resolve(__dirname, '../styles/nebu-ashy-walkthrough.css'), 'utf8')
  const main = readFileSync(resolve(__dirname, '../main.tsx'), 'utf8')

  it('uses Ashy-first brand tokens and Set the scene line', () => {
    expect(source).toContain('NEBU_BRAND')
    expect(source).toContain('ASHY_UNIT')
    expect(source).toContain('PipeStrip')
    expect(css).toContain('#0b001a')
    expect(css).toContain('#ffd100')
    expect(css).toContain('#9d00ff')
    expect(css).toContain('#00e5ff')
    expect(css).toContain('#b7ff2a')
    expect(css).toContain('#f7f5f2')
  })

  it('keeps the three pipes visible and practice rule copy', () => {
    expect(source).toContain('PIPE_LABELS')
    expect(source).toContain('Keep these three outputs separate')
    expect(source).toContain('finish Act I')
    expect(source).toContain('optionalTip')
    expect(source).toContain('PipeStrip')
  })

  it('wires NEBU login and FriskyDev studio without collapsing identity', () => {
    expect(source).toContain('NEBU_LOGIN_URL')
    expect(source).toContain('STUDIO_URL')
    expect(source).toContain('NEBU sign in')
    expect(source).toContain('Open studio')
    expect(source).not.toContain('TELEGRAM_BOT_TOKEN')
  })

  it('is routed at /units/ashy', () => {
    expect(main).toContain("path === '/units/ashy'")
    expect(main).toContain('NebuAshyWalkthrough')
  })
})
