/**
 * The VC node sign-in surface, backed by Supabase FriskyDev (the Fenrir master identity)
 * plus an explicit FriskyDev ID button when Authentik OIDC is configured on the node.
 *
 * The gate reports the identity the NODE resolved, never the one the browser believes it
 * has. That distinction is the whole point: a Supabase session sitting in localStorage
 * with no `vc_session` cookie means rooms and the WebSocket will reject you, so showing
 * "signed in" there would be theater. `syncSessionOnLoad()` reconciles the two on mount.
 */
import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CheckCircle, ShieldCheck, Sparkle } from '@phosphor-icons/react'
import {
  getIdentityConfigState,
  signInWithProvider,
  signOut,
  syncSessionOnLoad,
} from '@/lib/supabase-identity'
import {
  identityActionMark,
  listIdentityActions,
  supabaseProviderFor,
  type IdentityAction,
} from '@/lib/identity-actions'
import { usePublicConfig } from '@/lib/public-config'
import '@/styles/identity-portal.css'

type Identity = { id: string; name: string }

export function FriskyDevIdentityGate({
  onChange,
}: {
  onChange?: (identity: Identity | null) => void
}) {
  const [user, setUser] = useState<Identity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const config = getIdentityConfigState()
  const publicConfig = usePublicConfig()
  const actions = publicConfig?.identityProviders ?? listIdentityActions({
    supabaseConfigured: config.configured,
    friskydevIdConfigured: Boolean(publicConfig?.friskydevIdConfigured),
  })
  const primaryIndex = Math.max(0, actions.findIndex((action) => action.ready))

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

  async function handleAction(action: IdentityAction) {
    setError(null)
    if (!action.ready) return
    if (action.method === 'oidc') {
      const returnTo = `${window.location.pathname}${window.location.search}`
      const start = action.start ?? '/v1/auth/oidc/start'
      const separator = start.includes('?') ? '&' : '?'
      window.location.href = `${start}${separator}returnTo=${encodeURIComponent(returnTo)}`
      return
    }
    switch (action.id) {
      case 'google':
      case 'apple':
      case 'microsoft':
        try {
          await signInWithProvider(supabaseProviderFor(action.id))
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Could not start sign-in')
        }
        return
      case 'friskydev-id':
        setError('FriskyDev ID sign-in is unavailable')
        return
      default: {
        const _never: never = action.id
        setError(`Unhandled identity action: ${_never}`)
      }
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
            {actions.map((action, index) => (
              <button
                className={index === primaryIndex ? 'identity-portal__provider is-primary' : 'identity-portal__provider'}
                key={action.id}
                data-testid={`identity-action-${action.id}`}
                disabled={!action.ready}
                onClick={() => void handleAction(action)}
              >
                <span className="identity-portal__provider-mark">{identityActionMark(action.id)}</span>
                Continue with {action.label}
                {index === primaryIndex && <ArrowRight weight="bold" />}
              </button>
            ))}
          </div>
        )}
        {!config.configured && <p className="identity-portal__notice">Social SSO needs configuration: {config.missing.join(', ')}</p>}
        {publicConfig && !publicConfig.friskydevIdConfigured && (
          <p className="identity-portal__notice">FriskyDev ID is not configured on this node.</p>
        )}
        {error && <p className="identity-portal__notice is-error">{error}</p>}
        <p className="identity-portal__footer">By continuing, you enter with your FriskyDev identity.</p>
      </div>
    </section>
  )
}
