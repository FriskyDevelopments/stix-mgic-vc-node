import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MovingBackground } from './MovingBackground'

const palette = { sky: '#05070D', ribbon: '#8FC1FF', particle: '143, 193, 255' }

let container: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
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

describe('MovingBackground', () => {
  it('renders an aria-hidden canvas that fills its parent', () => {
    show(createElement(MovingBackground, { palette }))
    const canvas = container.querySelector('[data-testid="options-bg"]')
    expect(canvas?.tagName).toBe('CANVAS')
    expect(canvas?.getAttribute('aria-hidden')).toBe('true')
    expect(canvas?.className).toContain('absolute')
  })
  it('draws a still frame and stops when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: typeof q === 'string' && q.includes('prefers-reduced-motion'),
      media: q, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {},
    }))
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    show(createElement(MovingBackground, { palette }))
    // Still frame only: the loop must NOT be scheduled under reduced motion.
    expect(raf).toHaveBeenCalledTimes(0)
  })
})
