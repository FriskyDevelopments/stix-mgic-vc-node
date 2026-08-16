/**
 * Picks the sign-in surface the SERVER says is active.
 *
 * The node decides, not the bundle, because the choice depends on runtime configuration
 * the browser cannot see — in particular whether the Supabase project's redirect
 * allow-list actually contains this origin. Making it a build-time constant would mean a
 * rebuild to roll back a broken login; this way it is an env change and a restart.
 *
 * Until the server reports, nothing is rendered. Guessing a provider and correcting it a
 * moment later would flash the wrong set of buttons and, worse, could send someone into an
 * SSO round trip that cannot come back.
 */
import { useEffect, useState } from 'react'
import { FriskyDevIdGate } from '@/components/FriskyDevIdGate'
import { FriskyDevIdentityGate } from '@/components/FriskyDevIdentityGate'

type Provider = 'authentik' | 'supabase'
type Identity = { id: string; name: string }

export function IdentityGate({ onChange }: { onChange: (authenticated: boolean) => void }) {
  const [provider, setProvider] = useState<Provider | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch('/v1/config/public', { credentials: 'same-origin' })
        const config = (await response.json()) as { identityProvider?: Provider }
        if (!cancelled) setProvider(config.identityProvider === 'supabase' ? 'supabase' : 'authentik')
      } catch {
        // Unreachable config endpoint means the node is unhealthy; fall back to the path
        // that has been working in production rather than showing nothing at all.
        if (!cancelled) setProvider('authentik')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!provider) return null

  return provider === 'supabase' ? (
    <FriskyDevIdentityGate onChange={(identity: Identity | null) => onChange(Boolean(identity))} />
  ) : (
    <FriskyDevIdGate onChange={onChange} />
  )
}
