/**
 * The VC node sign-in surface, backed by Supabase FriskyDev (the Fenrir master identity).
 *
 * The gate reports the identity the NODE resolved, never the one the browser believes it
 * has. That distinction is the whole point: a Supabase session sitting in localStorage
 * with no `vc_session` cookie means rooms and the WebSocket will reject you, so showing
 * "signed in" there would be theater. `syncSessionOnLoad()` reconciles the two on mount.
 */
import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CheckCircle, ShieldCheck, Sparkle } from '@phosphor-icons/react'
import {
  PROVIDER_LABELS,
  getIdentityConfigState,
  signInWithProvider,
  signOut,
  syncSessionOnLoad,
  type OAuthProvider,
} from '@/lib/supabase-identity'
import '@/styles/identity-portal.css'

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
    <section className="identity-portal" aria-label="VC Node secure entry" data-testid="friskydev-identity-gate">
      <div className="identity-portal__aura" aria-hidden="true"><i /><i /><i /></div>
      <div className="identity-portal__signal" aria-hidden="true"><span>01</span><span>10</span><span>11</span></div>
      <div className="identity-portal__copy">
        <p className="identity-portal__eyebrow"><Sparkle weight="fill" /> PRIVATE SIGNAL / 001</p>
        <h1>{user ? `Welcome in, ${user.name}.` : 'Enter the room\nbefore it opens.'}</h1>
        <p className="identity-portal__lede" data-testid="identity-status">
          {loading
            ? 'Verifying your secure connection…'
            : user
              ? 'Your identity is verified. Your room controls are ready below.'
              : 'A private, peer-to-peer space for the people you invite. Your camera stays local until you choose to join.'}
        </p>
        <div className="identity-portal__proof"><ShieldCheck weight="fill" /> End-to-end encrypted media <span /> No account password here</div>
      </div>

      <div className="identity-portal__panel">
        <div className="identity-portal__panel-head">
          <span className={user ? 'identity-portal__status is-ready' : 'identity-portal__status'}><i /> {user ? 'IDENTITY VERIFIED' : 'SECURE ENTRY'}</span>
          {user && <CheckCircle weight="fill" aria-label="Identity verified" />}
        </div>
        {loading ? (
          <div className="identity-portal__loading"><i /><span>Checking your signal</span></div>
        ) : user ? (
          <div className="identity-portal__welcome">
            <div className="identity-portal__avatar">{user.name.slice(0, 1).toUpperCase()}</div>
            <div><strong>{user.name}</strong><small>FriskyDev ID · connected</small></div>
            <button className="identity-portal__quiet-action" onClick={() => void handleSignOut()}>Sign out</button>
          </div>
        ) : (
          <div className="identity-portal__actions" data-testid="sso-buttons">
            {PROVIDERS.map((provider, index) => (
              <button
                className={index === 0 ? 'identity-portal__provider is-primary' : 'identity-portal__provider'}
                key={provider}
                disabled={!config.configured}
                onClick={() => void handleSignIn(provider)}
              >
                <span className="identity-portal__provider-mark">{provider === 'google' ? 'G' : provider === 'apple' ? '●' : '⊞'}</span>
                Continue with {PROVIDER_LABELS[provider]}
                {index === 0 && <ArrowRight weight="bold" />}
              </button>
            ))}
          </div>
        )}
        {!config.configured && <p className="identity-portal__notice">Identity needs configuration: {config.missing.join(', ')}</p>}
        {error && <p className="identity-portal__notice is-error">{error}</p>}
        <p className="identity-portal__footer">By continuing, you enter with your FriskyDev identity.</p>
      </div>
    </section>
  )
}
