import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSpotifyPlaylists, getSpotifyPlaylistTracks, playSpotifySelection, searchSpotifyTracks, type SpotifySelection } from './spotify-library'

const trackId = '4iV5W9uYEdYUVa79Axb7Rh'
const playlistId = '3cEYpjA9oz9GiPac4AsH4n'
const track = { id: trackId, uri: `spotify:track:${trackId}`, type: 'track', name: 'Selected song', artists: [{ name: 'Artist' }], album: { name: 'Album', images: [{ url: 'https://i.scdn.co/image/cover' }] }, duration_ms: 180_000 }
const playlist = { id: playlistId, uri: `spotify:playlist:${playlistId}`, type: 'playlist', name: 'Studio playlist', images: null }
const trackSelection: SpotifySelection = { kind: 'track', uri: track.uri, name: track.name }

describe('Spotify library selection API', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => vi.unstubAllGlobals())
  const respond = (body: unknown, status = 200, headers: Record<string, string> = {}) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers }))

  it('searches using the development-mode limit and excludes unavailable/local/non-track entries', async () => {
    respond({ tracks: { items: [track, null, { ...track, type: 'episode' }, { ...track, is_local: true }, { ...track, is_playable: false }, { name: 'Missing URI' }] } })
    const controller = new AbortController()
    const result = await searchSpotifyTracks('test-access', '  artist:Artist & piano  ', { limit: 50, offset: 10, signal: controller.signal })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: trackId, uri: track.uri, name: track.name, preview_url: null })
    const [url, init] = fetchMock.mock.calls[0]
    expect(new URL(url).searchParams.get('q')).toBe('artist:Artist & piano')
    expect(new URL(url).searchParams.get('limit')).toBe('10')
    expect(new URL(url).searchParams.get('offset')).toBe('10')
    expect(new URL(url).searchParams.get('type')).toBe('track')
    expect(init.signal).toBe(controller.signal)
    expect(init.headers).toEqual({ Authorization: 'Bearer test-access' })
  })

  it('normalizes playlist counts from both current items and legacy tracks responses', async () => {
    respond({ items: [{ ...playlist, items: { total: 12 } }, { ...playlist, tracks: { total: 4 } }, { ...playlist }, null, { ...playlist, uri: 'spotify:playlist:bad' }] })
    const result = await getSpotifyPlaylists('test-access')
    expect(result.map((item) => item.tracks.total)).toEqual([12, 4, 0])
    expect(result[0]).toMatchObject({ uri: playlist.uri, images: [], description: '', externalUrl: `https://open.spotify.com/playlist/${playlistId}` })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.spotify.com/v1/me/playlists?limit=50&offset=0')
  })

  it('requests /items and supports item/track response wrappers without reviving deleted items', async () => {
    respond({ items: [{ item: track }, { track }, { item: null, track }, { item: { ...track, type: 'episode' } }, { item: track, is_local: true }, null] })
    const result = await getSpotifyPlaylistTracks('test-access', playlistId)
    expect(result).toHaveLength(2)
    expect(result[0].uri).toBe(track.uri)
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.spotify.com/v1/playlists/${playlistId}/items?limit=50&offset=0`)
  })

  it('keeps usable tracks when optional metadata is absent and rejects unsafe artwork URLs', async () => {
    respond({ tracks: { items: [{ uri: track.uri, name: track.name, artists: [null, { name: 'Artist' }], album: { images: [{ url: 'javascript:alert(1)' }, { url: 'http://example.test/cover' }, null] } }] } })
    expect(await searchSpotifyTracks('test-access', 'song')).toEqual([{ id: trackId, uri: track.uri, name: track.name, artists: [{ name: 'Artist' }], album: { name: '', images: [] }, duration_ms: 0, preview_url: null }])
  })

  it.each([
    [trackSelection, { uris: [track.uri] }],
    [{ kind: 'playlist', uri: playlist.uri, name: playlist.name }, { context_uri: playlist.uri }],
  ])('starts the exact selected item on the explicit target device', async (selection, body) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await playSpotifySelection('test-access', selection as SpotifySelection, 'speaker /1')
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('https://api.spotify.com/v1/me/player/play?device_id=speaker+%2F1', {
      method: 'PUT', headers: { Authorization: 'Bearer test-access', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  })

  it.each(['', '  ', ' device ', 'bad\ndevice'])('does not send playback requests without a valid device (%j)', async (deviceId) => {
    await expect(playSpotifySelection('test-access', trackSelection, deviceId)).rejects.toMatchObject({ kind: 'no-device' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['spotify:album:4iV5W9uYEdYUVa79Axb7Rh', 'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh', 'spotify:track:../../player', 'spotify:track:'])('rejects invalid selection URIs before making a request (%s)', async (uri) => {
    await expect(playSpotifySelection('test-access', { ...trackSelection, uri }, 'speaker')).rejects.toMatchObject({ kind: 'unavailable' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not issue requests for blank queries, invalid playlist IDs or missing authentication', async () => {
    expect(await searchSpotifyTracks('test-access', '  ')).toEqual([])
    await expect(getSpotifyPlaylistTracks('test-access', '../me')).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(getSpotifyPlaylists('')).rejects.toMatchObject({ kind: 'expired' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [401, { message: 'Invalid token' }, 'expired'],
    [403, { reason: 'PREMIUM_REQUIRED' }, 'premium'],
    [403, { message: 'Insufficient client scope' }, 'restricted'],
    [502, { message: 'private provider diagnostics' }, 'unavailable'],
  ])('propagates HTTP %s as a typed error instead of an empty library', async (status, error, kind) => {
    respond({ error }, status as number)
    await expect(searchSpotifyTracks('test-access', 'song')).rejects.toMatchObject({ kind })
  })

  it('explains playlist access restrictions without trying the removed endpoint', async () => {
    respond({ error: { message: 'Forbidden' } }, 403)
    await expect(getSpotifyPlaylistTracks('test-access', playlistId)).rejects.toMatchObject({ kind: 'restricted', message: expect.stringContaining('own or collaborate') })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves no-device playback failures and Retry-After backoff', async () => {
    respond({ error: { reason: 'NO_ACTIVE_DEVICE' } }, 404)
    await expect(playSpotifySelection('test-access', trackSelection, 'speaker')).rejects.toMatchObject({ kind: 'no-device' })
    respond({ error: { message: 'Too many requests' } }, 429, { 'Retry-After': '42' })
    await expect(getSpotifyPlaylists('test-access')).rejects.toMatchObject({ kind: 'rate-limit', retryAfterMs: 42_000 })
  })

  it('uses a safe delay when rate-limit responses omit Retry-After', async () => {
    respond({}, 429)
    await expect(getSpotifyPlaylists('test-access')).rejects.toMatchObject({ kind: 'rate-limit', retryAfterMs: 30_000 })
  })

  it('distinguishes an empty library from a malformed successful response', async () => {
    respond({ items: [] })
    expect(await getSpotifyPlaylists('test-access')).toEqual([])
    respond({ unexpected: [] })
    await expect(getSpotifyPlaylists('test-access')).rejects.toMatchObject({ kind: 'unavailable' })
    fetchMock.mockResolvedValueOnce(new Response('<html>unavailable</html>'))
    await expect(getSpotifyPlaylists('test-access')).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('preserves cancellation but gives network failures an actionable error', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    fetchMock.mockRejectedValueOnce(abort)
    await expect(getSpotifyPlaylists('test-access')).rejects.toBe(abort)
    fetchMock.mockRejectedValueOnce(new Error('private transport diagnostics'))
    await expect(getSpotifyPlaylists('test-access')).rejects.toMatchObject({ kind: 'unavailable', message: 'Could not reach Spotify. Check your connection and try again.' })
  })
})
