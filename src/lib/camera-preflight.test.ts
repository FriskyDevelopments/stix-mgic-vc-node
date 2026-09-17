import { describe, expect, it, vi } from 'vitest'
import { CameraPreflightError, checkCameraPreflight } from './camera-preflight'

function track(kind: 'video' | 'audio', options: Partial<MediaStreamTrack> = {}): MediaStreamTrack {
  return {
    kind, readyState: 'live', enabled: true, muted: false,
    getSettings: vi.fn(() => kind === 'video' ? { width: 1280, height: 720, frameRate: 30 } : {}),
    stop: vi.fn(), applyConstraints: vi.fn(), ...options,
  } as unknown as MediaStreamTrack
}

function stream(video: MediaStreamTrack[], audio: MediaStreamTrack[] = []): MediaStream {
  return {
    getVideoTracks: () => video, getAudioTracks: () => audio,
    getTracks: () => [...video, ...audio], addTrack: vi.fn(), removeTrack: vi.fn(), clone: vi.fn(),
  } as unknown as MediaStream
}

describe('local camera preflight', () => {
  it('returns the exact checked stream and reported settings without changing media', () => {
    const video = track('video')
    const audio = track('audio')
    const checked = stream([video], [audio])
    const result = checkCameraPreflight(checked)
    expect(result).toEqual({ stream: checked, videoTrack: video, video: { width: 1280, height: 720, frameRate: 30 }, microphone: 'ready' })
    expect(result.stream).toBe(checked)
    expect(video.stop).not.toHaveBeenCalled()
    expect(audio.stop).not.toHaveBeenCalled()
    expect(video.applyConstraints).not.toHaveBeenCalled()
    expect(checked.addTrack).not.toHaveBeenCalled()
    expect(checked.removeTrack).not.toHaveBeenCalled()
    expect(checked.clone).not.toHaveBeenCalled()
  })

  it.each([
    ['no stream', null, 'missing-camera'],
    ['no video', stream([]), 'missing-camera'],
    ['ended video', stream([track('video', { readyState: 'ended' })]), 'camera-ended'],
    ['disabled video', stream([track('video', { enabled: false })]), 'camera-disabled'],
    ['muted video source', stream([track('video', { muted: true })]), 'camera-unavailable'],
  ] as const)('reports %s without replacing the source', (_name, checked, code) => {
    expect(() => checkCameraPreflight(checked)).toThrow(CameraPreflightError)
    expect(() => checkCameraPreflight(checked)).toThrow(expect.objectContaining({ code }))
  })

  it.each([
    ['camera only', [], 'absent'],
    ['ended microphone', [track('audio', { readyState: 'ended' })], 'absent'],
    ['disabled microphone', [track('audio', { enabled: false })], 'muted'],
    ['muted microphone source', [track('audio', { muted: true })], 'muted'],
  ] as const)('accepts %s and reports its microphone state', (_name, audio, microphone) => {
    const checked = stream([track('video')], [...audio])
    expect(checkCameraPreflight(checked)).toMatchObject({ stream: checked, microphone })
  })

  it('selects a usable live track when an earlier video track ended', () => {
    const ended = track('video', { readyState: 'ended' })
    const live = track('video')
    expect(checkCameraPreflight(stream([ended, live])).video.height).toBe(720)
    expect(ended.getSettings).not.toHaveBeenCalled()
    expect(live.getSettings).toHaveBeenCalledOnce()
  })

  it('does not invent dimensions or expose invalid settings as measured metadata', () => {
    const settings = { width: 0, height: NaN, frameRate: Infinity, deviceId: 'checked-camera' }
    const video = track('video', { getSettings: () => settings })
    expect(checkCameraPreflight(stream([video])).video).toEqual({})
    expect(settings.width).toBe(0)
    expect(checkCameraPreflight(stream([track('video', { getSettings: () => ({}) })])).video).toEqual({})
  })

  it('gives an actionable error when camera settings cannot be read', () => {
    const video = track('video', { getSettings: () => { throw new Error('Device disappeared') } })
    expect(() => checkCameraPreflight(stream([video]))).toThrow('Run camera setup again.')
  })
})
