import { createHmac, timingSafeEqual } from 'node:crypto'
import { getServerEnv } from './env'

export type OperatorClaims = {
  sub: string
  // 'supabase' is the Fenrir master identity (auth.users.id) — see server/supabase-auth.ts.
  platform: 'telegram' | 'discord' | 'anonymous' | 'friskydev' | 'supabase'
  name: string
  iat: number
  exp: number
  iss: string
  accountId?: string
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64url')
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

export function mintOperatorToken(input: {
  sub: string
  platform: OperatorClaims['platform']
  name: string
  accountId?: string
}): string {
  const env = getServerEnv()
  const now = Math.floor(Date.now() / 1000)
  const claims: OperatorClaims = {
    sub: input.sub,
    platform: input.platform,
    name: input.name,
    iat: now,
    exp: now + env.OPERATOR_TOKEN_TTL_SECONDS,
    iss: env.SESSION_ISSUER,
    ...(input.accountId ? { accountId: input.accountId } : {}),
  }

  const payload = b64url(JSON.stringify(claims))
  const sig = createHmac('sha256', env.operatorTokenSecret).update(payload).digest()
  return `${payload}.${b64url(sig)}`
}

export function verifyOperatorToken(token: string): OperatorClaims | null {
  const env = getServerEnv()
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null

  const expected = createHmac('sha256', env.operatorTokenSecret).update(payload).digest()
  const actual = fromB64url(sig)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null
  }

  try {
    const claims = JSON.parse(fromB64url(payload).toString('utf8')) as OperatorClaims
    if (claims.iss !== env.SESSION_ISSUER) return null
    if (claims.exp < Math.floor(Date.now() / 1000)) return null
    return claims
  } catch {
    return null
  }
}
