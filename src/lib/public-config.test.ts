import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPublicConfig, getCachedPublicConfig, resetPublicConfigCache } from './public-config'

const CONFIG = {
  discordClientId: null,
  telegramBotUsername: 'STIXSIGNAL_BOT',
  authRequired: true,
  mediaPlaneEnabled: true,
  friskydevEnabled: true,
  friskydevIdConfigured: true,
  supabaseIdentityConfigured: true,
  supabaseUrl: 'https://example.supabase.co',
  supabasePublishableKey: 'publishable-test-key',
  spotifyClientId: null,
  identityProvider: 'supabase',
  identityReady: true,
}

describe('runtime public config', () => {
  beforeEach(() => {
    resetPublicConfigCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetPublicConfigCache()
  })

  it('reads the bot username the node serves, which no VITE_ build arg carries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => CONFIG })
    vi.stubGlobal('fetch', fetchMock)

    const config = await fetchPublicConfig()

    expect(config?.telegramBotUsername).toBe('STIXSIGNAL_BOT')
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/config/public')
  })

  it('fetches once and serves the rest from cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => CONFIG })
    vi.stubGlobal('fetch', fetchMock)

    const [first, second] = await Promise.all([fetchPublicConfig(), fetchPublicConfig()])
    const third = await fetchPublicConfig()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
    expect(third).toEqual(CONFIG)
    expect(getCachedPublicConfig()).toEqual(CONFIG)
  })

  it('returns null instead of throwing when the node is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await expect(fetchPublicConfig()).resolves.toBeNull()
    expect(getCachedPublicConfig()).toBeNull()
  })

  it('does not cache a non-OK response, so a later good one still lands', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => CONFIG })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPublicConfig()).resolves.toBeNull()
    await expect(fetchPublicConfig()).resolves.toEqual(CONFIG)
  })
})
