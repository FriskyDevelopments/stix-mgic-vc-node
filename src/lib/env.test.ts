import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAppEnv, resetAppEnvCache } from './env'
import { getSessionApi, resetSessionApi } from './session-api'

describe('getAppEnv', () => {
  beforeEach(() => {
    resetAppEnvCache()
    vi.unstubAllEnvs()
  })

  it('uses the real node API in development and production', () => {
    const env = getAppEnv()
    expect(env.isLiveApiConfigured).toBe(true)
    expect(env.operatorTier).toBe('premium')
  })

  it('defaults PostHog host and leaves token unset', () => {
    const env = getAppEnv()
    expect(env.posthogProjectToken).toBeUndefined()
    expect(env.posthogHost).toBe('https://us.i.posthog.com')
  })
})

describe('getSessionApi', () => {
  beforeEach(() => {
    resetAppEnvCache()
    resetSessionApi()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('selects the live API without a demo fallback', () => {
    const api = getSessionApi()
    expect(api.isLiveConfigured()).toBe(true)
  })

  it('never creates a local stream key when the node is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('node unavailable')))
    const api = getSessionApi()

    await expect(api.startSession({
      platform: 'telegram',
      protocol: 'rtmp',
      mode: 'operator',
    })).rejects.toThrow('node unavailable')
  })

  it('sends a cookie-authenticated session start when AUTH_REQUIRED and no bearer is stored', async () => {
    vi.stubEnv('VITE_AUTH_REQUIRED', 'true')
    resetAppEnvCache()
    resetSessionApi()
    sessionStorage.clear()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'standby', source: 'live-api' }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const api = getSessionApi()
    await expect(api.startSession({
      platform: 'telegram',
      protocol: 'dj-mode',
      mode: 'dj',
    })).resolves.toMatchObject({ status: 'standby', source: 'live-api' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/sessions/start',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
  })
})
