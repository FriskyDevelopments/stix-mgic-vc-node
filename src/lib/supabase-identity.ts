/**
 * VC node browser identity — Supabase FriskyDev.
 *
 * Deliberately a mirror of LORE's `client/src/lib/supabase-auth.ts`, not a second design.
 * Same project, same three SSO providers, same PKCE flow, same "no email auth" stance.
 * The standing rule LORE states in its own source is that one Supabase backs every Frisky
 * login so a person is the same `auth.users.id` everywhere; VC node follows it rather
 * than minting its own namespace.
 *
 * Where this departs from LORE — and it has to — is the last step. LORE is a Supabase-native
 * app and can let the client hold the session. VC node has a Node server that owns rooms and
 * a WebSocket media plane already gated by an HttpOnly `vc_session` cookie. So after SSO the
 * access token is posted once to `/v1/auth/supabase/session`, the server verifies it with
 * Supabase and mints that cookie. The browser never needs to attach a Supabase token to a
 * socket, and the media plane keeps exactly one notion of a session.
 *
 * The anon/publishable key is public by design: it ships in the bundle and is policed by
 * row-level security. The service-role key must never appear here.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getCachedPublicConfig } from '@/lib/public-config'

function identityConfig(): { url: string; key: string } {
  const runtime = getCachedPublicConfig()
  return {
    url: runtime?.supabaseUrl || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '',
    key:
      runtime?.supabasePublishableKey ||
      (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
      (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
      '',
  }
}

/** SSO only. The same three LORE wires: Google, Apple, Microsoft (azure). No email auth. */
export type OAuthProvider = 'google' | 'apple' | 'azure'

export const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: 'Google',
  apple: 'Apple',
  azure: 'Microsoft',
}

export interface IdentityConfigState {
  configured: boolean
  /** Env var names still needing values. Empty when configured. */
  missing: string[]
}

export function getIdentityConfigState(): IdentityConfigState {
  const { url, key } = identityConfig()
  const missing: string[] = []
  if (!url) missing.push('SUPABASE_URL')
  if (!key) missing.push('SUPABASE_PUBLISHABLE_KEY')
  return { configured: missing.length === 0, missing }
}

let client: SupabaseClient | null = null

/** Throws when unconfigured — callers must check `getIdentityConfigState()` first. */
export function getSupabase(): SupabaseClient {
  const { configured, missing } = getIdentityConfigState()
  if (!configured) {
    throw new Error(`Supabase identity is not configured. Missing: ${missing.join(', ')}`)
  }
  if (!client) {
    const { url, key } = identityConfig()
    client = createClient(url, key, {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        flowType: 'pkce',
      },
    })
  }
  return client
}

/** Start SSO. Returns to the current path so the operator lands back where they were. */
export async function signInWithProvider(provider: OAuthProvider): Promise<void> {
  const supabase = getSupabase()
  const redirectTo = `${window.location.origin}${window.location.pathname}`
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })
  if (error) throw error
}

/**
 * Hand the Supabase session to the node so it can mint `vc_session`.
 *
 * This is the step that makes the login real rather than decorative: until the node has
 * issued its cookie, the operator can see a signed-in UI but every room call and the
 * WebSocket upgrade still reject them. Returns the identity the SERVER resolved — not
 * what the client believed — so the caller displays only what actually authenticated.
 */
export async function establishNodeSession(): Promise<{ id: string; name: string } | null> {
  const supabase = getSupabase()
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) return null

  const response = await fetch('/v1/auth/supabase/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ access_token: accessToken }),
  })
  if (!response.ok) return null

  const body = (await response.json()) as { user?: { id: string; name: string } }
  return body.user ?? null
}

/**
 * Who does the NODE think we are? Source of truth for the gate.
 *
 * Reads the node's own session, not Supabase's, because the node's cookie is what rooms
 * and signaling actually enforce. A stale Supabase session in localStorage with no node
 * cookie must render as signed out, or the UI would promise access the server denies.
 */
export async function getNodeIdentity(): Promise<{ id: string; name: string } | null> {
  const response = await fetch('/v1/auth/oidc/me', { credentials: 'same-origin' })
  if (!response.ok) return null
  const body = (await response.json()) as { user?: { id: string; name: string } }
  return body.user ?? null
}

/** Sign out of both: the node cookie first, then the local Supabase session. */
export async function signOut(): Promise<void> {
  await fetch('/v1/auth/oidc/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
  if (getIdentityConfigState().configured) {
    await getSupabase().auth.signOut().catch(() => {})
  }
}

/**
 * Called once at startup. If Supabase has just returned from SSO (or a session is still
 * live) but the node has no cookie yet, exchange it. Idempotent and safe to call on every
 * mount — with no Supabase session it does nothing.
 */
export async function syncSessionOnLoad(): Promise<{ id: string; name: string } | null> {
  if (!getIdentityConfigState().configured) return null
  const existing = await getNodeIdentity()
  if (existing) return existing
  return establishNodeSession()
}
