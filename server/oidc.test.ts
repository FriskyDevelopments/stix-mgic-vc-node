import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app'
import { resetServerEnvCache } from './env'
import { resetOidcCache } from './oidc'
import { mintOperatorToken } from './tokens'

describe('FriskyDev ID OIDC', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.NODE_ENV = 'test'
    process.env.AUTH_REQUIRED = 'true'
    process.env.OPERATOR_TOKEN_SECRET = 'test-operator-token-secret'
    process.env.AUTHENTIK_ISSUER = 'https://authentik.friskydev.com/application/o/vc-node'
    process.env.OIDC_CLIENT_ID = 'vc-node'
    process.env.OIDC_CLIENT_SECRET = 'server-only-client-secret'
    process.env.OIDC_REDIRECT_URI = 'https://vc.friskydev.com/v1/auth/oidc/callback'
    resetServerEnvCache()
    resetOidcCache()
  })

  it('starts Authorization Code + PKCE without exposing the client secret', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      authorization_endpoint: 'https://authentik.friskydev.com/application/o/authorize/',
      token_endpoint: 'https://authentik.friskydev.com/application/o/token/',
      userinfo_endpoint: 'https://authentik.friskydev.com/application/o/userinfo/',
    }), { status: 200 }))

    const response = await createApp().request('/v1/auth/oidc/start')
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location')!)
    expect(location.searchParams.get('client_id')).toBe('vc-node')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('code_challenge')).toBeTruthy()
    expect(location.toString()).not.toContain('server-only-client-secret')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
  })

  it('rejects a callback without the matching state cookies via a safe retry redirect', async () => {
    const response = await createApp().request('/v1/auth/oidc/callback?code=fake&state=fake')
    // No dead-end: send the browser back to a safe local path to retry, and never a session.
    expect(response.status).toBe(302)
    const location = response.headers.get('location')!
    expect(location.startsWith('/')).toBe(true)
    expect(location).toContain('login=expired')
    expect(response.headers.get('set-cookie') || '').not.toContain('vc_session=')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('rejects a callback whose state does not match its cookie (no session issued)', async () => {
    // A state cookie exists but for a different state value → mismatch, not a session.
    const response = await createApp().request('/v1/auth/oidc/callback?code=fake&state=abc', {
      headers: { cookie: 'vc_oidc_state_abc=different; vc_oidc_verifier_abc=v' },
    })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('login=expired')
    expect(response.headers.get('set-cookie') || '').not.toContain('vc_session=')
  })

  it('marks auth responses no-store', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      authorization_endpoint: 'https://authentik.friskydev.com/application/o/authorize/',
      token_endpoint: 'https://authentik.friskydev.com/application/o/token/',
      userinfo_endpoint: 'https://authentik.friskydev.com/application/o/userinfo/',
    }), { status: 200 }))
    const start = await createApp().request('/v1/auth/oidc/start')
    expect(start.headers.get('cache-control')).toBe('no-store')
  })

  it('gives the login transaction cookies a window wide enough for a real interactive login', async () => {
    // Root cause of "Invalid or expired": a 10-minute Max-Age expired mid-login. The state
    // and verifier cookies must outlive a slow password + MFA + password-manager round.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      authorization_endpoint: 'https://authentik.friskydev.com/application/o/authorize/',
      token_endpoint: 'https://authentik.friskydev.com/application/o/token/',
      userinfo_endpoint: 'https://authentik.friskydev.com/application/o/userinfo/',
    }), { status: 200 }))
    const response = await createApp().request('/v1/auth/oidc/start')
    const cookies = response.headers.getSetCookie()
    const stateCookie = cookies.find((value) => value.startsWith('vc_oidc_state_'))!
    const verifierCookie = cookies.find((value) => value.startsWith('vc_oidc_verifier_'))!
    const maxAgeOf = (cookie: string) => Number(/Max-Age=(\d+)/.exec(cookie)?.[1] ?? '0')
    expect(maxAgeOf(stateCookie)).toBeGreaterThanOrEqual(1800)
    expect(maxAgeOf(verifierCookie)).toBeGreaterThanOrEqual(1800)
    // Still SameSite=Lax and HttpOnly — the widening does not relax the cookie.
    expect(stateCookie).toContain('SameSite=Lax')
    expect(stateCookie).toContain('HttpOnly')
  })

  it('keeps parallel login attempts isolated', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      authorization_endpoint: 'https://authentik.friskydev.com/application/o/authorize/',
      token_endpoint: 'https://authentik.friskydev.com/application/o/token/',
      userinfo_endpoint: 'https://authentik.friskydev.com/application/o/userinfo/',
    }), { status: 200 }))

    const app = createApp()
    const first = await app.request('/v1/auth/oidc/start?returnTo=/first')
    const second = await app.request('/v1/auth/oidc/start?returnTo=/second')
    const firstState = new URL(first.headers.get('location')!).searchParams.get('state')!
    const secondState = new URL(second.headers.get('location')!).searchParams.get('state')!
    const firstCookies = first.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
    const secondCookies = second.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')

    expect(firstState).not.toBe(secondState)
    expect(firstCookies).toContain(`vc_oidc_state_${firstState}=${firstState}`)
    expect(secondCookies).toContain(`vc_oidc_state_${secondState}=${secondState}`)
    expect(firstCookies).not.toContain(secondState)
  })

  it('recognizes the HttpOnly session used by REST and WebSocket', async () => {
    const session = mintOperatorToken({
      sub: 'friskydev:member-1',
      platform: 'friskydev',
      name: 'Frisky Member',
    })
    const response = await createApp().request('/v1/auth/oidc/me', {
      headers: { cookie: `vc_session=${session}` },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      authenticated: true,
      user: { id: 'friskydev:member-1', name: 'Frisky Member' },
    })
  })
})
