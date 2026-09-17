import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DJModePanel } from './DJModePanel'

const mock = vi.hoisted(() => ({ compositors: [] as any[], mixers: [] as any[], order: [] as string[] }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/compositor', () => ({
  MediaCompositor: class {
    canvas = document.createElement('canvas')
    setSource = vi.fn(() => mock.order.push('source'))
    setOverlay = vi.fn()
    stop = vi.fn()
    prepareSource = vi.fn().mockResolvedValue(undefined)
    start = vi.fn(() => new MediaStream([{ kind: 'video', stop: vi.fn() } as unknown as MediaStreamTrack]))
    getCanvas = () => this.canvas
    constructor() { mock.compositors.push(this) }
  },
  AudioMixer: class {
    resume = vi.fn().mockResolvedValue(undefined)
    setGain = vi.fn()
    addMediaElement = vi.fn()
    addMic = vi.fn()
    removeSource = vi.fn()
    destroy = vi.fn()
    getOutputStream = () => new MediaStream([{ kind: 'audio', stop: vi.fn() } as unknown as MediaStreamTrack])
    constructor() { mock.mixers.push(this) }
  },
  combineStreams: (video: MediaStream, audio: MediaStream) => new MediaStream([...video.getTracks(), ...audio.getTracks()]),
}))

class TestStream {
  constructor(private tracks: MediaStreamTrack[] = []) {}
  getTracks() { return this.tracks }
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video') }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio') }
}

const track = (kind: string) => ({ kind, stop: vi.fn(), onended: null, readyState: 'live' }) as unknown as MediaStreamTrack
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

