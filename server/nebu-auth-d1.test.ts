import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { resetServerEnvCache } from './env'
import { configureNebuDatabase, resetNebuAuthCache } from './betterAuth'
import { resetRooms } from './rooms'
import { configureAccountStore, resetAccountStore } from './account-store'

// Better Auth runs on D1 in the Worker; here node:sqlite stands in for the D1 binding.
let DatabaseSync: (new (path: string) => { exec(sql: string): void }) | null = null
try {
  const nodeSqlite = 'node:sqlite'
  DatabaseSync = ((await import(/* @vite-ignore */ nodeSqlite)) as { DatabaseSync: typeof DatabaseSync }).DatabaseSync
} catch {
  DatabaseSync = null
}

const ORIGIN = 'https://nebu.test'
const SCHEMA = readFileSync(resolve(__dirname, '../migrations/0001_better_auth.sql'), 'utf8')
const json = { 'content-type': 'application/json', origin: ORIGIN }

function sessionCookie(res: Response): string {
  const raw = res.headers.getSetCookie().find((c) => /nebu_session=/.test(c))
  expect(raw).toBeTruthy()
  return raw!.split(';')[0]!
}

describe.skipIf(!DatabaseSync)('NEBU Better Auth on a SQLite/D1-style database', () => {
  beforeEach(() => {
    resetNebuAuthCache()
    resetServerEnvCache()
    configureAccountStore({ persist: false })
    resetAccountStore()
    resetRooms()
    process.env.NODE_ENV = 'test'
    process.env.OPERATOR_TOKEN_SECRET = 'test-operator-token-secret'
    process.env.AUTH_REQUIRED = 'true'
    process.env.PUBLIC_ROOMS_ENABLED = 'true'
    process.env.CORS_ALLOWED_ORIGINS = ORIGIN
    process.env.BETTER_AUTH_SECRET = 'nebu-test-secret-at-least-32-chars!!'
    process.env.BETTER_AUTH_URL = ORIGIN
    delete process.env.DATABASE_URL
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    const db = new DatabaseSync!(':memory:')
    db.exec(SCHEMA)
    configureNebuDatabase(db)
  })

  it('is configured through the injected database and exposes no social providers', async () => {
    const app = createApp()
    const body = await (await app.request('/healthz')).json()
    expect(body.nebuBetterAuthConfigured).toBe(true)
    expect(body.nebuSocialProviders).toEqual([])
  })

  it('rejects POST /v1/rooms without a session (401) but still lets a guest read a room', async () => {
    const app = createApp()
    const res = await app.request('/v1/rooms', { method: 'POST', headers: json, body: '{}' })
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('login_required')
  })

  it('registers, signs in, and creates a room with the Better Auth session', async () => {
    const app = createApp()
    const email = 'tester@example.com'
    const password = 'correct horse battery'

    const up = await app.request('/api/auth/sign-up/email', {
      method: 'POST', headers: json, body: JSON.stringify({ name: 'Tester', email, password }),
    })
    expect(up.status).toBe(200)

    const bad = await app.request('/api/auth/sign-in/email', {
      method: 'POST', headers: json, body: JSON.stringify({ email, password: 'wrong password!!' }),
    })
    expect(bad.status).toBeGreaterThanOrEqual(400)

    const inRes = await app.request('/api/auth/sign-in/email', {
      method: 'POST', headers: json, body: JSON.stringify({ email, password }),
    })
    expect(inRes.status).toBe(200)
    const cookie = sessionCookie(inRes)

    const created = await app.request('/v1/rooms', {
      method: 'POST', headers: { ...json, cookie }, body: JSON.stringify({ name: 'Den' }),
    })
    expect(created.status).toBe(200)
    const { room } = await created.json()
    expect(room.ownerOperatorId).toMatch(/^nebu:/)

    // A guest (no session) may still open the room by its unguessable id.
    const guest = await app.request(`/v1/rooms/${room.id}`)
    expect(guest.status).toBe(200)
  })

  it('answers unknown /v1 routes with a JSON 404', async () => {
    const app = createApp()
    const res = await app.request('/v1/nope')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('does not send a wildcard CORS origin on /v1', async () => {
    const app = createApp()
    const ok = await app.request('/v1/config/public', { headers: { origin: ORIGIN } })
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    const evil = await app.request('/v1/config/public', { headers: { origin: 'https://evil.example' } })
    expect(evil.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('POST /v1/rooms without Better Auth configured', () => {
  beforeEach(() => {
    resetNebuAuthCache()
    resetServerEnvCache()
    resetRooms()
    process.env.NODE_ENV = 'test'
    process.env.OPERATOR_TOKEN_SECRET = 'test-operator-token-secret'
    process.env.AUTH_REQUIRED = 'true'
    process.env.PUBLIC_ROOMS_ENABLED = 'true'
    delete process.env.BETTER_AUTH_SECRET
    delete process.env.CORS_ALLOWED_ORIGINS
  })

  it('still returns 401 for anonymous callers', async () => {
    const res = await createApp().request('/v1/rooms', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    expect(res.status).toBe(401)
  })
})
