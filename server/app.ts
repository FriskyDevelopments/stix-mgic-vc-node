import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import { getServerEnv } from './env'
import { exchangeDiscordCode, verifyTelegramLogin, type TelegramLoginPayload } from './auth-providers'
import { mintOperatorToken } from './tokens'
import { createOperatorMiddleware, type OperatorVariables } from './operator-auth'
import {
  extendSession,
  getSession,
  isSignalingReady,
  startSession,
  stopSession,
  type SessionPlatform,
  type SessionProtocol,
} from './sessions'
import { buildMediaPlaneStatus } from './media-plane'
import { getIceServers } from './ice'
import {
  closeRoom,
  createRoom,
  getRoom,
  isOperatorInRoom,
  listRoomsForOperator,
  recordTelemetry,
  toView,
  MAX_PARTICIPANTS_LIMIT,
} from './rooms'
import { SIGNALING_PATH } from './signaling'

/** Bounds are sanity checks, not physics: a client reporting 900 fps is a broken client. */
const telemetrySchema = z.object({
  signalQuality: z.number().min(0).max(100),
  latency: z.number().min(0).max(60_000),
  frameRate: z.number().min(0).max(240),
  bitrate: z.number().min(0).max(100_000),
  packetLoss: z.number().min(0).max(100),
})