describe('DJModePanel local video lifecycle', () => {
  let container: HTMLDivElement
  let root: Root
  let videos: HTMLVideoElement[]
  let onOutput: ReturnType<typeof vi.fn>
  let getUserMedia: ReturnType<typeof vi.fn>
  beforeEach(() => {
    mock.compositors.length = 0
    mock.mixers.length = 0
    mock.order.length = 0
    videos = []
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('MediaStream', TestStream)
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    getUserMedia = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: vi.fn().mockResolvedValue([]), getUserMedia } })
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => `blob:local-${videos.length}`); static revokeObjectURL = vi.fn() })
    const create = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) => {
      const element = create(tag, options)
      if (tag === 'video') videos.push(element as HTMLVideoElement)
      return element
    }) as typeof document.createElement)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    onOutput = vi.fn(stream => { mock.order.push(stream ? 'output' : 'detach') })
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
  const button = (text: string) => [...container.querySelectorAll('button')].find(element => element.textContent?.trim() === text)!
  const render = async () => { await act(async () => root.render(createElement(DJModePanel, { onOutputStream: onOutput }))) }
  const chooseFile = async (name = 'local.mp4') => {
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['fake fixture'], name, { type: 'video/mp4' })] })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    return videos[videos.length - 1]
  }
  const ready = async (video: HTMLVideoElement) => {
    Object.defineProperties(video, { readyState: { configurable: true, value: 3 }, videoWidth: { configurable: true, value: 1920 }, videoHeight: { configurable: true, value: 1080 }, duration: { configurable: true, value: 42 } })
    await act(async () => video.dispatchEvent(new Event('canplay')))
  }
  const preview = async () => { await act(async () => button('Start preview').click()) }

  it('loads a local file silently and waits for decoded frames before enabling Preview', async () => {
    await render()
    const video = await chooseFile()
    expect(container.textContent).toContain('Loading video…')
    expect(button('Start preview').disabled).toBe(true)
    expect(video.muted).toBe(true)
    expect(video.play).not.toHaveBeenCalled()
    expect(mock.mixers).toHaveLength(0)
    expect(onOutput).not.toHaveBeenCalled()
    await ready(video)
    expect(container.textContent).toContain('Ready to preview · 1920 × 1080 · 42 sec')
    expect(button('Start preview').disabled).toBe(false)
    expect(video.play).not.toHaveBeenCalled()
  })

  it('starts only after Preview, stops file audio, and lets the same video retry after stopping', async () => {
    await render()
    const video = await chooseFile()
    await ready(video)
    await preview()
    expect(video.play).toHaveBeenCalledTimes(1)
    expect(onOutput).toHaveBeenCalledTimes(1)
    expect(onOutput.mock.calls[0][0].getTracks()).toHaveLength(2)
    expect(video.muted).toBe(false)
    await act(async () => button('Stop preview').click())
    expect(onOutput).toHaveBeenLastCalledWith(null)
    expect(video.muted).toBe(true)
    expect(mock.mixers[0].removeSource).toHaveBeenCalledWith('file')
    await preview()
    expect(video.play).toHaveBeenCalledTimes(2)
    expect(mock.mixers).toHaveLength(1)
    expect(onOutput.mock.calls[2][0]).not.toBeNull()
  })

  it('shows an actionable decode failure and keeps broken output unavailable', async () => {
    await render()
    const video = await chooseFile('unsupported.mov')
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 4 } })
    await act(async () => video.dispatchEvent(new Event('error')))
    expect(container.querySelector('[role=alert]')?.textContent).toContain('H.264 video and AAC audio')
    expect(button('Start preview').disabled).toBe(true)
    expect(onOutput).not.toHaveBeenCalled()
    expect(video.play).not.toHaveBeenCalled()
  })

  it('offers a deliberate retry when browser playback was blocked', async () => {
    await render()
    const video = await chooseFile()
    await ready(video)
    vi.mocked(video.play).mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'))
    await preview()
    expect(container.textContent).toContain('Playback needs your action')
    expect(button('Retry preview').disabled).toBe(false)
    expect(onOutput).not.toHaveBeenCalled()
    expect(video.muted).toBe(true)
    await act(async () => button('Retry preview').click())
    expect(onOutput).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Playing in local preview')
  })

  it('detaches shared output before a new file is installed and revokes the old URL', async () => {
    await render()
    const first = await chooseFile()
    await ready(first)
    await preview()
    mock.order.length = 0
    const lateReady = first.oncanplay!
    const second = await chooseFile('next.mp4')
    expect(mock.order[0]).toBe('detach')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-1')
    expect(first.getAttribute('src')).toBeNull()
    await act(async () => lateReady.call(first, new Event('canplay')))
    expect(container.textContent).toContain('Loading video…')
    expect(onOutput).toHaveBeenLastCalledWith(null)
    await ready(second)
    expect(onOutput).toHaveBeenLastCalledWith(null)
    expect(videoPlays()).toBe(1)
  })
  const videoPlays = () => vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length

  it('does not publish a video whose pending play finishes after another source was selected', async () => {
    await render()
    const video = await chooseFile()
    await ready(video)
    const pending = deferred<void>()
    vi.mocked(video.play).mockReturnValueOnce(pending.promise)
    await act(async () => button('Start preview').click())
    await act(async () => button('None').click())
    await act(async () => pending.resolve())
    expect(onOutput).not.toHaveBeenCalled()
    expect(mock.compositors[0].start).not.toHaveBeenCalled()
    expect(video.muted).toBe(true)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('does not capture on camera choice and stops late permission results after switching away', async () => {
    await render()
    await act(async () => button('Camera').click())
    expect(getUserMedia).not.toHaveBeenCalled()
    const pending = deferred<MediaStream>()
    getUserMedia.mockReturnValueOnce(pending.promise)
    await act(async () => button('Start preview').click())
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    await act(async () => button('None').click())
    const videoTrack = track('video')
    const audioTrack = track('audio')
    await act(async () => pending.resolve(new MediaStream([videoTrack, audioTrack])))
    expect(videoTrack.stop).toHaveBeenCalledOnce()
    expect(audioTrack.stop).toHaveBeenCalledOnce()
    expect(onOutput).not.toHaveBeenCalled()
  })

  it('releases camera and mic ownership and detaches program when the device ends', async () => {
    await render()
    const videoTrack = track('video')
    const audioTrack = track('audio')
    getUserMedia.mockResolvedValue(new MediaStream([videoTrack, audioTrack]))
    await act(async () => button('Camera').click())
    await preview()
    expect(onOutput).toHaveBeenCalledTimes(1)
    await act(async () => videoTrack.onended?.call(videoTrack, new Event('ended')))
    expect(onOutput).toHaveBeenLastCalledWith(null)
    expect(audioTrack.stop).toHaveBeenCalledOnce()
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Camera disconnected')
  })

  it('detaches output if an already playing file later fails to decode', async () => {
    await render()
    const video = await chooseFile()
    await ready(video)
    await preview()
    await act(async () => button('Stop preview').click())
    await preview()
    await act(async () => video.dispatchEvent(new Event('error')))
    expect(onOutput).toHaveBeenLastCalledWith(null)
    expect(button('Start preview').disabled).toBe(true)
    expect(video.muted).toBe(true)
  })

  it('stops the previous artwork program when the confirmed Spotify track changes', async () => {
    const images: { onload: (() => void) | null }[] = []
    vi.stubGlobal('Image', class {
      naturalWidth = 300; naturalHeight = 300; crossOrigin = ''; referrerPolicy = ''; src = ''
      onload: (() => void) | null = null; onerror: (() => void) | null = null
      constructor() { images.push(this) }
    })
    const spotifyTrack = { id: 'first', name: 'First', artists: [{ name: 'Artist' }], album: { name: 'Album', images: [{ url: 'https://i.scdn.co/art-one.jpg' }] }, uri: 'spotify:track:first', duration_ms: 30_000 }
    await act(async () => root.render(createElement(DJModePanel, { onOutputStream: onOutput, spotifyTrack })))
    await act(async () => button('Spotify artwork').click())
    await act(async () => images[0].onload?.())
    await preview()
    expect(onOutput).toHaveBeenCalledTimes(1)
    await act(async () => button('Spotify artwork').click())
    expect(onOutput).toHaveBeenCalledTimes(1)
    expect(button('Stop preview')).toBeDefined()
    mock.order.length = 0
    await act(async () => root.render(createElement(DJModePanel, { onOutputStream: onOutput, spotifyTrack: { ...spotifyTrack, id: 'second', name: 'Second' } })))
    expect(mock.order[0]).toBe('detach')
    expect(onOutput).toHaveBeenLastCalledWith(null)
    expect(button('Start preview').disabled).toBe(true)
    await act(async () => images[1].onload?.())
    expect(button('Start preview').disabled).toBe(false)
    expect(onOutput).toHaveBeenLastCalledWith(null)
  })

  it('gives a loading recovery action when a local video never produces frames', async () => {
    vi.useFakeTimers()
    await render()
    await chooseFile()
    await act(async () => vi.advanceTimersByTime(20_000))
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Download it fully to this device')
    expect(button('Start preview').disabled).toBe(true)
    expect(onOutput).not.toHaveBeenCalled()
  })

  it('revokes file resources and detaches the ready output on unmount', async () => {
    await render()
    const video = await chooseFile()
    await ready(video)
    await preview()
    await act(async () => root.unmount())
    expect(onOutput).toHaveBeenLastCalledWith(null)
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
    expect(video.oncanplay).toBeNull()
    expect(mock.mixers[0].destroy).toHaveBeenCalledOnce()
  })
})
