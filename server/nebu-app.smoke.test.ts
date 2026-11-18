import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app'
import { resetServerEnvCache } from './env'

vi.mock('./betterAuth', () => ({
  getNebuAuth: () => null,
  isNebuBetterAuthConfigured: () => false,
  listConfiguredSocialProviders: () => [],
}))

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
  resetServerEnvCache()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden in NEBU smoke tests') }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetServerEnvCache()
})

describe('NEBU app health smoke', () => {
  it('/healthz returns HTTP 200 JSON ok without providers or network', async () => {
    const response = await createApp().request('/healthz')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toMatchObject({ ok: true })
    expect(fetch).not.toHaveBeenCalled()
  })
})
