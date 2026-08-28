import { describe, expect, it, beforeEach } from 'vitest'
import { createApp } from './app'
import { resetServerEnvCache } from './env'
import { configureAccountStore, resetAccountStore } from './account-store'
import { setSignalingReady } from './sessions'
import { joinRoom, resetRooms } from './rooms'
import { mintOperatorToken } from './tokens'

describe('control plane API', () => {
  beforeEach(() => {
    resetServerEnvCache()
    configureAccountStore({ persist: false })
    resetAccountStore()
    resetRooms()
    process.env.NODE_ENV = 'test'
    process.env.OPERATOR_TOKEN_SECRET = 'test-operator-token-secret'
    process.env.AUTH_REQUIRED = 'false'
    delete process.env.PUBLIC_ROOMS_ENABLED
    process.env.MEDIA_PLANE_ENABLED = 'false'
    setSignalingReady(false)
    delete process.env.DISCORD_CLIENT_ID
    delete process.env.DISCORD_CLIENT_SECRET
    delete process.env.DISCORD_APPLICATION_PUBLIC_KEY
    delete process.env.DISCORD_APPLICATION_ID
    delete process.env.DISCORD_BOT_TOKEN
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    delete process.env.RTMP_INGEST_ENABLED
    delete process.env.RTMP_PUBLIC_HOST
    delete process.env.RTMP_PUBLISH_USER
    delete process.env.RTMP_PUBLISH_PASSWORD
  })

  it('reports health', async () => {
    const app = createApp()
    const res = await app.request('/healthz')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.mediaPlaneEnabled).toBe(false)
    expect(body.friskydevAccounts).toBe(true)
  })

  it('reports adapter-level media availability', async () => {
    setSignalingReady(true)
    const app = createApp()
    const res = await app.request('/v1/media/status')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ready).toBe(true)
    expect(body.adapters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'webrtc', state: 'degraded' }),
        expect.objectContaining({ id: 'telegram-vc', state: 'disabled' }),
        expect.objectContaining({ id: 'rtmp', state: 'disabled' }),
      ])
    )
  })

  it('rejects a session when the requested platform adapter is unavailable', async () => {
    const app = createApp()
    const start = await app.request('/v1/sessions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'telegram', protocol: 'dj-mode', mode: 'dj' }),
    })
    expect(start.status).toBe(503)
    const body = await start.json()
    expect(body.error).toBe('Telegram VC is unavailable')
    expect(body.reason).toBeTruthy()
  })

  it('rejects discord exchange when not configured', async () => {
    const app = createApp()
    const res = await app.request('/v1/auth/discord/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'abc' }),
    })
    expect(res.status).toBe(503)
  })

  it('protects telegram-vc adapter endpoints before reporting availability', async () => {
    const app = createApp()
    const res = await app.request('/v1/telegram-vc/status')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Operator token required')
  })

  it('keeps RTMP publish credentials behind operator authentication', async () => {
    process.env.RTMP_INGEST_ENABLED = 'true'
    process.env.RTMP_PUBLIC_HOST = 'stream.example.test'
    process.env.RTMP_PUBLISH_USER = 'operator'
    process.env.RTMP_PUBLISH_PASSWORD = 'a-secure-test-stream-password'
    resetServerEnvCache()
    const app = createApp()

    expect((await app.request('/v1/rtmp/publish')).status).toBe(401)

    const token = mintOperatorToken({ sub: 'rtmp-operator', platform: 'web', name: 'RTMP Operator' })
    const res = await app.request('/v1/rtmp/publish', { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ready).toBe(true)
    expect(body.publishUrl).toContain('rtmp://operator:')
  })

  it('rejects an unsigned Telegram webhook', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'telegram-test-token'
    process.env.TELEGRAM_WEBHOOK_SECRET = 'telegram-webhook-secret-that-is-long-enough'
    resetServerEnvCache()
    const app = createApp()
    const res = await app.request('/v1/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(401)
  })

  it('accepts a signed Telegram command webhook', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'telegram-test-token'
    process.env.TELEGRAM_WEBHOOK_SECRET = 'telegram-webhook-secret-that-is-long-enough'
    resetServerEnvCache()
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    try {
      const app = createApp()
      const res = await app.request('/v1/telegram/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET,
        },
        body: JSON.stringify({ message: { text: '/vc', chat: { id: 42 } } }),
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, handled: true })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('accepts the Supabase social-login session cookie for Telegram VC pairing', async () => {
    const app = createApp()
    const session = mintOperatorToken({
      sub: 'supabase-auth-users-id',
      platform: 'supabase',
      name: 'Social Operator',
    })
    const res = await app.request('/v1/telegram-vc/pair/status', {
      headers: { Cookie: `vc_session=${encodeURIComponent(session)}` },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ available: expect.any(Boolean) })
  })

  it('mints anonymous operator tokens', async () => {
    const app = createApp()
    const res = await app.request('/v1/auth/anonymous', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.token).toBe('string')
    expect(body.token.includes('.')).toBe(true)
  })

  it('registers and logs into a FriskyDev account', async () => {
    const app = createApp()
    const register = await app.request('/v1/account/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'operator@frisky.dev',
        password: 'securepass1',
        displayName: 'Operator',
      }),
    })
    expect(register.status).toBe(200)
    const created = await register.json()
    expect(created.account.email).toBe('operator@frisky.dev')
    expect(typeof created.sessionToken).toBe('string')

    const me = await app.request('/v1/account/me', {
      headers: { Authorization: `Bearer ${created.sessionToken}` },
    })
    expect(me.status).toBe(200)
    const profile = await me.json()
    expect(profile.account.id).toBe(created.account.id)
    expect(profile.linked).toEqual([])
  })

  it('requires FriskyDev session to link platforms', async () => {
    const app = createApp()
    const res = await app.request('/v1/account/link/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, first_name: 'A', auth_date: 1, hash: 'x' }),
    })
    expect(res.status).toBe(401)
  })

  it('serves GET /v1/auth as an identity catalog instead of Not found', async () => {
    const app = createApp()
    const res = await app.request('/v1/auth')
    expect(res.status).toBe(200)
    const body = await res.json() as {
      ok: boolean
      authenticated: boolean
      providers: Array<{ id: string; label: string; ready: boolean; method: string }>
    }
    expect(body.ok).toBe(true)
    expect(body.authenticated).toBe(false)
    expect(body.providers.map((provider) => provider.id)).toEqual([
      'google',
      'apple',
      'microsoft',
      'friskydev-id',
    ])
    expect(body.providers.map((provider) => provider.label)).toEqual([
      'Google',
      'Apple',
      'Microsoft',
      'FriskyDev ID',
    ])
  })

  it('serves GET /v1/account as a session probe instead of Not found', async () => {
    const app = createApp()
    const res = await app.request('/v1/account')
    expect(res.status).toBe(200)
    const body = await res.json() as {
      ok: boolean
      authenticated: boolean
      account: unknown
      endpoints: { me: string; login: string; register: string }
    }
    expect(body.ok).toBe(true)
    expect(body.authenticated).toBe(false)
    expect(body.account).toBeNull()
    expect(body.endpoints.me).toBe('/v1/account/me')
    expect(body.endpoints.login).toBe('/v1/account/login')
    expect(body.endpoints.register).toBe('/v1/account/register')
  })
})

