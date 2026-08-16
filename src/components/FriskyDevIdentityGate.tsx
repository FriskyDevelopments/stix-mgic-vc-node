/**
 * The VC node sign-in surface, backed by Supabase FriskyDev (the Fenrir master identity).
 *
 * The gate reports the identity the NODE resolved, never the one the browser believes it
 * has. That distinction is the whole point: a Supabase session sitting in localStorage
 * with no `vc_session` cookie means rooms and the WebSocket will reject you, so showing
 * "signed in" there would be theater. `syncSessionOnLoad()` reconciles the two on mount.
 */
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/GlassCard'
import {
  PROVIDER_LABELS,
  getIdentityConfigState,
  signInWithProvider,
  signOut,
  syncSessionOnLoad,
  type OAuthProvider,
} from '@/lib/supabase-identity'

type Identity = { id: string; name: string }

const PROVIDERS: OAuthProvider[] = ['google', 'apple', 'azure']

export function FriskyDevIdentityGate({
  onChange,
}: {
  onChange?: (identity: Identity | null) => void
}) {
  const [user, setUser] = useState<Identity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const config = getIdentityConfigState()

  const refresh = useCallback(async () => {
    try {
      const identity = await syncSessionOnLoad()
      setUser(identity)
      onChange?.(identity)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check the session')
    } finally {
      setLoading(false)
    }
  }, [onChange])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleSignIn(provider: OAuthProvider) {
    setError(null)
    try {
      await signInWithProvider(provider)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start sign-in')
    }
  }

  async function handleSignOut() {
    await signOut()
    setUser(null)
    onChange?.(null)
  }

  return (
    <GlassCard className="p-4" data-testid="friskydev-identity-gate">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">FriskyDev ID</p>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="identity-status">
            {loading
              ? 'Checking secure session…'
              : user
                ? `Signed in as ${user.name}`
                : 'Sign in to create and join VC rooms.'}
          </p>
          {user && (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground/70" data-testid="identity-sub">
              auth.users.id · {user.id}
            </p>
          )}
        </div>

        {!loading &&
          (user ? (
            <Button variant="outline" onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2" data-testid="sso-buttons">
              {PROVIDERS.map((provider) => (
                <Button
                  key={provider}
                  variant="outline"
                  disabled={!config.configured}
                  onClick={() => void handleSignIn(provider)}
                >
                  Continue with {PROVIDER_LABELS[provider]}
                </Button>
              ))}
            </div>
          ))}
      </div>

      {!config.configured && (
        <p className="mt-3 text-xs text-amber-300">
          Identity is not configured. Missing: {config.missing.join(', ')}
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </GlassCard>
  )
}
