import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getServerEnv } from './env'
import { exchangeDiscordCode, verifyTelegramLogin, type TelegramLoginPayload } from './auth-providers'
import { mintOperatorToken, verifyOperatorToken } from './tokens'
import {
  extendSession,
  getSession,
  startSession,
  stopSession,
  type SessionPlatform,
  type SessionProtocol,
} from './sessions'

type Variables = {
  operatorId: string
  operatorName: string
  operatorPlatform: 'telegram' | 'discord' | 'anonymous'
}

export function createApp() {
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

  app.get('/v1/media/status', (c) =>
    c.json({
      ready: false,
      enabled: env.MEDIA_PLANE_ENABLED,
      reason: env.MEDIA_PLANE_ENABLED
        ? 'Media plane flag enabled but adapters are not wired yet'
        : 'control-plane-only',
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

    const claims = verifyOperatorToken(token)
    if (!claims) {
      return c.json({ error: 'Invalid or expired operator token' }, 401)
    }

    c.set('operatorId', claims.sub)
    c.set('operatorName', claims.name)
    c.set('operatorPlatform', claims.platform)
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

  return app
}
