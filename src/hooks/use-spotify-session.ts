import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearSpotifyAuthRequest,
  clearSpotifySession,
  getSpotifyUser,
  getSpotifyAuthState,
  getStoredSpotifyRefreshToken,
  handleSpotifyCallback,
  isSpotifyAccessExpiringSoon,
  refreshSpotifyToken,
  SPOTIFY_AUTH_STARTED_EVENT,
  SpotifyRefreshError,
  storeSpotifySession,
} from '@/lib/spotify'

interface SpotifySessionEvents {
  onConnected?: (restored: boolean) => void
  onRefreshed?: () => void
  onProfileUnavailable?: () => void
  onError?: (message: string, disconnected: boolean) => void
}

// Only the refresh session belongs in this tab's sessionStorage. Access tokens
// remain in memory, and restoring a connection never issues playback commands.
export function useSpotifySession(events: SpotifySessionEvents = {}) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const accessRef = useRef<string | null>(null)
  const generationRef = useRef(0)
  const refreshRef = useRef<Promise<void> | null>(null)
  const exchangeRef = useRef<number | null>(null)
  const retryAtRef = useRef(0)
  const failuresRef = useRef(0)
  const eventsRef = useRef(events)
  eventsRef.current = events

  const disconnect = useCallback(() => {
    generationRef.current += 1
    exchangeRef.current = null
    retryAtRef.current = 0
    failuresRef.current = 0
    clearSpotifyAuthRequest()
    clearSpotifySession()
    accessRef.current = null
    setAccessToken(null)
  }, [])

  useEffect(() => {
    let active = true
    const current = (generation: number) => active && generationRef.current === generation
    const publish = (token: string) => {
      accessRef.current = token
      setAccessToken(token)
    }
    const failSession = () => {
      disconnect()
      eventsRef.current.onError?.('Spotify connection expired. Connect Spotify again to continue.', true)
    }
    const observeProfile = (token: string, generation: number) => {
      // Profile display is optional and must never hold the refresh lock.
      void getSpotifyUser(token).catch(() => null).then(user => {
        if (current(generation) && !user) eventsRef.current.onProfileUnavailable?.()
      })
    }

    const refresh = async (restoring: boolean) => {
      const refreshToken = getStoredSpotifyRefreshToken()
      if (!refreshToken || refreshRef.current || exchangeRef.current !== null || Date.now() < retryAtRef.current) return
      const generation = generationRef.current
      const task = (async () => {
        try {
          const result = await refreshSpotifyToken(refreshToken, () => current(generation))
          if (!current(generation)) return
          if (!result?.accessToken) { failSession(); return }
          retryAtRef.current = 0
          failuresRef.current = 0
          publish(result.accessToken)
          if (restoring) eventsRef.current.onConnected?.(true)
          else eventsRef.current.onRefreshed?.()
          if (restoring) observeProfile(result.accessToken, generation)
        } catch (error) {
          if (!current(generation)) return
          failuresRef.current += 1
          const backoff = Math.min(300_000, 30_000 * 2 ** Math.min(failuresRef.current - 1, 4))
          retryAtRef.current = Date.now() + Math.max(backoff, error instanceof SpotifyRefreshError ? error.retryAfterMs : 0)
          if (failuresRef.current === 1) eventsRef.current.onError?.('Spotify is temporarily unavailable. Your connection was kept; retrying shortly.', false)
        }
      })()
      refreshRef.current = task
      try { await task } finally {
        if (refreshRef.current === task) refreshRef.current = null
      }
    }

    const receive = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data
      if (data?.type !== 'spotify-auth-code' && data?.type !== 'spotify-auth-error') return
      // The parent owns the verifier. Bind each callback to its current request
      // before exchanging the code; a stale popup cannot undo Disconnect.
      if (typeof data.state !== 'string' || !data.state || data.state !== getSpotifyAuthState()) return
      if (data.type === 'spotify-auth-code' && (typeof data.code !== 'string' || !data.code)) return
      const generation = ++generationRef.current
      if (data.type === 'spotify-auth-error') {
        clearSpotifyAuthRequest()
        eventsRef.current.onError?.('Spotify connection was not completed. Choose Connect Spotify to try again.', false)
        return
      }
      exchangeRef.current = generation
      try {
        const result = await handleSpotifyCallback(data.code, data.state, () => current(generation))
        if (!current(generation)) return
        if (!result?.accessToken) {
          eventsRef.current.onError?.('Spotify authentication incomplete. Choose Connect Spotify to try again.', false)
          return
        }
        // A canceled login leaves the existing session untouched. A successful
        // token exchange replaces its metadata in the parent's own storage.
        clearSpotifySession()
        storeSpotifySession(result)
        retryAtRef.current = 0
        failuresRef.current = 0
        publish(result.accessToken)
        eventsRef.current.onConnected?.(false)
        observeProfile(result.accessToken, generation)
      } catch {
        if (current(generation)) eventsRef.current.onError?.('Spotify authentication incomplete. Allow site storage and choose Connect Spotify to try again.', false)
      } finally {
        if (exchangeRef.current === generation) exchangeRef.current = null
      }
    }
    const authorizing = () => { generationRef.current += 1; exchangeRef.current = null }
    window.addEventListener('message', receive)
    window.addEventListener(SPOTIFY_AUTH_STARTED_EVENT, authorizing)

    // Wait for a previous effect's request during a StrictMode remount, then
    // recover without running two refresh grants concurrently.
    void (async () => {
      await refreshRef.current
      if (active && !accessRef.current) await refresh(true)
    })()
    const interval = window.setInterval(() => {
      if (!accessRef.current) void refresh(true)
      else if (isSpotifyAccessExpiringSoon()) void refresh(false)
    }, 30_000)

    return () => {
      active = false
      generationRef.current += 1
      window.clearInterval(interval)
      window.removeEventListener('message', receive)
      window.removeEventListener(SPOTIFY_AUTH_STARTED_EVENT, authorizing)
    }
  }, [disconnect])

  return { accessToken, disconnect }
}
