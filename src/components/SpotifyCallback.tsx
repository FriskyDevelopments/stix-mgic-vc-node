import { useEffect } from 'react'
import { handleSpotifyCallback } from '@/lib/spotify'

interface SpotifyCallbackProps {
  onAuthComplete: (accessToken: string) => void
  onAuthError: () => void
}

export function SpotifyCallback({ onAuthComplete, onAuthError }: SpotifyCallbackProps) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const error = params.get('error')

    if (error) {
      onAuthError()
      if (window.opener) {
        window.close()
      }
      return
    }

    if (code && state) {
      handleSpotifyCallback(code, state).then((result) => {
        if (result?.accessToken) {
          if (window.opener) {
            window.opener.postMessage(
              { type: 'spotify-auth', accessToken: result.accessToken },
              window.location.origin
            )
            window.close()
          } else {
            onAuthComplete(result.accessToken)
          }
        } else {
          onAuthError()
          if (window.opener) {
            window.close()
          }
        }
      })
    }
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
