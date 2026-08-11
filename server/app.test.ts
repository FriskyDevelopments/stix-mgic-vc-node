import { describe, expect, it, beforeEach } from 'vitest'
import { createApp } from './app'
import { resetServerEnvCache } from './env'
import { configureAccountStore, resetAccountStore } from './account-store'
import { setSignalingReady } from './sessions'
import { joinRoom, resetRooms } from './rooms'

describe('control plane API', () => {
  beforeEach(() => {
    resetServerEnvCache()
    configureAccountStore({ persist: false })
    resetAccountStore()
    resetRooms()
    process.env.NODE_ENV = 'test'
    process.env.OPERATOR_TOKEN_SECRET = 'test-operator-token-secret'
    process.env.AUTH_REQUIRED = 'false'
    process.env.MEDIA_PLANE_ENABLED = 'false'
    setSignalingReady(false)
    delete process.env.DISCORD_CLIENT_ID
    delete process.env.DISCORD_CLIENT_SECRET
    delete process.env.TELEGRAM_BOT_TOKEN
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
        expect.objectContaining({ id: 'telegram-vc', state: 'not_implemented' }),
      ])
    )
  })

  it('starts and stops a session without auth when AUTH_REQUIRED=false', async () => {
    const app = createApp()
    const start = await app.request('/v1/sessions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'telegram', protocol: 'dj-mode', mode: 'dj' }),
    })
    expect(start.status).toBe(200)
    const started = await start.json()
    expect(started.status).toBe('dj-mode')
    expect(started.source).toBe('live-api')
    expect(started.mediaPlane.ready).toBe(false)

    const stop = await app.request('/v1/sessions/stop', { method: 'POST' })
    expect(stop.status).toBe(200)
    const stopped = await stop.json()
    expect(stopped.status).toBe('standby')
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

  it('returns 503 for telegram-vc adapter endpoints', async () => {
    const app = createApp()
    const res = await app.request('/v1/telegram-vc/status')
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.available).toBe(false)
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
    process.env.MEDIA_PLANE_ENABLED = 'false'
    setSignalingReady(false)
    delete process.env.DISCORD_CLIENT_ID
    delete process.env.DISCORD_CLIENT_SECRET
    delete process.env.TELEGRAM_BOT_TOKEN
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
