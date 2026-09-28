import { SpotifyPlayerError, type SpotifyPlaylist, type SpotifyTrack } from '@/lib/spotify'

const API_BASE = 'https://api.spotify.com/v1'
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/

export type SpotifySelection = { kind: 'track' | 'playlist'; uri: string; name: string }
export interface SpotifyLibraryPlaylist extends SpotifyPlaylist {
  uri: string
  externalUrl: string
}
export interface SpotifyLibraryOptions {
  signal?: AbortSignal
  offset?: number
  limit?: number
}

type JsonObject = Record<string, unknown>
type RequestKind = 'catalog' | 'playlist' | 'playback'

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null
}

function uriId(uri: unknown, kind: SpotifySelection['kind']): string | null {
  if (typeof uri !== 'string' || !uri.startsWith(`spotify:${kind}:`)) return null
  const id = uri.slice(`spotify:${kind}:`.length)
  return SPOTIFY_ID.test(id) ? id : null
}

function unavailable(message = 'Spotify is unavailable right now. Try again shortly.'): SpotifyPlayerError {
  return new SpotifyPlayerError('unavailable', message)
}

function isAbort(error: unknown): boolean {
  return object(error)?.name === 'AbortError'
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json() } catch (error) {
    if (isAbort(error)) throw error
    return null
  }
}

async function responseError(response: Response, kind: RequestKind): Promise<SpotifyPlayerError> {
  const payload = object(await readJson(response))
  const detail = object(payload?.error)
  const reason = `${typeof detail?.reason === 'string' ? detail.reason : ''} ${typeof detail?.message === 'string' ? detail.message : ''}`.toUpperCase()
  if (response.status === 401) return new SpotifyPlayerError('expired', 'Your Spotify connection expired. Reconnect to continue.')
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    const seconds = retryAfter === null ? NaN : Number(retryAfter)
    const dateDelay = retryAfter ? Date.parse(retryAfter) - Date.now() : NaN
    const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Number.isFinite(dateDelay) && dateDelay > 0 ? dateDelay : 30_000
    return new SpotifyPlayerError('rate-limit', 'Spotify needs a moment. Try again after a short pause.', delay)
  }
  if (response.status === 403 && /PREMIUM/.test(reason)) return new SpotifyPlayerError('premium', 'Spotify Premium is required for this action. You can still listen in Spotify.')
  if (response.status === 403 && /SCOPE/.test(reason)) return new SpotifyPlayerError('restricted', 'Reconnect Spotify to allow access to your library and playback controls.')
  if (response.status === 403 && kind === 'playlist') return new SpotifyPlayerError('restricted', 'Spotify only allows browsing tracks in playlists you own or collaborate on. You can still try playing the playlist directly.')
  if (response.status === 403) return new SpotifyPlayerError('restricted', kind === 'playback' ? 'Spotify cannot play this selection on that device. Choose another device or continue in Spotify.' : 'Spotify did not allow access to this library. Check your app access or reconnect Spotify.')
  if (response.status === 404 && kind === 'playback' && /NO_ACTIVE_DEVICE|NO ACTIVE DEVICE|DEVICE NOT FOUND/.test(reason)) return new SpotifyPlayerError('no-device', 'Open Spotify on a phone or computer, then choose a device below.')
  if (response.status === 404 && kind === 'playlist') return unavailable('This playlist is no longer available to your Spotify account.')
  return unavailable()
}

async function request(token: string, path: string, kind: RequestKind, init: RequestInit = {}): Promise<Response> {
  if (typeof token !== 'string' || !token.trim()) throw new SpotifyPlayerError('expired', 'Connect Spotify to browse your library and choose music.')
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } })
  } catch (error) {
    if (init.signal?.aborted || isAbort(error)) throw error
    throw unavailable('Could not reach Spotify. Check your connection and try again.')
  }
  if (!response.ok) throw await responseError(response, kind)
  return response
}

async function readObject(response: Response): Promise<JsonObject> {
  const data = object(await readJson(response))
  if (!data) throw unavailable('Spotify returned an unreadable library response. Try again.')
  return data
}

function pageItems(page: unknown): unknown[] {
  const items = object(page)?.items
  if (!Array.isArray(items)) throw unavailable('Spotify returned an incomplete library response. Try again.')
  return items
}

function pageParams(options: SpotifyLibraryOptions, maxLimit: number): URLSearchParams {
  const limit = options.limit === undefined ? maxLimit : options.limit
  const offset = options.offset ?? 0
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0) throw unavailable('Choose a valid library page.')
  return new URLSearchParams({ limit: String(Math.min(limit, maxLimit)), offset: String(offset) })
}

