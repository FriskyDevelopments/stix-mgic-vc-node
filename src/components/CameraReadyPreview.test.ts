import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CameraReadyPreview } from './CameraReadyPreview'

let container: HTMLDivElement
let root: Root
const stop = vi.fn()
const videoTrack = { enabled: true, stop }
const audioTrack = { enabled: true, stop }
const stream = {
  getTracks: () => [videoTrack, audioTrack],
  getVideoTracks: () => [videoTrack],
  getAudioTracks: () => [audioTrack],
} as unknown as MediaStream
const click = (label: string) => act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent === label)!.click())

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  })
  videoTrack.enabled = true
  audioTrack.enabled = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('camera preview framing', () => {
  it('keeps the framing preference chosen during camera setup', async () => {
    window.localStorage.setItem('stix-vc-node:camera-preview-fit', JSON.stringify('contain'))
    await act(async () => root.render(createElement(CameraReadyPreview, { stream, inRoom: false, onStop: vi.fn() })))
    expect(container.querySelector('video')?.style.objectFit).toBe('contain')
    await click('Fill frame')
    expect(window.localStorage.getItem('stix-vc-node:camera-preview-fit')).toBe(JSON.stringify('cover'))
  })

  it('bounds the video to the frame and changes crop without interrupting its live stream', async () => {
    await act(async () => root.render(createElement(CameraReadyPreview, { stream, inRoom: true, onStop: vi.fn() })))
    const video = container.querySelector('video')!
    expect(video.classList.contains('absolute')).toBe(true)
    expect(video.parentElement?.classList.contains('overflow-hidden')).toBe(true)
    expect(video.style.objectFit).toBe('cover')
    await click('Fit camera')
    expect(video.style.objectFit).toBe('contain')
    await click('Fill frame')
    expect(video.style.objectFit).toBe('cover')
    expect(container.querySelector('video')).toBe(video)
    expect(video.srcObject).toBe(stream)
    expect(stop).not.toHaveBeenCalled()
  })

  it('clearly labels camera-only setup and does not offer a microphone that does not exist', async () => {
    const cameraOnly = { ...stream, getAudioTracks: () => [] } as unknown as MediaStream
    await act(async () => root.render(createElement(CameraReadyPreview, { stream: cameraOnly, inRoom: false, onStop: vi.fn() })))
    expect(container.textContent).toContain('Camera only · no microphone')
    expect(container.textContent).not.toContain('Unmute microphone')
    expect(container.textContent).toContain('Turn camera off')
  })
})
