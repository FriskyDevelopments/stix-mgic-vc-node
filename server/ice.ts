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

/** Whether a relay is available — the difference between "most calls" and "all calls". */
export function hasTurn(): boolean {
  const env = getServerEnv()
  return Boolean(env.TURN_URLS && env.TURN_USERNAME && env.TURN_CREDENTIAL)
}
