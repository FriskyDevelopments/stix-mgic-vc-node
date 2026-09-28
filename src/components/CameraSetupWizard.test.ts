import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CameraSetupWizard } from './CameraSetupWizard'

const getUserMedia = vi.fn()
const enumerateDevices = vi.fn()
const closeAudio = vi.fn().mockResolvedValue(undefined)
const disconnectAudio = vi.fn()
const devices = [
  { deviceId: 'camera-a', label: 'Front camera', kind: 'videoinput' },
  { deviceId: 'camera-b', label: 'OBS Virtual Camera', kind: 'videoinput' },
  { deviceId: 'mic-a', label: 'Desk microphone', kind: 'audioinput' },
] as MediaDeviceInfo[]

function media(videoId = 'camera-a', audioId: string | null = 'mic-a') {
  const videoTrack = Object.assign(new EventTarget(), { label: 'Front camera', stop: vi.fn(), getSettings: () => ({ deviceId: videoId }) })
  const audioTrack = Object.assign(new EventTarget(), { label: 'Desk microphone', stop: vi.fn(), getSettings: () => ({ deviceId: audioId }) })
  const stream = { getTracks: () => audioId === null ? [videoTrack] : [videoTrack, audioTrack], getVideoTracks: () => [videoTrack], getAudioTracks: () => audioId === null ? [] : [audioTrack] } as unknown as MediaStream
  return { stream, videoTrack, audioTrack }
}

let container: HTMLDivElement
let root: Root
const onComplete = vi.fn()
const onCancel = vi.fn()
const button = (text: string) => Array.from(container.querySelectorAll('button')).find((node) => node.textContent === text)!
const render = (autoStart = false) => act(async () => root.render(createElement(StrictMode, null, createElement(CameraSetupWizard, {
  initialVideoDeviceId: 'camera-a', initialAudioDeviceId: 'mic-a', autoStart, onComplete, onCancel,
}))))
const click = (text: string) => act(async () => button(text).click())

beforeEach(() => {
  vi.clearAllMocks()
  getUserMedia.mockReset()
  enumerateDevices.mockResolvedValue(devices)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia, enumerateDevices, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  } })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  })
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('AudioContext', class {
    state = 'running'
    resume = vi.fn().mockResolvedValue(undefined)
    close = closeAudio
    createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: disconnectAudio })
    createAnalyser = () => ({ fftSize: 256, getByteTimeDomainData: (data: Uint8Array) => data.fill(152), disconnect: disconnectAudio })
  })
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