function images(value: unknown): { url: string }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const url = object(entry)?.url
    if (typeof url !== 'string') return []
    try { return new URL(url).protocol === 'https:' ? [{ url }] : [] } catch { return [] }
  })
}

function track(value: unknown): SpotifyTrack | null {
  const data = object(value)
  if (!data || data.is_local === true || data.is_playable === false || (data.type !== undefined && data.type !== 'track')) return null
  const id = uriId(data.uri, 'track')
  if (!id || typeof data.name !== 'string' || !data.name.trim()) return null
  const album = object(data.album)
  return {
    id, uri: data.uri as string, name: data.name,
    artists: Array.isArray(data.artists) ? data.artists.flatMap((artist) => {
      const name = object(artist)?.name
      return typeof name === 'string' && name.trim() ? [{ name }] : []
    }) : [],
    album: { name: typeof album?.name === 'string' ? album.name : '', images: images(album?.images) },
    duration_ms: typeof data.duration_ms === 'number' && Number.isFinite(data.duration_ms) && data.duration_ms >= 0 ? data.duration_ms : 0,
    preview_url: typeof data.preview_url === 'string' ? data.preview_url : null,
  }
}

function playlist(value: unknown): SpotifyLibraryPlaylist | null {
  const data = object(value)
  if (!data || (data.type !== undefined && data.type !== 'playlist')) return null
  const id = uriId(data.uri, 'playlist')
  if (!id || typeof data.name !== 'string' || !data.name.trim()) return null
  // February 2026 responses rename tracks to items. Both forms may be returned.
  const total = object(data.items)?.total ?? object(data.tracks)?.total
  return {
    id, uri: data.uri as string, name: data.name,
    description: typeof data.description === 'string' ? data.description : '',
    images: images(data.images),
    tracks: { total: typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : 0 },
    externalUrl: `https://open.spotify.com/playlist/${id}`,
  }
}

export async function searchSpotifyTracks(token: string, query: string, options: SpotifyLibraryOptions = {}): Promise<SpotifyTrack[]> {
  if (typeof query !== 'string' || !query.trim()) return []
  // Development-mode search is capped at 10 results per request as of February 2026.
  // https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
  const params = pageParams(options, 10)
  params.set('q', query.trim())
  params.set('type', 'track')
  const data = await readObject(await request(token, `/search?${params}`, 'catalog', { signal: options.signal }))
  return pageItems(data.tracks).flatMap((value) => { const item = track(value); return item ? [item] : [] })
}

export async function getSpotifyPlaylists(token: string, options: SpotifyLibraryOptions = {}): Promise<SpotifyLibraryPlaylist[]> {
  const params = pageParams(options, 50)
  const data = await readObject(await request(token, `/me/playlists?${params}`, 'catalog', { signal: options.signal }))
  return pageItems(data).flatMap((value) => { const item = playlist(value); return item ? [item] : [] })
}

export async function getSpotifyPlaylistTracks(token: string, playlistId: string, options: SpotifyLibraryOptions = {}): Promise<SpotifyTrack[]> {
  if (typeof playlistId !== 'string' || !SPOTIFY_ID.test(playlistId)) throw unavailable('Choose a valid Spotify playlist.')
  const params = pageParams(options, 50)
  // Use the current endpoint, not the removed development-mode /tracks route.
  // https://developer.spotify.com/documentation/web-api/reference/get-playlists-items
  const data = await readObject(await request(token, `/playlists/${playlistId}/items?${params}`, 'playlist', { signal: options.signal }))
  return pageItems(data).flatMap((value) => {
    const entry = object(value)
    if (!entry || entry.is_local === true) return []
    const item = track(Object.prototype.hasOwnProperty.call(entry, 'item') ? entry.item : entry.track)
    return item ? [item] : []
  })
}

export async function playSpotifySelection(token: string, selection: SpotifySelection, deviceId: string): Promise<void> {
  if (!selection || (selection.kind !== 'track' && selection.kind !== 'playlist') || !uriId(selection.uri, selection.kind)) throw unavailable('Choose a valid Spotify track or playlist.')
  // Control characters are deliberately rejected in provider device IDs.
  // eslint-disable-next-line no-control-regex
  if (typeof deviceId !== 'string' || !deviceId.trim() || deviceId !== deviceId.trim() || deviceId.length > 256 || /[\u0000-\u001f\u007f]/.test(deviceId)) throw new SpotifyPlayerError('no-device', 'Choose an available Spotify device before playing your selection.')
  const params = new URLSearchParams({ device_id: deviceId })
  // https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback
  await request(token, `/me/player/play?${params}`, 'playback', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(selection.kind === 'track' ? { uris: [selection.uri] } : { context_uri: selection.uri }),
  })
}
