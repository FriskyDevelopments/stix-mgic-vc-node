import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getServerEnv } from './env'
import { exchangeDiscordCode, verifyTelegramLogin, type TelegramLoginPayload } from './auth-providers'
import { mintOperatorToken, verifyOperatorToken } from './tokens'
import { extractBearer, mintFriskyDevToken, verifyFriskyDevToken } from './friskydev-tokens'
import {
  authenticateAccount,
  configureAccountStore,
  createAccount,
  getAccountById,
  linkIdentity,
  listLinkedIdentities,
  publicAccount,
  unlinkIdentity,
} from './account-store'
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
import {
  closeRoom,
  createRoom,
  findRoomForOperator,
  getRoom,
  isOperatorInRoom,
  listRoomsForOperator,
  recordTelemetry,
  toView,
} from './rooms'
import { getIceServers } from './ice'
import { SIGNALING_PATH } from './signaling'

type Variables = {
  operatorId: string
  operatorName: string
  operatorPlatform: 'telegram' | 'discord' | 'anonymous' | 'friskydev'
  friskyAccountId?: string
}

function requireFriskyDev(c: { req: { header: (name: string) => string | undefined } }) {
  const token = extractBearer(c.req.header('authorization'))
  if (!token) return null
  return verifyFriskyDevToken(token)
}

