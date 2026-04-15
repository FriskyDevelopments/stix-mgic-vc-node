const SPOTIFY_CLIENT_ID = '3e8f7a4b2c1d9e6f5a8b7c4d9e6f5a8b'
const SPOTIFY_REDIRECT_URI = window.location.origin + '/spotify-callback'
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

export async function initiateSpotifyAuth(): Promise<void> {
  const codeVerifier = generateRandomString(64)
  const hashed = await sha256(codeVerifier)
  const codeChallenge = base64urlencode(hashed)
  const state = generateRandomString(16)

  sessionStorage.setItem('spotify_code_verifier', codeVerifier)
  sessionStorage.setItem('spotify_auth_state', state)

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state: state,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  })

  const authUrl = `${SPOTIFY_AUTH_ENDPOINT}?${params.toString()}`
  
  const width = 600
  const height = 800
  const left = window.screenX + (window.outerWidth - width) / 2
  const top = window.screenY + (window.outerHeight - height) / 2
  
  window.open(
    authUrl,
    'Spotify Login',
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
  )
}

export async function handleSpotifyCallback(code: string, state: string): Promise<string | null> {
  const storedState = sessionStorage.getItem('spotify_auth_state')
  const codeVerifier = sessionStorage.getItem('spotify_code_verifier')

  if (state !== storedState || !codeVerifier) {
    console.error('State mismatch or missing code verifier')
    return null
  }

  sessionStorage.removeItem('spotify_auth_state')
  sessionStorage.removeItem('spotify_code_verifier')

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
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
    return data.access_token
  } catch (error) {
    console.error('Error exchanging code for token:', error)
    return null
  }
}

export async function refreshSpotifyToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      throw new Error('Token refresh failed')
    }

    const data = await response.json()
    return data.access_token
  } catch (error) {
    console.error('Error refreshing token:', error)
    return null
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
