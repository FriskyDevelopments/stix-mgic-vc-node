import { useEffect, useRef } from 'react'
import { clearSpotifyAuthRequest, handleSpotifyCallback, type SpotifyTokenResult } from '@/lib/spotify'

interface SpotifyCallbackProps {
  onAuthComplete: (accessToken: string) => void
  onAuthError: () => void
}

export function SpotifyCallback({ onAuthComplete, onAuthError }: SpotifyCallbackProps) {
  const exchangeRef = useRef<Promise<SpotifyTokenResult | null> | null>(null)
  const deliveredRef = useRef(false)
  useEffect(() => {
    let active = true
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const error = params.get('error')

    const fail = () => {
      if (!active || deliveredRef.current) return
      deliveredRef.current = true
      clearSpotifyAuthRequest()
      if (window.opener) {
        window.opener.postMessage({ type: 'spotify-auth-error', state }, window.location.origin)
        window.close()
      } else onAuthError()
    }

    if (error || !code || !state) {
      fail()
      return
    }

    if (window.opener) {
      if (!deliveredRef.current) {
        deliveredRef.current = true
        // sessionStorage may not be copied into a popup. The initiating tab
        // owns the PKCE verifier and performs the exchange itself.
        window.opener.postMessage({ type: 'spotify-auth-code', code, state }, window.location.origin)
        window.close()
      }
      return
    }

    // Reuse the one-time exchange when React repeats an effect; the callback
    // must consume the PKCE verifier and authorization code only once.
    exchangeRef.current ??= handleSpotifyCallback(code, state)
    exchangeRef.current.then((result) => {
        if (!active || deliveredRef.current) return
        if (result?.accessToken) {
          deliveredRef.current = true
          onAuthComplete(result.accessToken)
        } else {
          fail()
        }
      }).catch(fail)
    return () => { active = false }
  }, [onAuthComplete, onAuthError])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="glass-panel p-8 rounded-xl text-center space-y-4">
        <div className="font-mono text-lg">
          STIX M<span className="text-accent">Λ</span>GIC
        </div>
        <div className="text-sm text-muted-foreground">
          Completing Spotify authentication...
        </div>
      </div>
    </div>
  )
}
