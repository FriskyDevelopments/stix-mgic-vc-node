import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaCompositor } from './media-compositor'

const drawImage = vi.fn()
const fillText = vi.fn()
const stop = vi.fn()
const output = { getTracks: () => [{ stop }] } as unknown as MediaStream
const context = {
  drawImage, fillText, fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(),
  measureText: (text: string) => ({ width: text.length * 6 }),
  fillStyle: '', shadowColor: '', shadowBlur: 0, globalAlpha: 1, font: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: vi.fn(() => output) })
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLCanvasElement.prototype, 'captureStream') })

describe('Spotify artwork compositing', () => {
  it.each([
    [640, 640, 140, 0, 360, 360],
    [1280, 640, 0, 20, 640, 320],
    [300, 600, 230, 0, 180, 360],
  ])('preserves %sx%s artwork without cropping', (naturalWidth, naturalHeight, x, y, width, height) => {
    const compositor = new MediaCompositor({ width: 640, height: 360, overlay: { enabled: false } })
    const image = { naturalWidth, naturalHeight } as HTMLImageElement
    compositor.setSource({ type: 'image', image })
    expect(compositor.start()).toBe(output)
    expect(drawImage).toHaveBeenCalledWith(image, x, y, width, height)
    compositor.stop()
    expect(stop).toHaveBeenCalledOnce()
  })

  it('does not draw an image that has no decoded dimensions', () => {
    const compositor = new MediaCompositor({ overlay: { enabled: false } })
    compositor.setSource({ type: 'image', image: { naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement })
    compositor.start()
    expect(drawImage).not.toHaveBeenCalled()
    compositor.stop()
  })

  it('uses the native Frisky Developments lockup without the old STIX mark', () => {
    const compositor = new MediaCompositor()
    compositor.setSource({ type: 'image', image: { naturalWidth: 640, naturalHeight: 640 } as HTMLImageElement })
    compositor.start()
    expect(fillText.mock.calls.slice(0, 2).map(call => call[0])).toEqual(['VC NODE', 'FRISKY DEVELOPMENTS'])
    expect(context.shadowBlur).toBe(0)
    expect(context.fillStyle).toBe('#f5f2ec')
    compositor.stop()
  })
})
