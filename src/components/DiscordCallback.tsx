import { useEffect } from 'react'
import { handleDiscordCallback } from '@/lib/auth'
import { getFriskyDevSessionToken, linkDiscordToFriskyDev } from '@/lib/friskydev'

interface DiscordCallbackProps {
  onAuthComplete: (user: unknown) => void
  onAuthError: () => void
}

export function DiscordCallback({ onAuthComplete, onAuthError }: DiscordCallbackProps) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const error = params.get('error')

    const storedState = sessionStorage.getItem('discord_auth_state')
    const linkMode = sessionStorage.getItem('discord_link_mode') === '1'

    if (error) {
      onAuthError()
      if (window.opener) {
        window.opener.postMessage(
          { type: 'discord-auth-error', error },
          window.location.origin
        )
        window.close()
      }
      return
    }

    if (code && state && state === storedState) {
      sessionStorage.removeItem('discord_auth_state')
      sessionStorage.removeItem('discord_link_mode')

      const redirectUri = `${window.location.origin}/auth/discord/callback`

      const run = async () => {
        if (linkMode && getFriskyDevSessionToken()) {
          const result = await linkDiscordToFriskyDev(code, redirectUri)
          if (window.opener) {
            window.opener.postMessage(
              {
                type: 'discord-auth',
                user: result.user,
                linked: true,
                identity: result.identity,
              },
              window.location.origin
            )
            window.close()
          } else {
            onAuthComplete(result.user)
          }
          return
        }

        const result = await handleDiscordCallback(code)
        if (window.opener) {
          window.opener.postMessage(
            { type: 'discord-auth', user: result.user, token: result.token },
            window.location.origin
          )
          window.close()
        } else {
          onAuthComplete(result.user)
        }
      }

      run().catch((err) => {
        console.error('Discord auth error:', err)
        onAuthError()
        if (window.opener) {
          window.opener.postMessage(
            {
              type: 'discord-auth-error',
              error: err instanceof Error ? err.message : 'auth failed',
            },
            window.location.origin
          )
          window.close()
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
          Completing Discord authorization...
        </div>
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    </div>
  )
}