export function createApp() {
  configureAccountStore({
    persist: process.env.NODE_ENV !== 'test',
  })

  const app = new Hono<{ Variables: Variables }>()
  const env = getServerEnv()

  const allowedOrigins = env.CORS_ALLOWED_ORIGINS
    ? env.CORS_ALLOWED_ORIGINS.split(',').map((v) => v.trim()).filter(Boolean)
    : ['*']

  app.use(
    '/v1/*',
    cors({
      origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
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
      friskydevAccounts: true,
    })
  )

  app.get('/v1/media/status', (c) =>
    c.json(buildMediaPlaneStatus({ signalingReady: isSignalingReady() }))
  )

  app.get('/v1/config/public', (c) =>
    c.json({
      discordClientId: env.DISCORD_CLIENT_ID || null,
      telegramBotUsername: env.TELEGRAM_BOT_USERNAME || null,
      authRequired: env.AUTH_REQUIRED,
      mediaPlaneEnabled: env.MEDIA_PLANE_ENABLED,
      friskydevEnabled: true,
    })
  )

  app.post('/v1/account/register', async (c) => {
    const body = await c.req.json<{ email?: string; password?: string; displayName?: string }>()
    try {
      const account = createAccount({
        email: body.email || '',
        password: body.password || '',
        displayName: body.displayName || '',
      })
      const sessionToken = mintFriskyDevToken({
        id: account.id,
        email: account.email,
        name: account.displayName,
      })
      const operatorToken = mintOperatorToken({
        sub: `friskydev:${account.id}`,
        platform: 'friskydev',
        name: account.displayName,
        accountId: account.id,
      })
      return c.json({
        sessionToken,
        operatorToken,
        account: publicAccount(account),
        linked: [],
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed'
      return c.json({ error: message }, 400)
    }
  })

  app.post('/v1/account/login', async (c) => {
    const body = await c.req.json<{ email?: string; password?: string }>()
    const account = authenticateAccount(body.email || '', body.password || '')
    if (!account) return c.json({ error: 'Invalid email or password' }, 401)

    const sessionToken = mintFriskyDevToken({
      id: account.id,
      email: account.email,
      name: account.displayName,
    })
    const operatorToken = mintOperatorToken({
      sub: `friskydev:${account.id}`,
      platform: 'friskydev',
      name: account.displayName,
      accountId: account.id,
    })
    return c.json({
      sessionToken,
      operatorToken,
      account: publicAccount(account),
      linked: listLinkedIdentities(account.id).map((i) => ({
        platform: i.platform,
        externalSubject: i.externalSubject,
        displayName: i.displayName,
        verifiedAt: i.verifiedAt,
      })),
    })
  })

  app.get('/v1/account/me', (c) => {
    const claims = requireFriskyDev(c)
    if (!claims) return c.json({ error: 'FriskyDev session required' }, 401)
    const account = getAccountById(claims.sub)
    if (!account) return c.json({ error: 'Account not found' }, 404)
    return c.json({
      account: publicAccount(account),
      linked: listLinkedIdentities(account.id).map((i) => ({
        platform: i.platform,
        externalSubject: i.externalSubject,
        displayName: i.displayName,
        verifiedAt: i.verifiedAt,
        meta: i.meta,
      })),
    })
  })

  app.post('/v1/account/link/telegram', async (c) => {
    const claims = requireFriskyDev(c)
    if (!claims) return c.json({ error: 'FriskyDev session required' }, 401)
    if (!env.telegramConfigured) {
      return c.json({ error: 'Telegram auth is not configured' }, 503)
    }

    const payload = await c.req.json<TelegramLoginPayload>()
    try {
      if (!verifyTelegramLogin(payload)) {
        return c.json({ error: 'Invalid Telegram login payload' }, 401)
      }

      const linked = linkIdentity({
        accountId: claims.sub,
        platform: 'telegram',
        externalSubject: String(payload.id),
        displayName: payload.username ? `@${payload.username}` : payload.first_name,
        meta: {
          username: payload.username,
          first_name: payload.first_name,
          last_name: payload.last_name,
          photo_url: payload.photo_url,
        },
      })

      return c.json({
        linked: true,
        identity: {
          platform: linked.platform,
          externalSubject: linked.externalSubject,
          displayName: linked.displayName,
          verifiedAt: linked.verifiedAt,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Telegram link failed'
      return c.json({ error: message }, 400)
    }
  })

  app.post('/v1/account/link/discord', async (c) => {
    const claims = requireFriskyDev(c)
    if (!claims) return c.json({ error: 'FriskyDev session required' }, 401)
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
      const linked = linkIdentity({
        accountId: claims.sub,
        platform: 'discord',
        externalSubject: user.id,
        displayName: user.global_name || user.username,
        meta: {
          username: user.username,
          discriminator: user.discriminator,
          avatar: user.avatar,
          global_name: user.global_name,
        },
      })

      return c.json({
        linked: true,
        identity: {
          platform: linked.platform,
          externalSubject: linked.externalSubject,
          displayName: linked.displayName,
          verifiedAt: linked.verifiedAt,
        },
        user: {
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
          global_name: user.global_name,
          avatar: user.avatar,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Discord link failed'
      return c.json({ error: message }, 400)
    }
  })

  app.delete('/v1/account/link/:platform', (c) => {
    const claims = requireFriskyDev(c)
    if (!claims) return c.json({ error: 'FriskyDev session required' }, 401)
    const platform = c.req.param('platform')
    if (platform !== 'telegram' && platform !== 'discord') {
      return c.json({ error: 'platform must be telegram or discord' }, 400)
    }
    const unlinked = unlinkIdentity(claims.sub, platform)
    return c.json({ unlinked })
  })

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

  app.use('/v1/sessions/*', async (c, next) => {
    const header = c.req.header('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''

    if (!token) {
      if (env.AUTH_REQUIRED) {
        return c.json({ error: 'Operator token required' }, 401)
      }
      c.set('operatorId', `anonymous:${c.req.header('x-client-id') || 'local'}`)
      c.set('operatorName', 'Anonymous Operator')
      c.set('operatorPlatform', 'anonymous')
      await next()
      return
    }

    const frisky = verifyFriskyDevToken(token)
    if (frisky) {
      c.set('operatorId', `friskydev:${frisky.sub}`)
      c.set('operatorName', frisky.name)
      c.set('operatorPlatform', 'friskydev')
      c.set('friskyAccountId', frisky.sub)
      await next()
      return
    }

    const claims = verifyOperatorToken(token)
    if (!claims) {
      return c.json({ error: 'Invalid or expired operator token' }, 401)
    }

    c.set('operatorId', claims.sub)
    c.set('operatorName', claims.name)
    c.set('operatorPlatform', claims.platform)
    if (claims.accountId) c.set('friskyAccountId', claims.accountId)
    await next()
  })

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

  app.post('/v1/sessions/extend', async (c) => {
    const body = await c.req.json<{ seconds?: number }>()
    const seconds = body.seconds && body.seconds > 0 ? body.seconds : 1800
    const result = extendSession(c.get('operatorId'), seconds)
    if (!result) return c.json({ error: 'No active session' }, 404)
    return c.json(result)
  })

  // Room CRUD — the REST half of the media plane.
  // Auth is the same as sessions: anonymous when allowed, token-verified otherwise.
  app.use('/v1/rooms/*', async (c, next) => {
    const header = c.req.header('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''

    if (!token) {
      if (env.AUTH_REQUIRED) {
        return c.json({ error: 'Operator token required' }, 401)
      }
      c.set('operatorId', `anonymous:${c.req.header('x-client-id') || 'local'}`)
      c.set('operatorName', 'Anonymous Operator')
      c.set('operatorPlatform', 'anonymous')
      await next()
      return
    }

    const frisky = verifyFriskyDevToken(token)
    if (frisky) {
      c.set('operatorId', `friskydev:${frisky.sub}`)
      c.set('operatorName', frisky.name)
      c.set('operatorPlatform', 'friskydev')
      c.set('friskyAccountId', frisky.sub)
      await next()
      return
    }

    const claims = verifyOperatorToken(token)
    if (!claims) {
      return c.json({ error: 'Invalid or expired operator token' }, 401)
    }

    c.set('operatorId', claims.sub)
    c.set('operatorName', claims.name)
    c.set('operatorPlatform', claims.platform)
    if (claims.accountId) c.set('friskyAccountId', claims.accountId)
    await next()
  })

  app.post('/v1/rooms', async (c) => {
    const body = await c.req.json<{
      name?: string
      platform?: 'telegram' | 'discord' | 'web'
      maxParticipants?: number
    }>()
    const room = createRoom({
      ownerOperatorId: c.get('operatorId'),
      name: body.name,
      platform: body.platform,
      maxParticipants: body.maxParticipants,
    })
    return c.json({
      room: toView(room),
      signaling: {
        path: SIGNALING_PATH,
        iceServers: getIceServers(),
      },
    })
  })

  app.get('/v1/rooms', (c) => {
    const rooms = listRoomsForOperator(c.get('operatorId'))
    return c.json({ rooms: rooms.map((room) => toView(room)) })
  })

  app.get('/v1/rooms/:id', (c) => {
    const room = getRoom(c.req.param('id'))
    if (!room) return c.json({ error: 'Room not found' }, 404)

    const operatorId = c.get('operatorId')
    const isOwner = room.ownerOperatorId === operatorId
    const isParticipant = isOperatorInRoom(room.id, operatorId)
    if (!isOwner && !isParticipant) {
      return c.json({ error: 'Only the room owner or a participant may view this room' }, 403)
    }

    return c.json({
      room: toView(room),
      signaling: {
        path: SIGNALING_PATH,
        iceServers: getIceServers(),
      },
    })
  })

  app.delete('/v1/rooms/:id', (c) => {
    const roomId = c.req.param('id')
    const operatorId = c.get('operatorId')
    if (!closeRoom(roomId, operatorId)) {
      return c.json({ error: 'Only the room owner can close it' }, 403)
    }
    return c.json({ ok: true })
  })

  app.post('/v1/rooms/:id/telemetry', async (c) => {
    const roomId = c.req.param('id')
    const operatorId = c.get('operatorId')

    const membership = findRoomForOperator(operatorId)
    if (!membership || membership.room.id !== roomId) {
      return c.json({ error: 'Not in this room' }, 403)
    }

    const body = await c.req.json<{
      signalQuality: number
      latency: number
      frameRate: number
      bitrate: number
      packetLoss: number
    }>()
    const recorded = recordTelemetry(roomId, operatorId, body)
    if (!recorded) return c.json({ error: 'Room not found' }, 404)
    return c.json(recorded)
  })

  // Telegram VC adapter — honestly unavailable until a real MTProto user session exists.
  // The client polls /v1/telegram-vc/status and shows "not configured" when these
  // routes return 503; no functional Join/Leave buttons are ever rendered.
  app.all('/v1/telegram-vc/*', (c) =>
    c.json(
      {
        error:
          'Telegram VC adapter is not implemented. Joining a group call requires MTProto with a user session.',
        adapter: 'telegram-vc',
        available: false,
        reason:
          'joining a Telegram group call requires MTProto with a dedicated user session — not a bot token. Owner decision pending.',
      },
      503
    )
  )

  return app
}
