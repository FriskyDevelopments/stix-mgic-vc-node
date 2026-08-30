import { z } from 'zod'

const serverEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  VITE_DIST_DIR: z.string().default('dist'),
  ROOMS_STATE_PATH: z.string().optional().transform((v) => v?.trim() || undefined),
  DISCORD_CLIENT_ID: z.string().optional().transform((v) => v?.trim() || undefined),
  DISCORD_CLIENT_SECRET: z.string().optional().transform((v) => v?.trim() || undefined),
  DISCORD_REDIRECT_URI: z.string().optional().transform((v) => v?.trim() || undefined),
  // Discord signs Interaction webhooks with this public Ed25519 application key. It is
  // safe to store here; unlike the client secret or bot token, it cannot grant access.
  DISCORD_APPLICATION_PUBLIC_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).optional().transform((v) => v?.trim() || undefined),
  DISCORD_APPLICATION_ID: z.string().regex(/^\d+$/).optional().transform((v) => v?.trim() || undefined),
  DISCORD_BOT_TOKEN: z.string().min(20).optional().transform((v) => v?.trim() || undefined),
  TELEGRAM_BOT_TOKEN: z.string().optional().transform((v) => v?.trim() || undefined),
  TELEGRAM_BOT_USERNAME: z.string().optional().transform((v) => v?.trim() || undefined),
  /** Secret header Telegram includes with each webhook request. Never expose it to the client. */
  TELEGRAM_WEBHOOK_SECRET: z.string().min(24).optional().transform((v) => v?.trim() || undefined),
  // Telegram application credentials identify the MTProto client; they are not a user
  // session and cannot make calls without the separately paired operator account.
  STIX_TELEGRAM_API_ID: z.coerce.number().int().positive().optional(),
  STIX_TELEGRAM_API_HASH: z.string().optional().transform((v) => v?.trim() || undefined),
  OPERATOR_TOKEN_SECRET: z.string().min(16).optional(),
  OPERATOR_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  SESSION_ISSUER: z.string().default('stix-magic-vc-node'),
  AUTH_REQUIRED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  PUBLIC_ROOMS_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  MEDIA_PLANE_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  // The RTMP listener is intentionally a separate, small media process.  Credentials
  // stay server-side and are only returned through the authenticated operator route.
  RTMP_INGEST_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  RTMP_PUBLIC_HOST: z.string().optional().transform((v) => v?.trim() || undefined),
  RTMP_PUBLISH_USER: z.string().optional().transform((v) => v?.trim() || undefined),
  RTMP_PUBLISH_PASSWORD: z.string().min(16).optional().transform((v) => v?.trim() || undefined),
  RTMP_PATH: z.string().default('vc').transform((v) => v.trim().replace(/^\/+|\/+$/g, '') || 'vc'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  AUTHENTIK_ISSUER: z.string().url().optional().transform((v) => v?.replace(/\/$/, '')),
  OIDC_CLIENT_ID: z.string().optional().transform((v) => v?.trim() || undefined),
  OIDC_CLIENT_SECRET: z.string().optional().transform((v) => v?.trim() || undefined),
  OIDC_REDIRECT_URI: z.string().url().optional(),
  // Supabase FriskyDev — the Fenrir master identity (auth.users.id). Same project LORE
  // uses; VC node deliberately does not get its own. The anon/publishable key is public
  // by design: it ships in the client bundle and is policed by RLS. The service-role key
  // must never appear in this process.
  SUPABASE_URL: z.string().url().optional().transform((v) => v?.replace(/\/$/, '')),
  SUPABASE_ANON_KEY: z.string().optional().transform((v) => v?.trim() || undefined),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional().transform((v) => v?.trim() || undefined),
  SPOTIFY_CLIENT_ID: z.string().optional().transform((v) => v?.trim() || undefined),
  // VC Node has one primary identity plane: FriskyDev/Supabase social SSO. Keep this
  // explicit even though it has one value so an old environment cannot revive Authentik.
  IDENTITY_PROVIDER: z.literal('supabase').default('supabase'),
  // WebRTC. STUN gets most peers connected; TURN is what gets the rest connected, and it
  // relays media, so it is optional and reported as a capability rather than assumed.
  STUN_URLS: z.string().optional().transform((v) => v?.trim() || undefined),
  TURN_URLS: z.string().optional().transform((v) => v?.trim() || undefined),
  TURN_USERNAME: z.string().optional().transform((v) => v?.trim() || undefined),
  TURN_CREDENTIAL: z.string().optional().transform((v) => v?.trim() || undefined),
  // Cloudflare Realtime (formerly Calls). Two independent credentials, each optional:
  //   - TURN key (KEY_ID + API_TOKEN) mints short-lived relay credentials on demand, so a
  //     static TURN username/password never ships to the browser and rotates every call.
  //   - Realtime app (APP_ID + APP_SECRET) drives the SFU, which relays media through
  //     Cloudflare instead of the mesh so a room can scale past a handful of participants.
  // Both are secrets and stay server-side; the browser only ever sees derived, expiring
  // artifacts (an ICE server entry, an SFU session id).
  CLOUDFLARE_TURN_KEY_ID: z.string().optional().transform((v) => v?.trim() || undefined),
  CLOUDFLARE_TURN_KEY_API_TOKEN: z.string().optional().transform((v) => v?.trim() || undefined),
  CLOUDFLARE_REALTIME_APP_ID: z.string().optional().transform((v) => v?.trim() || undefined),
  CLOUDFLARE_REALTIME_APP_SECRET: z.string().optional().transform((v) => v?.trim() || undefined),
  // How long a minted Cloudflare TURN credential stays valid. One hour comfortably covers
  // a call while keeping the blast radius of a leaked credential small.
  CLOUDFLARE_TURN_TTL_SECONDS: z.coerce.number().int().positive().max(86_400).default(3600),
})

