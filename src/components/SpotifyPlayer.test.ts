import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpotifyPlayer } from './SpotifyPlayer'
import { getSpotifyDevices, getSpotifyPlayback, SpotifyPlayerError, spotifyNext, spotifyPlay, spotifyTransferPlayback, spotifySetVolume } from '@/lib/spotify'
import { searchSpotifyTracks } from '@/lib/spotify-library'

vi.mock('@/lib/public-config', () => ({ usePublicConfig: () => ({ spotifyClientId: 'test-public' }), getCachedPublicConfig: () => ({ spotifyClientId: 'test-public' }), fetchPublicConfig: vi.fn() }))
vi.mock('@/lib/spotify', async (original) => ({
  ...await original<typeof import('@/lib/spotify')>(),
  getSpotifyPlayback: vi.fn(), getSpotifyDevices: vi.fn(), spotifyPlay: vi.fn(),
  spotifyPause: vi.fn(), spotifyPrevious: vi.fn(), spotifyNext: vi.fn(),
  spotifyTransferPlayback: vi.fn(), spotifySetVolume: vi.fn(), initiateSpotifyAuth: vi.fn(),
}))
vi.mock('@/lib/spotify-library', async (original) => ({
  ...await original<typeof import('@/lib/spotify-library')>(), searchSpotifyTracks: vi.fn(),
}))

const device = { id: 'studio-device', name: 'Studio Mac', is_active: true, is_restricted: false, supports_volume: true, volume_percent: 35 }
const track = { id: 'track-1', name: 'Test track', artists: [{ name: 'Test artist' }], album: { name: 'Test album', images: [{ url: 'https://i.scdn.co/test.jpg' }] }, duration_ms: 180_000, uri: 'spotify:track:track-1' }

