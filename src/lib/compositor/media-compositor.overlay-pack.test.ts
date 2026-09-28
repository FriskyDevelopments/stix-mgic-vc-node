import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaCompositor } from './media-compositor'
import { createBlankPack } from '../overlays'

describe('canonical graphics in the video compositor', () => {
  const ctx = Object.fromEntries(['fillRect', 'drawImage', 'fillText', 'save', 'restore', 'setTransform', 'translate', 'scale', 'beginPath', 'rect', 'clip', 'setLineDash', 'fill', 'roundRect'].map(key => [key, vi.fn()]))
  let compositor: MediaCompositor
  beforeEach(() => {
    vi.clearAllMocks()
    ctx.measureText = vi.fn((text: string) => ({ width: text.length * 6 }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: () => ({ getTracks: () => [] }) })
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    compositor = new MediaCompositor()
    compositor.setSource({ type: 'image', image: { naturalWidth: 640, naturalHeight: 360 } as HTMLImageElement })
  })
  afterEach(() => { compositor.stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLCanvasElement.prototype, 'captureStream') })

  it('keeps the video but suppresses the default mark for an explicitly empty scene', () => {
    compositor.setOverlayScene(createBlankPack(), 'empty-master')
    compositor.start()
    expect(ctx.drawImage).toHaveBeenCalled()
    expect(ctx.fillText).not.toHaveBeenCalled()
    compositor.stop()
    compositor.setOverlayScene(null)
    compositor.start()
    expect(ctx.fillText).toHaveBeenCalledWith('VC NODE', expect.any(Number), expect.any(Number))
  })

  it('renders a validated snapshot over video and leaves it intact on invalid selection', () => {
    const pack = createBlankPack()
    pack.screens[0].layers.push({ id: 'caption', type: 'text', bounds: { unit: 'px', x: 60, y: 900, width: 800, height: 100 }, text: 'Frisky', color: 'paper', fontFamily: 'serif', fontSize: 48 })
    compositor.setOverlayScene(pack, 'empty-master')
    pack.screens[0].layers.length = 0
    expect(() => compositor.setOverlayScene(pack, 'missing')).toThrow('valid overlay')
    compositor.start()
    expect(ctx.fillText).toHaveBeenCalledWith('Frisky', 60, 948)
    expect(ctx.fillText).not.toHaveBeenCalledWith('VC NODE', expect.any(Number), expect.any(Number))
    expect(ctx.scale).toHaveBeenCalledWith(1 / 3, 1 / 3)
  })
})
