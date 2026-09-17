import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaCompositor } from './media-compositor'

describe('MediaCompositor frame readiness', () => {
  let context: any
  let output: any
  let capture: ReturnType<typeof vi.fn>
  let videos: HTMLVideoElement[]
  beforeEach(() => {
    videos = []
    context = { fillRect: vi.fn(), drawImage: vi.fn() }
    output = { getTracks: () => [{ stop: vi.fn() }] }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    capture = vi.fn(() => output)
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: capture })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const create = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) => {
      const element = create(tag, options)
      if (tag === 'video') videos.push(element as HTMLVideoElement)
      return element
    }) as typeof document.createElement)
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('refuses to publish an undecoded file and paints a frame before capture starts', async () => {
    const compositor = new MediaCompositor({ overlay: { enabled: false } })
    const video = document.createElement('video')
    compositor.setSource({ type: 'file', element: video })
    expect(() => compositor.start()).toThrow('still loading')
    expect(capture).not.toHaveBeenCalled()
    Object.defineProperties(video, { readyState: { value: 3 }, videoWidth: { value: 1280 }, videoHeight: { value: 720 } })
    expect(compositor.start()).toBe(output)
    expect(context.drawImage.mock.invocationCallOrder[0]).toBeLessThan(capture.mock.invocationCallOrder[0])
    compositor.stop()
  })

  it('surfaces camera playback rejection instead of claiming a ready blank output', async () => {
    const compositor = new MediaCompositor({ overlay: { enabled: false } })
    compositor.setSource({ type: 'camera', stream: {} as MediaStream })
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'))
    await expect(compositor.prepareSource()).rejects.toThrow('blocked')
    expect(capture).not.toHaveBeenCalled()
    compositor.stop()
    expect(videos[0].srcObject).toBeNull()
  })

  it('waits for camera decoded data and clears its media reference when stopped', async () => {
    const compositor = new MediaCompositor({ overlay: { enabled: false } })
    const stream = {} as MediaStream
    compositor.setSource({ type: 'camera', stream })
    const preparing = compositor.prepareSource()
    await Promise.resolve()
    const camera = videos[0]
    expect(camera.srcObject).toBe(stream)
    expect(capture).not.toHaveBeenCalled()
    Object.defineProperties(camera, { readyState: { value: 3 }, videoWidth: { value: 640 }, videoHeight: { value: 360 } })
    camera.dispatchEvent(new Event('loadeddata'))
    await preparing
    compositor.start()
    expect(capture).toHaveBeenCalledOnce()
    compositor.stop()
    expect(camera.srcObject).toBeNull()
    expect(camera.pause).toHaveBeenCalled()
  })

  it('times out a camera whose play promise never resolves and cancels it on source change', async () => {
    vi.useFakeTimers()
    const compositor = new MediaCompositor({ overlay: { enabled: false } })
    compositor.setSource({ type: 'camera', stream: {} as MediaStream })
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(new Promise(() => {}))
    const timeout = expect(compositor.prepareSource()).rejects.toThrow('did not produce a video frame')
    await vi.advanceTimersByTimeAsync(10_000)
    await timeout
    compositor.stop()
    compositor.setSource({ type: 'camera', stream: {} as MediaStream })
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(new Promise(() => {}))
    const cancelled = expect(compositor.prepareSource()).rejects.toThrow('cancelled')
    compositor.setSource({ type: 'none' })
    await cancelled
    expect(capture).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('cancels a pending camera frame when the source changes', async () => {
    const compositor = new MediaCompositor({ overlay: { enabled: false } })
    compositor.setSource({ type: 'camera', stream: {} as MediaStream })
    const preparing = compositor.prepareSource()
    const rejected = expect(preparing).rejects.toThrow('cancelled')
    await Promise.resolve()
    compositor.setSource({ type: 'none' })
    await rejected
    expect(videos[0].srcObject).toBeNull()
    expect(capture).not.toHaveBeenCalled()
  })
})