export type ServerEnv = z.infer<typeof serverEnvSchema> & {
  operatorTokenSecret: string
  discordConfigured: boolean
  discordInteractionsConfigured: boolean
  discordBotConfigured: boolean
  telegramConfigured: boolean
  telegramWebhookConfigured: boolean
  mtprotoConfigured: boolean
  oidcConfigured: boolean
  supabaseConfigured: boolean
  rtmpConfigured: boolean
  cloudflareTurnConfigured: boolean
  cloudflareRealtimeConfigured: boolean
}

let cached: ServerEnv | null = null

export function getServerEnv(): ServerEnv {
  if (cached) return cached

  const parsed = serverEnvSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(`Invalid server env: ${parsed.error.message}`)
  }

  const data = parsed.data
  const operatorTokenSecret =
    data.OPERATOR_TOKEN_SECRET ||
    (data.NODE_ENV === 'production'
      ? ''
      : 'dev-only-operator-token-secret')

  if (data.NODE_ENV === 'production' && !data.OPERATOR_TOKEN_SECRET) {
    throw new Error('OPERATOR_TOKEN_SECRET is required in production')
  }
  if (data.NODE_ENV === 'production' && !data.AUTH_REQUIRED) {
    throw new Error('AUTH_REQUIRED must be true in production')
  }

  cached = {
    ...data,
    operatorTokenSecret,
    discordConfigured: Boolean(data.DISCORD_CLIENT_ID && data.DISCORD_CLIENT_SECRET),
    discordInteractionsConfigured: Boolean(data.DISCORD_APPLICATION_PUBLIC_KEY),
    discordBotConfigured: Boolean(data.DISCORD_APPLICATION_ID && data.DISCORD_BOT_TOKEN),
    telegramConfigured: Boolean(data.TELEGRAM_BOT_TOKEN),
    telegramWebhookConfigured: Boolean(data.TELEGRAM_BOT_TOKEN && data.TELEGRAM_WEBHOOK_SECRET),
    mtprotoConfigured: Boolean(data.STIX_TELEGRAM_API_ID && data.STIX_TELEGRAM_API_HASH),
    oidcConfigured: Boolean(
      data.AUTHENTIK_ISSUER && data.OIDC_CLIENT_ID && data.OIDC_CLIENT_SECRET && data.OIDC_REDIRECT_URI
    ),
    supabaseConfigured: Boolean(
      data.SUPABASE_URL && (data.SUPABASE_PUBLISHABLE_KEY || data.SUPABASE_ANON_KEY)
    ),
    rtmpConfigured: Boolean(
      data.RTMP_INGEST_ENABLED && data.RTMP_PUBLIC_HOST && data.RTMP_PUBLISH_USER && data.RTMP_PUBLISH_PASSWORD
    ),
    cloudflareTurnConfigured: Boolean(
      data.CLOUDFLARE_TURN_KEY_ID && data.CLOUDFLARE_TURN_KEY_API_TOKEN
    ),
    cloudflareRealtimeConfigured: Boolean(
      data.CLOUDFLARE_REALTIME_APP_ID && data.CLOUDFLARE_REALTIME_APP_SECRET
    ),
  }

  return cached
}

export function resetServerEnvCache(): void {
  cached = null
}
