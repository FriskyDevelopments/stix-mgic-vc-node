/**
 * These tests exist to prove the thing that actually matters: that a Supabase identity
 * reaches the room gate. A login screen that does not change what the media plane accepts
 * is decoration, so the assertions below are about room creation and ownership scoping,
 * not about whether a cookie was set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app'
import { resetServerEnvCache } from './env'

const SUPABASE_URL = 'https://yqevglppbhuoxxfsfnih.supabase.co'
const ANON_KEY = 'sb_publishable_test'
/** A real-shaped auth.users.id — the Fenrir master identity. */
const USER_ID = '3f1c9a52-8d4e-4c1b-9a77-2b5e6d0c1f34'

function setEnv() {
  process.env.NODE_ENV = 'test'
  process.env.OPERATOR_TOKEN_SECRET = 'test-secret-value-at-least-16'
  process.env.SESSION_ISSUER = 'stix-magic-vc-node'
  process.env.AUTH_REQUIRED = 'true'
  process.env.PUBLIC_ROOMS_ENABLED = 'false'
  process.env.SUPABASE_URL = SUPABASE_URL
  process.env.SUPABASE_ANON_KEY = ANON_KEY
  resetServerEnvCache()
}

/** Stand in for Supabase's `/auth/v1/user`, so no network is needed. */
function mockSupabaseUser(accepted: Record<string, unknown> | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) {
        return accepted
          ? new Response(JSON.stringify(accepted), { status: 200 })
          : new Response(JSON.stringify({ msg: 'invalid claim' }), { status: 401 })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
  )
}

/** Pull the vc_session value out of a Set-Cookie header. */
function sessionCookie(response: Response): string | null {
  const raw = response.headers.get('set-cookie')
  const match = raw?.match(/vc_session=([^;]+)/)
  return match ? `vc_session=${match[1]}` : null
}

beforeEach(setEnv)
afterEach(() => {
  vi.unstubAllGlobals()
  resetServerEnvCache()
})

describe('supabase session exchange', () => {
  it('rejects a token Supabase does not accept', async () => {
    mockSupabaseUser(null)
    const app = createApp()
    const response = await app.request('/v1/auth/supabase/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: 'forged' }),
    })
    expect(response.status).toBe(401)
    expect(sessionCookie(response)).toBeNull()
  })

  it('mints a session whose subject is the bare auth.users.id', async () => {
    mockSupabaseUser({
      id: USER_ID,
      email: 'operator@friskydev.com',
      user_metadata: { full_name: 'Frisky Operator' },
      app_metadata: { provider: 'google' },
    })
    const app = createApp()
    const response = await app.request('/v1/auth/supabase/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: 'valid' }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { user: { id: string } }
    // No `supabase:` / `friskydev:` prefix — the master identity, unaltered.
    expect(body.user.id).toBe(USER_ID)
    expect(sessionCookie(response)).not.toBeNull()
  })
})

describe('the identity actually gates the media plane', () => {
  it('refuses room creation without a session', async () => {
    const app = createApp()
    const response = await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'unauthorised' }),
    })
    expect(response.status).toBe(401)
  })

  it('accepts room creation with the minted Supabase session, and scopes it to that user', async () => {
    mockSupabaseUser({
      id: USER_ID,
      user_metadata: { full_name: 'Frisky Operator' },
      app_metadata: { provider: 'google' },
    })
    const app = createApp()

    const login = await app.request('/v1/auth/supabase/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: 'valid' }),
    })
    const cookie = sessionCookie(login)
    expect(cookie).not.toBeNull()

    const created = await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookie! },
      body: JSON.stringify({ name: 'authorised room' }),
    })
    expect(created.ok).toBe(true)

    // The room must belong to the Supabase identity, not to some node-local principal.
    // `listRoomsForOperator` is keyed by the session `sub`, so a room coming back on this
    // cookie proves ownership was scoped to auth.users.id end to end.
    const mine = await app.request('/v1/rooms', { headers: { cookie: cookie! } })
    expect(mine.ok).toBe(true)
    const body = (await mine.json()) as { rooms?: Array<{ name?: string }> }
    const names = (body.rooms ?? []).map((room) => room.name)
    expect(names).toContain('authorised room')
  })
})

describe('rooms are isolated per Supabase identity', () => {
  it('does not show one operator the rooms of another', async () => {
    const OTHER_USER_ID = '9c2d7e01-4a5b-4f8c-8e13-77a0b9d4e2aa'
    const app = createApp()

    mockSupabaseUser({ id: USER_ID, user_metadata: { full_name: 'First' } })
    const firstLogin = await app.request('/v1/auth/supabase/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: 'first' }),
    })
    const firstCookie = sessionCookie(firstLogin)!
    await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: firstCookie },
      body: JSON.stringify({ name: 'private to first' }),
    })

    mockSupabaseUser({ id: OTHER_USER_ID, user_metadata: { full_name: 'Second' } })
    const secondLogin = await app.request('/v1/auth/supabase/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: 'second' }),
    })
    const secondCookie = sessionCookie(secondLogin)!

    const seen = await app.request('/v1/rooms', { headers: { cookie: secondCookie } })
    const body = (await seen.json()) as { rooms?: Array<{ name?: string }> }
    expect((body.rooms ?? []).map((r) => r.name)).not.toContain('private to first')
  })
})
