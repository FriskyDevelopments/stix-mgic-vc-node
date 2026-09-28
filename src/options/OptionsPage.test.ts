import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OptionsPage } from './OptionsPage'

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

vi.mock('@/hooks/use-spotify-session', () => ({
  useSpotifySession: () => ({ accessToken: null, disconnect: () => {} }),
}))

vi.mock('@/lib/spotify', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/spotify')>()
  return { ...original, getSpotifyPlayback: vi.fn().mockResolvedValue(null) }
})

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

describe('OptionsPage', () => {
  it('renders the gate locked and all three mode buttons', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    show(createElement(OptionsPage))
    await settle()
    expect(container.querySelector('[data-testid="options-page"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="mode-orbit"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="mode-auras"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="mode-showcase"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="captcha-gate"]')).toBeTruthy()
  })
  it('switching mode resets the gate to locked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    show(createElement(OptionsPage))
    await settle()
    const btn = container.querySelector('[data-testid="mode-showcase"]')
    if (!btn) throw new Error('missing mode-showcase')
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[data-testid="captcha-gate"]')).toBeTruthy()
  })
})
