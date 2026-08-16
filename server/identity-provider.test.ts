/**
 * The provider switch has to fail safe. Selecting Supabase without configuring it must
 * not produce a sign-in screen with nothing behind it, so the server resolves the
 * advertised provider rather than echoing the raw env value.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { resetServerEnvCache } from './env'

function withEnv(vars: Record<string, string | undefined>) {
  process.env.NODE_ENV = 'test'
  process.env.OPERATOR_TOKEN_SECRET = 'test-secret-value-at-least-16'
  process.env.AUTH_REQUIRED = 'true'
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_ANON_KEY
  delete process.env.IDENTITY_PROVIDER
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetServerEnvCache()
}

async function advertisedProvider(): Promise<string> {
  const response = await createApp().request('/v1/config/public')
  const body = (await response.json()) as { identityProvider: string }
  return body.identityProvider
}

afterEach(resetServerEnvCache)

describe('identity provider selection', () => {
  it('defaults to authentik — the proven production path', async () => {
    withEnv({})
    expect(await advertisedProvider()).toBe('authentik')
  })

  it('falls back to authentik when supabase is selected but unconfigured', async () => {
    withEnv({ IDENTITY_PROVIDER: 'supabase' })
    expect(await advertisedProvider()).toBe('authentik')
  })

  it('advertises supabase only when it is both selected and configured', async () => {
    withEnv({
      IDENTITY_PROVIDER: 'supabase',
      SUPABASE_URL: 'https://yqevglppbhuoxxfsfnih.supabase.co',
      SUPABASE_ANON_KEY: 'sb_publishable_test',
    })
    expect(await advertisedProvider()).toBe('supabase')
  })
})