describe('room REST API', () => {
  beforeEach(() => {
    resetServerEnvCache()
    configureAccountStore({ persist: false })
    resetAccountStore()
    resetRooms()
    process.env.NODE_ENV = 'test'
    process.env.OPERATOR_TOKEN_SECRET = 'test-operator-token-secret'
    process.env.AUTH_REQUIRED = 'false'
    delete process.env.PUBLIC_ROOMS_ENABLED
    process.env.MEDIA_PLANE_ENABLED = 'false'
    setSignalingReady(false)
    delete process.env.DISCORD_CLIENT_ID
    delete process.env.DISCORD_CLIENT_SECRET
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_WEBHOOK_SECRET
  })

  it('creates a room and returns it with signaling info', async () => {
    const app = createApp()
    const res = await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test call', platform: 'web' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.room.name).toBe('Test call')
    expect(body.room.platform).toBe('web')
    expect(body.room.participants).toEqual([])
    expect(body.room.participantCount).toBe(0)
    expect(typeof body.room.id).toBe('string')
    expect(body.signaling.path).toBe('/v1/signal')
    expect(Array.isArray(body.signaling.iceServers)).toBe(true)
  })

  it('creates a room without auth when AUTH_REQUIRED=false', async () => {
    const app = createApp()
    const res = await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
  })

  it('lists rooms for the operator', async () => {
    const app = createApp()
    await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'First' }),
    })
    await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Second' }),
    })

    const list = await app.request('/v1/rooms')
    expect(list.status).toBe(200)
    const body = await list.json()
    expect(body.rooms).toHaveLength(2)
    expect(body.rooms[0].participantCount).toBe(0)
  })

  it('gets a room by id', async () => {
    const app = createApp()
    const created = await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Find me' }),
    })
    const { room } = await created.json() as { room: { id: string } }

    const res = await app.request(`/v1/rooms/${room.id}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.room.name).toBe('Find me')
    expect(body.signaling.iceServers).toBeDefined()
  })

  it('returns 404 for a room that does not exist', async () => {
    const app = createApp()
    const res = await app.request('/v1/rooms/nonexistent')
    expect(res.status).toBe(404)
  })

  it('lets a participant who joined the room view it', async () => {
    const app = createApp()
    const created = await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Shared room' }),
    })
    const { room } = await created.json() as { room: { id: string } }

    // A guest joins the room, then fetches it with their own identity.
    joinRoom(room.id, { operatorId: 'anonymous:guest', name: 'Guest' })

    const res = await app.request(`/v1/rooms/${room.id}`, {
      headers: { 'x-client-id': 'guest' },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).room.name).toBe('Shared room')
  })

  it('rejects viewing a room the operator is neither owner nor participant of', async () => {
    const app = createApp()
    const created = await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Private' }),
    })
    const { room } = await created.json() as { room: { id: string } }

    // A stranger who knows the room id tries to peek.
    const res = await app.request(`/v1/rooms/${room.id}`, {
      headers: { 'x-client-id': 'stranger' },
    })
    expect(res.status).toBe(403)
  })

  it('treats a room UUID as an invitation when public rooms are enabled', async () => {
    process.env.AUTH_REQUIRED = 'true'
    process.env.PUBLIC_ROOMS_ENABLED = 'true'
    resetServerEnvCache()
    const app = createApp()
    const created = await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-id': 'owner' },
      body: JSON.stringify({ name: 'Public invite' }),
    })
    expect(created.status).toBe(200)
    const { room } = await created.json() as { room: { id: string } }

    const guest = await app.request(`/v1/rooms/${room.id}`, {
      headers: { 'x-client-id': 'guest' },
    })
    expect(guest.status).toBe(200)
    expect((await guest.json()).room.name).toBe('Public invite')
  })

  it('treats a room UUID as an invitation between authenticated FriskyDev members', async () => {
    process.env.AUTH_REQUIRED = 'true'
    resetServerEnvCache()
    const app = createApp()
    const ownerToken = mintOperatorToken({ sub: 'friskydev:owner', platform: 'friskydev', name: 'Owner' })
    const guestToken = mintOperatorToken({ sub: 'friskydev:guest', platform: 'friskydev', name: 'Guest' })
    const created = await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: 'FriskyDev invite' }),
    })
    const { room } = await created.json() as { room: { id: string } }

    const guest = await app.request(`/v1/rooms/${room.id}`, {
      headers: { authorization: `Bearer ${guestToken}` },
    })
    expect(guest.status).toBe(200)
    expect((await guest.json()).room.name).toBe('FriskyDev invite')
  })

  it('lets the owner close a room', async () => {
    const app = createApp()
    const created = await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Closable' }),
    })
    const { room } = await created.json() as { room: { id: string } }

    const res = await app.request(`/v1/rooms/${room.id}`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)

    const gone = await app.request(`/v1/rooms/${room.id}`)
    expect(gone.status).toBe(404)
  })

  it('rejects closing a room by a non-owner', async () => {
    const app = createApp()
    const created = await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { room } = await created.json() as { room: { id: string } }

    const res = await app.request(`/v1/rooms/${room.id}`, {
      method: 'DELETE',
      headers: { 'x-client-id': 'intruder' },
    })
    expect(res.status).toBe(403)
  })

  it('rejects telemetry from an operator not in the room', async () => {
    const app = createApp()
    const created = await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { room } = await created.json() as { room: { id: string } }

    const res = await app.request(`/v1/rooms/${room.id}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signalQuality: 90, latency: 40, frameRate: 30,
        bitrate: 2000, packetLoss: 0.5,
      }),
    })
    expect(res.status).toBe(403)
  })

  it('records telemetry from a participant in the room', async () => {
    const app = createApp()
    const created = await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { room } = await created.json() as { room: { id: string } }

    joinRoom(room.id, { operatorId: 'anonymous:local', name: 'Tester' })

    const res = await app.request(`/v1/rooms/${room.id}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signalQuality: 91, latency: 38, frameRate: 30,
        bitrate: 1800, packetLoss: 0.4,
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.signalQuality).toBe(91)
    expect(body.reportedBy).toBe('anonymous:local')
  })
})
