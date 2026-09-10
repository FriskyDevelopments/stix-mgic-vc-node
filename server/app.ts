import { Hono, type Context } from 'hono'
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
import { issueAltchaChallenge, isAltchaReady, verifyAltcha } from './altcha'
import { SIGNALING_PATH } from './signaling'
import { beginPairing, confirmPairing, pairingStatus } from './telegram-vc-pair'
import { telegramVcAdapter } from './telegram-vc-adapter'
import {
  executeRoomAdmin,
  httpStatusForRoomAdmin,
  parseRoomAdminAction,
  type RoomAdminActionName,
} from './room-admin'
import { getRtmpPublishConfig } from './rtmp-ingest'
import { discordInteractions } from './discord-interactions'
import {
  listPlaylists,
  createPlaylist,
  addPlaylistItem,
  playPlaylist,
  nextPlaylistItem,
} from './playlist-store'
import { listStickers, saveSticker } from './stickers'
import { getAvailableAudioDevices, setActiveAudioSource, type AudioSourceKind } from './audio-devices'
import { lookupMusicArtwork } from './music-artwork'
import { listMediaFiles, saveMediaFile } from './media-upload'
import { oidcCallback, oidcLogout, oidcMe, oidcStart, sessionClaimsFromCookie } from './oidc'
import { supabaseSession } from './supabase-auth'
import { handleTelegramUpdate, isTelegramWebhookAuthorized, WEBHOOK_HEADER } from './telegram-bot'
import { buildIdentityCatalog, publicSupabaseIdentity } from './identity-catalog'
import { getNebuAuth, isNebuBetterAuthConfigured, listConfiguredSocialProviders } from './betterAuth'

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

