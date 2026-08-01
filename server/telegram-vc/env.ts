/**
 * telegram-vc/env.ts — environment config for the Telegram VC adapter.
 *
 * These secrets come from 1Password / Frisky Secret Center. They are NEVER logged.
 * The session string is equivalent to the account password.
 */

export type TelegramVcEnv = {
  apiId: number
  apiHash: string
  sessionString: string
  /** Optional: default chat to join when no chat is specified. */
  defaultChatId: bigint | null
  /** Max seconds an ffmpeg transcode can run before being killed. */
  ffmpegTimeoutSeconds: number
}

let cached: TelegramVcEnv | null | undefined = undefined

/**
 * Returns null if the required vars are not set (the adapter stays disabled).
 * Throws if vars are partially set (likely a configuration mistake).
 */
export function getTelegramVcEnv(): TelegramVcEnv | null {
  if (cached !== undefined) return cached

  const apiId = process.env.TELEGRAM_VC_API_ID?.trim()
  const apiHash = process.env.TELEGRAM_VC_API_HASH?.trim()
  const sessionString = process.env.TELEGRAM_VC_SESSION_STRING?.trim()

  // All three absent = adapter disabled.
  if (!apiId && !apiHash && !sessionString) {
    cached = null
    return null
  }

  // Partially set = mistake.
  if (!apiId || !apiHash || !sessionString) {
    throw new Error(
      'Telegram VC adapter: TELEGRAM_VC_API_ID, TELEGRAM_VC_API_HASH, and TELEGRAM_VC_SESSION_STRING must ALL be set or ALL be absent.'
    )
  }

  const parsedApiId = parseInt(apiId, 10)
  if (!Number.isFinite(parsedApiId) || parsedApiId <= 0) {
    throw new Error('Telegram VC adapter: TELEGRAM_VC_API_ID must be a positive integer.')
  }

  const defaultChat = process.env.TELEGRAM_VC_DEFAULT_CHAT_ID?.trim()
  const ffmpegTimeout = parseInt(process.env.TELEGRAM_VC_FFMPEG_TIMEOUT_SECONDS || '300', 10)

  cached = {
    apiId: parsedApiId,
    apiHash,
    sessionString,
    defaultChatId: defaultChat ? BigInt(defaultChat) : null,
    ffmpegTimeoutSeconds: Number.isFinite(ffmpegTimeout) && ffmpegTimeout > 0 ? ffmpegTimeout : 300,
  }

  return cached
}

/** Reset for testing. */
export function resetTelegramVcEnvCache(): void {
  cached = undefined
}
