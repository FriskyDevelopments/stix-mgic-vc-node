/**
 * ice.ts — the ICE server list handed to browsers before they negotiate.
 *
 * STUN alone gets two peers connected in most home and office networks. It does NOT get
 * them connected through symmetric NAT or a restrictive corporate firewall — those need
 * TURN, which relays the media and therefore costs bandwidth. So TURN is optional here and
 * configured, never bundled: a deploy without TURN credentials still works for most
 * callers and says plainly, in `/v1/media/status`, that the hard cases will fail.
 *
 * TURN credentials are secrets. They arrive from the environment (op:// -> env), are sent
 * only to an authenticated operator, and are never logged.
 */
import { getServerEnv } from './env'
import { mintCloudflareTurnCredential } from './cloudflare-realtime'

export type IceServer = {
  urls: string | string[]
  username?: string
  credential?: string
}

/** Public STUN default. Overridden by STUN_URLS when the fleet runs its own. */
const DEFAULT_STUN = 'stun:stun.l.google.com:19302'

export function getIceServers(): IceServer[] {
  const env = getServerEnv()

  const stunUrls = (env.STUN_URLS ?? DEFAULT_STUN)
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)

  const servers: IceServer[] = []
  if (stunUrls.length > 0) servers.push({ urls: stunUrls })

  if (env.TURN_URLS && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    servers.push({
      urls: env.TURN_URLS.split(',').map((url) => url.trim()).filter(Boolean),
      username: env.TURN_USERNAME,
      credential: env.TURN_CREDENTIAL,
    })
  }

  return servers
}

/**
 * The ICE list a browser should actually negotiate with, including a freshly minted
 * Cloudflare TURN relay when one is configured. This is async because the Cloudflare
 * credential is minted per call over the network; a static `TURN_*` deployment resolves
 * synchronously and this simply returns the static list.
 *
 * A Cloudflare mint failure is non-fatal: we log nothing sensitive, drop the relay, and
 * still hand back STUN (+ any static TURN) so most callers connect rather than the whole
 * call failing on a transient Cloudflare error.
 */
export async function getIceServersAsync(
  mint: typeof mintCloudflareTurnCredential = mintCloudflareTurnCredential,
): Promise<IceServer[]> {
  const servers = getIceServers()

  const env = getServerEnv()
  if (!env.cloudflareTurnConfigured) return servers

  try {
    const minted = await mint()
    if (minted) {
      servers.push({
        urls: minted.iceServers.urls,
        username: minted.iceServers.username,
        credential: minted.iceServers.credential,
      })
    }
  } catch {
    // Relay unavailable this negotiation; STUN-only is still better than a failed call.
  }

  return servers
}

/** Whether a relay is available — the difference between "most calls" and "all calls". */
export function hasTurn(): boolean {
  const env = getServerEnv()
  return Boolean(
    (env.TURN_URLS && env.TURN_USERNAME && env.TURN_CREDENTIAL) || env.cloudflareTurnConfigured,
  )
}
