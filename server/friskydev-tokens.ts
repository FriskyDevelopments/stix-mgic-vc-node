import { createHmac, timingSafeEqual } from 'node:crypto'
import { getServerEnv } from './env'

export type FriskyDevClaims = {
  sub: string
  typ: 'friskydev'
  email: string
  name: string
  iat: number
  exp: number
  iss: string
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64url')
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

export function mintFriskyDevToken(input: { id: string; email: string; name: string }): string {
  const env = getServerEnv()
  const now = Math.floor(Date.now() / 1000)
  const claims: FriskyDevClaims = {
    sub: input.id,
    typ: 'friskydev',
    email: input.email,
    name: input.name,
    iat: now,
    exp: now + env.OPERATOR_TOKEN_TTL_SECONDS,
    iss: env.SESSION_ISSUER,
  }
  const payload = b64url(JSON.stringify(claims))
  const sig = createHmac('sha256', env.operatorTokenSecret).update(payload).digest()
  return `${payload}.${b64url(sig)}`
}

export function verifyFriskyDevToken(token: string): FriskyDevClaims | null {
  const env = getServerEnv()
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null

  const expected = createHmac('sha256', env.operatorTokenSecret).update(payload).digest()
  const actual = fromB64url(sig)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null
  }

  try {
    const claims = JSON.parse(fromB64url(payload).toString('utf8')) as FriskyDevClaims
    if (claims.typ !== 'friskydev') return null
    if (claims.iss !== env.SESSION_ISSUER) return null
    if (claims.exp < Math.floor(Date.now() / 1000)) return null
    return claims
  } catch {
    return null
  }
}

export function extractBearer(header: string | undefined): string {
  if (!header?.startsWith('Bearer ')) return ''
  return header.slice(7)
}
