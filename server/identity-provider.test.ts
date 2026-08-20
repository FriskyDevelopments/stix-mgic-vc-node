/**
 * VC Node has one primary identity surface. A missing Supabase setup must show a
 * configuration error in that surface rather than silently rerouting an operator to a
 * different identity system.
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
  it('always advertises the FriskyDev/Supabase social surface', async () => {
    withEnv({})
    expect(await advertisedProvider()).toBe('supabase')
  })

  it('keeps the social surface when Supabase is configured', async () => {
    withEnv({
      SUPABASE_URL: 'https://yqevglppbhuoxxfsfnih.supabase.co',
      SUPABASE_ANON_KEY: 'sb_publishable_test',
    })
    expect(await advertisedProvider()).toBe('supabase')
  })
})
