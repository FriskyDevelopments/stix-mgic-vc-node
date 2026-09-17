import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetPublicConfigCache } from './public-config'
import { clearSpotifyAuthRequest, clearSpotifySession, getSpotifyDevices, getSpotifyPlayback, handleSpotifyCallback, initiateSpotifyAuth, isSpotifyConfigured, refreshSpotifyToken, SpotifyRefreshError, SpotifyPlayerError, spotifyPlay, spotifySetVolume, spotifyTransferPlayback } from './spotify'

describe('Spotify runtime PKCE connection', () => {
  const popup = { location: { replace: vi.fn() }, close: vi.fn() }
  let fetchMock: ReturnType<typeof vi.fn>
  let openMock: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetPublicConfigCache()
    sessionStorage.clear()
    vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', '')
    vi.stubGlobal('crypto', webcrypto)
    popup.location.replace.mockReset()
    popup.close.mockReset()
    openMock = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/v1/config/public')
        ? { spotifyClientId: 'runtime-public-client-id' }
        : { access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600 },
    }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    resetPublicConfigCache()
    sessionStorage.clear()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens during the click, then uses runtime configuration and a real PKCE challenge', async () => {
    expect(isSpotifyConfigured()).toBe(false)
    const pending = initiateSpotifyAuth()
    expect(openMock).toHaveBeenCalledWith('', expect.stringMatching(/^Spotify Login /), expect.any(String))
    expect(popup.location.replace).not.toHaveBeenCalled()
    await pending
    expect(isSpotifyConfigured()).toBe(true)

    const url = new URL(popup.location.replace.mock.calls[0][0])
    expect(url.origin).toBe('https://accounts.spotify.com')
    expect(url.searchParams.get('client_id')).toBe('runtime-public-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(`${window.location.origin}/spotify-callback`)
    expect(url.searchParams.get('state')).toBe(sessionStorage.getItem('spotify_auth_state'))
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(sessionStorage.getItem('spotify_code_verifier')!))
    expect(url.searchParams.get('code_challenge')).toBe(Buffer.from(digest).toString('base64url'))
    expect(url.searchParams.has('client_secret')).toBe(false)
  })

  it('loads runtime config in the cold callback window before exchanging the code', async () => {
    sessionStorage.setItem('spotify_auth_state', 'test-state')
    sessionStorage.setItem('spotify_code_verifier', 'test-verifier')
    const result = await handleSpotifyCallback('test-code', 'test-state')

    expect(result?.accessToken).toBe('test-access')
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/config/public')
    const [url, request] = fetchMock.mock.calls[1]
    expect(url).toBe('https://accounts.spotify.com/api/token')
    expect(Object.fromEntries(request.body)).toEqual({
      client_id: 'runtime-public-client-id', grant_type: 'authorization_code',
      code: 'test-code', code_verifier: 'test-verifier',
      redirect_uri: `${window.location.origin}/spotify-callback`,
    })
    expect(sessionStorage.getItem('spotify_auth_state')).toBeNull()
    expect(sessionStorage.getItem('spotify_code_verifier')).toBeNull()
  })

  it('loads runtime config before refreshing a token in a fresh page', async () => {
    expect((await refreshSpotifyToken('test-refresh'))?.accessToken).toBe('test-access')
    const request = fetchMock.mock.calls[1][1]
    expect(Object.fromEntries(request.body)).toEqual({
      client_id: 'runtime-public-client-id', grant_type: 'refresh_token', refresh_token: 'test-refresh',
    })
  })

  it('does not restore token metadata after disconnecting during an in-flight refresh', async () => {
    vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'test-public-client')
    let sessionCurrent = true
    let finish!: (response: unknown) => void
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    sessionStorage.setItem('spotify_refresh_token', 'old-refresh')
    sessionStorage.setItem('spotify_expires_at', '1')
    const pending = refreshSpotifyToken('old-refresh', () => sessionCurrent)
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    sessionCurrent = false
    clearSpotifySession()
    finish({ ok: true, json: async () => ({ access_token: 'stale-access', refresh_token: 'stale-refresh', expires_in: 3600 }) })
    expect(await pending).toBeNull()
    expect(sessionStorage.getItem('spotify_refresh_token')).toBeNull()
    expect(sessionStorage.getItem('spotify_expires_at')).toBeNull()
  })

  it('does not restore metadata when a parent code exchange is invalidated by Disconnect', async () => {
    vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'test-public-client')
    let current = true
    let finish!: (response: unknown) => void
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    sessionStorage.setItem('spotify_auth_state', 'test-state')
    sessionStorage.setItem('spotify_code_verifier', 'test-verifier')
    const pending = handleSpotifyCallback('test-code', 'test-state', () => current)
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    current = false
    clearSpotifySession()
    finish({ ok: true, json: async () => ({ access_token: 'stale-access', refresh_token: 'stale-refresh', expires_in: 3600 }) })
    expect(await pending).toBeNull()
    expect(sessionStorage.getItem('spotify_refresh_token')).toBeNull()
    expect(sessionStorage.getItem('spotify_expires_at')).toBeNull()
  })

  it('consumes the parent verifier once and rejects a repeated callback before a second exchange', async () => {
    sessionStorage.setItem('spotify_auth_state', 'test-state')
    sessionStorage.setItem('spotify_code_verifier', 'test-verifier')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const first = handleSpotifyCallback('test-code', 'test-state')
    expect(await handleSpotifyCallback('test-code', 'test-state')).toBeNull()
    expect((await first)?.accessToken).toBe('test-access')
    expect(fetchMock.mock.calls.filter(([url]) => url === 'https://accounts.spotify.com/api/token')).toHaveLength(1)
  })

  it('explains disabled tab storage without opening an unusable login popup', async () => {
    vi.stubGlobal('sessionStorage', { setItem: () => { throw new DOMException('Storage disabled', 'SecurityError') }, removeItem: () => {}, clear: () => {} })
    await expect(initiateSpotifyAuth()).rejects.toThrow('Allow site storage')
    expect(openMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('closes a canceled login instead of navigating it after delayed configuration resolves', async () => {
    let finish!: (response: unknown) => void
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = initiateSpotifyAuth()
    clearSpotifyAuthRequest()
    finish({ ok: true, json: async () => ({ spotifyClientId: 'runtime-public-client-id' }) })
    await pending
    expect(popup.close).toHaveBeenCalledTimes(1)
    expect(popup.location.replace).not.toHaveBeenCalled()
  })

  it('closes only the older popup and preserves the newer PKCE request when two logins prepare concurrently', async () => {
    const newerPopup = { location: { replace: vi.fn() }, close: vi.fn() }
    openMock.mockReturnValueOnce(popup as unknown as Window).mockReturnValueOnce(newerPopup as unknown as Window)
    let finish!: (response: unknown) => void
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))

    const olderLogin = initiateSpotifyAuth()
    const olderState = sessionStorage.getItem('spotify_auth_state')
    const newerLogin = initiateSpotifyAuth()
    const newerState = sessionStorage.getItem('spotify_auth_state')
    const newerVerifier = sessionStorage.getItem('spotify_code_verifier')!
    expect(olderState).not.toBe(newerState)
    expect(openMock.mock.calls.map(call => call[1])).toEqual([`Spotify Login ${olderState}`, `Spotify Login ${newerState}`])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    finish({ ok: true, json: async () => ({ spotifyClientId: 'runtime-public-client-id' }) })
    await Promise.all([olderLogin, newerLogin])

    expect(popup.close).toHaveBeenCalledTimes(1)
    expect(popup.location.replace).not.toHaveBeenCalled()
    expect(newerPopup.close).not.toHaveBeenCalled()
    expect(newerPopup.location.replace).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('spotify_auth_state')).toBe(newerState)
    expect(sessionStorage.getItem('spotify_code_verifier')).toBe(newerVerifier)
    const authorization = new URL(newerPopup.location.replace.mock.calls[0][0])
    expect(authorization.searchParams.get('state')).toBe(newerState)
    const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(newerVerifier))
    expect(authorization.searchParams.get('code_challenge')).toBe(Buffer.from(digest).toString('base64url'))
  })

  it.each(['network', '503', '429'])('retains refresh metadata on a transient %s failure', async failure => {
    vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'test-public-client')
    sessionStorage.setItem('spotify_refresh_token', 'existing-refresh')
    sessionStorage.setItem('spotify_expires_at', '1')
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('Network unavailable'))
    else fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'temporarily_unavailable' }), { status: Number(failure), headers: { 'Retry-After': '90' } }))
    await expect(refreshSpotifyToken('existing-refresh')).rejects.toMatchObject({ name: 'SpotifyRefreshError', retryAfterMs: failure === 'network' ? 30_000 : 90_000 })
    expect(sessionStorage.getItem('spotify_refresh_token')).toBe('existing-refresh')
    expect(sessionStorage.getItem('spotify_expires_at')).toBe('1')
  })

  it('reports an invalid grant as the confirmed reconnect condition', async () => {
    vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'test-public-client')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }))
    expect(await refreshSpotifyToken('revoked-refresh')).toBeNull()
  })

  it('keeps an existing refresh token when Spotify does not rotate it', async () => {
    vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'test-public-client')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'new-access', expires_in: 3600 })))
    expect(await refreshSpotifyToken('existing-refresh')).toEqual({ accessToken: 'new-access', refreshToken: 'existing-refresh', expiresIn: 3600 })
    expect(sessionStorage.getItem('spotify_refresh_token')).toBe('existing-refresh')
  })

  it('keeps the build-time client ID fallback for existing installations', async () => {
    vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', ' build-public-client-id ')
    await initiateSpotifyAuth()
    const url = new URL(popup.location.replace.mock.calls[0][0])
    expect(url.searchParams.get('client_id')).toBe('build-public-client-id')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('closes the placeholder window and explains an unconfigured node', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ spotifyClientId: null }) })
    await expect(initiateSpotifyAuth()).rejects.toThrow('not enabled on this node')
    expect(popup.close).toHaveBeenCalled()
    expect(popup.location.replace).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('spotify_code_verifier')).toBeNull()
  })

  it('reports popup blocking instead of silently failing', async () => {
    openMock.mockReturnValue(null)
    await expect(initiateSpotifyAuth()).rejects.toThrow('Allow pop-ups')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('spotify_auth_state')).toBeNull()
  })

  it('rejects mismatched state before loading config or sending credentials', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    sessionStorage.setItem('spotify_auth_state', 'expected-state')
    sessionStorage.setItem('spotify_code_verifier', 'test-verifier')
    expect(await handleSpotifyCallback('test-code', 'wrong-state')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Spotify device controls', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => vi.unstubAllGlobals())

  it('treats no active device as an empty playback state, with friendly control errors', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } }), { status: 404 }))
    expect(await getSpotifyPlayback('test-access')).toBeNull()
    await expect(spotifyPlay('test-access')).rejects.toMatchObject({ kind: 'no-device', message: 'Open Spotify on a phone or computer, then choose a device below.' })
  })

  it('reads devices and transfers only the chosen device without starting paused playback', async () => {
    const device = { id: 'speaker-1', name: 'Studio', is_active: false, is_restricted: false }
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ devices: [device] })))
    expect(await getSpotifyDevices('test-access')).toEqual([device])
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await spotifyTransferPlayback('test-access', device)
    expect(fetchMock.mock.calls[1]).toEqual(['https://api.spotify.com/v1/me/player', expect.objectContaining({
      method: 'PUT', body: JSON.stringify({ device_ids: ['speaker-1'], play: false }),
      headers: { Authorization: 'Bearer test-access', 'Content-Type': 'application/json' },
    })])
  })

  it.each([{ id: null, is_restricted: false }, { id: 'blocked', is_restricted: true }])('rejects a device that cannot accept commands before requesting transfer', async (device) => {
    await expect(spotifyTransferPlayback('test-access', { ...device, name: 'Unavailable', is_active: false })).rejects.toBeInstanceOf(SpotifyPlayerError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('targets the active device and rounds/clamps committed volume', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))
    await spotifyPlay('test-access', 'speaker /1')
    await spotifySetVolume('test-access', 106.8, 'speaker /1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.spotify.com/v1/me/player/play?device_id=speaker+%2F1')
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.spotify.com/v1/me/player/volume?volume_percent=100&device_id=speaker+%2F1')
  })

  it.each([
    [401, {}, 'expired'],
    [403, { reason: 'PREMIUM_REQUIRED' }, 'premium'],
    [403, { message: 'Restriction violated' }, 'restricted'],
    [502, { message: '<html>upstream failure</html>' }, 'unavailable'],
  ])('turns HTTP %s into an actionable error without raw provider payloads', async (status, detail, kind) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: detail }), { status: status as number }))
    await expect(spotifyPlay('test-access')).rejects.toMatchObject({ kind })
  })

  it('respects Spotify rate-limit backoff', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 429, headers: { 'Retry-After': '42' } }))
    await expect(spotifyPlay('test-access')).rejects.toMatchObject({ kind: 'rate-limit', retryAfterMs: 42_000 })
  })
})
