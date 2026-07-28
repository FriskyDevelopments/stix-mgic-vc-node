import { describe, expect, it, beforeEach } from 'vitest'
import { createApp } from './app'
import { resetServerEnvCache } from './env'
import { joinRoom, resetRooms, getRoom } from './rooms'
import { setSignalingReady } from './sessions'

// Top level on purpose: a beforeEach inside a describe only runs for that describe, and
// these tests share module state (the env cache and the room registry). Scoped to one
// block, the later suites inherit whatever the previous one left behind.
beforeEach(() => {
  resetServerEnvCache()
  process.env.NODE_ENV = 'test'
  process.env.OPERATOR_TOKEN_SECRET = 'test-operator-token-secret'
  process.env.AUTH_REQUIRED = 'false'
  process.env.MEDIA_PLANE_ENABLED = 'false'
  delete process.env.DISCORD_CLIENT_ID
  delete process.env.DISCORD_CLIENT_SECRET
  delete process.env.TELEGRAM_BOT_TOKEN
  delete process.env.TURN_URLS
  delete process.env.TURN_USERNAME
  delete process.env.TURN_CREDENTIAL
  resetRooms()
  setSignalingReady(false)
})

describe('control plane API', () => {

  it('reports health', async () => {
    const app = createApp()
    const res = await app.request('/healthz')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.mediaPlaneEnabled).toBe(false)
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

  it('mints anonymous operator tokens', async () => {
    const app = createApp()
    const res = await app.request('/v1/auth/anonymous', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.token).toBe('string')
    expect(body.token.includes('.')).toBe(true)
  })
})

describe('media plane status', () => {
  it('reports per adapter, and says why each unavailable one is unavailable', async () => {
    const app = createApp()
    const res = await app.request('/v1/media/status')
    const body = await res.json()

    const byId = Object.fromEntries(body.adapters.map((a: { id: string }) => [a.id, a]))
    expect(byId['telegram-vc'].state).toBe('not_implemented')
    expect(byId['telegram-vc'].reason).toMatch(/MTProto/)
    expect(byId['discord-voice'].reason).toMatch(/audio only/i)
    expect(byId['rtmp'].reason).toMatch(/ffmpeg/)
    for (const adapter of body.adapters) {
      if (adapter.state !== 'ready') expect(adapter.reason.length).toBeGreaterThan(0)
    }
  })

  it('is not ready while signaling is not attached to the process', async () => {
    setSignalingReady(false)
    const app = createApp()
    const body = await (await app.request('/v1/media/status')).json()
    expect(body.ready).toBe(false)
    expect(body.adapters.find((a: { id: string }) => a.id === 'webrtc').state).toBe('disabled')
  })

  it('is degraded — not ready — with signaling up but no TURN relay', async () => {
    setSignalingReady(true)
    const app = createApp()
    const body = await (await app.request('/v1/media/status')).json()
    const webrtc = body.adapters.find((a: { id: string }) => a.id === 'webrtc')
    expect(webrtc.state).toBe('degraded')
    // The operator has to know WHO will fail to connect, not just that something might.
    expect(webrtc.reason).toMatch(/symmetric NAT/)
  })

  it('is ready once both signaling and a TURN relay exist', async () => {
    setSignalingReady(true)
    process.env.TURN_URLS = 'turn:turn.example.net:3478'
    process.env.TURN_USERNAME = 'operator'
    process.env.TURN_CREDENTIAL = 'test-turn-credential'
    resetServerEnvCache()

    const app = createApp()
    const body = await (await app.request('/v1/media/status')).json()
    expect(body.ready).toBe(true)
    expect(body.adapters.find((a: { id: string }) => a.id === 'webrtc').state).toBe('ready')
  })
})

describe('rooms API', () => {
  async function createRoomViaApi(app: ReturnType<typeof createApp>, body: unknown = {}) {
    const res = await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { res, body: await res.json() }
  }

  it('creates a room and hands back what a client needs to negotiate', async () => {
    const app = createApp()
    const { res, body } = await createRoomViaApi(app, { name: 'Session A', maxParticipants: 3 })
    expect(res.status).toBe(201)
    expect(body.room.name).toBe('Session A')
    expect(body.room.maxParticipants).toBe(3)
    expect(body.signaling.path).toBe('/v1/signal')
    expect(Array.isArray(body.signaling.iceServers)).toBe(true)
  })

  it('lists only the caller’s own rooms', async () => {
    const app = createApp()
    await createRoomViaApi(app, { name: 'mine' })

    const otherOperator = await app.request('/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-id': 'someone-else' },
      body: JSON.stringify({ name: 'theirs' }),
    })
    expect(otherOperator.status).toBe(201)

    const list = await (await app.request('/v1/rooms')).json()
    expect(list.rooms).toHaveLength(1)
    expect(list.rooms[0].name).toBe('mine')
  })

  it('404s a room that does not exist', async () => {
    const app = createApp()
    expect((await app.request('/v1/rooms/does-not-exist')).status).toBe(404)
  })

  it('lets the owner close a room and refuses everyone else', async () => {
    const app = createApp()
    const { body } = await createRoomViaApi(app)

    const stranger = await app.request(`/v1/rooms/${body.room.id}`, {
      method: 'DELETE',
      headers: { 'x-client-id': 'someone-else' },
    })
    expect(stranger.status).toBe(403)
    expect(getRoom(body.room.id)).not.toBeNull()

    const owner = await app.request(`/v1/rooms/${body.room.id}`, { method: 'DELETE' })
    expect(owner.status).toBe(200)
    expect(getRoom(body.room.id)).toBeNull()
  })

  it('requires a token for rooms when AUTH_REQUIRED=true', async () => {
    process.env.AUTH_REQUIRED = 'true'
    resetServerEnvCache()
    const app = createApp()
    const res = await app.request('/v1/rooms', { method: 'POST' })
    expect(res.status).toBe(401)
  })
})

