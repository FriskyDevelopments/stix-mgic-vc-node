import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { AnimatedGradient } from './AnimatedGradient'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('keeps its animation and resize observer alive across unrelated page renders', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const observe = vi.fn()
  const disconnect = vi.fn()
  const observer = vi.fn(function () { return { observe, disconnect } })
  vi.stubGlobal('ResizeObserver', observer)
  const request = vi.fn().mockReturnValue(1)
  const cancel = vi.fn()
  vi.stubGlobal('requestAnimationFrame', request)
  vi.stubGlobal('cancelAnimationFrame', cancel)
  const context = { clearRect: vi.fn(), createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })), fillRect: vi.fn(), setTransform: vi.fn(), fillStyle: '' }
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(createElement(AnimatedGradient, { opacity: .08 })))
    for (const opacity of [.09, .1, .08]) await act(async () => root.render(createElement(AnimatedGradient, { opacity })))
    expect(getContext).toHaveBeenCalledOnce()
    expect(observer).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledOnce()
    expect(cancel).not.toHaveBeenCalled()
    expect(disconnect).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
  expect(cancel).toHaveBeenCalledOnce()
  expect(disconnect).toHaveBeenCalledOnce()
})
