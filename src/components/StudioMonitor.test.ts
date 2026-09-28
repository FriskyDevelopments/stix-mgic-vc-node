import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudioMonitor, type StudioMonitorProps } from './StudioMonitor'

class TestTrack extends EventTarget {
  kind = 'video'
  enabled = true
  muted = false
  readyState: 'live' | 'ended' = 'live'
  stop = vi.fn()
}

function stream(id: string, tracks: TestTrack[] = [new TestTrack()]): MediaStream {
  return Object.assign(new EventTarget(), {
    id, getVideoTracks: () => tracks, getTracks: () => tracks, getAudioTracks: () => [],
  }) as unknown as MediaStream
}

describe('StudioMonitor controlled video output', () => {
  let container: HTMLDivElement
  let root: Root | null
  let props: StudioMonitorProps
  let play: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    props = {
      sources: [{ id: 'camera', label: 'Camera', stream: null }, { id: 'screen', label: 'Screen', stream: null }, { id: 'studio', label: 'Studio', stream: null }],
      previewId: 'camera', programId: null, programStream: null, roomId: null, pending: false,
      onPreviewChange: vi.fn(), onShare: vi.fn(), onClear: vi.fn(),
      onOpenCameraSetup: vi.fn(), onOpenScreenControls: vi.fn(), onOpenStudioControls: vi.fn(),
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    container.remove()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const render = async (next: Partial<StudioMonitorProps> = {}) => {
    props = { ...props, ...next }
    await act(async () => root?.render(createElement(StudioMonitor, props)))
  }
  const pane = (name = 'preview') => container.querySelector(`[data-pane="${name}"]`)!
  const video = (name = 'preview') => pane(name).querySelector('video')!
  const button = (text: string) => Array.from(container.querySelectorAll('button')).find((element) => element.textContent === text || element.getAttribute('aria-label') === text)!
  const ready = async (name = 'preview') => {
    const element = video(name)
    Object.defineProperties(element, { readyState: { configurable: true, value: 2 }, videoWidth: { configurable: true, value: 1280 }, videoHeight: { configurable: true, value: 720 } })
    await act(async () => element.dispatchEvent(new Event('loadeddata')))
  }

  it('shows distinct empty preview/output states without acquiring or sharing media', async () => {
    await render()
    expect(container.textContent).toContain('Preview your camera')
    expect(container.textContent).toContain('Your next scene goes here')
    expect(container.textContent).toContain('Not shared')
    expect(button('Prepare output').disabled).toBe(true)
    expect(props.onShare).not.toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
    expect(video().muted).toBe(true)
    expect(video().playsInline).toBe(true)
  })

  it('waits for an actual video frame before allowing explicit preparation', async () => {
    const camera = stream('camera-1')
    await render({ sources: [{ id: 'camera', label: 'Camera', stream: camera }] })
    expect(video().srcObject).toBe(camera)
    expect(pane().getAttribute('data-frame-state')).toBe('loading')
    expect(button('Prepare output').disabled).toBe(true)
    await ready()
    expect(pane().textContent).toContain('1280 × 720')
    expect(button('Prepare output').disabled).toBe(false)
    expect(props.onShare).not.toHaveBeenCalled()
    await act(async () => button('Prepare output').click())
    expect(props.onShare).toHaveBeenCalledTimes(1)
    expect(video('output').srcObject).toBeNull()
    expect(container.textContent).toContain('Not shared')
  })

  it('selects previews through the parent without changing or sharing the confirmed output', async () => {
    const camera = stream('camera-1')
    const screen = stream('screen-1')
    await render({ sources: [{ id: 'camera', label: 'Camera', stream: camera }, { id: 'screen', label: 'Screen', stream: screen }], programId: 'camera', programStream: camera, roomId: 'room-1' })
    await ready()
    const sourceButton = container.querySelectorAll<HTMLButtonElement>('.studio-monitor__source-select')[1]
    await act(async () => sourceButton.click())
    expect(props.onPreviewChange).toHaveBeenCalledExactlyOnceWith('screen')
    expect(props.onShare).not.toHaveBeenCalled()
    expect(video('output').srcObject).toBe(camera)
    await render({ previewId: 'screen' })
    expect(video().srcObject).toBe(screen)
    expect(button('Share preview with room').disabled).toBe(true)
    await ready()
    expect(button('Share preview with room').disabled).toBe(false)
    expect(video('output').srcObject).toBe(camera)
  })

  it('shows the exact confirmed stream when its source id has a newer stream', async () => {
    const confirmed = stream('camera-old')
    const next = stream('camera-new')
    await render({ sources: [{ id: 'camera', label: 'Camera', stream: next }], programId: 'camera', programStream: confirmed, roomId: 'room-1', pending: true })
    await ready()
    expect(video().srcObject).toBe(next)
    expect(video('output').srcObject).toBe(confirmed)
    expect(button('Updating…').disabled).toBe(true)
    expect(container.textContent).toContain('Shared source')
    await render({ pending: false, error: 'The room did not accept the new source.' })
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('The room did not accept the new source.')
    expect(video('output').srcObject).toBe(confirmed)
  })

  it('only labels output shared when a room and confirmed output exist', async () => {
    const camera = stream('camera-1')
    await render({ sources: [{ id: 'camera', label: 'Camera', stream: camera }], programId: 'camera', programStream: camera })
    expect(container.textContent).toContain('Output prepared')
    expect(container.textContent).not.toContain('Shared source')
    await render({ roomId: 'room-1' })
    expect(container.textContent).toContain('Shared source')
    await act(async () => button('Stop sharing video').click())
    expect(props.onClear).toHaveBeenCalledTimes(1)
    expect(video('output').srcObject).toBe(camera)
    await render({ programId: null, programStream: null })
    expect(container.textContent).toContain('No video shared')
    expect(video('output').srcObject).toBeNull()
  })

  it('reports ended video and disables sharing instead of keeping a ready badge', async () => {
    const track = new TestTrack()
    await render({ sources: [{ id: 'camera', label: 'Camera', stream: stream('camera-1', [track]) }] })
    await ready()
    await act(async () => { track.readyState = 'ended'; track.dispatchEvent(new Event('ended')) })
    expect(pane().getAttribute('data-frame-state')).toBe('ended')
    expect(button('Prepare output').disabled).toBe(true)
    expect(pane().textContent).not.toContain('1280 × 720')
    expect(track.stop).not.toHaveBeenCalled()
  })

  it('observes disabled tracks and keeps stalled video waiting until frames return', async () => {
    const track = new TestTrack()
    await render({ sources: [{ id: 'camera', label: 'Camera', stream: stream('camera-1', [track]) }] })
    await ready()
    await act(async () => video().dispatchEvent(new Event('stalled')))
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(pane().getAttribute('data-frame-state')).toBe('waiting')
    expect(button('Prepare output').disabled).toBe(true)
    await act(async () => video().dispatchEvent(new Event('playing')))
    expect(pane().getAttribute('data-frame-state')).toBe('ready')
    track.enabled = false
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(pane().getAttribute('data-frame-state')).toBe('disabled')
    expect(button('Prepare output').disabled).toBe(true)
  })

  it('shows media failures and lets the user explicitly resume a blocked preview', async () => {
    await render({ sources: [{ id: 'camera', label: 'Camera', stream: stream('camera-1') }] })
    await act(async () => video().dispatchEvent(new Event('error')))
    expect(pane().getAttribute('data-frame-state')).toBe('error')
    play.mockRejectedValueOnce(new DOMException('Not allowed', 'NotAllowedError'))
    await act(async () => button('Resume preview').click())
    expect(play).toHaveBeenCalledTimes(1)
    expect(pane().getAttribute('data-frame-state')).toBe('blocked')
    expect(button('Prepare output').disabled).toBe(true)
  })

  it('keeps fit/fill local and opens fullscreen only through its explicit button', async () => {
    const camera = stream('camera-1')
    await render({ sources: [{ id: 'camera', label: 'Camera', stream: camera }] })
    const frame = pane().querySelector('.studio-monitor__frame')!
    const fullscreen = vi.fn().mockResolvedValue(undefined)
    Object.assign(frame, { requestFullscreen: fullscreen })
    await act(async () => Array.from(pane().querySelectorAll('button')).find((item) => item.textContent === 'Fill')!.click())
    expect(video().style.objectFit).toBe('cover')
    expect(video('output').style.objectFit).toBe('contain')
    expect(fullscreen).not.toHaveBeenCalled()
    await act(async () => button('Fullscreen preview').click())
    expect(fullscreen).toHaveBeenCalledTimes(1)
    expect(props.onShare).not.toHaveBeenCalled()
  })

  it('delegates source setup without obtaining streams or selecting output', async () => {
    await render()
    await act(async () => button('Camera setup').click())
    await act(async () => button('Screen controls').click())
    await act(async () => button('Studio controls').click())
    expect(props.onOpenCameraSetup).toHaveBeenCalledTimes(1)
    expect(props.onOpenScreenControls).toHaveBeenCalledTimes(1)
    expect(props.onOpenStudioControls).toHaveBeenCalledTimes(1)
    expect(props.onShare).not.toHaveBeenCalled()
  })

  it('detaches previews and listeners on unmount while leaving source tracks running', async () => {
    const track = new TestTrack()
    const camera = stream('camera-1', [track])
    await render({ sources: [{ id: 'camera', label: 'Camera', stream: camera }], programId: 'camera', programStream: camera })
    const local = video()
    const output = video('output')
    await act(async () => { root?.unmount(); root = null })
    expect(local.srcObject).toBeNull()
    expect(output.srcObject).toBeNull()
    expect(track.stop).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
