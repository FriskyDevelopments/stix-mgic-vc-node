import { createHash, randomBytes } from 'node:crypto'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { getServerEnv } from './env'
import { mintOperatorToken, verifyOperatorToken, type OperatorClaims } from './tokens'

export const SESSION_COOKIE = 'vc_session'
const STATE_COOKIE_PREFIX = 'vc_oidc_state_'
const VERIFIER_COOKIE_PREFIX = 'vc_oidc_verifier_'
const RETURN_COOKIE_PREFIX = 'vc_oidc_return_'

/**
 * How long the per-attempt state/verifier/return cookies live. This is the time budget for
 * the whole interactive login at the IdP — password, MFA, a password-manager prompt, a
 * first-time consent. At 10 minutes real logins that paused on any of those arrived at the
 * callback after the cookie had expired and were rejected as "Invalid or expired" even
 * though nothing was wrong. 30 minutes covers a slow-but-legitimate login; the cookies stay
 * single-use, HttpOnly, Secure and SameSite=Lax, and the state is still unpredictable and
 * compared exactly, so widening the window does not weaken the flow.
 */
const LOGIN_TX_TTL_SECONDS = 30 * 60

type Discovery = {
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
}

type UserInfo = {
  sub: string
  name?: string
  preferred_username?: string
  email?: string
}

let discoveryCache: Discovery | null = null

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: getServerEnv().NODE_ENV === 'production',
    sameSite: 'Lax' as const,
    path: '/',
    maxAge,
  }
}

function attemptCookies(state: string) {
  // `state` is generated as base64url, so it is safe in a cookie name. Keeping
  // every attempt under its own name prevents a second login tab from
  // invalidating the first one's PKCE verifier.
  return {
    state: `${STATE_COOKIE_PREFIX}${state}`,
    verifier: `${VERIFIER_COOKIE_PREFIX}${state}`,
    returnTo: `${RETURN_COOKIE_PREFIX}${state}`,
  }
}

/** No auth response may be cached by the browser or an edge — each carries a one-time state. */
function noStore(c: Context) {
  c.header('Cache-Control', 'no-store')
}

/**
 * Structured, REDACTED diagnostics for the auth flow. Only booleans, counts and a coarse
 * reason code are ever emitted — never a code, token, secret, PKCE verifier, cookie value
 * or raw header. This is the only window into a callback that fails before token exchange.
 */
function logAuth(message: string, data: Record<string, unknown>): void {
  console.info(
    JSON.stringify({ ts: new Date().toISOString(), level: 'info', scope: 'oidc', message, data })
  )
}

/** Count our own attempt cookies present on the request, by name only — no values. */
function countAttemptCookies(cookieHeader: string | undefined): { state: number; verifier: number } {
  if (!cookieHeader) return { state: 0, verifier: 0 }
  const names = cookieHeader.split(';').map((p) => p.trim().split('=')[0])
  return {
    state: names.filter((n) => n.startsWith(STATE_COOKIE_PREFIX)).length,
    verifier: names.filter((n) => n.startsWith(VERIFIER_COOKIE_PREFIX)).length,
  }
}

/** Where a failed or expired callback sends the browser: back to a safe local path to retry. */
function safeRedirectTarget(returnTo: string | undefined): string {
  const target = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
  const separator = target.includes('?') ? '&' : '?'
  return `${target}${separator}login=expired`
}