/** Builds the Hono control-plane application and registers its API routes. */
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

  // NEBU Better Auth (nebu.quest). Additive — does not replace Authentik OIDC on the studio path.
  app.on(['GET', 'POST'], '/api/auth/*', (c) => {
    const auth = getNebuAuth()
    if (!auth) {
      return c.json(
        {
          error: 'NEBU Better Auth is not configured',
          hint: 'Set BETTER_AUTH_SECRET, BETTER_AUTH_URL, DATABASE_URL, and OAuth provider env vars.',
        },
        503
      )
    }
    return auth.handler(c.req.raw)
  })

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
      nebuBetterAuthConfigured: isNebuBetterAuthConfigured(),
      nebuSocialProviders: listConfiguredSocialProviders(),
    })
  )

  app.get('/v1/media/status', (c) =>
    c.json(buildMediaPlaneStatus({ signalingReady: isSignalingReady() }))
  )

  // ALTCHA proof-of-work challenge. Public by design — the client must solve this before
  // hitting abuse-prone auth routes. Returns 503 when no HMAC key is configured so the
  // client can degrade gracefully rather than send an unsolvable payload.
  app.get('/v1/altcha/challenge', async (c) => {
    if (!isAltchaReady()) {
      return c.json({ error: 'ALTCHA is not configured' }, 503)
    }
    return c.json(await issueAltchaChallenge())
  })

  // Public by design, but cryptographically authenticated by Discord's Ed25519
  // signature. This is the endpoint registered in the Discord Developer Portal.
  app.post('/v1/discord/interactions', discordInteractions)

  app.get('/v1/config/public', (c) => {
    const media = buildMediaPlaneStatus({ signalingReady: isSignalingReady() })
    const telegramAdapter = media.adapters.find((adapter) => adapter.id === 'telegram-vc')
    const discordAdapter = media.adapters.find((adapter) => adapter.id === 'discord-voice')
    const supabase = publicSupabaseIdentity(env)
    const identityProviders = buildIdentityCatalog(env)

    return c.json({
      discordClientId: env.DISCORD_CLIENT_ID || null,
      telegramBotUsername: env.TELEGRAM_BOT_USERNAME || null,
      authRequired: env.AUTH_REQUIRED,
      mediaPlaneEnabled: env.MEDIA_PLANE_ENABLED,
      friskydevEnabled: true,
      friskydevIdConfigured: env.oidcConfigured,
      supabaseIdentityConfigured: env.supabaseConfigured,
      supabaseUrl: supabase.url,
      supabasePublishableKey: supabase.publishableKey,
      spotifyClientId: env.SPOTIFY_CLIENT_ID || null,
      identityProvider: 'supabase',
      identityReady: env.supabaseConfigured,
      identityProviders,
      nebuBetterAuthConfigured: isNebuBetterAuthConfigured(),
      nebuSocialProviders: listConfiguredSocialProviders(),
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

  const authIndex = (c: Context) => {
    const cookie = sessionClaimsFromCookie(c.req.header('cookie'))
    const supabase = publicSupabaseIdentity(env)
    return c.json({
      ok: true,
      authenticated: Boolean(cookie),
      user: cookie ? { id: cookie.sub, name: cookie.name, platform: cookie.platform } : null,
      providers: buildIdentityCatalog(env),
      supabase,
    })
  }
  app.get('/v1/auth', authIndex)
  app.get('/v1/auth/', authIndex)

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
    const body = await c.req.json<{ email?: string; password?: string; displayName?: string; altcha?: string }>()
    if (isAltchaReady() && !(await verifyAltcha(body.altcha))) {
      return c.json({ error: 'Human verification failed. Please try again.' }, 403)
    }
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
    const body = await c.req.json<{ email?: string; password?: string; altcha?: string }>()
    if (isAltchaReady() && !(await verifyAltcha(body.altcha))) {
      return c.json({ error: 'Human verification failed. Please try again.' }, 403)
    }
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

  const accountIndex = (c: Context) => {
    const endpoints = {
      me: '/v1/account/me',
      login: '/v1/account/login',
      register: '/v1/account/register',
    }
    const claims = requireFriskyDev(c)
    if (claims) {
      const account = getAccountById(claims.sub)
      if (!account) {
        return c.json({
          ok: false,
          authenticated: false,
          account: null,
          linked: [],
          endpoints,
          error: 'Account not found',
        }, 404)
      }
      return c.json({
        ok: true,
        authenticated: true,
        account: publicAccount(account),
        linked: listLinkedIdentities(account.id).map((i) => ({
          platform: i.platform,
          externalSubject: i.externalSubject,
          displayName: i.displayName,
          verifiedAt: i.verifiedAt,
          meta: i.meta,
        })),
        endpoints,
      })
    }

    const cookie = sessionClaimsFromCookie(c.req.header('cookie'))
    if (cookie) {
      return c.json({
        ok: true,
        authenticated: true,
        account: { id: cookie.sub, displayName: cookie.name, platform: cookie.platform },
        linked: [],
        endpoints,
      })
    }

    return c.json({
      ok: true,
      authenticated: false,
      account: null,
      linked: [],
      endpoints,
    })
  }
  app.get('/v1/account', accountIndex)
  app.get('/v1/account/', accountIndex)

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
      const user = verifyTelegramLogin(payload)
      if (!user) {
        return c.json({ error: 'Invalid Telegram login payload' }, 401)
      }

      const linked = linkIdentity({
        accountId: claims.sub,
        platform: 'telegram',
        externalSubject: String(user.id),
        displayName: user.username ? `@${user.username}` : user.first_name,
        meta: {
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          photo_url: user.photo_url,
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
      const user = verifyTelegramLogin(payload)
      if (!user) {
        return c.json({ error: 'Invalid Telegram login payload' }, 401)
      }

      const token = mintOperatorToken({
        sub: `telegram:${user.id}`,
        platform: 'telegram',
        name: user.username ? `@${user.username}` : user.first_name,
      })

      return c.json({
        token,
        user: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          photo_url: user.photo_url,
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
    const body = await c.req.json<{ altcha?: string }>().catch(() => ({}) as { altcha?: string })
    if (isAltchaReady() && !(await verifyAltcha(body.altcha))) {
      return c.json({ error: 'Human verification failed. Please try again.' }, 403)
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


  // ROOM-ADMIN.md — Telegram VC moderation for the live Studio room.
  // Destructive `end` is confirmed in the UI; the API still requires the owner token.
  app.post('/v1/rooms/:id/admin', async (c) => {
    const body = await c.req.json<{
      action?: string
      target?: string
      title?: string
    }>().catch(() => ({} as { action?: string; target?: string; title?: string }))

    const action = parseRoomAdminAction(body.action)
    if (!action) {
      return c.json(
        {
          error: 'Invalid action. Expected mute|unmute|kick|pin|end|title|invite',
        },
        400
      )
    }

    const result = await executeRoomAdmin(c.req.param('id'), c.get('operatorId'), {
      action: action as RoomAdminActionName,
      target: body.target,
      title: body.title,
    })

    if (!result.ok) {
      return c.json({ error: result.error, code: result.code }, httpStatusForRoomAdmin(result))
    }

    return c.json({
      ok: true,
      action: result.action,
      participants: result.participants,
      count: result.count,
      pendingMtproto: result.pendingMtproto ?? null,
      title: result.title ?? null,
    })
  })


  // Shared operator gate for live-control surfaces (Telegram VC, playlists, uploads).
  // Accepts HttpOnly vc_session cookie, FriskyDev bearer, or operator bearer — never anonymous.
  const requireLiveOperator = async (c: Context<{ Variables: Variables }>, next: () => Promise<void>) => {
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
  }

  const tenantFrom = (c: Context<{ Variables: Variables }>) => {
    const tenant = c.get('friskyAccountId') || c.get('operatorId')
    if (!tenant) throw new Error('Operator identity required')
    return tenant
  }

  // A Telegram MTProto session can control live call participants. Keep this surface
  // behind the same operator authentication boundary as rooms. In particular, the
  // primary Supabase social-login flow uses the HttpOnly vc_session cookie, not a
  // browser-readable bearer token; rejecting that cookie here made the authenticated
  // operator unable even to inspect or pair the adapter.
  app.use('/v1/telegram-vc/*', requireLiveOperator)

  // DJ simplify live-control / upload surfaces — same privilege as telegram-vc.
  // Unauthenticated callers must not mutate shared playlists or drive adapter.source.
  app.use('/v1/playlists/*', requireLiveOperator)
  app.use('/v1/playlists', requireLiveOperator)
  app.use('/v1/stickers/*', requireLiveOperator)
  app.use('/v1/stickers', requireLiveOperator)
  app.use('/v1/media/*', requireLiveOperator)
  app.use('/v1/media', requireLiveOperator)
  app.use('/v1/audio/*', requireLiveOperator)
  app.use('/v1/audio', requireLiveOperator)
  app.use('/v1/music/*', requireLiveOperator)
  app.use('/v1/music', requireLiveOperator)

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
        state: result.active ? 'active' : 'idle',
        chatId: result.chatId ? String(result.chatId) : null,
        ssrc: null,
        activeSource: result.source ? 'rtmp' : null,
        error: null,
        joinedAt: null,
        hasTransport: result.active,
        camera: result.camera ?? false,
        paused: result.paused ?? false,
      },
    }
  }
  app.get('/v1/telegram-vc/status', async (c) => {
    try { return c.json(await telegramStatus()) } catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Telegram adapter unavailable' }, 503) }
  })
  app.post('/v1/telegram-vc/join', async (c) => {
    const body: { chatId?: string; source?: string; camera?: boolean } = await c.req.json<{ chatId?: string; source?: string; camera?: boolean }>().catch(() => ({}))
    try {
      const cam = body.camera !== false // default true for cam auto-on (Bug 5)
      await telegramVcAdapter.join(body.chatId || '', body.source || '', cam)
      return c.json({ call: (await telegramStatus()).call })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Could not join Telegram group call' }, 503) }
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

  // Playback controls (Bug 2)
  app.post('/v1/telegram-vc/pause', async (c) => {
    try { await telegramVcAdapter.pause(); return c.json({ call: (await telegramStatus()).call }) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Could not pause' }, 503) }
  })
  app.post('/v1/telegram-vc/resume', async (c) => {
    try { await telegramVcAdapter.resume(); return c.json({ call: (await telegramStatus()).call }) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Could not resume' }, 503) }
  })
  app.post('/v1/telegram-vc/skip', async (c) => {
    try { await telegramVcAdapter.skip(); return c.json({ call: (await telegramStatus()).call }) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Could not skip' }, 503) }
  })
  app.post('/v1/telegram-vc/stop', async (c) => {
    try { await telegramVcAdapter.stop(); return c.json({ call: (await telegramStatus()).call }) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Could not stop' }, 503) }
  })
  app.post('/v1/telegram-vc/cam', async (c) => {
    const body: { on?: boolean } = await c.req.json<{ on?: boolean }>().catch(() => ({}))
    try { await telegramVcAdapter.setCamera(!!body.on); return c.json({ call: (await telegramStatus()).call }) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Could not toggle camera' }, 503) }
  })

  app.get('/v1/telegram-vc/groups', async (c) => {
    try { return c.json(await telegramVcAdapter.groups()) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Could not load Telegram groups' }, 503) }
  })
  app.get('/v1/telegram-vc/participants', async (c) => {
    const chatId = c.req.query('chatId')
    try {
      if (chatId) {
        return c.json(await telegramVcAdapter.participants(chatId))
      }
      const result = await telegramVcAdapter.participants()
      return c.json({
        participants: result.participants ?? [],
        count: result.count ?? 0,
        pendingMtproto: result.pendingMtproto ?? null,
        active: result.active,
        chatId: result.chatId ?? null,
        source: result.source ?? null,
        title: result.title ?? null,
      })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not load participants' }, 503)
    }
  })
  app.post('/v1/telegram-vc/mute', async (c) => {
    const body = await c.req
      .json<{
        chatId?: string
        participantId?: string
        target?: string
        expectedCallId?: string
        onlyIfCameraOff?: boolean
      }>()
      .catch(() => ({} as {
        chatId?: string
        participantId?: string
        target?: string
        expectedCallId?: string
        onlyIfCameraOff?: boolean
      }))
    const target = (body.target || body.participantId || '').trim()
    if (body.chatId && body.participantId) {
      try {
        const res = await telegramVcAdapter.mute(
          body.chatId,
          body.participantId,
          body.expectedCallId || '',
          { onlyIfCameraOff: !!body.onlyIfCameraOff }
        )
        return c.json({ ok: true, ...res })
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : 'Mute failed' }, 503)
      }
    }
    if (!target) return c.json({ error: 'target user id is required' }, 400)
    try {
      const result = await telegramVcAdapter.mute(target)
      return c.json({
        ok: true,
        participants: result.participants,
        count: result.count,
        pendingMtproto: result.pendingMtproto ?? null,
      })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not mute participant' }, 503)
    }
  })

  // Playlists / queue (Bug 3)
  app.get('/v1/playlists', (c) => {
    // In real multi-tenant, derive tenant from operator; here use a default or frisky account
    const tenant = tenantFrom(c)
    return c.json({ playlists: listPlaylists(tenant) })
  })
  app.post('/v1/playlists', async (c) => {
    const body = await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string }))
    const tenant = tenantFrom(c)
    const pl = createPlaylist(tenant, body.name || 'New Playlist')
    return c.json({ playlist: pl })
  })
  app.post('/v1/playlists/:id/items', async (c) => {
    const body = await c.req.json<{ url?: string; title?: string; duration?: number }>().catch(() => ({} as { url?: string; title?: string; duration?: number }))
    const tenant = tenantFrom(c)
    const url = (body.url || '').trim()
    if (!url) return c.json({ error: 'url is required' }, 400)
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/') && !url.startsWith('file:')) {
      return c.json({ error: 'url must be http(s), file, or absolute path' }, 400)
    }
    const pl = addPlaylistItem(tenant, c.req.param('id'), { url, title: body.title, duration: body.duration })
    return pl ? c.json({ playlist: pl }) : c.json({ error: 'Playlist not found' }, 404)
  })
  app.post('/v1/playlists/:id/play', async (c) => {
    const tenant = tenantFrom(c)
    try {
      const pl = await playPlaylist(tenant, c.req.param('id'))
      return pl ? c.json({ playlist: pl }) : c.json({ error: 'Playlist not found or empty' }, 404)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not play playlist' }, 503)
    }
  })
  app.post('/v1/playlists/:id/next', async (c) => {
    const tenant = tenantFrom(c)
    try {
      const pl = await nextPlaylistItem(tenant, c.req.param('id'))
      return pl ? c.json({ playlist: pl }) : c.json({ error: 'Playlist not found' }, 404)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not advance playlist' }, 503)
    }
  })

  // Stickers (Bug 4)
  app.get('/v1/stickers', (c) => {
    const tenant = tenantFrom(c)
    return c.json({ stickers: listStickers(tenant) })
  })
  app.post('/v1/stickers/upload', async (c) => {
    const body = await c.req.json<{ name?: string; data?: string }>().catch(() => ({} as { name?: string; data?: string }))
    if (!body.data) return c.json({ error: 'data (base64) required' }, 400)
    if (body.data.length > 11_000_000) return c.json({ error: 'Sticker too large (max ~8MB)' }, 413)
    const tenant = tenantFrom(c)
    const buf = Buffer.from(body.data, 'base64')
    if (buf.length > 8 * 1024 * 1024) return c.json({ error: 'Sticker too large (max 8MB)' }, 413)
    const sticker = saveSticker(tenant, body.name || 'upload.png', buf)
    return c.json({ sticker })
  })

  // Audio source + real levels (Bug 6)
  app.get('/v1/audio/devices', (c) => c.json(getAvailableAudioDevices()))
  app.post('/v1/audio/source', async (c) => {
    const body = await c.req.json<{ source?: AudioSourceKind }>().catch(() => ({} as { source?: AudioSourceKind }))
    const src = body.source || 'file'
    return c.json(setActiveAudioSource(src))
  })

  // Media upload for clipflow file picker (Bug 10)
  app.get('/v1/media/files', (c) => {
    const tenant = tenantFrom(c)
    return c.json({ files: listMediaFiles(tenant) })
  })
  app.get('/v1/media', (c) => {
    const tenant = tenantFrom(c)
    return c.json({ files: listMediaFiles(tenant) })
  })
  // POST /v1/media/upload would use multipart; simplified JSON for now
  app.post('/v1/media/upload', async (c) => {
    const body = await c.req.json<{ name?: string; data?: string; base64?: string }>().catch(
      () => ({} as { name?: string; data?: string; base64?: string })
    )
    const tenant = tenantFrom(c)
    const payload = body.data || body.base64
    if (!payload) return c.json({ error: 'data required' }, 400)
    if (payload.length > 45_000_000) return c.json({ error: 'Media too large (max ~32MB)' }, 413)
    const buf = Buffer.from(payload, 'base64')
    if (buf.length > 32 * 1024 * 1024) return c.json({ error: 'Media too large (max 32MB)' }, 413)
    const f = saveMediaFile(tenant, body.name || 'clip.bin', buf)
    return c.json({ file: f })
  })

  // Apple music artwork (Bug 9) - simple lookup
  app.get('/v1/music/artwork', async (c) => {
    const id = c.req.query('id')
    if (!id) return c.json({ error: 'id required' }, 400)
    const art = await lookupMusicArtwork(id)
    return c.json(art)

  })

  return app
}