describe('room telemetry — reported by participants, never invented', () => {
  const measurement = {
    signalQuality: 93,
    latency: 41,
    frameRate: 30,
    bitrate: 1900,
    packetLoss: 0.3,
  }

  async function roomWithSelfJoined(app: ReturnType<typeof createApp>) {
    const created = await (
      await app.request('/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    ).json()
    // The default anonymous operator identity used by app.request without headers.
    joinRoom(created.room.id, { operatorId: 'anonymous:local', name: 'Anonymous Operator' })
    return created.room.id as string
  }

  it('accepts a measurement from a participant', async () => {
    const app = createApp()
    const roomId = await roomWithSelfJoined(app)
    const res = await app.request(`/v1/rooms/${roomId}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(measurement),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).telemetry).toMatchObject(measurement)
  })

  it('refuses a measurement from someone who is not in the room', async () => {
    const app = createApp()
    const roomId = await roomWithSelfJoined(app)
    const res = await app.request(`/v1/rooms/${roomId}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-id': 'outsider' },
      body: JSON.stringify(measurement),
    })
    expect(res.status).toBe(403)
  })

  it('rejects an implausible measurement', async () => {
    const app = createApp()
    const roomId = await roomWithSelfJoined(app)
    const res = await app.request(`/v1/rooms/${roomId}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...measurement, frameRate: 900 }),
    })
    expect(res.status).toBe(400)
  })

  it('serves zeros marked `unavailable` while nothing is measuring', async () => {
    const app = createApp()
    const started = await (
      await app.request('/v1/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'telegram', protocol: 'rtmp', mode: 'operator' }),
      })
    ).json()

    // This used to answer 90% signal, 180 ms latency and 2500 kbps with nothing connected.
    expect(started.telemetrySource).toBe('unavailable')
    expect(started.signalQuality).toBe(0)
    expect(started.bitrate).toBe(0)
    expect(started.frameRate).toBe(0)
  })

  it('serves the real measurement once a participant reports one', async () => {
    const app = createApp()
    const roomId = await roomWithSelfJoined(app)
    await app.request(`/v1/rooms/${roomId}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(measurement),
    })

    const started = await (
      await app.request('/v1/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'web', protocol: 'local', mode: 'operator' }),
      })
    ).json()

    expect(started.telemetrySource).toBe('measured')
    expect(started.signalQuality).toBe(93)
    expect(started.roomId).toBe(roomId)
    expect(started.participantCount).toBe(1)
  })
})
