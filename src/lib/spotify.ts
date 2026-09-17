import { fetchPublicConfig, getCachedPublicConfig } from '@/lib/public-config'

const SPOTIFY_REDIRECT_URI = window.location.origin + '/spotify-callback'

function spotifyClientId(): string {
  return getCachedPublicConfig()?.spotifyClientId?.trim() ||
    (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined)?.trim() || ''
}

async function resolveSpotifyClientId(): Promise<string> {
  if (!spotifyClientId()) await fetchPublicConfig()
  const clientId = spotifyClientId()
  if (!clientId) throw new Error('Spotify account connection is not enabled on this node yet.')
  return clientId
}

export function isSpotifyConfigured(): boolean {
  return spotifyClientId().length > 0
}
const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-library-read',
  'user-top-read',
  'playlist-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing'
].join(' ')

const SPOTIFY_AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize'
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'

export interface SpotifyTrack {
  id: string
  name: string
  artists: { name: string }[]
  album: {
    name: string
    images: { url: string }[]
  }
  duration_ms: number
  uri: string
  preview_url?: string | null
}

export interface SpotifyUser {
  id: string
  display_name: string
  email?: string
  images?: { url: string }[]
}

export interface SpotifyPlaylist {
  id: string
  name: string
  description: string
  images: { url: string }[]
  tracks: {
    total: number
  }
}

export interface SpotifyDevice {
  id: string | null
  name: string
  is_active: boolean
  is_restricted?: boolean
  type?: string
  volume_percent?: number | null
  supports_volume?: boolean
}

export interface SpotifyPlaybackState {
  is_playing: boolean
  progress_ms: number | null
  device?: SpotifyDevice
  item: SpotifyTrack | null
  context?: { uri: string } | null
  actions?: { disallows?: { pausing?: boolean; resuming?: boolean; skipping_next?: boolean; skipping_prev?: boolean; transferring_playback?: boolean } }
}

export class SpotifyPlayerError extends Error {
  constructor(
    public readonly kind: 'no-device' | 'expired' | 'premium' | 'restricted' | 'rate-limit' | 'unavailable',
    message: string,
    public readonly retryAfterMs = 0,
  ) {
    super(message)
    this.name = 'SpotifyPlayerError'
  }
}

async function playerError(response: Response): Promise<SpotifyPlayerError> {
  const detail = await response.json().catch(() => null)
  const reason = String(detail?.error?.reason || detail?.error?.message || '').toUpperCase()
  if (response.status === 404 && /NO_ACTIVE_DEVICE|DEVICE NOT FOUND|NO ACTIVE DEVICE/.test(reason)) {
    return new SpotifyPlayerError('no-device', 'Open Spotify on a phone or computer, then choose a device below.')
  }
  if (response.status === 401) return new SpotifyPlayerError('expired', 'Your Spotify connection expired. Reconnect to continue.')
  if (response.status === 403 && /PREMIUM/.test(reason)) return new SpotifyPlayerError('premium', 'Spotify Premium is required to control playback here. You can still listen in Spotify.')
  if (response.status === 403) return new SpotifyPlayerError('restricted', 'Spotify cannot control this playback. Try another device or continue in Spotify.')
  if (response.status === 429) {
    const seconds = Number(response.headers?.get('Retry-After'))
    return new SpotifyPlayerError('rate-limit', 'Spotify needs a moment. Controls will be available again shortly.', Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 30_000)
  }
  return new SpotifyPlayerError('unavailable', 'Spotify is unavailable right now. Check your connection and try again.')
}

async function spotifyRequest(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers },
  })
  if (!response.ok && response.status !== 204) {
    throw await playerError(response)
  }
  return response
}

export async function getSpotifyPlayback(accessToken: string): Promise<SpotifyPlaybackState | null> {
  try {
    const response = await spotifyRequest(accessToken, '/me/player')
    if (response.status === 204) return null
    return response.json()
  } catch (error) {
    if (error instanceof SpotifyPlayerError && error.kind === 'no-device') return null
    throw error
  }
}

export async function getSpotifyDevices(accessToken: string): Promise<SpotifyDevice[]> {
  const response = await spotifyRequest(accessToken, '/me/player/devices')
  const data = await response.json()
  return Array.isArray(data.devices) ? data.devices : []
}

export async function spotifyTransferPlayback(accessToken: string, device: SpotifyDevice): Promise<void> {
  if (!device.id || device.is_restricted) throw new SpotifyPlayerError('restricted', 'Choose a Spotify device that supports remote control.')
  await spotifyRequest(accessToken, '/me/player', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    // Preserve the existing playback state. Selecting a device never starts a paused track.
    body: JSON.stringify({ device_ids: [device.id], play: false }),
  })
}

