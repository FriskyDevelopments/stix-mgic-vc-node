import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Nebu host controls surface copy', () => {
  const host = readFileSync(resolve(__dirname, 'HostControls.tsx'), 'utf8')
  const cam = readFileSync(resolve(__dirname, 'CameraRequestPrompt.tsx'), 'utf8')
  const mini = readFileSync(resolve(__dirname, 'MiniControlWidget.tsx'), 'utf8')
  const css = readFileSync(resolve(__dirname, '../../styles/nebu-host-controls.css'), 'utf8')

  it('keeps consent-forward camera request copy', () => {
    expect(cam).toContain('Host is requesting your camera')
    expect(cam).toContain('Enable Camera')
    expect(cam).toContain('Not Now')
    expect(cam).toContain('Nothing turns on until you choose')
  })

  it('distinguishes request unmute vs turn microphone on', () => {
    expect(host).toContain('Request unmute')
    expect(host).toContain('Turn microphone on')
  })

  it('ships mini sizes and FULL↔MINI restore controls', () => {
    expect(mini).toContain("data-size={snapshot.miniSize}")
    expect(mini).toContain("set_chrome_mode', mode: 'full'")
    expect(mini).toContain('compact')
    expect(mini).toContain('expanded_mini')
  })

  it('inherits Nebu tokens and respects reduced motion', () => {
    expect(css).toContain('var(--nebu-cyan')
    expect(css).toContain('var(--nebu-yellow')
    expect(css).toContain('prefers-reduced-motion')
  })

  it('does not redefine NebuLanding marketing identity', () => {
    expect(host).not.toContain('Set the scene')
    expect(host).not.toContain('Open your studio')
  })
})
