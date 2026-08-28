import { describe, expect, it } from 'vitest'
import {
  ALPHA_BANNER,
  generateDemoStreamKey,
  getArchitectureLayers,
  getPlatformDestinationLabel,
  getRuntimeBanner,
} from './alpha'
import { isDiscordConfigured } from './auth'
import { isSpotifyConfigured } from './spotify'

describe('alpha value helpers', () => {
  it('exposes a clear alpha banner', () => {
    expect(ALPHA_BANNER).toMatch(/Alpha/i)
    expect(ALPHA_BANNER).toMatch(/real providers only/i)
    expect(ALPHA_BANNER).toMatch(/unavailable/i)
  })

  it('returns a runtime banner for current mode', () => {
    expect(getRuntimeBanner()).toMatch(/control surface|Live control plane/i)
  })

  it('maps platform destinations for architecture', () => {
    expect(getPlatformDestinationLabel('telegram')).toBe('Telegram VC')
    expect(getPlatformDestinationLabel('discord')).toBe('Discord Voice')
  })

  it('builds architecture layers for Discord RTMP', () => {
    expect(getArchitectureLayers('rtmp', 'discord')).toEqual([
      'OBS',
      'VC NODE',
      'Discord RTMP',
    ])
  })

  it('builds architecture layers for Telegram ClipsFlow', () => {
    expect(getArchitectureLayers('clipsflow', 'telegram')).toEqual([
      'ClipsFlow',
      'VC NODE',
      'Telegram VC',
    ])
  })

  it('uses demo stream key prefix', () => {
    expect(generateDemoStreamKey().startsWith('sk_placeholder_')).toBe(true)
  })
})

describe('optional integration config guards', () => {
  it('reports Discord as unconfigured without env', () => {
    expect(isDiscordConfigured()).toBe(false)
  })

  it('reports Spotify as unconfigured without env', () => {
    expect(isSpotifyConfigured()).toBe(false)
  })
})