function playerPath(path: string, deviceId?: string, params = new URLSearchParams()): string {
  if (deviceId) params.set('device_id', deviceId)
  return `/me/player/${path}${params.size ? `?${params}` : ''}`
}

export async function spotifyPlay(accessToken: string, deviceId?: string): Promise<void> {
  await spotifyRequest(accessToken, playerPath('play', deviceId), { method: 'PUT' })
}

export async function spotifyPause(accessToken: string, deviceId?: string): Promise<void> {
  await spotifyRequest(accessToken, playerPath('pause', deviceId), { method: 'PUT' })
}

export async function spotifyNext(accessToken: string, deviceId?: string): Promise<void> {
  await spotifyRequest(accessToken, playerPath('next', deviceId), { method: 'POST' })
}

export async function spotifyPrevious(accessToken: string, deviceId?: string): Promise<void> {
  await spotifyRequest(accessToken, playerPath('previous', deviceId), { method: 'POST' })
}

export async function spotifySetVolume(accessToken: string, volume: number, deviceId?: string): Promise<void> {
  const safeVolume = Math.max(0, Math.min(100, Math.round(volume)))
  await spotifyRequest(accessToken, playerPath('volume', deviceId, new URLSearchParams({ volume_percent: String(safeVolume) })), { method: 'PUT' })
}

function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return values.reduce((acc, x) => acc + possible[x % possible.length], '')
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  return crypto.subtle.digest('SHA-256', data)
}

function base64urlencode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let str = ''
  bytes.forEach((byte) => {
    str += String.fromCharCode(byte)
  })
  const base64 = btoa(str)
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export const SPOTIFY_AUTH_STARTED_EVENT = 'spotify-auth-started'

function readSpotifyStorage(key: string): string | null {
  try { return sessionStorage.getItem(key) } catch { return null }
}

function removeSpotifyStorage(keys: string[]): void {
  for (const key of keys) {
    try { sessionStorage.removeItem(key) } catch { /* Storage may be disabled. */ }
  }
}

export function getSpotifyAuthState(): string | null {
  return readSpotifyStorage('spotify_auth_state')
}

export function clearSpotifyAuthRequest(): void {
  removeSpotifyStorage(['spotify_code_verifier', 'spotify_auth_state'])
}

export async function initiateSpotifyAuth(): Promise<void> {
  const codeVerifier = generateRandomString(64)
  const state = generateRandomString(16)
  try {
    sessionStorage.setItem('spotify_code_verifier', codeVerifier)
    sessionStorage.setItem('spotify_auth_state', state)
  } catch {
    clearSpotifyAuthRequest()
    throw new Error('Allow site storage in this browser, then choose Connect Spotify again.')
  }

  const width = 600
  const height = 800
  const left = window.screenX + (window.outerWidth - width) / 2
  const top = window.screenY + (window.outerHeight - height) / 2

  // Open synchronously during the click. Waiting for config or PKCE hashing first
  // can lose browser user activation and silently block the login window.
  const popup = window.open(
    '',
    `Spotify Login ${state}`,
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
  )
  try {
    if (!popup) throw new Error('Allow pop-ups for this site to connect Spotify.')
    window.dispatchEvent(new Event(SPOTIFY_AUTH_STARTED_EVENT))
    const clientId = await resolveSpotifyClientId()
    const codeChallenge = base64urlencode(await sha256(codeVerifier))
    if (getSpotifyAuthState() !== state) {
      popup.close()
      return
    }
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: SPOTIFY_REDIRECT_URI,
      state,
      scope: SPOTIFY_SCOPES,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    })
    popup.location.replace(`${SPOTIFY_AUTH_ENDPOINT}?${params.toString()}`)
  } catch (error) {
    if (getSpotifyAuthState() === state) clearSpotifyAuthRequest()
    popup?.close()
    throw error
  }
}

export interface SpotifyTokenResult {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
}

const SPOTIFY_REFRESH_KEY = 'spotify_refresh_token'
const SPOTIFY_EXPIRES_AT_KEY = 'spotify_expires_at'

export function storeSpotifySession(result: SpotifyTokenResult): void {
  if (result.refreshToken) {
    sessionStorage.setItem(SPOTIFY_REFRESH_KEY, result.refreshToken)
  }
  if (result.expiresIn) {
    sessionStorage.setItem(
      SPOTIFY_EXPIRES_AT_KEY,
      String(Date.now() + result.expiresIn * 1000 - 60_000)
    )
  }
}

export function clearSpotifySession(): void {
  removeSpotifyStorage([SPOTIFY_REFRESH_KEY, SPOTIFY_EXPIRES_AT_KEY])
}