export function createApp() {
  const app = new Hono<{ Variables: OperatorVariables }>()
  const env = getServerEnv()

  const allowedOrigins = env.CORS_ALLOWED_ORIGINS
    ? env.CORS_ALLOWED_ORIGINS.split(',').map((v) => v.trim()).filter(Boolean)
    : ['*']

  app.use(
    '/v1/*',
    cors({
      origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
    })
  )

  app.get('/healthz', (c) =>
    c.json({
      ok: true,
      service: 'stix-mgic-vc-node',
      issuer: env.SESSION_ISSUER,
      authRequired: env.AUTH_REQUIRED,
      discordConfigured: env.discordConfigured,
      telegramConfigured: env.telegramConfigured,
      mediaPlaneEnabled: env.MEDIA_PLANE_ENABLED,
    })
  )

  // Per-adapter, because one boolean cannot say "can host a WebRTC room, cannot join a
  // Telegram group call". Each unavailable adapter carries the reason it is unavailable.
  app.get('/v1/media/status', (c) =>
    c.json({
      ...buildMediaPlaneStatus({ signalingReady: isSignalingReady() }),
      signalingPath: SIGNALING_PATH,
      maxParticipants: MAX_PARTICIPANTS_LIMIT,
    })
  )

  app.get('/v1/config/public', (c) =>
    c.json({
      discordClientId: env.DISCORD_CLIENT_ID || null,
      telegramBotUsername: env.TELEGRAM_BOT_USERNAME || null,
      authRequired: env.AUTH_REQUIRED,
      mediaPlaneEnabled: env.MEDIA_PLANE_ENABLED,
    })
  )

  app.post('/v1/auth/discord/exchange', async (c) => {
    if (!env.discordConfigured) {
      return c.json({ error: 'Discord OAuth is not configured' }, 503)
    }

    const body = await c.req.json<{ code?: string; redirectUri?: string }>()
    if (!body.code) return c.json({ error: 'code is required' }, 400)

    const redirectUri =
      body.redirectUri ||
      env.DISCORD_REDIRECT_URI ||
      `${new URL(c.req.url).origin}/auth/discord/callback`

    try {
      const user = await exchangeDiscordCode({ code: body.code, redirectUri })
      const token = mintOperatorToken({
        sub: `discord:${user.id}`,
        platform: 'discord',
        name: user.global_name || user.username,
      })

      return c.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
          global_name: user.global_name,
          avatar: user.avatar,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Discord exchange failed'
      return c.json({ error: message }, 400)
    }
  })

  app.post('/v1/auth/telegram/verify', async (c) => {
    if (!env.telegramConfigured) {
      return c.json({ error: 'Telegram auth is not configured' }, 503)
    }

    const payload = await c.req.json<TelegramLoginPayload>()
    try {
      if (!verifyTelegramLogin(payload)) {
        return c.json({ error: 'Invalid Telegram login payload' }, 401)
      }

      const token = mintOperatorToken({
        sub: `telegram:${payload.id}`,
        platform: 'telegram',
        name: payload.username ? `@${payload.username}` : payload.first_name,
      })

      return c.json({
        token,
        user: {
          id: payload.id,
          first_name: payload.first_name,
          last_name: payload.last_name,
          username: payload.username,
          photo_url: payload.photo_url,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Telegram verify failed'
      return c.json({ error: message }, 400)
    }
  })

  app.post('/v1/auth/anonymous', async (c) => {
    if (env.AUTH_REQUIRED) {
      return c.json({ error: 'Anonymous operators are disabled (AUTH_REQUIRED=true)' }, 403)
    }

    const token = mintOperatorToken({
      sub: `anonymous:${crypto.randomUUID()}`,
      platform: 'anonymous',
      name: 'Anonymous Operator',
    })

    return c.json({ token })
  })

  const requireOperator = createOperatorMiddleware(env.AUTH_REQUIRED)
  app.use('/v1/sessions/*', requireOperator)

  app.get('/v1/sessions/current', (c) => {
    const snapshot = getSession(c.get('operatorId'))
    return c.json(snapshot || { status: 'standby', source: 'live-api', mediaPlane: { enabled: env.MEDIA_PLANE_ENABLED, ready: false, reason: 'control-plane-only' } })
  })

  app.post('/v1/sessions/start', async (c) => {
    const body = await c.req.json<{
      platform?: SessionPlatform
      protocol?: SessionProtocol
      mode?: 'operator' | 'dj'
    }>()

    const platform = body.platform || 'telegram'
    const protocol = body.protocol || 'dj-mode'
    const mode = body.mode || (protocol === 'dj-mode' ? 'dj' : 'operator')

    const snapshot = startSession({
      operatorId: c.get('operatorId'),
      platform,
      protocol,
      mode,
      mediaPlaneEnabled: env.MEDIA_PLANE_ENABLED,
      ttlSeconds: env.OPERATOR_TOKEN_TTL_SECONDS,
    })

    return c.json(snapshot)
  })

  app.post('/v1/sessions/stop', (c) => {
    const snapshot = stopSession(c.get('operatorId'), env.MEDIA_PLANE_ENABLED)
    return c.json(snapshot)
  })

  // ---- Rooms -------------------------------------------------------------
  // A room is where a call actually happens. Everything under /v1/rooms sits behind the
  app.use('/v1/rooms', requireOperator)
  app.use('/v1/rooms/*', requireOperator)

  app.post('/v1/rooms', async (c) => {
    type CreateRoomBody = { name?: string; platform?: 'telegram' | 'discord' | 'web'; maxParticipants?: number }
    const body: CreateRoomBody = await c.req.json<CreateRoomBody>().catch(() => ({}) as CreateRoomBody)
    const room = createRoom({
      ownerOperatorId: c.get('operatorId'),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.platform !== undefined ? { platform: body.platform } : {}),
      ...(body.maxParticipants !== undefined ? { maxParticipants: body.maxParticipants } : {}),
    })

    return c.json({
      room: toView(room),
      // What a client needs to start negotiating, so joining is one round trip.
      signaling: { path: SIGNALING_PATH, iceServers: getIceServers() },
    }, 201)
  })

  // Only the caller's own rooms. There is no route that lists every room on the node —
  // a room id is a capability, and enumerating them would hand out other operators' calls.
  app.get('/v1/rooms', (c) =>
    c.json({ rooms: listRoomsForOperator(c.get('operatorId')).map(toView) })
  )

  app.get('/v1/rooms/:id', (c) => {
    const room = getRoom(c.req.param('id'))
    if (!room) return c.json({ error: 'Room not found' }, 404)
    return c.json({
      room: toView(room),
      signaling: { path: SIGNALING_PATH, iceServers: getIceServers() },
    })
  })

  app.delete('/v1/rooms/:id', (c) => {
    const room = getRoom(c.req.param('id'))
    if (!room) return c.json({ error: 'Room not found' }, 404)
    if (!closeRoom(room.id, c.get('operatorId'))) {
      return c.json({ error: 'Only the room owner can close it' }, 403)
    }
    return c.json({ closed: true })
  })

  // Telemetry flows UP from participants: frame rate, bitrate and packet loss only exist
  // inside a peer connection, so the client posts what getStats() measured and the node
  // serves it back. Nothing here estimates a number.
  app.post('/v1/rooms/:id/telemetry', async (c) => {
    const room = getRoom(c.req.param('id'))
    if (!room) return c.json({ error: 'Room not found' }, 404)

    const operatorId = c.get('operatorId')
    if (!isOperatorInRoom(room.id, operatorId)) {
      return c.json({ error: 'Not a participant of this room' }, 403)
    }

    const body = await c.req.json<Record<string, unknown>>().catch(() => null)
    const parsed = telemetrySchema.safeParse(body)
    if (!parsed.success) return c.json({ error: 'Invalid telemetry payload' }, 400)

    const recorded = recordTelemetry(room.id, operatorId, parsed.data)
    return c.json({ telemetry: recorded })
  })

  app.post('/v1/sessions/extend', async (c) => {
    const body = await c.req.json<{ seconds?: number }>()
    const seconds = body.seconds && body.seconds > 0 ? body.seconds : 1800
    const result = extendSession(c.get('operatorId'), seconds)
    if (!result) return c.json({ error: 'No active session' }, 404)
    return c.json(result)
  })

  return app
}
