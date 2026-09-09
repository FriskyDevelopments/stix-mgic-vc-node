import { afterEach, describe, expect, it } from 'vitest'
import {
  buildSocialProviders,
  getNebuAuth,
  isNebuBetterAuthConfigured,
  listConfiguredSocialProviders,
  resetNebuAuthCache,
} from './betterAuth'
import { createApp } from './app'
import { resetServerEnvCache } from './env'

describe('NEBU Better Auth', () => {
  afterEach(() => {
    resetNebuAuthCache()
    resetServerEnvCache()
    delete process.env.BETTER_AUTH_SECRET
    delete process.env.BETTER_AUTH_URL
    delete process.env.DATABASE_URL
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    delete process.env.MICROSOFT_CLIENT_ID
    delete process.env.MICROSOFT_CLIENT_SECRET
    delete process.env.MS_CLIENT_ID
    delete process.env.MS_CLIENT_SECRET
    delete process.env.APPLE_CLIENT_ID
    delete process.env.APPLE_CLIENT_SECRET
    delete process.env.APPLE_TEAM_ID
    delete process.env.APPLE_KEY_ID
    delete process.env.APPLE_PRIVATE_KEY
    process.env.NODE_ENV = 'test'
  })

  it('is inactive without DATABASE_URL and BETTER_AUTH_SECRET', () => {
    expect(isNebuBetterAuthConfigured()).toBe(false)
    expect(getNebuAuth()).toBeNull()
  })

  it('requires a secret of at least 32 characters', () => {
    process.env.DATABASE_URL = 'mysql://user:pass@127.0.0.1:3306/nebu'
    process.env.BETTER_AUTH_SECRET = 'too-short'
    expect(isNebuBetterAuthConfigured()).toBe(false)
  })

  it('registers Google, Microsoft, and Apple when provider secrets are present', () => {
    process.env.GOOGLE_CLIENT_ID = 'google-client'
    process.env.GOOGLE_CLIENT_SECRET = 'google-secret'
    process.env.MICROSOFT_CLIENT_ID = 'ms-client'
    process.env.MICROSOFT_CLIENT_SECRET = 'ms-secret'
    process.env.APPLE_CLIENT_ID = 'com.nebu.signin'
    process.env.APPLE_CLIENT_SECRET = 'apple-jwt-secret'

    const providers = buildSocialProviders()
    expect(Object.keys(providers).sort()).toEqual(['apple', 'google', 'microsoft'])
    expect(providers.google).toMatchObject({ clientId: 'google-client' })
    expect(providers.microsoft).toMatchObject({
      clientId: 'ms-client',
      tenantId: 'common',
      prompt: 'select_account',
    })
    expect(providers.apple).toMatchObject({ clientId: 'com.nebu.signin' })
    expect(listConfiguredSocialProviders().sort()).toEqual(['apple', 'google', 'microsoft'])
  })

  it('omits providers when their env is incomplete', () => {
    process.env.GOOGLE_CLIENT_ID = 'google-only-id'
    expect(Object.keys(buildSocialProviders())).toEqual([])
  })

  it('exposes nebuBetterAuthConfigured on healthz and public config', async () => {
    process.env.OPERATOR_TOKEN_SECRET = 'test-operator-token-secret'
    process.env.AUTH_REQUIRED = 'false'
    resetServerEnvCache()

    const app = createApp()
    const health = await app.request('/healthz')
    expect(health.status).toBe(200)
    const healthBody = await health.json()
    expect(healthBody.nebuBetterAuthConfigured).toBe(false)

    const config = await app.request('/v1/config/public')
    expect(config.status).toBe(200)
    const configBody = await config.json()
    expect(configBody.nebuBetterAuthConfigured).toBe(false)
    expect(configBody.nebuSocialProviders).toEqual([])
  })

  it('returns 503 from Better Auth catch-all when not configured', async () => {
    process.env.OPERATOR_TOKEN_SECRET = 'test-operator-token-secret'
    process.env.AUTH_REQUIRED = 'false'
    resetServerEnvCache()

    const app = createApp()
    const res = await app.request('/api/auth/ok')
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatch(/not configured/i)
  })

  it('configures NEBU cookie prefix and opaque session cookie when auth boots', () => {
    process.env.DATABASE_URL = 'mysql://user:pass@127.0.0.1:3306/nebu'
    process.env.BETTER_AUTH_SECRET = 'nebu-test-secret-at-least-32-chars!!'
    process.env.BETTER_AUTH_URL = 'https://nebu.quest'
    process.env.NODE_ENV = 'production'
    process.env.GOOGLE_CLIENT_ID = 'google-client'
    process.env.GOOGLE_CLIENT_SECRET = 'google-secret'

    expect(isNebuBetterAuthConfigured()).toBe(true)
    const auth = getNebuAuth()
    expect(auth).not.toBeNull()
    expect(auth!.options.advanced?.cookiePrefix).toBe('nebu')
    expect(auth!.options.advanced?.useSecureCookies).toBe(true)
    expect(auth!.options.session?.cookieCache?.enabled).toBe(false)
    expect(auth!.options.advanced?.cookies?.session_token).toMatchObject({
      name: '__Host-nebu_session',
      attributes: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      },
    })
    expect(auth!.options.basePath).toBe('/api/auth')
    expect(auth!.options.baseURL).toBe('https://nebu.quest')
  })
})