export function getStoredSpotifyRefreshToken(): string | null {
  return readSpotifyStorage(SPOTIFY_REFRESH_KEY)
}

export function isSpotifyAccessExpiringSoon(): boolean {
  const expiresAt = Number(readSpotifyStorage(SPOTIFY_EXPIRES_AT_KEY) || 0)
  return Boolean(expiresAt) && Date.now() >= expiresAt
}

export async function handleSpotifyCallback(code: string, state: string, isSessionCurrent: () => boolean = () => true): Promise<SpotifyTokenResult | null> {
  const storedState = getSpotifyAuthState()
  const codeVerifier = readSpotifyStorage('spotify_code_verifier')

  if (state !== storedState || !codeVerifier) {
    console.error('State mismatch or missing code verifier')
    return null
  }

  clearSpotifyAuthRequest()

  try {
    // The callback opens in another window, whose module config cache is empty.
    const clientId = await resolveSpotifyClientId()
    if (!isSessionCurrent()) return null
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    })

    if (!response.ok) {
      throw new Error('Token exchange failed')
    }

    const data = await response.json()
    const result: SpotifyTokenResult = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    }
    if (!isSessionCurrent()) return null
    storeSpotifySession(result)
    return result
  } catch (error) {
    console.error('Error exchanging code for token:', error)
    return null
  }
}

export class SpotifyRefreshError extends Error {
  constructor(public readonly retryAfterMs = 30_000) {
    super('Spotify is temporarily unavailable. Your connection was kept; retrying shortly.')
    this.name = 'SpotifyRefreshError'
  }
}

export async function refreshSpotifyToken(refreshToken: string, isSessionCurrent: () => boolean = () => true): Promise<SpotifyTokenResult | null> {
  try {
    const clientId = await resolveSpotifyClientId()
    if (!isSessionCurrent()) return null
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      const detail = await response.json().catch(() => null)
      // Only a confirmed invalid grant means this refresh session is unusable.
      if (detail?.error === 'invalid_grant') return null
      const retryAfter = Number(response.headers?.get('Retry-After'))
      throw new SpotifyRefreshError(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 30_000)
    }

    const data = await response.json()
    const result: SpotifyTokenResult = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
    }
    if (typeof result.accessToken !== 'string' || !result.accessToken) throw new SpotifyRefreshError()
    // A completed request from a disconnected or replaced session must not
    // repopulate its refresh token in sessionStorage.
    if (!isSessionCurrent()) return null
    storeSpotifySession(result)
    return result
  } catch (error) {
    if (!isSessionCurrent()) return null
    throw error instanceof SpotifyRefreshError ? error : new SpotifyRefreshError()
  }
}

export async function getSpotifyUser(accessToken: string): Promise<SpotifyUser | null> {
  try {
    const response = await fetch(`${SPOTIFY_API_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch user')
    }

    return await response.json()
  } catch (error) {
    console.error('Error fetching Spotify user:', error)
    return null
  }
}

export async function getUserTopTracks(accessToken: string, limit = 20): Promise<SpotifyTrack[]> {
  try {
    const response = await fetch(
      `${SPOTIFY_API_BASE}/me/top/tracks?limit=${limit}&time_range=medium_term`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch top tracks')
    }

    const data = await response.json()
    return data.items
  } catch (error) {
    console.error('Error fetching top tracks:', error)
    return []
  }
}

export async function getUserPlaylists(accessToken: string, limit = 20): Promise<SpotifyPlaylist[]> {
  try {
    const response = await fetch(`${SPOTIFY_API_BASE}/me/playlists?limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch playlists')
    }

    const data = await response.json()
    return data.items
  } catch (error) {
    console.error('Error fetching playlists:', error)
    return []
  }
}

export async function getPlaylistTracks(
  accessToken: string,
  playlistId: string
): Promise<SpotifyTrack[]> {
  try {
    const response = await fetch(`${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch playlist tracks')
    }

    const data = await response.json()
    return data.items.map((item: any) => item.track)
  } catch (error) {
    console.error('Error fetching playlist tracks:', error)
    return []
  }
}

export async function searchTracks(
  accessToken: string,
  query: string,
  limit = 20
): Promise<SpotifyTrack[]> {
  try {
    const response = await fetch(
      `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to search tracks')
    }

    const data = await response.json()
    return data.tracks.items
  } catch (error) {
    console.error('Error searching tracks:', error)
    return []
  }
}

export function formatTrackDisplay(track: SpotifyTrack): string {
  const artists = track.artists?.map(a => a.name).join(', ') || 'Unknown Artist'
  return `${track.name} - ${artists}`
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
