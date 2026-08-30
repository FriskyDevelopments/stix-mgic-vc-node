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
  scheduleRoom,
  toView,
} from './rooms'
import { getIceServersAsync } from './ice'
import { createSfuSession } from './cloudflare-realtime'
import { SIGNALING_PATH } from './signaling'
import { beginPairing, confirmPairing, pairingStatus } from './telegram-vc-pair'
import { telegramVcAdapter } from './telegram-vc-adapter'
import { getRtmpPublishConfig } from './rtmp-ingest'
import { discordInteractions } from './discord-interactions'
import { oidcCallback, oidcLogout, oidcMe, oidcStart, sessionClaimsFromCookie } from './oidc'
import { supabaseSession } from './supabase-auth'
import { handleTelegramUpdate, isTelegramWebhookAuthorized, WEBHOOK_HEADER } from './telegram-bot'

type Variables = {
  operatorId: string
  operatorName: string
  operatorPlatform: 'telegram' | 'discord' | 'anonymous' | 'friskydev' | 'supabase'
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
      allowHeaders: ['Content-Type', 'Authorization', 'X-Client-Id'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  )

  app.get('/healthz', (c) =>
    c.json({
      ok: true,
      service: 'stix-mgic-vc-node',
      issuer: env.SESSION_ISSUER,
      authRequired: env.AUTH_REQUIRED,
      discordConfigured: env.discordConfigured,
      discordInteractionsConfigured: env.discordInteractionsConfigured,
      discordBotConfigured: env.discordBotConfigured,
      telegramConfigured: env.telegramConfigured,
      telegramWebhookConfigured: env.telegramWebhookConfigured,
      mediaPlaneEnabled: env.MEDIA_PLANE_ENABLED,
      friskydevAccounts: true,
      friskydevIdConfigured: env.oidcConfigured,
      supabaseIdentityConfigured: env.supabaseConfigured,
    })
  )

  app.get('/v1/media/status', (c) =>
    c.json(buildMediaPlaneStatus({ signalingReady: isSignalingReady() }))
  )

  // Public by design, but cryptographically authenticated by Discord's Ed25519
  // signature. This is the endpoint registered in the Discord Developer Portal.
  app.post('/v1/discord/interactions', discordInteractions)

  app.get('/v1/config/public', (c) => {
    const media = buildMediaPlaneStatus({ signalingReady: isSignalingReady() })
    const telegramAdapter = media.adapters.find((adapter) => adapter.id === 'telegram-vc')
    const discordAdapter = media.adapters.find((adapter) => adapter.id === 'discord-voice')

    return c.json({
      discordClientId: env.DISCORD_CLIENT_ID || null,
      telegramBotUsername: env.TELEGRAM_BOT_USERNAME || null,
      authRequired: env.AUTH_REQUIRED,
      mediaPlaneEnabled: env.MEDIA_PLANE_ENABLED,
      friskydevEnabled: true,
      friskydevIdConfigured: env.oidcConfigured,
      supabaseIdentityConfigured: env.supabaseConfigured,
      supabaseUrl: env.SUPABASE_URL || null,
      supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || null,
      spotifyClientId: env.SPOTIFY_CLIENT_ID || null,
      identityProvider: 'supabase',
      identityReady: env.supabaseConfigured,
      capabilities: {
        telegramAuth: {
          ready: env.telegramConfigured && Boolean(env.TELEGRAM_BOT_USERNAME),
          reason: env.telegramConfigured && env.TELEGRAM_BOT_USERNAME
            ? 'Telegram Login Widget verification is configured'
            : 'Telegram bot token and bot username are required',
        },
        discordAuth: {
          ready: env.discordConfigured,
          reason: env.discordConfigured
            ? 'Discord OAuth code exchange is configured'
            : 'Discord client ID and client secret are required',
        },
        telegramVc: {
          ready: telegramAdapter?.state === 'ready',
          reason: telegramAdapter?.reason || 'Telegram VC adapter is unavailable',
        },
        discordVoice: {
          ready: discordAdapter?.state === 'ready',
          reason: discordAdapter?.reason || 'Discord voice adapter is unavailable',
        },
        cloudflareTurn: {
          ready: env.cloudflareTurnConfigured,
          reason: env.cloudflareTurnConfigured
            ? 'Cloudflare TURN relay credentials are minted per call'
            : 'Cloudflare TURN key ID and API token are required',
        },
        cloudflareSfu: {
          ready: env.cloudflareRealtimeConfigured,
          reason: env.cloudflareRealtimeConfigured
            ? 'Cloudflare Realtime SFU sessions can be created for scale'
            : 'Cloudflare Realtime app ID and secret are required',
        },
      },
    })
  })

  app.get('/v1/auth/oidc/start', oidcStart)
  app.get('/v1/auth/oidc/callback', oidcCallback)
  app.get('/v1/auth/oidc/me', oidcMe)
  app.post('/v1/auth/oidc/logout', oidcLogout)
  // Supabase FriskyDev — the Fenrir master identity. Exchanges a Supabase access token
  // (obtained by the browser via SSO/PKCE) for the same `vc_session` cookie the OIDC path
  // issues, so rooms and signaling gate on `auth.users.id` with no downstream changes.
  app.post('/v1/auth/supabase/session', supabaseSession)

  // Telegram sends this directly; it is authenticated with the secret header configured
  // on the Bot API, not an operator cookie or browser bearer token.
  app.post('/v1/telegram/webhook', async (c) => {
    if (!env.telegramWebhookConfigured || !isTelegramWebhookAuthorized(c.req.header(WEBHOOK_HEADER))) {
      return c.json({ error: 'Unauthorized Telegram webhook' }, 401)
    }
    let update: Parameters<typeof handleTelegramUpdate>[0]
    try {
      update = await c.req.json()
    } catch {
      return c.json({ error: 'Expected a Telegram update JSON payload' }, 400)
    }
    const result = await handleTelegramUpdate(update)
    return c.json({ ok: true, ...result })
  })

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
    const media = buildMediaPlaneStatus({ signalingReady: isSignalingReady() })
    const requiredAdapter = media.adapters.find((adapter) =>
      adapter.id === (platform === 'telegram' ? 'telegram-vc' : 'discord-voice')
    )

    if (!requiredAdapter || requiredAdapter.state !== 'ready') {
      return c.json({
        error: `${platform === 'telegram' ? 'Telegram VC' : 'Discord Voice'} is unavailable`,
        reason: requiredAdapter?.reason || 'No verified adapter is configured',
      }, 503)
    }

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
    const cookieClaims = !token ? sessionClaimsFromCookie(c.req.header('cookie')) : null

    if (cookieClaims) {
      c.set('operatorId', cookieClaims.sub)
      c.set('operatorName', cookieClaims.name)
      c.set('operatorPlatform', cookieClaims.platform)
      await next()
      return
    }

    if (!token) {
      if (env.AUTH_REQUIRED && !env.PUBLIC_ROOMS_ENABLED) {
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
      scheduledFor?: number
    }>()
    const room = createRoom({
      ownerOperatorId: c.get('operatorId'),
      name: body.name,
      platform: body.platform,
      maxParticipants: body.maxParticipants,
      scheduledFor: body.scheduledFor,
    })
    return c.json({
      room: toView(room),
      signaling: {
        path: SIGNALING_PATH,
        iceServers: await getIceServersAsync(),
      },
    })
  })

  // Bootstrap a Cloudflare Realtime SFU session for a caller who has already been admitted
  // to the operator plane. The app secret never leaves the server; the client receives only
  // the session id it negotiates its push/pull tracks against. 503 when the SFU is not
  // configured so the client falls back to mesh rather than silently believing it scaled.
  app.post('/v1/media/sfu/session', async (c) => {
    if (!env.cloudflareRealtimeConfigured) {
      return c.json({ error: 'Cloudflare Realtime SFU is not configured on this node' }, 503)
    }
    try {
      const session = await createSfuSession()
      if (!session) {
        return c.json({ error: 'Cloudflare Realtime SFU is not configured on this node' }, 503)
      }
      return c.json({ sessionId: session.sessionId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create SFU session'
      return c.json({ error: message }, 502)
    }
  })

  app.patch('/v1/rooms/:id/schedule', async (c) => {
    const body = await c.req.json<{ scheduledFor?: number }>()
    const room = scheduleRoom(c.req.param('id'), c.get('operatorId'), Number(body.scheduledFor))
    if (!room) return c.json({ error: 'Invalid schedule or only the room owner may change it' }, 400)
    return c.json({ room: toView(room) })
  })

  app.get('/v1/rooms', (c) => {
    const rooms = listRoomsForOperator(c.get('operatorId'))
    return c.json({ rooms: rooms.map((room) => toView(room)) })
  })

  app.get('/v1/rooms/:id', async (c) => {
    const room = getRoom(c.req.param('id'))
    if (!room) return c.json({ error: 'Room not found' }, 404)

    const operatorId = c.get('operatorId')
    const isOwner = room.ownerOperatorId === operatorId
    const isParticipant = isOperatorInRoom(room.id, operatorId)
    // In authenticated production the unguessable room UUID is the invitation capability.
    // Guests must read signaling configuration before their WebSocket can join the room.
    // Anonymous local mode stays owner/participant-only unless public rooms are explicit.
    if (!env.AUTH_REQUIRED && !env.PUBLIC_ROOMS_ENABLED && !isOwner && !isParticipant) {
      return c.json({ error: 'Only the room owner or a participant may view this room' }, 403)
    }

    return c.json({
      room: toView(room),
      signaling: {
        path: SIGNALING_PATH,
        iceServers: await getIceServersAsync(),
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

  // A Telegram MTProto session can control live call participants. Keep this surface
  // behind the same operator authentication boundary as rooms. In particular, the
  // primary Supabase social-login flow uses the HttpOnly vc_session cookie, not a
  // browser-readable bearer token; rejecting that cookie here made the authenticated
  // operator unable even to inspect or pair the adapter.
  app.use('/v1/telegram-vc/*', async (c, next) => {
    const header = c.req.header('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const cookieClaims = !token ? sessionClaimsFromCookie(c.req.header('cookie')) : null

    if (cookieClaims) {
      c.set('operatorId', cookieClaims.sub)
      c.set('operatorName', cookieClaims.name)
      c.set('operatorPlatform', cookieClaims.platform)
      await next()
      return
    }

    if (!token) return c.json({ error: 'Operator token required' }, 401)

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
    if (!claims) return c.json({ error: 'Invalid or expired operator token' }, 401)

    c.set('operatorId', claims.sub)
    c.set('operatorName', claims.name)
    c.set('operatorPlatform', claims.platform)
    if (claims.accountId) c.set('friskyAccountId', claims.accountId)
    await next()
  })

  // RTMP credentials are the keys to publish into the live pipeline. They follow the
  // same social-session/operator-token boundary as the Telegram VC controls.
  app.use('/v1/rtmp/*', async (c, next) => {
    const header = c.req.header('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const cookieClaims = !token ? sessionClaimsFromCookie(c.req.header('cookie')) : null
    if (cookieClaims) { await next(); return }
    if (!token) return c.json({ error: 'Operator token required' }, 401)
    if (verifyFriskyDevToken(token) || verifyOperatorToken(token)) { await next(); return }
    return c.json({ error: 'Invalid or expired operator token' }, 401)
  })

  app.get('/v1/rtmp/publish', (c) => {
    const config = getRtmpPublishConfig()
    return config.ready ? c.json(config) : c.json({ error: 'RTMP ingest is not configured' }, 503)
  })

  app.get('/v1/telegram-vc/pair/status', (c) => c.json(pairingStatus()))

  app.post('/v1/telegram-vc/pair/start', async (c) => {
    const body: { phone?: string } = await c.req.json<{ phone?: string }>().catch(() => ({}))
    try {
      return c.json(await beginPairing(body.phone || ''))
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not send Telegram code' }, 503)
    }
  })

  app.post('/v1/telegram-vc/pair/confirm', async (c) => {
    const body: { code?: string; password?: string } = await c.req.json<{ code?: string; password?: string }>().catch(() => ({}))
    try {
      return c.json(await confirmPairing(body.code || '', body.password))
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not verify Telegram code' }, 400)
    }
  })

  const telegramStatus = async () => {
    const result = await telegramVcAdapter.status()
    return {
      adapter: 'telegram-vc',
      client: { connected: result.paired, userId: null, username: null },
      call: {
        state: result.active ? 'active' : 'idle', chatId: result.chatId ? String(result.chatId) : null,
        ssrc: null, activeSource: result.source ? 'rtmp' : null, error: null, joinedAt: null, hasTransport: result.active,
      },
    }
  }
  app.get('/v1/telegram-vc/status', async (c) => {
    try { return c.json(await telegramStatus()) } catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Telegram adapter unavailable' }, 503) }
  })
  app.post('/v1/telegram-vc/join', async (c) => {
    const body: { chatId?: string; source?: string } = await c.req.json<{ chatId?: string; source?: string }>().catch(() => ({}))
    try { await telegramVcAdapter.join(body.chatId || '', body.source || ''); return c.json({ call: (await telegramStatus()).call }) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Could not join Telegram group call' }, 503) }
  })
  app.post('/v1/telegram-vc/leave', async (c) => {
    try { await telegramVcAdapter.leave(); return c.json({ call: (await telegramStatus()).call }) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Could not leave Telegram group call' }, 503) }
  })
  app.post('/v1/telegram-vc/source', async (c) => {
    const body: { config?: { url?: string; path?: string } } = await c.req.json<{ config?: { url?: string; path?: string } }>().catch(() => ({}))
    try { await telegramVcAdapter.source(body.config?.url || body.config?.path || ''); return c.json({ call: (await telegramStatus()).call }) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Could not switch Telegram source' }, 503) }
  })
  app.get('/v1/telegram-vc/groups', async (c) => {
    try { return c.json(await telegramVcAdapter.groups()) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Could not load Telegram groups' }, 503) }
  })
  app.get('/v1/telegram-vc/participants', (c) => c.json({ participants: [], count: 0 }))
  app.post('/v1/telegram-vc/mute', (c) => c.json({ error: 'Participant moderation is not available in the Telegram adapter yet' }, 501))

  return app
}