async function discovery(): Promise<Discovery> {
  if (discoveryCache) return discoveryCache
  const issuer = getServerEnv().AUTHENTIK_ISSUER
  if (!issuer) throw new Error('FriskyDev ID is not configured')
  const response = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`)
  if (!response.ok) throw new Error('Could not discover FriskyDev ID')
  discoveryCache = (await response.json()) as Discovery
  return discoveryCache
}

export function sessionClaimsFromCookie(cookieHeader?: string): OperatorClaims | null {
  const token = cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1)
  return token ? verifyOperatorToken(decodeURIComponent(token)) : null
}

export async function oidcStart(c: Context) {
  const env = getServerEnv()
  noStore(c)
  if (!env.oidcConfigured) return c.json({ error: 'FriskyDev ID is not configured' }, 503)
  const metadata = await discovery()
  const state = randomBytes(24).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const cookies = attemptCookies(state)
  setCookie(c, cookies.state, state, cookieOptions(LOGIN_TX_TTL_SECONDS))
  setCookie(c, cookies.verifier, verifier, cookieOptions(LOGIN_TX_TTL_SECONDS))
  const requestedReturn = c.req.query('returnTo') || '/'
  const returnTo = requestedReturn.startsWith('/') && !requestedReturn.startsWith('//') ? requestedReturn : '/'
  setCookie(c, cookies.returnTo, returnTo, cookieOptions(LOGIN_TX_TTL_SECONDS))

  const url = new URL(metadata.authorization_endpoint)
  url.searchParams.set('client_id', env.OIDC_CLIENT_ID!)
  url.searchParams.set('redirect_uri', env.OIDC_REDIRECT_URI!)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid profile email')
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return c.redirect(url.toString())
}

export async function oidcCallback(c: Context) {
  const env = getServerEnv()
  noStore(c)
  const code = c.req.query('code')
  const state = c.req.query('state')
  const authError = c.req.query('error')
  const cookieHeader = c.req.header('cookie')
  const cookies = state ? attemptCookies(state) : null
  const expectedState = cookies ? getCookie(c, cookies.state) : undefined
  const verifier = cookies ? getCookie(c, cookies.verifier) : undefined
  const returnTo = cookies ? getCookie(c, cookies.returnTo) : undefined
  if (cookies) {
    deleteCookie(c, cookies.state, cookieOptions(0))
    deleteCookie(c, cookies.verifier, cookieOptions(0))
    deleteCookie(c, cookies.returnTo, cookieOptions(0))
  }

  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    // Pinpoint which precondition failed — presence booleans and counts only, no values.
    const present = countAttemptCookies(cookieHeader)
    const reason = !code
      ? 'missing_code'
      : !state
        ? 'missing_state'
        : !cookieHeader
          ? 'no_cookies_sent'
          : !expectedState
            ? 'state_cookie_absent'
            : state !== expectedState
              ? 'state_mismatch'
              : 'verifier_cookie_absent'
    logAuth('oidc callback rejected before token exchange', {
      reason,
      hasCode: Boolean(code),
      hasState: Boolean(state),
      cookieHeaderPresent: Boolean(cookieHeader),
      stateCookiesPresent: present.state,
      verifierCookiesPresent: present.verifier,
      hasExpectedStateCookie: Boolean(expectedState),
      stateMatches: Boolean(state && expectedState && state === expectedState),
      hasVerifier: Boolean(verifier),
      // Authentik may itself redirect back with an error (e.g. access_denied); record only
      // that one was present, never its text.
      authProviderErrorPresent: Boolean(authError),
    })
    // Do not dead-end. Send the browser back to a safe local path that can offer a fresh
    // login, preserving a valid returnTo. Never accept the invalid state as a session.
    return c.redirect(safeRedirectTarget(returnTo))
  }

  const metadata = await discovery()
  const tokenResponse = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.OIDC_REDIRECT_URI!,
      client_id: env.OIDC_CLIENT_ID!,
      client_secret: env.OIDC_CLIENT_SECRET!,
      code_verifier: verifier,
    }),
  })
  if (!tokenResponse.ok) return c.json({ error: 'FriskyDev ID token exchange failed' }, 502)
  const tokens = (await tokenResponse.json()) as { access_token?: string }
  if (!tokens.access_token) return c.json({ error: 'FriskyDev ID returned no access token' }, 502)

  const userResponse = await fetch(metadata.userinfo_endpoint, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  })
  if (!userResponse.ok) return c.json({ error: 'Could not read FriskyDev ID profile' }, 502)
  const user = (await userResponse.json()) as UserInfo
  if (!user.sub) return c.json({ error: 'FriskyDev ID profile has no subject' }, 502)
  const name = user.name || user.preferred_username || user.email || 'FriskyDev member'
  const session = mintOperatorToken({ sub: `friskydev:${user.sub}`, platform: 'friskydev', name })
  setCookie(c, SESSION_COOKIE, session, cookieOptions(env.OPERATOR_TOKEN_TTL_SECONDS))
  logAuth('oidc login completed', { returned: true })
  const safeReturn = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
  return c.redirect(safeReturn)
}

export function oidcMe(c: Context) {
  noStore(c)
  const token = getCookie(c, SESSION_COOKIE)
  const claims = token ? verifyOperatorToken(token) : null
  if (!claims) return c.json({ authenticated: false }, 401)
  return c.json({ authenticated: true, user: { id: claims.sub, name: claims.name } })
}

export function oidcLogout(c: Context) {
  noStore(c)
  deleteCookie(c, SESSION_COOKIE, cookieOptions(0))
  return c.json({ ok: true })
}

export function resetOidcCache() {
  discoveryCache = null
}
