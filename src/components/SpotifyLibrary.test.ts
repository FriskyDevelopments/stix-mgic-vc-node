import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpotifyLibrary } from './SpotifyLibrary'
import { SpotifyPlayer } from './SpotifyPlayer'
import { getSpotifyDevices, getSpotifyPlayback, SpotifyPlayerError } from '@/lib/spotify'
import { getSpotifyPlaylists, getSpotifyPlaylistTracks, searchSpotifyTracks, playSpotifySelection } from '@/lib/spotify-library'

vi.mock('@/lib/public-config', () => ({ usePublicConfig: () => ({ spotifyClientId: 'test-public' }), getCachedPublicConfig: () => ({ spotifyClientId: 'test-public' }), fetchPublicConfig: vi.fn() }))
vi.mock('@/lib/spotify-library', () => ({ getSpotifyPlaylists: vi.fn(), getSpotifyPlaylistTracks: vi.fn(), searchSpotifyTracks: vi.fn(), playSpotifySelection: vi.fn() }))
vi.mock('@/lib/spotify', async original => ({ ...await original<typeof import('@/lib/spotify')>(), getSpotifyPlayback: vi.fn(), getSpotifyDevices: vi.fn() }))

const song = { id: '1', uri: 'spotify:track:1111111111111111111111', name: 'Chosen song', artists: [{ name: 'Artist' }], album: { name: 'Album', images: [] }, duration_ms: 180000 }
const playlist = { id: '2222222222222222222222', uri: 'spotify:playlist:2222222222222222222222', name: 'Evening mix', description: '', images: [], tracks: { total: 1 }, externalUrl: 'https://open.spotify.com/playlist/2222222222222222222222' }
const device = { id: 'device-1', name: 'Studio Mac', is_active: true, is_restricted: false, volume_percent: 50 }

