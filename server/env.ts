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
  TELEGRAM_BOT_TOKEN: z.string().optional().transform((v) => v?.trim() || undefined),
  TELEGRAM_BOT_USERNAME: z.string().optional().transform((v) => v?.trim() || undefined),
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
  /**
   * Which IdP the sign-in surface actually offers. Runtime, not build-time, so switching
   * is an env change and a restart rather than a rebuild — and so a misconfigured Supabase
   * redirect allow-list can be rolled back in seconds without shipping a new image.
   * Defaults to `authentik` because that is what is proven working in production.
   */
  IDENTITY_PROVIDER: z.enum(['authentik', 'supabase']).default('authentik'),
  // WebRTC. STUN gets most peers connected; TURN is what gets the rest connected, and it
  // relays media, so it is optional and reported as a capability rather than assumed.
  STUN_URLS: z.string().optional().transform((v) => v?.trim() || undefined),
  TURN_URLS: z.string().optional().transform((v) => v?.trim() || undefined),
  TURN_USERNAME: z.string().optional().transform((v) => v?.trim() || undefined),
  TURN_CREDENTIAL: z.string().optional().transform((v) => v?.trim() || undefined),
})

export type ServerEnv = z.infer<typeof serverEnvSchema> & {
  operatorTokenSecret: string
  discordConfigured: boolean
  telegramConfigured: boolean
  oidcConfigured: boolean
  supabaseConfigured: boolean
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
    telegramConfigured: Boolean(data.TELEGRAM_BOT_TOKEN),
    oidcConfigured: Boolean(
      data.AUTHENTIK_ISSUER && data.OIDC_CLIENT_ID && data.OIDC_CLIENT_SECRET && data.OIDC_REDIRECT_URI
    ),
    supabaseConfigured: Boolean(data.SUPABASE_URL && data.SUPABASE_ANON_KEY),
  }

  return cached
}

export function resetServerEnvCache(): void {
  cached = null
}
