import { z } from 'zod'

const envSchema = z.object({
  VITE_DEMO_MODE: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value !== 'false'),
  VITE_API_BASE_URL: z.string().url().optional().or(z.literal('')).transform((value) => value || undefined),
  VITE_DISCORD_CLIENT_ID: z.string().optional().transform((value) => value?.trim() || undefined),
  VITE_SPOTIFY_CLIENT_ID: z.string().optional().transform((value) => value?.trim() || undefined),
  VITE_OPERATOR_TIER: z.enum(['free', 'premium']).optional().default('premium'),
})

export type AppEnv = {
  demoMode: boolean
  apiBaseUrl?: string
  discordClientId?: string
  spotifyClientId?: string
  operatorTier: 'free' | 'premium'
  isLiveApiConfigured: boolean
}

function readRawEnv() {
  return {
    VITE_DEMO_MODE: import.meta.env.VITE_DEMO_MODE as string | undefined,
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL as string | undefined,
    VITE_DISCORD_CLIENT_ID: import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined,
    VITE_SPOTIFY_CLIENT_ID: import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined,
    VITE_OPERATOR_TIER: import.meta.env.VITE_OPERATOR_TIER as string | undefined,
  }
}

let cachedEnv: AppEnv | null = null

export function getAppEnv(): AppEnv {
  if (cachedEnv) return cachedEnv

  const parsed = envSchema.safeParse(readRawEnv())
  if (!parsed.success) {
    console.error('[env] Invalid environment configuration', parsed.error.flatten())
    cachedEnv = {
      demoMode: true,
      operatorTier: 'premium',
      isLiveApiConfigured: false,
    }
    return cachedEnv
  }

  const apiBaseUrl = parsed.data.VITE_API_BASE_URL
  const demoMode = parsed.data.VITE_DEMO_MODE || !apiBaseUrl

  cachedEnv = {
    demoMode,
    apiBaseUrl,
    discordClientId: parsed.data.VITE_DISCORD_CLIENT_ID,
    spotifyClientId: parsed.data.VITE_SPOTIFY_CLIENT_ID,
    operatorTier: parsed.data.VITE_OPERATOR_TIER,
    isLiveApiConfigured: Boolean(apiBaseUrl) && !demoMode,
  }

  return cachedEnv
}

/** Test helper — clears memoized env. */
export function resetAppEnvCache(): void {
  cachedEnv = null
}
