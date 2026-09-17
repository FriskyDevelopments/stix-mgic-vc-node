import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpotifySession } from './use-spotify-session'
import { clearSpotifyAuthRequest, getSpotifyUser, handleSpotifyCallback, refreshSpotifyToken, SPOTIFY_AUTH_STARTED_EVENT, SpotifyRefreshError, storeSpotifySession, type SpotifyTokenResult } from '@/lib/spotify'

vi.mock('@/lib/spotify', async original => ({
  ...await original<typeof import('@/lib/spotify')>(),
  getSpotifyUser: vi.fn(), handleSpotifyCallback: vi.fn(), refreshSpotifyToken: vi.fn(),
}))
const session = { accessToken: 'test-access', refreshToken: 'test-refresh', expiresIn: 3600 }
const events = { onConnected: vi.fn(), onRefreshed: vi.fn(), onError: vi.fn(), onProfileUnavailable: vi.fn() }
let host: HTMLDivElement
let root: Root
let output: ReturnType<typeof useSpotifySession>
function Harness() { output = useSpotifySession(events); return null }
const render = () => act(async () => root.render(createElement(Harness)))
function pendingAuth(state = 'test-state') {
  sessionStorage.setItem('spotify_auth_state', state)
  sessionStorage.setItem('spotify_code_verifier', 'test-verifier')
  window.dispatchEvent(new Event(SPOTIFY_AUTH_STARTED_EVENT))
}
const callback = (data: object = { type: 'spotify-auth-code', code: 'test-code', state: 'test-state' }, origin = window.location.origin) =>
  act(async () => { window.dispatchEvent(new MessageEvent('message', { origin, data })) })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network call')))
  sessionStorage.clear()
  const local = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
    removeItem: (key: string) => local.delete(key),
    clear: () => local.clear(),
    get length() { return local.size },
  })
  vi.mocked(getSpotifyUser).mockResolvedValue({ id: 'test-user', display_name: 'Test user' })
  vi.mocked(handleSpotifyCallback).mockImplementation(async () => { clearSpotifyAuthRequest(); return session })
  vi.mocked(refreshSpotifyToken).mockImplementation(async (_token, current = () => true) => {
    if (!current()) return null
    storeSpotifySession(session)
    return session
  })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove(); sessionStorage.clear(); localStorage.clear()
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks()
})

