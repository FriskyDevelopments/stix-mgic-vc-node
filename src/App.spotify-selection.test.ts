import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { SpotifyPlayer } from '@/components/SpotifyPlayer'
import { MediaDisclosure } from '@/components/MediaDisclosure'
import { getSpotifyDevices, getSpotifyPlayback, getSpotifyUser, handleSpotifyCallback, type SpotifyPlaybackState } from '@/lib/spotify'

vi.mock('@/lib/env', () => ({ getAppEnv: () => ({ demoMode: false, operatorTier: 'free', isLiveApiConfigured: true, authRequired: true }) }))
vi.mock('@/lib/public-config', () => ({ usePublicConfig: () => ({ spotifyClientId: 'test-public' }), getCachedPublicConfig: () => ({ spotifyClientId: 'test-public' }) }))
vi.mock('@/lib/spotify', async original => ({ ...await original<typeof import('@/lib/spotify')>(), getSpotifyDevices: vi.fn(), getSpotifyPlayback: vi.fn(), getSpotifyUser: vi.fn(), handleSpotifyCallback: vi.fn() }))
vi.mock('@/components/CreatorTools', () => ({ CreatorTools: ({ spotifyAccessToken, onSpotifyDisconnect, onSpotifyPlaybackChange }: { spotifyAccessToken: string | null; onSpotifyDisconnect: () => void; onSpotifyPlaybackChange?: (state: SpotifyPlaybackState | null) => void }) => createElement(MediaDisclosure, {
  id: 'spotify-controls', title: 'Spotify',
  children: createElement(SpotifyPlayer, { accessToken: spotifyAccessToken, onDisconnect: onSpotifyDisconnect, onPlaybackChange: onSpotifyPlaybackChange }),
}) }))
vi.mock('@/components/AudioVisualizer', () => ({ AudioVisualizer: () => null }))
vi.mock('@/components/FriskyDevIdentityGate', () => ({ FriskyDevIdentityGate: () => null }))
vi.mock('@/components/RoomPanel', () => ({ RoomPanel: () => null }))
vi.mock('@/components/CameraSetupWizard', () => ({ CameraSetupWizard: () => null }))
vi.mock('@/components/DeviceSelector', () => ({ DeviceSelector: () => null }))
vi.mock('@/components/PlatformAccess', () => ({ PlatformAccess: () => null }))
vi.mock('@/components/TelegramVcPanel', () => ({ TelegramVcPanel: () => null }))
vi.mock('@/components/DJModePanel', () => ({ DJModePanel: () => null }))
vi.mock('@/components/NodeOperationsBoard', () => ({ NodeOperationsBoard: () => null }))
vi.mock('@/components/BrandControl', () => ({ BrandControl: () => null }))
vi.mock('@/components/wow/ParticleField', () => ({ ParticleField: () => null }))
vi.mock('@/components/wow/AnimatedGradient', () => ({ AnimatedGradient: () => null }))
vi.mock('@/components/wow/HudFrame', () => ({ HudFrame: ({ children }: { children: React.ReactNode }) => createElement('div', {}, children) }))

const device = { id: 'studio-device', name: 'Studio Mac', is_active: true, is_restricted: false, supports_volume: true, volume_percent: 35 }
const playing = { id: 'playing-a', uri: 'spotify:track:playing-a', name: 'Song A actually playing', artists: [{ name: 'Artist A' }], album: { name: 'Album A', images: [{ url: 'https://i.scdn.co/playing.jpg' }] }, duration_ms: 180_000 }
const selected = { ...playing, id: 'selected-b', name: 'Song B only selected', uri: 'spotify:track:selected-b' }
let container: HTMLDivElement
let root: Root
const scrollIntoView = vi.fn()
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network call in Spotify regression')))
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
    clear: () => stored.clear(),
  })
  window.localStorage.setItem('stix-vc-node:input-protocol', JSON.stringify('dj-mode'))
  window.localStorage.setItem('stix-vc-node:session-status', JSON.stringify('dj-mode'))
  window.localStorage.setItem('stix-vc-node:dj-audio-source', JSON.stringify('spotify'))
  window.localStorage.setItem('stix-vc-node:spotify-track', JSON.stringify(selected))
  vi.mocked(getSpotifyDevices).mockResolvedValue([device])
  vi.mocked(getSpotifyPlayback).mockResolvedValue({ device, item: playing, is_playing: true, progress_ms: 20_000 })
  vi.mocked(handleSpotifyCallback).mockResolvedValue({ accessToken: 'test-access', refreshToken: 'test-refresh', expiresIn: 3600 })
  vi.mocked(getSpotifyUser).mockResolvedValue({ id: 'test-person', display_name: 'Test person', email: 'test@example.com', images: [] })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('opens Spotify from the shortcut and preserves confirmed playback while its controls collapse and reopen', async () => {
  await act(async () => root.render(createElement(App)))
  sessionStorage.setItem('spotify_auth_state', 'test-state')
  sessionStorage.setItem('spotify_code_verifier', 'test-verifier')
  await act(async () => window.dispatchEvent(new MessageEvent('message', {
    origin: window.location.origin,
    data: { type: 'spotify-auth-code', code: 'test-code', state: 'test-state' },
  })))
  expect(container.querySelectorAll('.spotify-player')).toHaveLength(1)
  expect(container.querySelector('.spotify-player__track h3')?.textContent).toBe(playing.name)
  expect(container.textContent).not.toContain(selected.name)
  expect(container.textContent).not.toContain('DJ Mode will use your selected Spotify track')
  const link = Array.from(container.querySelectorAll('a')).find(anchor => anchor.textContent === 'Open Spotify controls')!
  expect(link.getAttribute('href')).toBe('#spotify-controls')
  const target = container.querySelector<HTMLDetailsElement>('#spotify-controls')!
  const summary = target.querySelector('summary')!
  const player = container.querySelector('.spotify-player')!
  expect(target.contains(player)).toBe(true)
  expect(target.open).toBe(false)
  await act(async () => link.click())
  expect(target.open).toBe(true)
  expect(document.activeElement).toBe(summary)
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' })

  await act(async () => summary.click())
  expect(target.open).toBe(false)
  const nextTrack = { ...playing, id: 'playing-c', uri: 'spotify:track:playing-c', name: 'Song C confirmed while hidden' }
  vi.mocked(getSpotifyPlayback).mockResolvedValue({ device, item: nextTrack, is_playing: true, progress_ms: 1_000 })
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
  expect(target.open).toBe(false)
  expect(container.querySelector('.spotify-player')).toBe(player)
  await act(async () => link.click())
  expect(target.open).toBe(true)
  expect(document.activeElement).toBe(summary)
  expect(container.querySelector('.spotify-player__track h3')?.textContent).toBe(nextTrack.name)
  expect(container.querySelector('button[aria-label="Pause Spotify"]')).not.toBeNull()
  expect(getSpotifyDevices).toHaveBeenCalledTimes(1)
  expect(getSpotifyPlayback).toHaveBeenCalledTimes(2)
})
