import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioMixer } from './audio-mixer'

describe('AudioMixer retry and ownership', () => {
  let context: any
  beforeEach(() => {
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn() })
    const elements = new WeakSet<HTMLMediaElement>()
    context = {
      state: 'suspended', resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
      destination: {},
      createGain: vi.fn(() => ({ ...node(), gain: { value: 1 } })),
      createMediaStreamDestination: vi.fn(() => ({ stream: { getTracks: () => [context.outputTrack] } })),
      outputTrack: { stop: vi.fn() },
      createMediaElementSource: vi.fn((element: HTMLMediaElement) => {
        if (elements.has(element)) throw new DOMException('already connected', 'InvalidStateError')
        elements.add(element)
        return node()
      }),
    }
    vi.stubGlobal('AudioContext', class { constructor() { return context } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('reconnects the same file node across stop and retry without InvalidStateError', () => {
    const mixer = new AudioMixer()
    const video = document.createElement('video')
    mixer.addMediaElement(video)
    const node = context.createMediaElementSource.mock.results[0].value
    mixer.removeSource('file')
    expect(node.disconnect).toHaveBeenCalledOnce()
    expect(() => mixer.addMediaElement(video)).not.toThrow()
    expect(context.createMediaElementSource).toHaveBeenCalledOnce()
    expect(node.connect).toHaveBeenCalledTimes(2)
    expect(context.createGain.mock.results[1].value.gain.value).toBe(0.8)
  })

  it('creates separate nodes for replacement files and stops the owned audio track on destroy', () => {
    const mixer = new AudioMixer()
    mixer.addMediaElement(document.createElement('video'))
    mixer.setGain('file', 0.3)
    const first = context.createMediaElementSource.mock.results[0].value
    mixer.addMediaElement(document.createElement('video'))
    expect(first.disconnect).toHaveBeenCalledOnce()
    expect(context.createGain.mock.results[1].value.gain.value).toBe(0.3)
    mixer.destroy()
    expect(context.outputTrack.stop).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
  })
})
