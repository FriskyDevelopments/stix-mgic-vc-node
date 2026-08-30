/**
 * cloudflare-realtime.ts — Cloudflare Realtime (formerly Calls): TURN + SFU.
 *
 * Two independent capabilities, deliberately kept separate because they solve different
 * problems and are configured with different credentials:
 *
 *   TURN  A relay for the peers STUN cannot connect — symmetric NAT, restrictive firewalls.
 *         Cloudflare mints SHORT-LIVED credentials over REST; we call that endpoint with the
 *         TURN key API token (server-side secret) and hand the browser only the derived
 *         username/credential, which expires. This is what turns the WebRTC adapter from
 *         "degraded, STUN only" into "ready".
 *
 *   SFU   A media server that receives each participant's tracks once and fans them out, so
 *         a room scales past the O(n^2) connection count of a full mesh. We create a session
 *         with the app secret; the browser then pushes/pulls tracks against that session id.
 *
 * Every network call here is authenticated with a secret that must never reach the client,
 * and every value we return to the client is derived and expiring. Nothing is logged.
 */
import { getServerEnv } from './env'

const CF_REALTIME_BASE = 'https://rtc.live.cloudflare.com/v1'

export type MintedIceServer = {
  urls: string | string[]
  username?: string
  credential?: string
}

export type TurnCredential = {
  iceServers: MintedIceServer
  /** Seconds the credential remains valid, echoed so the client can schedule a refresh. */
  ttl: number
}

/**
 * Ask Cloudflare for a fresh, expiring TURN credential. Returns null when TURN is not
 * configured so callers can degrade to STUN-only rather than fail the call.
 */
export async function mintCloudflareTurnCredential(
  fetchImpl: typeof fetch = fetch,
): Promise<TurnCredential | null> {
  const env = getServerEnv()
  if (!env.cloudflareTurnConfigured) return null

  const ttl = env.CLOUDFLARE_TURN_TTL_SECONDS
  const response = await fetchImpl(
    `${CF_REALTIME_BASE}/turn/keys/${env.CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_TURN_KEY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl }),
    },
  )

  if (!response.ok) {
    // Surface a cause without leaking the token or the response body verbatim.
    throw new Error(`Cloudflare TURN credential request failed with ${response.status}`)
  }

  const data = (await response.json()) as { iceServers?: MintedIceServer | MintedIceServer[] }
  const first = Array.isArray(data.iceServers) ? data.iceServers[0] : data.iceServers
  if (!first || !first.urls) {
    throw new Error('Cloudflare TURN response did not include an iceServers entry')
  }

  return { iceServers: first, ttl }
}

export type SfuSession = {
  sessionId: string
}

/**
 * Create a Cloudflare Realtime SFU session. The returned session id is what the browser
 * negotiates its push/pull tracks against. Returns null when the SFU is not configured.
 */
export async function createSfuSession(
  fetchImpl: typeof fetch = fetch,
): Promise<SfuSession | null> {
  const env = getServerEnv()
  if (!env.cloudflareRealtimeConfigured) return null

  const response = await fetchImpl(
    `${CF_REALTIME_BASE}/apps/${env.CLOUDFLARE_REALTIME_APP_ID}/sessions/new`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_REALTIME_APP_SECRET}`,
        'Content-Type': 'application/json',
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Cloudflare SFU session request failed with ${response.status}`)
  }

  const data = (await response.json()) as { sessionId?: string }
  if (!data.sessionId) {
    throw new Error('Cloudflare SFU response did not include a sessionId')
  }

  return { sessionId: data.sessionId }
}