describe('SpotifyPlayer device states', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.mocked(getSpotifyPlayback).mockResolvedValue(null)
    vi.mocked(getSpotifyDevices).mockResolvedValue([])
    vi.mocked(spotifyPlay).mockResolvedValue()
    vi.mocked(spotifyNext).mockResolvedValue()
    vi.mocked(spotifyTransferPlayback).mockResolvedValue()
    vi.mocked(spotifySetVolume).mockResolvedValue()
    vi.mocked(searchSpotifyTracks).mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.clearAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  const button = (name: string) => Array.from(container.querySelectorAll('button')).find((element) => element.getAttribute('aria-label') === name || element.textContent === name)!
  const connect = async (accessToken = 'test-access') => {
    await act(async () => root.render(createElement(SpotifyPlayer, { accessToken, onDisconnect: vi.fn() })))
  }
  const chooseDevice = async (id: string) => act(async () => {
    const select = container.querySelector('select')!
    select.value = id
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })

  function SharedSession() {
    const [accessToken, setAccessToken] = useState<string | null>('test-access')
    const disconnect = () => setAccessToken(null)
    return createElement('div', null,
      createElement('button', { onClick: disconnect }, 'Disconnect outside player'),
      createElement('output', null, accessToken ? 'App connected' : 'App disconnected'),
      createElement(SpotifyPlayer, { accessToken, onDisconnect: disconnect }),
    )
  }

  it('keeps controls disabled without a device and gives an actionable connection state', async () => {
    await connect()
    expect(container.textContent).toContain('Open Spotify on your phone or computer')
    expect(button('Play Spotify').disabled).toBe(true)
    expect(button('Previous track').disabled).toBe(true)
    expect((container.querySelector('input[type="range"]') as HTMLInputElement).disabled).toBe(true)
    expect(container.querySelector('a')?.href).toBe('https://open.spotify.com/')
    await act(async () => { button('Play Spotify').click(); await vi.advanceTimersByTimeAsync(15_000) })
    expect(spotifyPlay).not.toHaveBeenCalled()
    expect(spotifyTransferPlayback).not.toHaveBeenCalled()
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(0)
  })

  it('shows a real track and only starts playback after the user presses Play', async () => {
    vi.mocked(getSpotifyPlayback).mockResolvedValue({ device, item: track, progress_ms: 30_000, is_playing: false })
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    await connect()
    expect(container.textContent).toContain('Test track')
    expect(container.textContent).toContain('Test artist')
    expect(container.textContent).toContain('0:30')
    expect(button('Play Spotify').disabled).toBe(false)
    expect(spotifyPlay).not.toHaveBeenCalled()
    await act(async () => button('Play Spotify').click())
    expect(spotifyPlay).toHaveBeenCalledExactlyOnceWith('test-access', 'studio-device')
  })

  it('lets the user activate an idle device and keeps a failed transfer actionable', async () => {
    vi.mocked(getSpotifyDevices).mockResolvedValue([{ ...device, is_active: false }])
    vi.mocked(spotifyTransferPlayback).mockRejectedValue(new SpotifyPlayerError('no-device', 'Open Spotify on a phone or computer, then choose a device below.'))
    await connect()
    expect(spotifyTransferPlayback).not.toHaveBeenCalled()
    await act(async () => button('Use device').click())
    expect(spotifyTransferPlayback).toHaveBeenCalledExactlyOnceWith('test-access', expect.objectContaining({ id: 'studio-device' }))
    expect(button('Play Spotify').disabled).toBe(true)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Open Spotify')
    expect(container.textContent).not.toContain('NO_ACTIVE_DEVICE')
  })

  it('waits for Spotify to confirm a device transfer before sending playback to that device', async () => {
    const phone = { ...device, id: 'phone-device', name: 'Phone', is_active: false, volume_percent: 20 }
    const previous = { device, item: track, progress_ms: 30_000, is_playing: false }
    const confirmed = { ...previous, device: { ...phone, is_active: true, volume_percent: 71 } }
    vi.mocked(getSpotifyDevices).mockResolvedValue([{ ...device, volume_percent: 5 }, phone])
    vi.mocked(getSpotifyPlayback).mockResolvedValueOnce(previous).mockResolvedValueOnce(previous).mockResolvedValue(confirmed)
    await connect()
    expect((container.querySelector('input[type="range"]') as HTMLInputElement).value).toBe('35')
    await chooseDevice(phone.id)
    await act(async () => button('Use device').click())
    expect(spotifyTransferPlayback).toHaveBeenCalledExactlyOnceWith('test-access', expect.objectContaining({ id: phone.id }))
    expect(button('Play Spotify').disabled).toBe(true)
    expect(button('Next track').disabled).toBe(true)
    expect((container.querySelector('input[type="range"]') as HTMLInputElement).disabled).toBe(true)
    expect(container.querySelector('.spotify-player__active-device')?.textContent).toBe(device.name)
    await act(async () => button('Play Spotify').click())
    expect(spotifyPlay).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(299) })
    expect(button('Play Spotify').disabled).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(button('Play Spotify').disabled).toBe(false)
    expect(container.querySelector('.spotify-player__active-device')?.textContent).toBe(phone.name)
    expect(container.querySelector('option[value="studio-device"]')?.textContent).toBe(device.name)
    expect(container.querySelector('option[value="phone-device"]')?.textContent).toBe('Phone · active')
    expect((container.querySelector('input[type="range"]') as HTMLInputElement).value).toBe('71')
    await act(async () => button('Play Spotify').click())
    expect(spotifyPlay).toHaveBeenCalledExactlyOnceWith('test-access', phone.id)
  })

  it.each(['Refresh', 'Use device'])('keeps an unconfirmed transfer blocked and recoverable through %s', async (recovery) => {
    const phone = { ...device, id: 'phone-device', name: 'Phone', is_active: false }
    const previous = { device, item: track, progress_ms: 30_000, is_playing: false }
    vi.mocked(getSpotifyDevices).mockResolvedValue([device, phone])
    vi.mocked(getSpotifyPlayback).mockResolvedValue(previous)
    await connect()
    await chooseDevice(phone.id)
    await act(async () => button('Use device').click())
    await act(async () => { await vi.advanceTimersByTimeAsync(1_600) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(5)
    expect(container.textContent).toContain('Spotify has not confirmed Phone. Refresh or use the device again.')
    expect(button('Refresh').disabled).toBe(false)
    expect(button('Use device').disabled).toBe(false)
    expect(button('Play Spotify').disabled).toBe(true)
    // Even a fresh successful read of the previous device cannot lift the guard.
    await act(async () => button('Refresh').click())
    expect(button('Play Spotify').disabled).toBe(true)
    expect(spotifyPlay).not.toHaveBeenCalled()
    vi.mocked(getSpotifyPlayback).mockResolvedValue({ ...previous, device: { ...phone, is_active: true } })
    await act(async () => button(recovery).click())
    expect(button('Play Spotify').disabled).toBe(false)
    expect(container.textContent).not.toContain('Spotify has not confirmed')
    await act(async () => button('Play Spotify').click())
    expect(spotifyPlay).toHaveBeenCalledExactlyOnceWith('test-access', phone.id)
  })

  it('times out a stalled transfer confirmation and ignores its late response after recovery', async () => {
    const phone = { ...device, id: 'phone-device', name: 'Phone', is_active: false }
    const previous = { device, item: track, progress_ms: 30_000, is_playing: false }
    let finishStalled!: (state: typeof previous) => void
    vi.mocked(getSpotifyDevices).mockResolvedValue([device, phone])
    vi.mocked(getSpotifyPlayback).mockResolvedValueOnce(previous)
      .mockImplementationOnce(() => new Promise(resolve => { finishStalled = resolve }))
      .mockResolvedValue({ ...previous, device: { ...phone, is_active: true } })
    await connect()
    await chooseDevice(phone.id)
    await act(async () => button('Use device').click())
    await act(async () => { await vi.advanceTimersByTimeAsync(4_999) })
    expect(button('Refresh').disabled).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(button('Refresh').disabled).toBe(false)
    expect(button('Use device').disabled).toBe(false)
    expect(button('Play Spotify').disabled).toBe(true)
    await act(async () => button('Refresh').click())
    expect(button('Play Spotify').disabled).toBe(false)
    await act(async () => finishStalled(previous))
    expect(container.querySelector('.spotify-player__active-device')?.textContent).toBe(phone.name)
    expect(container.querySelector('option[value="studio-device"]')?.textContent).toBe(device.name)
    expect(spotifyPlay).not.toHaveBeenCalled()
  })

  it('reconciles devices with confirmed playback while preserving the selected target until it disappears', async () => {
    const phone = { ...device, id: 'phone-device', name: 'Phone', is_active: false }
    const speaker = { ...device, id: 'speaker-device', name: 'Speaker', is_active: false }
    const previous = { device, item: track, progress_ms: 30_000, is_playing: false }
    vi.mocked(getSpotifyDevices).mockResolvedValue([device, phone, speaker])
    vi.mocked(getSpotifyPlayback).mockResolvedValueOnce(previous)
      .mockResolvedValue({ ...previous, device: { ...phone, name: 'Renamed phone', is_active: true, volume_percent: 27 } })
    await connect()
    await chooseDevice(speaker.id)
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(container.querySelector('option[value="studio-device"]')?.textContent).toBe(device.name)
    expect(container.querySelector('option[value="phone-device"]')?.textContent).toBe('Renamed phone · active')
    expect(container.querySelector('select')?.value).toBe(speaker.id)
    expect((container.querySelector('input[type="range"]') as HTMLInputElement).value).toBe('27')
    expect(getSpotifyDevices).toHaveBeenCalledTimes(1)
    vi.mocked(getSpotifyDevices).mockResolvedValue([device, phone])
    await act(async () => button('Refresh').click())
    expect(container.querySelector('select')?.value).toBe(phone.id)
    expect(container.querySelector('option[value="phone-device"]')?.textContent).toBe('Renamed phone · active')
    expect((container.querySelector('input[type="range"]') as HTMLInputElement).value).toBe('27')
    expect(spotifyTransferPlayback).not.toHaveBeenCalled()
  })

  it.each(['rate-limit', 'expired'] as const)('ignores an older command failure after a library %s error', async (kind) => {
    let failSearch!: (error: Error) => void
    let failCommand!: (error: Error) => void
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    vi.mocked(getSpotifyPlayback).mockResolvedValue({ device, item: track, progress_ms: 30_000, is_playing: true })
    vi.mocked(searchSpotifyTracks).mockImplementationOnce(() => new Promise((_, reject) => { failSearch = reject }))
    vi.mocked(spotifyNext).mockImplementationOnce(() => new Promise((_, reject) => { failCommand = reject }))
    await connect()
    await act(async () => {
      const input = container.querySelector('input[type="search"]')!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'song')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button('Search Spotify').click())
    await act(async () => button('Next track').click())
    await act(async () => failSearch(new SpotifyPlayerError(kind, 'Library needs attention.', 30_000)))
    await act(async () => failCommand(new Error('Older command failed.')))
    expect(container.querySelector('.spotify-player > .spotify-player__notice')?.textContent).toContain('Library needs attention.')
    expect(container.textContent).not.toContain('Could not reach Spotify')
    expect(button('Next track').disabled).toBe(true)
    if (kind === 'expired') expect(button('Reconnect Spotify').disabled).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(kind === 'expired' ? 60_000 : 25_000) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(1)
  })

  it('refreshes after a command even with a pending poll and ignores the older track response', async () => {
    const oldState = { device, item: track, progress_ms: 30_000, is_playing: false }
    const nextTrack = { ...track, id: 'track-2', uri: 'spotify:track:track-2', name: 'Next track', album: { ...track.album, images: [{ url: 'https://i.scdn.co/next.jpg' }] } }
    const nextState = { device, item: nextTrack, progress_ms: 2_000, is_playing: true }
    let finishPoll!: (value: typeof oldState) => void
    vi.mocked(getSpotifyPlayback).mockResolvedValueOnce(oldState)
      .mockImplementationOnce(() => new Promise(resolve => { finishPoll = resolve }))
      .mockResolvedValue(nextState)
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    await connect()
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    await act(async () => button('Next track').click())
    await act(async () => finishPoll(oldState))

    expect(spotifyNext).toHaveBeenCalledExactlyOnceWith('test-access', 'studio-device')
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(3)
    expect(container.querySelector('.spotify-player__track h3')?.textContent).toBe('Next track')
    expect(container.querySelector('.spotify-player__art img')?.getAttribute('src')).toBe('https://i.scdn.co/next.jpg')
    expect(container.querySelector('progress')?.value).toBe(2_000)
    expect(button('Pause Spotify').disabled).toBe(false)
  })

  it('updates a changed track within 300ms after Spotify first returns the old state', async () => {
    const oldState = { device, item: track, progress_ms: 30_000, is_playing: true }
    const nextTrack = { ...track, name: 'Confirmed next song', uri: 'spotify:track:next-song' }
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    vi.mocked(getSpotifyPlayback).mockResolvedValueOnce(oldState).mockResolvedValueOnce(oldState)
      .mockResolvedValue({ ...oldState, item: nextTrack, progress_ms: 0 })
    await connect()
    await act(async () => button('Next track').click())
    expect(container.querySelector('.spotify-player__track h3')?.textContent).toBe(track.name)
    await act(async () => { await vi.advanceTimersByTimeAsync(299) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(container.querySelector('.spotify-player__track h3')?.textContent).toBe(nextTrack.name)
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(3)
    expect(getSpotifyDevices).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_600) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(3)
  })

  it('bounds quick readback to three retries while Spotify continues returning the old track', async () => {
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    vi.mocked(getSpotifyPlayback).mockResolvedValue({ device, item: track, progress_ms: 30_000, is_playing: true })
    await connect()
    await act(async () => button('Next track').click())
    await act(async () => { await vi.advanceTimersByTimeAsync(1_600) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(5)
    expect(container.querySelector('.spotify-player__track h3')?.textContent).toBe(track.name)
    await act(async () => { await vi.advanceTimersByTimeAsync(399) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(5)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(6)
  })

  it('confirms Play within 300ms without changing the pause button before Spotify responds', async () => {
    const state = { device, item: track, progress_ms: 30_000, is_playing: false }
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    vi.mocked(getSpotifyPlayback).mockResolvedValueOnce(state).mockResolvedValueOnce(state)
      .mockResolvedValue({ ...state, is_playing: true })
    await connect()
    await act(async () => button('Play Spotify').click())
    expect(button('Play Spotify')).toBeDefined()
    expect(button('Pause Spotify')).toBeUndefined()
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(button('Pause Spotify')).toBeDefined()
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(3)
  })

  it('cancels the pending quick readback when the shared session disconnects', async () => {
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    vi.mocked(getSpotifyPlayback).mockResolvedValue({ device, item: track, progress_ms: 30_000, is_playing: true })
    await act(async () => root.render(createElement(SharedSession)))
    await act(async () => button('Next track').click())
    await act(async () => button('Disconnect outside player').click())
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(2)
    expect(container.querySelector('.spotify-player__track h3')?.textContent).not.toBe(track.name)
  })

  it('cancels quick readback when Spotify rate-limits and honors its retry deadline', async () => {
    const state = { device, item: track, progress_ms: 30_000, is_playing: true }
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    vi.mocked(getSpotifyPlayback).mockResolvedValueOnce(state).mockResolvedValueOnce(state)
      .mockRejectedValueOnce(new SpotifyPlayerError('rate-limit', 'Wait for Spotify.', 30_000))
      .mockResolvedValue(state)
    await connect()
    await act(async () => button('Next track').click())
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(container.textContent).toContain('Wait for Spotify.')
    await act(async () => { await vi.advanceTimersByTimeAsync(29_999) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(3)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_701) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(4)
  })

  it('polls changed playback at two seconds even when the initial response was delayed', async () => {
    const state = { device, item: track, progress_ms: 30_000, is_playing: true }
    let finishInitial!: (value: typeof state) => void
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    vi.mocked(getSpotifyPlayback).mockImplementationOnce(() => new Promise(resolve => { finishInitial = resolve }))
      .mockResolvedValue({ ...state, item: { ...track, name: 'Changed in Spotify' } })
    await connect()
    await act(async () => { await vi.advanceTimersByTimeAsync(100); finishInitial(state) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1_899) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(container.querySelector('.spotify-player__track h3')?.textContent).toBe('Changed in Spotify')
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(2)
    expect(getSpotifyDevices).toHaveBeenCalledTimes(1)
  })

  it('clears the active device when a playback-only poll reports no current session', async () => {
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    vi.mocked(getSpotifyPlayback).mockResolvedValueOnce({ device, item: track, progress_ms: 0, is_playing: true }).mockResolvedValue(null)
    await connect()
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(button('Play Spotify').disabled).toBe(true)
    expect(container.querySelector('.spotify-player__active-device')).toBeNull()
    expect(getSpotifyDevices).toHaveBeenCalledTimes(1)
  })

  it('shares only accepted playback and clears it on logout without restarting requests for callback changes', async () => {
    const state = { device, item: track, progress_ms: 30_000, is_playing: true }
    const onPlaybackChange = vi.fn()
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    vi.mocked(getSpotifyPlayback).mockResolvedValue(state)
    await act(async () => root.render(createElement(SpotifyPlayer, { accessToken: 'test-access', onDisconnect: vi.fn(), onPlaybackChange })))
    expect(onPlaybackChange).toHaveBeenLastCalledWith(state)
    const replacement = vi.fn()
    await act(async () => root.render(createElement(SpotifyPlayer, { accessToken: 'test-access', onDisconnect: vi.fn(), onPlaybackChange: replacement })))
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(1)
    expect(replacement).not.toHaveBeenCalled()
    await act(async () => root.render(createElement(SpotifyPlayer, { accessToken: null, onDisconnect: vi.fn(), onPlaybackChange: replacement })))
    expect(replacement).toHaveBeenLastCalledWith(null)
  })

  it.each(['rate-limit', 'expired'] as const)('does not let a pending poll clear a command %s error or its backoff', async kind => {
    const state = { device, item: track, progress_ms: 0, is_playing: false }
    let finishPoll!: (value: typeof state) => void
    vi.mocked(getSpotifyPlayback).mockResolvedValueOnce(state)
      .mockImplementationOnce(() => new Promise(resolve => { finishPoll = resolve }))
      .mockResolvedValue(state)
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    vi.mocked(spotifyPlay).mockRejectedValueOnce(new SpotifyPlayerError(kind, 'Playback cannot continue yet.', 30_000))
    await connect()
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    await act(async () => button('Play Spotify').click())
    await act(async () => finishPoll(state))
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Playback cannot continue yet.')
    expect(button('Play Spotify').disabled).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(2)
    if (kind === 'expired') expect(button('Reconnect Spotify')).toBeDefined()
  })

  it('starts a fresh read when the shared token changes during an older pending read', async () => {
    const oldState = { device, item: track, progress_ms: 0, is_playing: false }
    const refreshedState = { ...oldState, item: { ...track, name: 'Refreshed account track' } }
    let finishOldRead!: (value: typeof oldState) => void
    vi.mocked(getSpotifyPlayback).mockImplementationOnce(() => new Promise(resolve => { finishOldRead = resolve }))
      .mockResolvedValue(refreshedState)
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    await connect()
    await connect('refreshed-access')
    await act(async () => finishOldRead(oldState))
    expect(getSpotifyPlayback).toHaveBeenLastCalledWith('refreshed-access')
    expect(container.querySelector('.spotify-player__track h3')?.textContent).toBe('Refreshed account track')
    expect(button('Play Spotify').disabled).toBe(false)
  })

  it('disables restricted devices and unsupported volume controls', async () => {
    vi.mocked(getSpotifyPlayback).mockResolvedValue({ device: { ...device, is_restricted: true, supports_volume: false }, item: track, progress_ms: 0, is_playing: false })
    vi.mocked(getSpotifyDevices).mockResolvedValue([{ ...device, is_restricted: true, supports_volume: false }])
    await connect()
    expect(button('Play Spotify').disabled).toBe(true)
    expect(container.querySelector('option[value="studio-device"]')?.hasAttribute('disabled')).toBe(true)
    expect(container.textContent).toContain('Adjust volume on Studio Mac')
  })

  it('does not send volume requests for every drag position; commits on release', async () => {
    vi.mocked(getSpotifyPlayback).mockResolvedValue({ device, item: track, progress_ms: 0, is_playing: false })
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    await connect()
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      for (const value of ['40', '50', '60']) {
        setValue.call(slider, value)
        slider.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
    expect(spotifySetVolume).not.toHaveBeenCalled()
    await act(async () => slider.dispatchEvent(new Event('pointerup', { bubbles: true })))
    expect(spotifySetVolume).toHaveBeenCalledExactlyOnceWith('test-access', 60, 'studio-device')
  })

  it('disables further playback requests after Spotify reports the device has disappeared', async () => {
    vi.mocked(getSpotifyPlayback).mockResolvedValue({ device, item: track, progress_ms: 0, is_playing: false })
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    vi.mocked(spotifyPlay).mockRejectedValue(new SpotifyPlayerError('no-device', 'Open Spotify on a phone or computer, then choose a device below.'))
    await connect()
    await act(async () => button('Play Spotify').click())
    await act(async () => button('Play Spotify').click())
    expect(spotifyPlay).toHaveBeenCalledTimes(1)
    expect(button('Play Spotify').disabled).toBe(true)
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
  })

  it('replaces repeated polling failures with one inline notice and waits before retrying', async () => {
    vi.mocked(getSpotifyPlayback).mockRejectedValue(new SpotifyPlayerError('rate-limit', 'Spotify needs a moment.', 30_000))
    await connect()
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
    expect(button('Play Spotify').disabled).toBe(true)
    vi.mocked(getSpotifyPlayback).mockResolvedValue(null)
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(2)
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(0)
  })

  it.each(['Disconnect', 'Disconnect outside player'])('clears the shared session when using %s', async (control) => {
    vi.mocked(getSpotifyPlayback).mockResolvedValue({ device, item: track, progress_ms: 0, is_playing: false })
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    await act(async () => root.render(createElement(SharedSession)))
    expect(container.querySelector('output')?.textContent).toBe('App connected')
    await act(async () => button(control).click())
    expect(container.querySelector('output')?.textContent).toBe('App disconnected')
    expect(button('Connect Spotify')).toBeDefined()
    expect(button('Play Spotify')).toBeUndefined()
    expect(container.textContent).not.toContain('Test track')
    const reads = vi.mocked(getSpotifyPlayback).mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(reads)
  })

  it('uses the parent refreshed token and clears the expired-session backoff', async () => {
    vi.mocked(getSpotifyPlayback).mockRejectedValueOnce(new SpotifyPlayerError('expired', 'Reconnect to continue.'))
    await connect()
    expect(button('Reconnect Spotify')).toBeDefined()
    vi.mocked(getSpotifyPlayback).mockResolvedValue({ device, item: track, progress_ms: 0, is_playing: false })
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    await connect('refreshed-access')
    expect(getSpotifyPlayback).toHaveBeenLastCalledWith('refreshed-access')
    expect(button('Reconnect Spotify')).toBeUndefined()
    await act(async () => button('Play Spotify').click())
    expect(spotifyPlay).toHaveBeenCalledExactlyOnceWith('refreshed-access', 'studio-device')
  })

  it('ignores an old playback response after the shared session disconnects', async () => {
    let complete!: (value: Awaited<ReturnType<typeof getSpotifyPlayback>>) => void
    vi.mocked(getSpotifyPlayback).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
    vi.mocked(getSpotifyDevices).mockResolvedValue([device])
    await act(async () => root.render(createElement(SharedSession)))
    await act(async () => button('Disconnect outside player').click())
    await act(async () => complete({ device, item: track, progress_ms: 0, is_playing: false }))
    expect(container.textContent).not.toContain('Test track')
    expect(button('Play Spotify')).toBeUndefined()
    expect(container.querySelector('output')?.textContent).toBe('App disconnected')
  })

  it('shows reconnect for an expired token and stops polling it', async () => {
    vi.mocked(getSpotifyPlayback).mockRejectedValue(new SpotifyPlayerError('expired', 'Your Spotify connection expired. Reconnect to continue.'))
    await connect()
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(getSpotifyPlayback).toHaveBeenCalledTimes(1)
    expect(button('Reconnect Spotify')).toBeDefined()
  })
})
