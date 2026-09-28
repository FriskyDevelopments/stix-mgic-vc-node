import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app'
import { resetServerEnvCache } from './env'

describe('Spotify public configuration', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('OPERATOR_TOKEN_SECRET', 'test-operator-token-secret')
    resetServerEnvCache()
  })
  afterEach(() => { vi.unstubAllEnvs(); resetServerEnvCache() })

  it('exposes the runtime public client ID, never the client secret', async () => {
    vi.stubEnv('SPOTIFY_CLIENT_ID', ' runtime-public-client-id ')
    vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'test-server-only-secret')
    const response = await createApp().request('/v1/config/public')
    const config = await response.json()
    expect(config.spotifyClientId).toBe('runtime-public-client-id')
    expect(JSON.stringify(config)).not.toContain('test-server-only-secret')
    expect(config).not.toHaveProperty('spotifyClientSecret')
  })

  it('reports an absent client ID explicitly', async () => {
    vi.stubEnv('SPOTIFY_CLIENT_ID', '')
    const config = await (await createApp().request('/v1/config/public')).json()
    expect(config.spotifyClientId).toBeNull()
  })
})
