import { z } from 'zod'

const optionalTrimmed = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined)

const envSchema = z.object({

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
  // Supabase FriskyDev — the Fenrir master identity. Optional here because
  // `supabase-identity.ts` carries the same public defaults LORE does; these only
  // override them per-deployment.
  VITE_SUPABASE_URL: optionalTrimmed,
  VITE_SUPABASE_ANON_KEY: optionalTrimmed,
})

export type AppEnv = {
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
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL as string | undefined,
    VITE_DISCORD_CLIENT_ID: import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined,
    VITE_SPOTIFY_CLIENT_ID: import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined,
    VITE_TELEGRAM_BOT_USERNAME: import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined,
    VITE_OPERATOR_TIER: import.meta.env.VITE_OPERATOR_TIER as string | undefined,
    VITE_AUTH_REQUIRED: import.meta.env.VITE_AUTH_REQUIRED as string | undefined,
    VITE_POSTHOG_PROJECT_TOKEN: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN as string | undefined,
    VITE_POSTHOG_HOST: import.meta.env.VITE_POSTHOG_HOST as string | undefined,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  }
}

let cachedEnv: AppEnv | null = null

export function getAppEnv(): AppEnv {
  if (cachedEnv) return cachedEnv

  const parsed = envSchema.safeParse(readRawEnv())
  if (!parsed.success) {
    console.error('[env] Invalid environment configuration', parsed.error.flatten())
    cachedEnv = {
      apiBaseUrl: '',
      operatorTier: 'premium',
      isLiveApiConfigured: true,
      authRequired: false,
      posthogHost: 'https://us.i.posthog.com',
    }
    return cachedEnv
  }

  cachedEnv = {
    apiBaseUrl: parsed.data.VITE_API_BASE_URL || '',
    discordClientId: parsed.data.VITE_DISCORD_CLIENT_ID,
    spotifyClientId: parsed.data.VITE_SPOTIFY_CLIENT_ID,
    telegramBotUsername: parsed.data.VITE_TELEGRAM_BOT_USERNAME,
    operatorTier: parsed.data.VITE_OPERATOR_TIER,
    isLiveApiConfigured: true,
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
