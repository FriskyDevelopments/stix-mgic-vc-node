import { solveChallenge } from 'altcha-lib'
import { getAppEnv } from '@/lib/env'

/**
 * Client-side ALTCHA proof-of-work.
 *
 * Fetches a signed challenge from the API, solves it (burns a little CPU finding the
 * matching number), and returns the base64 payload the server re-verifies. This is
 * invisible to the user — no widget, no third-party — and self-hosted end to end.
 *
 * If ALTCHA is not configured server-side, the challenge endpoint returns 503 and this
 * resolves to `null`; callers send no token and the server (also seeing it unconfigured)
 * does not require one. That keeps local/dev usable without weakening a configured prod.
 */

type ChallengePayload = {
  algorithm: string
  challenge: string
  salt: string
  signature: string
  maxnumber?: number
}

function apiUrl(path: string): string {
  return `${getAppEnv().apiBaseUrl}${path}`
}

export async function solveAltcha(): Promise<string | null> {
  let challenge: ChallengePayload
  try {
    const response = await fetch(apiUrl('/v1/altcha/challenge'))
    if (response.status === 503) return null // ALTCHA disabled server-side
    if (!response.ok) return null
    challenge = (await response.json()) as ChallengePayload
  } catch {
    return null
  }

  try {
    const solver = solveChallenge(
      challenge.challenge,
      challenge.salt,
      challenge.algorithm,
      challenge.maxnumber,
    )
    const solution = await solver.promise
    if (!solution) return null
    return btoa(
      JSON.stringify({
        algorithm: challenge.algorithm,
        challenge: challenge.challenge,
        number: solution.number,
        salt: challenge.salt,
        signature: challenge.signature,
        took: solution.took,
      }),
    )
  } catch {
    return null
  }
}
