import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CaptchaGate } from './CaptchaGate'

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

let container: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root?.unmount() })
  root = null
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function show(element: React.ReactElement) {
  act(() => { root?.render(element) })
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('CaptchaGate', () => {
  it('goes unavailable with preview affordance when the challenge endpoint is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    let verified = 'unset'
    show(createElement(CaptchaGate, { onVerified: (p: string) => { verified = p } }))
    await settle()
    expect(container.querySelector('[data-testid="captcha-gate"]')?.textContent).toContain('preview mode')
    const btn = container.querySelector('[data-testid="gate-continue"]')
    if (!btn) throw new Error('missing continue button')
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(verified).toBe('')
  })
  it('announces state via role=status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    show(createElement(CaptchaGate, { onVerified: () => {} }))
    expect(container.querySelector('[data-testid="captcha-gate"]')?.getAttribute('role')).toBe('status')
    await settle()
    expect(container.querySelector('[data-testid="captcha-gate"]')?.textContent).toContain('preview mode')
  })
})
