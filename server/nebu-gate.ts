import { resolveNebuSession } from './betterAuth'
import { getServerEnv } from './env'
import { SIGNALING_PATH } from './signaling-core'

export type NebuSession = NonNullable<Awaited<ReturnType<typeof resolveNebuSession>>>

/** Routes that need a NEBU (Better Auth) login when AUTH_REQUIRED=true: creating rooms and the signalling socket. */
export function requiresNebuSession(request: Request): boolean {
  const { pathname } = new URL(request.url)
  const isSignal = pathname === SIGNALING_PATH && request.headers.get('upgrade')?.toLowerCase() === 'websocket'
  const isCreateRoom = request.method === 'POST' && pathname.replace(/\/+$/, '') === '/v1/rooms'
  return isSignal || isCreateRoom
}

/**
 * Returns a 401 Response when the request needs a Better Auth session and has none, otherwise null
 * (plus the session when one was resolved). Does nothing when AUTH_REQUIRED is not true.
 * Session lookup is resolveNebuSession (Better Auth `auth.api.getSession`) from ./betterAuth.
 */
export async function gateNebuSession(
  request: Request
): Promise<{ denied: Response | null; session: NebuSession | null }> {
  if (!getServerEnv().AUTH_REQUIRED || !requiresNebuSession(request)) return { denied: null, session: null }
  const session = await resolveNebuSession(request.headers)
  if (session) return { denied: null, session }
  return {
    denied: Response.json({ error: 'Sign in required', code: 'login_required' }, { status: 401 }),
    session: null,
  }
}