describe('inline Spotify selection', () => {
  let root: Root
  let container: HTMLDivElement
  const onPlay = vi.fn()
  const onReconnect = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.mocked(searchSpotifyTracks).mockResolvedValue([song])
    vi.mocked(getSpotifyPlaylists).mockResolvedValue([playlist])
    vi.mocked(getSpotifyPlaylistTracks).mockResolvedValue([song])
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    vi.mocked(getSpotifyPlayback).mockResolvedValue({ device, item: { ...song, name: 'Existing playback' }, progress_ms: 0, is_playing: false })
    vi.mocked(playSpotifySelection).mockResolvedValue()
    onPlay.mockResolvedValue(true)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.resetAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })
  const button = (name: string) => [...container.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === name || item.textContent === name)!
  const render = async (canPlay = true) => act(async () => root.render(createElement(SpotifyLibrary, { token: 'test-token', deviceName: 'Studio Mac', canPlay, busy: false, onPlay, onReconnect })))
  async function search(query = 'chosen') {
    await act(async () => {
      const input = container.querySelector('input[type="search"]')!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button('Search Spotify').click())
  }
  const chooseSong = async () => act(async () => container.querySelector<HTMLButtonElement>('ul[aria-label="Songs"] button')!.click())

  it('browses and selects without autoplay, then plays the exact selection', async () => {
    await render()
    await search()
    expect(searchSpotifyTracks).toHaveBeenCalledWith('test-token', 'chosen')
    await chooseSong()
    expect(onPlay).not.toHaveBeenCalled()
    await act(async () => button('Play song on Studio Mac').click())
    expect(onPlay).toHaveBeenCalledExactlyOnceWith({ kind: 'track', uri: song.uri, name: song.name })
    expect(container.textContent).toContain('Playback requested for Chosen song on Studio Mac.')
  })

  it('lets a playlist be chosen separately from its songs and requires an explicit play', async () => {
    await render()
    await act(async () => button('Your playlists').click())
    await act(async () => container.querySelector<HTMLButtonElement>('ul[aria-label="Playlists"] button')!.click())
    expect(getSpotifyPlaylistTracks).toHaveBeenCalledWith('test-token', playlist.id)
    await act(async () => button('Choose this playlist').click())
    expect(onPlay).not.toHaveBeenCalled()
    await act(async () => button('Play playlist on Studio Mac').click())
    expect(onPlay).toHaveBeenCalledWith({ kind: 'playlist', uri: playlist.uri, name: playlist.name })
  })

  it('allows browsing without a usable device but does not send playback', async () => {
    await render(false)
    await search()
    await chooseSong()
    expect(button('Play song on Studio Mac').disabled).toBe(true)
    await act(async () => button('Play song on Studio Mac').click())
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('shows expired authorization as an error with reconnect instead of an empty library', async () => {
    vi.mocked(searchSpotifyTracks).mockRejectedValue(new SpotifyPlayerError('expired', 'Your Spotify connection expired.'))
    await render()
    await search()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('expired')
    expect(container.textContent).not.toContain('No songs found')
    await act(async () => button('Reconnect Spotify').click())
    expect(onReconnect).toHaveBeenCalledOnce()
  })

  it('discards a slow search result after switching to playlists', async () => {
    let resolveSearch!: (value: typeof song[]) => void
    vi.mocked(searchSpotifyTracks).mockReturnValue(new Promise(resolve => { resolveSearch = resolve }))
    await render()
    await search()
    await act(async () => button('Your playlists').click())
    await act(async () => resolveSearch([song]))
    expect(container.textContent).toContain('Evening mix')
    expect(container.querySelector('ul[aria-label="Songs"]')).toBeNull()
  })

  it('player submits the exact chosen track and active device, then keeps confirmed playback honest on failure', async () => {
    vi.mocked(playSpotifySelection).mockRejectedValue(new SpotifyPlayerError('restricted', 'Spotify could not start this song.'))
    await act(async () => root.render(createElement(SpotifyPlayer, { accessToken: 'test-token', onDisconnect: vi.fn() })))
    await search()
    await chooseSong()
    await act(async () => button('Play song on Studio Mac').click())
    expect(playSpotifySelection).toHaveBeenCalledExactlyOnceWith('test-token', { kind: 'track', uri: song.uri, name: song.name }, 'device-1')
    expect(container.querySelector('.spotify-player__track h3')?.textContent).toBe('Existing playback')
    expect(container.textContent).toContain('Spotify could not start this song.')
    expect(container.textContent).not.toContain('Playback requested')
  })

  it('reads the chosen song back within 300ms when Spotify initially still reports the previous song', async () => {
    vi.useFakeTimers()
    const previous = { device, item: { ...song, uri: 'spotify:track:0000000000000000000000', name: 'Previous song' }, progress_ms: 30_000, is_playing: true }
    vi.mocked(getSpotifyPlayback).mockResolvedValueOnce(previous).mockResolvedValueOnce(previous)
      .mockResolvedValue({ device, item: song, progress_ms: 0, is_playing: true })
    await act(async () => root.render(createElement(SpotifyPlayer, { accessToken: 'test-token', onDisconnect: vi.fn() })))
    await search()
    await chooseSong()
    await act(async () => button('Play song on Studio Mac').click())
    expect(container.querySelector('.spotify-player__track h3')?.textContent).toBe('Previous song')
    await act(async () => vi.advanceTimersByTimeAsync(300))
    expect(container.querySelector('.spotify-player__track h3')?.textContent).toBe(song.name)
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(3)
    expect(playSpotifySelection).toHaveBeenCalledExactlyOnceWith('test-token', { kind: 'track', uri: song.uri, name: song.name }, 'device-1')
  })

  it.each(['rate-limit', 'expired'] as const)('stops playlist playback and player polling after a library %s response', async kind => {
    vi.useFakeTimers()
    vi.mocked(getSpotifyPlaylistTracks).mockRejectedValue(new SpotifyPlayerError(kind, 'Spotify needs attention.', 30000))
    await act(async () => root.render(createElement(SpotifyPlayer, { accessToken: 'test-token', onDisconnect: vi.fn() })))
    await act(async () => button('Your playlists').click())
    await act(async () => container.querySelector<HTMLButtonElement>('ul[aria-label="Playlists"] button')!.click())
    expect(button('Choose this playlist').disabled).toBe(true)
    expect(button('Play Spotify').disabled).toBe(true)
    await act(async () => button('Choose this playlist').click())
    expect(playSpotifySelection).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTimeAsync(25000))
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(1)
    if (kind === 'rate-limit') {
      await act(async () => vi.advanceTimersByTimeAsync(5000))
      expect(getSpotifyPlayback).toHaveBeenCalledTimes(2)
      expect(button('Choose this playlist').disabled).toBe(false)
    } else {
      await act(async () => vi.advanceTimersByTimeAsync(60000))
      expect(getSpotifyPlayback).toHaveBeenCalledTimes(1)
      expect(button('Reconnect Spotify')).toBeDefined()
    }
  })
})
