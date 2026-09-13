/** Port the existing Dockerfile EXPOSEs and the HEALTHCHECK curls. */
export const ASHY_CONTAINER_PORT = 10000

/** Durable Object / Container instance name for Ashy’s unit. */
export const ASHY_UNIT_INSTANCE_NAME = 'ashy'

const CONTAINER_DEFAULTS: Record<string, string> = {
  NODE_ENV: 'production',
  HOST: '0.0.0.0',
  PORT: String(ASHY_CONTAINER_PORT),
  AUTH_REQUIRED: 'true',
  MEDIA_PLANE_ENABLED: 'true',
  PUBLIC_ROOMS_ENABLED: 'true',
  IDENTITY_PROVIDER: 'supabase',
  SESSION_ISSUER: 'stix-magic-vc-node',
  LOG_LEVEL: 'info',
}

/**
 * Worker vars/secrets copied into the unit process when set.
 * Values must come from wrangler vars, `wrangler secret put`, or `.dev.vars` — never from git.
 */
export const ASHY_FORWARDED_ENV_KEYS = [
  'OPERATOR_TOKEN_SECRET',
  'OPERATOR_TOKEN_TTL_SECONDS',
  'AUTH_REQUIRED',
  'MEDIA_PLANE_ENABLED',
  'PUBLIC_ROOMS_ENABLED',
  'SESSION_ISSUER',
  'LOG_LEVEL',
  'CORS_ALLOWED_ORIGINS',
  'STUN_URLS',
  'TURN_URLS',
  'TURN_USERNAME',
  'TURN_CREDENTIAL',
  'CLOUDFLARE_TURN_KEY_ID',
  'CLOUDFLARE_TURN_KEY_API_TOKEN',
  'CLOUDFLARE_REALTIME_APP_ID',
  'CLOUDFLARE_REALTIME_APP_SECRET',
  'CLOUDFLARE_TURN_TTL_SECONDS',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_BOT_USERNAME',
  'TELEGRAM_WEBHOOK_SECRET',
  'STIX_TELEGRAM_API_ID',
  'STIX_TELEGRAM_API_HASH',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_REDIRECT_URI',
  'DISCORD_APPLICATION_PUBLIC_KEY',
  'DISCORD_APPLICATION_ID',
  'DISCORD_BOT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'AUTHENTIK_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_REDIRECT_URI',
  'ALTCHA_HMAC_KEY',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'DATABASE_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'APPLE_CLIENT_ID',
  'APPLE_CLIENT_SECRET',
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'MICROSOFT_TENANT_ID',
  'SPOTIFY_CLIENT_ID',
] as const

export function buildAshyContainerEnv(source: object): Record<string, string> {
  const bag = source as Record<string, unknown>
  const out: Record<string, string> = { ...CONTAINER_DEFAULTS }
  for (const key of ASHY_FORWARDED_ENV_KEYS) {
    const value = bag[key]
    if (typeof value === 'string' && value.trim()) {
      out[key] = value
    }
  }
  // The Worker proxies HTTP + WebSocket to this port. Do not let a stray var move it.
  out.PORT = String(ASHY_CONTAINER_PORT)
  out.HOST = '0.0.0.0'
  out.NODE_ENV = 'production'
  return out
}

export function missingRequiredAshySecrets(source: object): string[] {
  const bag = source as Record<string, unknown>
  const secret = bag.OPERATOR_TOKEN_SECRET
  if (typeof secret !== 'string' || secret.trim().length < 16) {
    return ['OPERATOR_TOKEN_SECRET']
  }
  return []
}
