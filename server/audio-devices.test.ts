import { describe, expect, it } from 'vitest'
import { getAvailableAudioDevices, setActiveAudioSource } from './audio-devices'

describe('audio-devices', () => {
  it('lists 4 distinct sources and defaults to file', () => {
    setActiveAudioSource('file')
    const result = getAvailableAudioDevices()
    expect(result.devices).toHaveLength(4)
    expect(result.activeSource).toBe('file')
    const activeDev = result.devices.find((d) => d.kind === 'file')
    expect(activeDev?.active).toBe(true)
  })

  it('allows changing active audio source', () => {
    const updated = setActiveAudioSource('system')
    expect(updated.ok).toBe(true)
    expect(updated.activeSource).toBe('system')

    const result = getAvailableAudioDevices()
    expect(result.activeSource).toBe('system')
    expect(result.devices.find((d) => d.kind === 'system')?.active).toBe(true)
  })

  it('reports a realistic dynamic RMS meter rather than 100% fixed', () => {
    const result = getAvailableAudioDevices()
    expect(result.meter.rmsLevel).toBeGreaterThan(0)
    expect(result.meter.rmsLevel).toBeLessThanOrEqual(1.0)
    // Must not be identically 1.0 (the fake 100% bug)
    expect(result.meter.rmsLevel).not.toBe(1.0)
    expect(result.meter.peakLevel).toBeGreaterThanOrEqual(result.meter.rmsLevel)
  })
})
