import { createChallenge, verifySolution } from 'altcha-lib'
import { getServerEnv } from './env'

/**
 * ALTCHA proof-of-work anti-abuse.
 *
 * The server issues a signed challenge; the client burns CPU finding a number whose
 * hash matches, then returns a base64 payload. We re-verify the HMAC and the solution
 * before allowing an abuse-prone action (account creation, login, anonymous token mint).
 *
 * This is intentionally invisible/self-hosted: no third-party key, no external calls.
 * The only secret is ALTCHA_HMAC_KEY, which stays server-side.
 */

export type AltchaChallenge = {
  algorithm: string
  challenge: string
  salt: string
  signature: string
  maxnumber: number
}

/** True when the server can issue and verify challenges. */
export function isAltchaReady(): boolean {
  return getServerEnv().altchaConfigured && Boolean(getServerEnv().altchaKey)
}

/** Mint a fresh, short-lived signed challenge for the client to solve. */
export async function issueAltchaChallenge(): Promise<AltchaChallenge> {
  const env = getServerEnv()
  const challenge = await createChallenge({
    hmacKey: env.altchaKey,
    maxNumber: env.ALTCHA_MAX_NUMBER,
    // Expire quickly: a challenge is meant to be solved and spent within one flow.
    expires: new Date(Date.now() + 5 * 60_000),
  })
  return { ...challenge, maxnumber: env.ALTCHA_MAX_NUMBER }
}

/**
 * Verify a solved ALTCHA payload (the base64 string produced by the client widget/solver).
 * Returns true only for a well-formed, correctly-signed, unexpired solution.
 */
export async function verifyAltcha(payload: unknown): Promise<boolean> {
  if (typeof payload !== 'string' || payload.length === 0) return false
  const env = getServerEnv()
  if (!env.altchaKey) return false
  try {
    // `true` checks the embedded expiry.
    return await verifySolution(payload, env.altchaKey, true)
  } catch {
    return false
  }
}
