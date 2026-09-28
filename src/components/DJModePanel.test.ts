import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DJModePanel } from './DJModePanel'
import type { SpotifyTrack } from '@/lib/spotify'

const mocked = vi.hoisted(() => ({ setSource: vi.fn(), start: vi.fn(), stop: vi.fn(), resume: vi.fn(), canvas: null as HTMLCanvasElement | null }))
vi.mock('@/lib/compositor', () => ({
  MediaCompositor: class { prepareSource = vi.fn().mockResolvedValue(undefined); setSource = mocked.setSource; setOverlay = vi.fn(); start = mocked.start; stop = mocked.stop; getCanvas = () => mocked.canvas },
  AudioMixer: class { removeSource = vi.fn(); resume = mocked.resume; destroy = vi.fn(); setGain = vi.fn(); getOutputStream = () => ({ getAudioTracks: () => [] }) },
  combineStreams: (video: MediaStream) => video,
}))
vi.mock('@/components/ui/slider', () => ({ Slider: () => null }))
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => createElement('div', {}, children),
  SelectContent: () => null,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => createElement('div', {}, children),
  SelectValue: () => null,
  SelectItem: () => null,
}))

class ArtworkImage {
  crossOrigin = ''
  referrerPolicy = ''
  naturalWidth = 640
  naturalHeight = 640
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  url = ''
  corsAtRequest = ''
  constructor() { images.push(this) }
  set src(value: string) { this.url = value; this.corsAtRequest = this.crossOrigin }
}
let images: ArtworkImage[]
let root: Root
let container: HTMLDivElement
const output = { getTracks: () => [] } as unknown as MediaStream
const track = (id: string): SpotifyTrack => ({ id, name: `Song ${id}`, artists: [{ name: 'Artist' }], album: { name: 'Album', images: [{ url: `https://i.scdn.co/image/${id}` }] }, duration_ms: 180000, uri: `spotify:track:${id}` })
const render = (spotifyTrack: SpotifyTrack | null = track('a'), onOutputStream?: (stream: MediaStream | null) => void) => act(async () => root.render(createElement(DJModePanel, { spotifyTrack, onOutputStream })))
const button = (label: string) => Array.from(container.querySelectorAll('button')).find(button => button.textContent === label)!
const click = (label: string) => act(async () => button(label).click())

beforeEach(() => {
  vi.clearAllMocks()
  images = []
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('Image', ArtworkImage)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: vi.fn().mockResolvedValue([]) } })
  mocked.canvas = document.createElement('canvas')
  mocked.start.mockReturnValue(output)
  mocked.resume.mockResolvedValue(undefined)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Reflect.deleteProperty(navigator, 'mediaDevices')
  vi.unstubAllGlobals()
})

describe('DJ Spotify artwork source', () => {
  it('places Media Output first and attaches its canvas on the first local preview, without claiming LIVE', async () => {
    await render()
    expect(container.textContent!.indexOf('Media Output')).toBeLessThan(container.textContent!.indexOf('Video Source'))
    await click('Spotify artwork')
    expect(images[0].corsAtRequest).toBe('anonymous')
    expect(images[0].referrerPolicy).toBe('no-referrer')
    expect(button('Start preview').disabled).toBe(true)
    await act(async () => images[0].onload?.())
    await click('Start preview')
    expect(container.contains(mocked.canvas)).toBe(true)
    expect(container.textContent).toContain('Preview active')
    expect(container.textContent).not.toContain('LIVE')
    expect(container.textContent).toContain('Album image only')
  })

  it('clears old artwork immediately and ignores a late prior track image', async () => {
    await render()
    await click('Spotify artwork')
    const oldImage = images[0]
    const oldLoad = oldImage.onload!
    await render(track('b'))
    expect(mocked.setSource).toHaveBeenLastCalledWith({ type: 'none' })
    await act(async () => oldLoad())
    expect(mocked.setSource).toHaveBeenLastCalledWith({ type: 'none' })
    await act(async () => images[1].onload?.())
    expect(mocked.setSource).toHaveBeenLastCalledWith({ type: 'image', image: images[1] })
    expect(container.textContent).toContain('Song b')
    expect(container.textContent).not.toContain('Song a')
  })

  it('never restores artwork after the operator switches to another visual source', async () => {
    await render()
    await click('Spotify artwork')
    const staleLoad = images[0].onload!
    await click('None')
    await act(async () => staleLoad())
    expect(mocked.setSource).toHaveBeenLastCalledWith({ type: 'none' })
  })

  it('shows missing and rejected artwork states without retaining a prior image', async () => {
    await render()
    await click('Spotify artwork')
    await act(async () => images[0].onload?.())
    await render(null)
    expect(mocked.setSource).toHaveBeenLastCalledWith({ type: 'none' })
    expect(container.textContent).toContain('Play a track with artwork')
    await render(track('c'))
    await act(async () => images[1].onerror?.())
    expect(container.textContent).toContain('artwork could not be loaded')
    expect(button('Start preview').disabled).toBe(true)
    expect(mocked.setSource).toHaveBeenLastCalledWith({ type: 'none' })
  })

  it('passes output to an explicitly connected consumer but still does not claim a broadcast is live', async () => {
    const consume = vi.fn()
    await render(track('a'), consume)
    await click('Spotify artwork')
    await act(async () => images[0].onload?.())
    await click('Start preview')
    expect(consume).toHaveBeenCalledWith(output)
    expect(container.textContent).toContain('Output ready')
    expect(container.textContent).not.toContain('LIVE')
    await click('Stop preview')
    expect(consume).toHaveBeenLastCalledWith(null)
  })
})
