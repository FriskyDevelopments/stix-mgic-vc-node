/**
 * Runtime configuration, read from the node instead of baked into the bundle.
 *
 * `VITE_*` values are frozen at `npm run build`. The production image is built from a
 * Dockerfile that forwards only `VITE_SPOTIFY_CLIENT_ID`, so anything else the UI needs to
 * know about the deployment — the Telegram bot it should hand the Login Widget, the Discord
 * client id — was always `undefined` in production even though the node itself had the value
 * and served it at `/v1/config/public`. That is why the Telegram login never rendered there.
 *
 * This reads the same endpoint at runtime, so changing `/opt/vc-node.env` and recreating the
 * container is enough; no rebuild is needed to correct a bot username again.
 */
import { useEffect, useState } from 'react'
import { apiUrl } from '@/lib/api-client'

export type PublicConfig = {
  discordClientId: string | null
  telegramBotUsername: string | null
  authRequired: boolean
  mediaPlaneEnabled: boolean
  friskydevEnabled: boolean
  friskydevIdConfigured: boolean
  supabaseIdentityConfigured: boolean
  identityProvider: string
  identityReady: boolean
}

let cached: PublicConfig | null = null
let inFlight: Promise<PublicConfig | null> | null = null

/** Resets the module cache. Tests only — the browser keeps one config per page load. */
export function resetPublicConfigCache(): void {
  cached = null
  inFlight = null
}

export function getCachedPublicConfig(): PublicConfig | null {
  return cached
}

export async function fetchPublicConfig(): Promise<PublicConfig | null> {
  if (cached) return cached
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const response = await fetch(apiUrl('/v1/config/public'))
      if (!response.ok) return null
      cached = (await response.json()) as PublicConfig
      return cached
    } catch {
      // The node not answering is not a reason to blank the UI; callers fall back to the
      // build-time values and the operations board reports the node as unreachable.
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export function usePublicConfig(): PublicConfig | null {
  const [config, setConfig] = useState<PublicConfig | null>(() => getCachedPublicConfig())

  useEffect(() => {
    if (config) return
    let cancelled = false
    void fetchPublicConfig().then((next) => {
      if (!cancelled && next) setConfig(next)
    })
    return () => {
      cancelled = true
    }
  }, [config])

  return config
}
