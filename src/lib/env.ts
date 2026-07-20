import { z } from 'zod'

const optionalTrimmed = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined)

const envSchema = z.object({
  VITE_DEMO_MODE: z.enum(['true', 'false']).optional(),
  VITE_API_BASE_URL: z.string().optional().transform((value) => {
    const trimmed = value?.trim()
    if (!trimmed) return ''
    return trimmed.replace(/\/$/, '')
  }),
  VITE_DISCORD_CLIENT_ID: optionalTrimmed,
  VITE_SPOTIFY_CLIENT_ID: optionalTrimmed,
  VITE_TELEGRAM_BOT_USERNAME: optionalTrimmed,
  VITE_OPERATOR_TIER: z.enum(['free', 'premium']).optional().default('premium'),
  VITE_AUTH_REQUIRED: z.enum(['true', 'false']).optional(),
  VITE_POSTHOG_PROJECT_TOKEN: optionalTrimmed,
  VITE_POSTHOG_HOST: optionalTrimmed,
})

export type AppEnv = {
  demoMode: boolean
  apiBaseUrl: string
  discordClientId?: string
  spotifyClientId?: string
  telegramBotUsername?: string
  operatorTier: 'free' | 'premium'
  isLiveApiConfigured: boolean
  authRequired: boolean
  posthogProjectToken?: string
  posthogHost: string
}

function readRawEnv() {
  return {
    VITE_DEMO_MODE: import.meta.env.VITE_DEMO_MODE as string | undefined,
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL as string | undefined,
    VITE_DISCORD_CLIENT_ID: import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined,
    VITE_SPOTIFY_CLIENT_ID: import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined,
    VITE_TELEGRAM_BOT_USERNAME: import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined,
    VITE_OPERATOR_TIER: import.meta.env.VITE_OPERATOR_TIER as string | undefined,
    VITE_AUTH_REQUIRED: import.meta.env.VITE_AUTH_REQUIRED as string | undefined,
    VITE_POSTHOG_PROJECT_TOKEN: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN as string | undefined,
    VITE_POSTHOG_HOST: import.meta.env.VITE_POSTHOG_HOST as string | undefined,
  }
}

let cachedEnv: AppEnv | null = null

export function getAppEnv(): AppEnv {
  if (cachedEnv) return cachedEnv

  const parsed = envSchema.safeParse(readRawEnv())
  if (!parsed.success) {
    console.error('[env] Invalid environment configuration', parsed.error.flatten())
    cachedEnv = {
      demoMode: !import.meta.env.PROD,
      apiBaseUrl: '',
      operatorTier: 'premium',
      isLiveApiConfigured: Boolean(import.meta.env.PROD),
      authRequired: false,
      posthogHost: 'https://us.i.posthog.com',
    }
    return cachedEnv
  }

  const explicitDemo = parsed.data.VITE_DEMO_MODE
  const demoMode =
    explicitDemo === 'true' ? true : explicitDemo === 'false' ? false : !import.meta.env.PROD

  cachedEnv = {
    demoMode,
    apiBaseUrl: parsed.data.VITE_API_BASE_URL || '',
    discordClientId: parsed.data.VITE_DISCORD_CLIENT_ID,
    spotifyClientId: parsed.data.VITE_SPOTIFY_CLIENT_ID,
    telegramBotUsername: parsed.data.VITE_TELEGRAM_BOT_USERNAME,
    operatorTier: parsed.data.VITE_OPERATOR_TIER,
    isLiveApiConfigured: !demoMode,
    authRequired: parsed.data.VITE_AUTH_REQUIRED === 'true',
    posthogProjectToken: parsed.data.VITE_POSTHOG_PROJECT_TOKEN,
    posthogHost: parsed.data.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
  }

  return cachedEnv
}

/** Test helper — clears memoized env. */
export function resetAppEnvCache(): void {
  cachedEnv = null
}
