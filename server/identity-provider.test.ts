/**
 * VC Node's primary identity surface is Fenrir social SSO (Apple / Google / Microsoft).
 * FriskyDev ID (Authentik OIDC) is an additional explicit button when those env vars
 * are present — never a silent fallback that hides a missing Supabase setup.
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
  delete process.env.SUPABASE_PUBLISHABLE_KEY
  delete process.env.AUTHENTIK_ISSUER
  delete process.env.OIDC_CLIENT_ID
  delete process.env.OIDC_CLIENT_SECRET
  delete process.env.OIDC_REDIRECT_URI
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

  it('marks Apple/Google/Microsoft ready only when Supabase env is present', async () => {
    withEnv({
      SUPABASE_URL: 'https://yqevglppbhuoxxfsfnih.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    })
    const response = await createApp().request('/v1/auth')
    expect(response.status).toBe(200)
    const body = await response.json() as {
      providers: Array<{ id: string; ready: boolean; method: string }>
      supabase: { url: string | null; publishableKey: string | null }
    }
    const byId = Object.fromEntries(body.providers.map((provider) => [provider.id, provider]))
    expect(byId.google).toMatchObject({ ready: true, method: 'supabase' })
    expect(byId.apple).toMatchObject({ ready: true, method: 'supabase' })
    expect(byId.microsoft).toMatchObject({ ready: true, method: 'supabase' })
    expect(byId['friskydev-id']).toMatchObject({ ready: false, method: 'oidc' })
    expect(body.supabase.url).toBe('https://yqevglppbhuoxxfsfnih.supabase.co')
    expect(body.supabase.publishableKey).toBe('sb_publishable_test')
  })

  it('marks FriskyDev ID ready when Authentik OIDC env is present', async () => {
    withEnv({
      AUTHENTIK_ISSUER: 'https://authentik.friskydev.com/application/o/vc-node',
      OIDC_CLIENT_ID: 'vc-node',
      OIDC_CLIENT_SECRET: 'oidc-client-secret-for-tests',
      OIDC_REDIRECT_URI: 'https://vc.friskydev.com/v1/auth/oidc/callback',
    })
    const response = await createApp().request('/v1/auth')
    expect(response.status).toBe(200)
    const body = await response.json() as {
      providers: Array<{ id: string; ready: boolean; start?: string }>
    }
    const friskydevId = body.providers.find((provider) => provider.id === 'friskydev-id')
    expect(friskydevId).toMatchObject({
      ready: true,
      start: '/v1/auth/oidc/start',
    })
  })

  it('advertises the same identity catalog on /v1/config/public', async () => {
    withEnv({
      SUPABASE_URL: 'https://yqevglppbhuoxxfsfnih.supabase.co',
      SUPABASE_ANON_KEY: 'sb_publishable_test',
      AUTHENTIK_ISSUER: 'https://authentik.friskydev.com/application/o/vc-node',
      OIDC_CLIENT_ID: 'vc-node',
      OIDC_CLIENT_SECRET: 'oidc-client-secret-for-tests',
      OIDC_REDIRECT_URI: 'https://vc.friskydev.com/v1/auth/oidc/callback',
    })
    const response = await createApp().request('/v1/config/public')
    const body = await response.json() as {
      supabaseUrl: string | null
      supabasePublishableKey: string | null
      identityProviders: Array<{ id: string; ready: boolean }>
    }
    expect(body.supabaseUrl).toBe('https://yqevglppbhuoxxfsfnih.supabase.co')
    expect(body.supabasePublishableKey).toBe('sb_publishable_test')
    expect(body.identityProviders.map((provider) => [provider.id, provider.ready])).toEqual([
      ['google', true],
      ['apple', true],
      ['microsoft', true],
      ['friskydev-id', true],
    ])
  })
})
