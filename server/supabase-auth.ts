/**
 * VC node ← Supabase FriskyDev identity.
 *
 * This is the Fenrir master identity. LORE states the standing rule in its own source
 * (`client/src/lib/supabase-auth.ts`): "one Supabase for every Frisky login, so a person
 * is the same `auth.users.id` across MyFenrir, ClipsFlow and LORE." VC node joins that
 * rule here — it does not get its own identity provider, and it does not invent a second
 * namespace for the same human.
 *
 * Why this matters beyond the login screen: rooms in `rooms.ts` are owned and scoped by
 * `operatorId`, and `operatorId` is whatever `sub` the session carries. Minting
 * `friskydev:<authentik-sub>` made a VC operator a different principal from the same
 * person in LORE. Here `sub` is the raw `auth.users.id`, so a room owner is the same
 * identity Fenrir uses everywhere else, with no mapping table to drift.
 *
 * The exchange is deliberately server-side. The browser completes SSO with Supabase
 * (PKCE, in `src/lib/supabase-identity.ts`) and posts the resulting access token here
 * once; the node verifies it with Supabase and mints its own short-lived operator token
 * as an HttpOnly cookie. The WebSocket upgrade in `signaling.ts` already reads that
 * cookie, so the media plane is gated by the same session as the REST API without the
 * Supabase token ever being handed to the signaling layer.
 *
 * Verification calls Supabase's `/auth/v1/user` rather than checking a signature locally.
 * That needs no JWT secret and no JWKS cache, it works unchanged across Supabase's legacy
 * HS256 keys and the newer asymmetric signing keys, and it fails closed if the user was
 * deleted or the session revoked between sign-in and this call — which local signature
 * checking would happily miss until the token expired.
 */
import type { Context } from 'hono'
import { setCookie } from 'hono/cookie'
import { getServerEnv } from './env'
import { mintOperatorToken } from './tokens'
import { SESSION_COOKIE } from './oidc'

/** The subset of Supabase's user object this node relies on. */
type SupabaseUser = {
  id: string
  email?: string
  user_metadata?: {
    full_name?: string
    name?: string
    preferred_username?: string
  }
  app_metadata?: {
    provider?: string
  }
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: getServerEnv().NODE_ENV === 'production',
    sameSite: 'Lax' as const,
    path: '/',
    maxAge,
  }
}

/** No auth response may be cached by the browser or an edge. */
function noStore(c: Context) {
  c.header('Cache-Control', 'no-store')
}

/**
 * Structured, REDACTED diagnostics — booleans and a coarse reason code only. Never a
 * token, key, email or user id. Mirrors the discipline in `oidc.ts`.
 */
function logAuth(message: string, data: Record<string, unknown>): void {
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      scope: 'supabase-auth',
      message,
      data,
    })
  )
}

/** A human-facing display name, falling back through what SSO actually populates. */
function displayName(user: SupabaseUser): string {
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.user_metadata?.preferred_username ||
    user.email ||
    'FriskyDev member'
  )
}

/**
 * Ask Supabase who this access token belongs to.
 *
 * Returns null on any failure — invalid, expired and revoked are indistinguishable here
 * on purpose, so the caller cannot leak which one it was.
 */
export async function resolveSupabaseUser(accessToken: string): Promise<SupabaseUser | null> {
  const env = getServerEnv()
  if (!env.supabaseConfigured) return null

  let response: Response
  try {
    response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: env.SUPABASE_ANON_KEY!,
      },
    })
  } catch {
    // Network/DNS failure reaching Supabase. Fail closed.
    return null
  }

  if (!response.ok) return null

  const user = (await response.json()) as SupabaseUser
  // `id` is the auth.users.id — the master identity. Without it there is nothing to gate on.
  return user?.id ? user : null
}

/**
 * POST /v1/auth/supabase/session
 *
 * Body: { access_token }. On success sets the same `vc_session` cookie the OIDC path sets,
 * so every downstream consumer — REST routes, the WebSocket upgrade, room ownership — is
 * unchanged and cannot tell which IdP the operator came through.
 */
export async function supabaseSession(c: Context) {
  const env = getServerEnv()
  noStore(c)

  if (!env.supabaseConfigured) {
    return c.json({ error: 'Supabase FriskyDev identity is not configured' }, 503)
  }

  let body: { access_token?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Expected a JSON body' }, 400)
  }

  const accessToken = body.access_token?.trim()
  if (!accessToken) {
    logAuth('supabase session rejected', { reason: 'missing_access_token' })
    return c.json({ error: 'access_token is required' }, 400)
  }

  const user = await resolveSupabaseUser(accessToken)
  if (!user) {
    logAuth('supabase session rejected', { reason: 'token_not_accepted_by_supabase' })
    return c.json({ error: 'Supabase did not accept that session' }, 401)
  }

  // `sub` is the bare auth.users.id — no prefix. This IS the Fenrir master identity, and
  // it is what rooms.ts scopes ownership and membership by.
  const session = mintOperatorToken({
    sub: user.id,
    platform: 'supabase',
    name: displayName(user),
  })
  setCookie(c, SESSION_COOKIE, session, cookieOptions(env.OPERATOR_TOKEN_TTL_SECONDS))

  logAuth('supabase login completed', {
    provider: user.app_metadata?.provider ?? 'unknown',
    hasEmail: Boolean(user.email),
  })

  return c.json({
    authenticated: true,
    user: { id: user.id, name: displayName(user) },
  })
}