describe('camera setup permission and ownership', () => {
  it('opens a preview directly after the parent setup action, including StrictMode rehearsal', async () => {
    const preview = media()
    getUserMedia.mockResolvedValue(preview.stream)
    enumerateDevices.mockResolvedValueOnce([{ kind: 'videoinput', deviceId: '', label: '' }])
    await act(async () => root.render(createElement(StrictMode, {}, createElement(CameraSetupWizard, { autoStart: true, onComplete }))))
    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({ video: true, audio: true })
    expect(container.querySelector('video')?.srcObject).toBe(preview.stream)
    expect(container.querySelector('select')?.textContent).toContain('OBS Virtual Camera')
    expect(preview.videoTrack.stop).not.toHaveBeenCalled()
  })

  it('does not describe permission-hidden devices as missing cameras', async () => {
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: '', label: '' }])
    await render()
    expect(container.textContent).toContain('Your browser has not revealed any cameras yet')
    expect(button('Allow access & find devices')).toBeDefined()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('fits or fills the camera frame without replacing the video or restarting capture', async () => {
    const preview = media()
    getUserMedia.mockResolvedValue(preview.stream)
    await render(true)
    const video = container.querySelector('video')!
    expect(video.style.objectFit).toBe('cover')
    await click('Fit camera')
    expect(video.style.objectFit).toBe('contain')
    await click('Fill frame')
    expect(video.style.objectFit).toBe('cover')
    expect(container.querySelector('video')).toBe(video)
    expect(video.srcObject).toBe(preview.stream)
    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(preview.videoTrack.stop).not.toHaveBeenCalled()
  })

  it('allows the browser to recover a stale saved camera ID and shows the device actually tested', async () => {
    const preview = media('camera-b')
    getUserMedia.mockResolvedValue(preview.stream)
    await render(true)
    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({ video: { deviceId: { ideal: 'camera-a' } }, audio: { deviceId: { ideal: 'mic-a' } } })
    expect(container.querySelector('select')?.value).toBe('camera-b')
    expect(container.textContent).toContain('A saved device is no longer available')
    expect(container.querySelector('video')?.srcObject).toBe(preview.stream)
  })

  it('shows an available camera when a missing microphone rejects the combined request, and requires camera-only confirmation', async () => {
    const preview = media()
    const cameraOnly = { ...preview.stream, getTracks: () => [preview.videoTrack], getAudioTracks: () => [] } as unknown as MediaStream
    getUserMedia.mockRejectedValueOnce(new DOMException('No audio input', 'NotFoundError')).mockResolvedValueOnce(cameraOnly)
    await render(true)
    expect(getUserMedia).toHaveBeenLastCalledWith({ video: { deviceId: { ideal: 'camera-a' } }, audio: false })
    expect(container.querySelector('video')?.srcObject).toBe(cameraOnly)
    expect(container.textContent).toContain('No microphone was found')
    expect(container.textContent).toContain('Continue with my camera only, without a microphone')
    expect(button('Continue').disabled).toBe(true)
    await act(async () => container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => input.click()))
    await click('Continue')
    await click('Use these devices')
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ videoDeviceId: 'camera-a', audioDeviceId: '', stream: cameraOnly })
    expect(preview.videoTrack.stop).not.toHaveBeenCalled()
  })

  it('does not start a camera-only fallback after setup was cancelled', async () => {
    let reject!: (reason: unknown) => void
    getUserMedia.mockImplementation(() => new Promise<MediaStream>((_, fail) => { reject = fail }))
    await render(true)
    await click('Cancel setup')
    await act(async () => reject(new DOMException('No audio input', 'NotFoundError')))
    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(container.querySelector('video')).toBeNull()
  })

  it('does not capture on mount, then uses remembered devices as preferences after explicit access', async () => {
    const preview = media()
    getUserMedia.mockResolvedValue(preview.stream)
    await render()
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(closeAudio).not.toHaveBeenCalled()
    await click('Allow access & find devices')
    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({ video: { deviceId: { ideal: 'camera-a' } }, audio: { deviceId: { ideal: 'mic-a' } } })
    expect(container.querySelector('video')?.srcObject).toBe(preview.stream)
    expect(container.querySelector('meter')?.value).toBeGreaterThan(0)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('picking up sound')
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('starts only once when the parent marks an explicit setup entry, even under StrictMode', async () => {
    const preview = media()
    getUserMedia.mockResolvedValue(preview.stream)
    await render(true)
    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(container.querySelector('video')?.srcObject).toBe(preview.stream)
    expect(onComplete).not.toHaveBeenCalled()
    await act(async () => root.render(null))
    expect(preview.videoTrack.stop).toHaveBeenCalledOnce()
    expect(preview.audioTrack.stop).toHaveBeenCalledOnce()
  })

  it('uses exact constraints for devices explicitly selected in the wizard', async () => {
    getUserMedia.mockResolvedValue(media('camera-b').stream)
    await render()
    await act(async () => {
      const [camera, microphone] = container.querySelectorAll('select')
      camera.value = 'camera-b'
      camera.dispatchEvent(new Event('change', { bubbles: true }))
      microphone.value = 'mic-a'
      microphone.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(getUserMedia).not.toHaveBeenCalled()
    await click('Allow access & find devices')
    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({ video: { deviceId: { exact: 'camera-b' } }, audio: { deviceId: { exact: 'mic-a' } } })
  })

  it('offers a camera-only fallback after a missing microphone and requires its explicit confirmation', async () => {
    const preview = media('camera-a', null)
    getUserMedia.mockRejectedValueOnce(new DOMException('Missing microphone', 'NotFoundError')).mockResolvedValueOnce(preview.stream)
    await render()
    expect(getUserMedia).not.toHaveBeenCalled()
    await click('Allow access & find devices')
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(getUserMedia).toHaveBeenLastCalledWith({ video: { deviceId: { ideal: 'camera-a' } }, audio: false })
    expect(container.textContent).toContain('Continue with my camera only, without a microphone.')
    const [cameraCheck, cameraOnlyCheck] = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    await act(async () => cameraCheck.click())
    expect(button('Continue').disabled).toBe(true)
    expect(onComplete).not.toHaveBeenCalled()
    await act(async () => cameraOnlyCheck.click())
    await click('Continue')
    await click('Use these devices')
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ videoDeviceId: 'camera-a', audioDeviceId: '', stream: preview.stream })
    await act(async () => root.render(null))
    expect(preview.videoTrack.stop).not.toHaveBeenCalled()
    expect(closeAudio).toHaveBeenCalled()
  })

  it('stops every owned track and microphone analysis on cancel', async () => {
    const preview = media()
    getUserMedia.mockResolvedValue(preview.stream)
    await render()
    await click('Allow access & find devices')
    await click('Cancel setup')
    expect(preview.videoTrack.stop).toHaveBeenCalledOnce()
    expect(preview.audioTrack.stop).toHaveBeenCalledOnce()
    expect(closeAudio).toHaveBeenCalled()
    expect(disconnectAudio).toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('stops a permission result that arrives after cancellation', async () => {
    const preview = media()
    let resolve!: (stream: MediaStream) => void
    getUserMedia.mockImplementation(() => new Promise<MediaStream>((done) => { resolve = done }))
    await render()
    await click('Allow access & find devices')
    await click('Cancel setup')
    await act(async () => resolve(preview.stream))
    expect(preview.videoTrack.stop).toHaveBeenCalledOnce()
    expect(preview.audioTrack.stop).toHaveBeenCalledOnce()
    expect(container.querySelector('video')).toBeNull()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('stops a permission result that arrives after unmount', async () => {
    const preview = media()
    let resolve!: (stream: MediaStream) => void
    getUserMedia.mockImplementation(() => new Promise<MediaStream>((done) => { resolve = done }))
    await render()
    await click('Allow access & find devices')
    await act(async () => root.render(null))
    await act(async () => resolve(preview.stream))
    expect(preview.videoTrack.stop).toHaveBeenCalledOnce()
    expect(preview.audioTrack.stop).toHaveBeenCalledOnce()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('stops an active unconfirmed preview when the wizard unmounts', async () => {
    const preview = media()
    getUserMedia.mockResolvedValue(preview.stream)
    await render()
    await click('Allow access & find devices')
    await act(async () => root.render(null))
    expect(preview.videoTrack.stop).toHaveBeenCalledOnce()
    expect(preview.audioTrack.stop).toHaveBeenCalledOnce()
    expect(closeAudio).toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('requires an explicit retest after selecting another camera and closes the old preview', async () => {
    const first = media()
    const second = media('camera-b')
    getUserMedia.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream)
    await render()
    await click('Allow access & find devices')
    await act(async () => {
      const select = container.querySelector('select')!
      select.value = 'camera-b'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Test these devices before continuing')
    await click('Test selected devices')
    expect(getUserMedia).toHaveBeenLastCalledWith({ video: { deviceId: { exact: 'camera-b' } }, audio: { deviceId: { ideal: 'mic-a' } } })
    expect(first.videoTrack.stop).toHaveBeenCalledOnce()
    expect(first.audioTrack.stop).toHaveBeenCalledOnce()
    expect(container.querySelector('video')?.srcObject).toBe(second.stream)
  })

  it('transfers only a tested, confirmed stream and keeps it alive when the wizard unmounts', async () => {
    const preview = media()
    getUserMedia.mockResolvedValue(preview.stream)
    await render()
    await click('Allow access & find devices')
    expect(button('Continue').disabled).toBe(true)
    await act(async () => container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => input.click()))
    await click('Continue')
    await click('Back to preview')
    expect(container.querySelector('video')?.srcObject).toBe(preview.stream)
    await click('Continue')
    expect(onComplete).not.toHaveBeenCalled()
    await click('Use these devices')
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ videoDeviceId: 'camera-a', audioDeviceId: 'mic-a', stream: preview.stream })
    await act(async () => root.render(null))
    expect(preview.videoTrack.stop).not.toHaveBeenCalled()
    expect(preview.audioTrack.stop).not.toHaveBeenCalled()
    expect(closeAudio).toHaveBeenCalled()
  })

  it.each([
    ['NotAllowedError', 'access was blocked'],
    ['NotFoundError', 'camera or microphone was not found'],
    ['OverconstrainedError', 'selected device is no longer available'],
    ['NotReadableError', 'Close other apps'],
  ])('explains %s without confirming setup', async (name, message) => {
    getUserMedia.mockRejectedValue(new DOMException('Device failure', name))
    await render()
    await click('Allow access & find devices')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(message)
    expect(button('Try again')).toBeDefined()
    expect(onComplete).not.toHaveBeenCalled()
    expect(closeAudio).toHaveBeenCalled()
  })

  it('returns to device selection if the active camera disconnects', async () => {
    const preview = media()
    getUserMedia.mockResolvedValue(preview.stream)
    await render()
    await click('Allow access & find devices')
    await act(async () => preview.videoTrack.dispatchEvent(new Event('ended')))
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('device disconnected or stopped')
    expect(preview.audioTrack.stop).toHaveBeenCalledOnce()
    expect(onComplete).not.toHaveBeenCalled()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })
})
