import { z } from 'zod'

const serverEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  VITE_DIST_DIR: z.string().default('dist'),
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
  MEDIA_PLANE_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
})

export type ServerEnv = z.infer<typeof serverEnvSchema> & {
  operatorTokenSecret: string
  discordConfigured: boolean
  telegramConfigured: boolean
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

  cached = {
    ...data,
    operatorTokenSecret,
    discordConfigured: Boolean(data.DISCORD_CLIENT_ID && data.DISCORD_CLIENT_SECRET),
    telegramConfigured: Boolean(data.TELEGRAM_BOT_TOKEN),
  }

  return cached
}

export function resetServerEnvCache(): void {
  cached = null
}