describe('Spotify tab session lifecycle', () => {
  it('restores this tab after reload using only its refresh session and no playback commands', async () => {
    sessionStorage.setItem('spotify_refresh_token', 'before-reload')
    await render()
    expect(refreshSpotifyToken).toHaveBeenCalledWith('before-reload', expect.any(Function))
    expect(output.accessToken).toBe('test-access')
    expect(sessionStorage.getItem('spotify_refresh_token')).toBe('test-refresh')
    expect(sessionStorage.getItem('spotify_expires_at')).toBe(String(Date.now() + 3540_000))
    expect(Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index)).sort()).toEqual(['spotify_expires_at', 'spotify_refresh_token'])
    expect(localStorage.length).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
    expect(events.onConnected).toHaveBeenCalledWith(true)
  })

  it('does not infer a connection from old identity labels or expiry metadata', async () => {
    sessionStorage.setItem('spotify_expires_at', '1')
    await render()
    await act(async () => vi.advanceTimersByTimeAsync(60_000))
    expect(refreshSpotifyToken).not.toHaveBeenCalled()
    expect(output.accessToken).toBeNull()
  })

  it('exchanges a matching popup code in the parent and saves the refresh session there', async () => {
    await render(); pendingAuth(); await callback()
    expect(handleSpotifyCallback).toHaveBeenCalledWith('test-code', 'test-state', expect.any(Function))
    expect(output.accessToken).toBe('test-access')
    expect(sessionStorage.getItem('spotify_refresh_token')).toBe('test-refresh')
    expect(sessionStorage.getItem('spotify_auth_state')).toBeNull()
    expect(localStorage.length).toBe(0)
    expect(events.onConnected).toHaveBeenCalledWith(false)
  })

  it('ignores foreign origins, missing state, stale state and duplicate callback delivery', async () => {
    await render(); pendingAuth()
    await callback(undefined, 'https://unrelated.example')
    await callback({ type: 'spotify-auth-code', code: 'test-code' })
    await callback({ type: 'spotify-auth-code', code: 'test-code', state: 'stale-state' })
    expect(handleSpotifyCallback).not.toHaveBeenCalled()
    await callback(); await callback()
    expect(handleSpotifyCallback).toHaveBeenCalledTimes(1)
  })

  it('retains a working session when a later popup login is canceled or fails', async () => {
    sessionStorage.setItem('spotify_refresh_token', 'before-reload')
    await render(); pendingAuth()
    await callback({ type: 'spotify-auth-error', state: 'test-state' })
    expect(output.accessToken).toBe('test-access')
    expect(sessionStorage.getItem('spotify_refresh_token')).toBe('test-refresh')
    expect(sessionStorage.getItem('spotify_auth_state')).toBeNull()
    expect(events.onError).toHaveBeenCalledWith(expect.stringContaining('try again'), false)
    pendingAuth()
    vi.mocked(handleSpotifyCallback).mockImplementationOnce(async () => { clearSpotifyAuthRequest(); return null })
    await callback()
    expect(output.accessToken).toBe('test-access')
    expect(events.onError).toHaveBeenLastCalledWith(expect.stringContaining('authentication incomplete'), false)
  })

  it('keeps a usable token when the optional profile request fails', async () => {
    vi.mocked(getSpotifyUser).mockResolvedValue(null)
    sessionStorage.setItem('spotify_refresh_token', 'before-reload')
    await render()
    expect(output.accessToken).toBe('test-access')
    expect(events.onProfileUnavailable).toHaveBeenCalledTimes(1)
    expect(events.onError).not.toHaveBeenCalled()
    vi.mocked(getSpotifyUser).mockRejectedValueOnce(new Error('Network unavailable'))
    pendingAuth(); await callback()
    expect(output.accessToken).toBe('test-access')
    expect(events.onProfileUnavailable).toHaveBeenCalledTimes(2)
    expect(events.onError).not.toHaveBeenCalled()
  })

  it('serializes refresh requests even when a response takes longer than the timer', async () => {
    await render(); pendingAuth(); await callback()
    sessionStorage.setItem('spotify_expires_at', '1')
    const refresh = deferred<SpotifyTokenResult | null>()
    vi.mocked(refreshSpotifyToken).mockImplementationOnce(() => refresh.promise)
    await act(async () => vi.advanceTimersByTimeAsync(90_000))
    expect(refreshSpotifyToken).toHaveBeenCalledTimes(1)
    await act(async () => refresh.resolve({ ...session, accessToken: 'refreshed-access' }))
    expect(output.accessToken).toBe('refreshed-access')
    expect(events.onRefreshed).toHaveBeenCalledTimes(1)
  })

  it('invalidates a restore and its storage writes when Disconnect happens before completion', async () => {
    sessionStorage.setItem('spotify_refresh_token', 'before-reload')
    const refresh = deferred<SpotifyTokenResult | null>()
    vi.mocked(refreshSpotifyToken).mockImplementationOnce(async (_token, current = () => true) => {
      const result = await refresh.promise
      if (!current()) return null
      storeSpotifySession(result!)
      return result
    })
    await render()
    await act(async () => output.disconnect())
    await act(async () => refresh.resolve(session))
    expect(output.accessToken).toBeNull()
    expect(sessionStorage.getItem('spotify_refresh_token')).toBeNull()
    expect(events.onConnected).not.toHaveBeenCalled()
  })

  it('ignores a callback delivered after Disconnect and invalidates an exchange already running', async () => {
    await render(); pendingAuth()
    await act(async () => output.disconnect())
    await callback()
    expect(handleSpotifyCallback).not.toHaveBeenCalled()
    pendingAuth()
    const exchange = deferred<SpotifyTokenResult | null>()
    let guard!: () => boolean
    vi.mocked(handleSpotifyCallback).mockImplementationOnce((_code, _state, current) => { clearSpotifyAuthRequest(); guard = current!; return exchange.promise })
    await callback()
    await act(async () => output.disconnect())
    expect(guard()).toBe(false)
    await act(async () => exchange.resolve(session))
    expect(output.accessToken).toBeNull()
    expect(sessionStorage.getItem('spotify_refresh_token')).toBeNull()
  })

  it('invalidates old refreshes as soon as a new authorization starts and keeps the replacement session', async () => {
    sessionStorage.setItem('spotify_refresh_token', 'before-reload')
    const refresh = deferred<SpotifyTokenResult | null>()
    let guard!: () => boolean
    vi.mocked(refreshSpotifyToken).mockImplementationOnce((_token, current) => { guard = current!; return refresh.promise })
    await render(); pendingAuth()
    expect(guard()).toBe(false)
    await callback()
    await act(async () => refresh.resolve({ ...session, accessToken: 'stale-access', refreshToken: 'stale-refresh' }))
    expect(output.accessToken).toBe('test-access')
    expect(sessionStorage.getItem('spotify_refresh_token')).toBe('test-refresh')
  })

  it('does not hold the refresh lock while an optional profile request is stalled', async () => {
    sessionStorage.setItem('spotify_refresh_token', 'before-reload')
    vi.mocked(getSpotifyUser).mockReturnValue(new Promise(() => {}))
    await render()
    expect(output.accessToken).toBe('test-access')
    sessionStorage.setItem('spotify_expires_at', '1')
    await act(async () => vi.advanceTimersByTimeAsync(30_000))
    expect(refreshSpotifyToken).toHaveBeenCalledTimes(2)
    expect(events.onRefreshed).toHaveBeenCalledTimes(1)
  })

  it('keeps refresh metadata and retries transient failures with bounded exponential backoff', async () => {
    sessionStorage.setItem('spotify_refresh_token', 'before-reload')
    vi.mocked(refreshSpotifyToken).mockRejectedValueOnce(new SpotifyRefreshError()).mockRejectedValueOnce(new SpotifyRefreshError())
    await render()
    expect(output.accessToken).toBeNull()
    expect(sessionStorage.getItem('spotify_refresh_token')).toBe('before-reload')
    await act(async () => vi.advanceTimersByTimeAsync(30_000))
    expect(refreshSpotifyToken).toHaveBeenCalledTimes(2)
    await act(async () => vi.advanceTimersByTimeAsync(30_000))
    expect(refreshSpotifyToken).toHaveBeenCalledTimes(2)
    await act(async () => vi.advanceTimersByTimeAsync(30_000))
    expect(refreshSpotifyToken).toHaveBeenCalledTimes(3)
    expect(output.accessToken).toBe('test-access')
    expect(events.onError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('connection was kept'), false)
  })

  it('honors a Spotify Retry-After interval while retaining a usable access token', async () => {
    await render(); pendingAuth(); await callback()
    sessionStorage.setItem('spotify_expires_at', '1')
    vi.mocked(refreshSpotifyToken).mockRejectedValueOnce(new SpotifyRefreshError(90_000))
    await act(async () => vi.advanceTimersByTimeAsync(30_000))
    expect(output.accessToken).toBe('test-access')
    expect(sessionStorage.getItem('spotify_refresh_token')).toBe('test-refresh')
    await act(async () => vi.advanceTimersByTimeAsync(60_000))
    expect(refreshSpotifyToken).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(30_000))
    expect(refreshSpotifyToken).toHaveBeenCalledTimes(2)
  })

  it('does not refresh the old account while its replacement code exchange is pending', async () => {
    sessionStorage.setItem('spotify_refresh_token', 'before-reload')
    await render(); pendingAuth()
    const exchange = deferred<SpotifyTokenResult | null>()
    vi.mocked(handleSpotifyCallback).mockImplementationOnce(() => { clearSpotifyAuthRequest(); return exchange.promise })
    await callback()
    sessionStorage.setItem('spotify_expires_at', '1')
    await act(async () => vi.advanceTimersByTimeAsync(90_000))
    expect(refreshSpotifyToken).toHaveBeenCalledTimes(1)
    await act(async () => exchange.resolve({ ...session, accessToken: 'replacement-access', refreshToken: 'replacement-refresh' }))
    expect(output.accessToken).toBe('replacement-access')
    expect(sessionStorage.getItem('spotify_refresh_token')).toBe('replacement-refresh')
  })

  it('clears an expired refresh session and gives a reconnect action', async () => {
    sessionStorage.setItem('spotify_refresh_token', 'expired-refresh')
    vi.mocked(refreshSpotifyToken).mockResolvedValueOnce(null)
    await render()
    expect(output.accessToken).toBeNull()
    expect(sessionStorage.getItem('spotify_refresh_token')).toBeNull()
    expect(events.onError).toHaveBeenCalledWith(expect.stringContaining('Connect Spotify again'), true)
  })

  it('restores once under repeated StrictMode effects', async () => {
    sessionStorage.setItem('spotify_refresh_token', 'before-reload')
    await act(async () => root.render(createElement(StrictMode, {}, createElement(Harness))))
    expect(refreshSpotifyToken).toHaveBeenCalledTimes(1)
    expect(output.accessToken).toBe('test-access')
  })

  it('remains disconnected without an unhandled rejection when sessionStorage is unavailable', async () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new DOMException('Storage disabled', 'SecurityError') }, removeItem: () => { throw new DOMException('Storage disabled', 'SecurityError') }, clear: () => {} })
    await render()
    await act(async () => vi.advanceTimersByTimeAsync(30_000))
    await act(async () => output.disconnect())
    expect(output.accessToken).toBeNull()
    expect(refreshSpotifyToken).not.toHaveBeenCalled()
  })
})
