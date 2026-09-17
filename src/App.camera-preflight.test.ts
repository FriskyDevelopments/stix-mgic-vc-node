import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { RoomPanel } from '@/components/RoomPanel'
import { CameraSetupWizard, type CameraSetupSelection } from '@/components/CameraSetupWizard'
import { getSessionApi } from '@/lib/session-api'
import { CameraReadyPreview } from '@/components/CameraReadyPreview'

// Keep the real App state, device preferences, preview and entry controls. Isolate
// unrelated provider/canvas panels and the two already-tested media boundaries.
vi.mock('@/lib/session-api', () => ({ getSessionApi: vi.fn(() => ({ startSession: vi.fn() })) }))
vi.mock('@/components/CameraReadyPreview', () => ({ CameraReadyPreview: vi.fn(() => null) }))
vi.mock('@/lib/env', () => ({ getAppEnv: () => ({ demoMode: false, operatorTier: 'free', isLiveApiConfigured: true, authRequired: true }) }))
vi.mock('@/lib/public-config', () => ({ usePublicConfig: () => null }))
vi.mock('@/components/FriskyDevIdentityGate', () => ({ FriskyDevIdentityGate: ({ onChange }: { onChange: (identity: unknown) => void }) => createElement('button', { onClick: () => onChange({ id: 'person-a', name: 'Frisky' }) }, 'Test sign in') }))
vi.mock('@/components/RoomPanel', () => ({ RoomPanel: vi.fn(() => createElement('div', { 'data-testid': 'mounted-room' })) }))
vi.mock('@/components/CameraSetupWizard', () => ({ CameraSetupWizard: vi.fn(({ onComplete }: { onComplete: (selection: CameraSetupSelection) => void }) => createElement('button', { onClick: () => onComplete(selection) }, 'Finish mocked device checks')) }))
vi.mock('@/components/PreviewPanel', () => ({ PreviewPanel: () => null }))
vi.mock('@/components/DeviceSelector', () => ({ DeviceSelector: () => null }))
vi.mock('@/components/PlatformAccess', () => ({ PlatformAccess: () => null }))
vi.mock('@/components/TelegramVcPanel', () => ({ TelegramVcPanel: () => null }))
vi.mock('@/components/DJModePanel', () => ({ DJModePanel: ({ onOutputStream }: { onOutputStream: (stream: MediaStream | null) => void }) => createElement('div', {}, createElement('button', { onClick: () => onOutputStream(studioSelection) }, 'Prepare mocked video'), createElement('button', { onClick: () => onOutputStream(null) }, 'Stop mocked video')) }))
vi.mock('@/components/CreatorTools', () => ({ CreatorTools: ({ onScreenStream }: { onScreenStream: (stream: MediaStream | null) => void }) => createElement('button', { onClick: () => onScreenStream(screenSelection) }, 'Prepare mocked screen') }))
vi.mock('@/components/StudioMonitor', () => ({ StudioMonitor: vi.fn(({ onShare, onClear }: { onShare: () => void; onClear: () => void }) => createElement('div', {}, createElement('button', { onClick: onShare }, 'Share selected preview'), createElement('button', { onClick: onClear }, 'Clear selected output'))) }))
vi.mock('@/components/NodeOperationsBoard', () => ({ NodeOperationsBoard: () => null }))
vi.mock('@/components/BrandControl', () => ({ BrandControl: () => null }))
vi.mock('@/components/SpotifyTrackPicker', () => ({ SpotifyTrackPicker: () => null }))
vi.mock('@/components/wow/ParticleField', () => ({ ParticleField: () => null }))
vi.mock('@/components/wow/AnimatedGradient', () => ({ AnimatedGradient: () => null }))
vi.mock('@/components/wow/HudFrame', () => ({ HudFrame: ({ children }: { children: React.ReactNode }) => createElement('div', {}, children) }))

let container: HTMLDivElement
let root: Root
let selection: CameraSetupSelection
let screenSelection: MediaStream
let studioSelection: MediaStream
let videoTrack: { enabled: boolean; stop: ReturnType<typeof vi.fn> }
let audioTrack: { enabled: boolean; stop: ReturnType<typeof vi.fn> }
const getUserMedia = vi.fn()
const button = (text: string) => Array.from(container.querySelectorAll('button')).find((node) => node.textContent === text)!
const latestRoomProps = () => vi.mocked(RoomPanel).mock.calls.slice(-1)[0]?.[0]
const roomStudioHeader = () => Array.from(container.querySelectorAll('h2')).find(node => node.textContent === 'Room studio')!.parentElement!.parentElement!
const click = (text: string) => act(async () => button(text).click())
const renderSignedIn = async () => {
  await act(async () => root.render(createElement(App)))
  await click('Test sign in')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network call in camera setup integration test')))
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
    clear: () => stored.clear(),
  })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  window.localStorage.clear()
  window.localStorage.setItem('stix-vc-node:input-protocol', JSON.stringify('virtual-camera'))
  window.history.replaceState(null, '', '/?room=invited-room')
  videoTrack = { enabled: true, stop: vi.fn(), readyState: 'live', muted: false, getSettings: () => ({ width: 1280, height: 720, frameRate: 30 }) } as typeof videoTrack
  audioTrack = { enabled: true, stop: vi.fn(), readyState: 'live', muted: false } as typeof audioTrack
  selection = {
    videoDeviceId: 'selected-camera', audioDeviceId: 'selected-microphone',
    stream: { getTracks: () => [videoTrack, audioTrack], getVideoTracks: () => [videoTrack], getAudioTracks: () => [audioTrack] } as unknown as MediaStream,
  }
  const source = () => { const track = Object.assign(new EventTarget(), { kind: 'video', readyState: 'live', enabled: true, stop: vi.fn() }); return { getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [] } as unknown as MediaStream }
  screenSelection = source()
  studioSelection = source()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
  Reflect.deleteProperty(navigator, 'mediaDevices')
  vi.unstubAllGlobals()
})

describe('Camera preflight', () => {
  it('checks the selected camera locally without platform auth, a session or joining the invited room', async () => {
    window.localStorage.setItem('stix-vc-node:platform', JSON.stringify('discord'))
    await renderSignedIn()
    await click('Set up camera & microphone')
    expect(roomStudioHeader().textContent).toContain('DEVICE SETUP')
    await click('Finish mocked device checks')
    const stream = selection.stream
    await act(async () => Array.from(container.querySelectorAll('button')).find(node => node.textContent?.includes('Run Preflight'))!.click())
    expect(container.textContent).toContain('Camera check passed. Microphone ready.')
    expect(roomStudioHeader().textContent).toContain('READY TO JOIN')
    expect(roomStudioHeader().textContent).not.toMatch(/LIVE|ACTIVE/)
    expect(getSessionApi).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(RoomPanel).not.toHaveBeenCalled()
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(videoTrack.stop).not.toHaveBeenCalled()
    expect(audioTrack.stop).not.toHaveBeenCalled()
    expect(vi.mocked(CameraReadyPreview).mock.calls.slice(-1)[0][0].stream).toBe(stream)
    expect(window.location.search).toBe('?room=invited-room')
  })

  it('shows an ended camera error and allows retry without calling Stop or starting a session', async () => {
    await renderSignedIn()
    await click('Set up camera & microphone')
    await click('Finish mocked device checks')
    Object.assign(videoTrack, { readyState: 'ended' })
    await act(async () => Array.from(container.querySelectorAll('button')).find(node => node.textContent?.includes('Run Preflight'))!.click())
    expect(container.querySelector('[role="alert"]')?.textContent).toBeTruthy()
    expect(roomStudioHeader().textContent).toContain('CHECK CAMERA')
    const retry = Array.from(container.querySelectorAll('button')).find(node => node.textContent?.includes('Retry preflight'))!
    expect(retry).toBeDefined()
    Object.assign(videoTrack, { readyState: 'live' })
    await act(async () => retry.click())
    expect(container.textContent).toContain('Camera check passed.')
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(roomStudioHeader().textContent).toContain('READY TO JOIN')
    expect(getSessionApi).not.toHaveBeenCalled()
    expect(RoomPanel).not.toHaveBeenCalled()
    expect(videoTrack.stop).not.toHaveBeenCalled()
  })

  it('opens device setup when no camera has been prepared', async () => {
    await renderSignedIn()
    await act(async () => Array.from(container.querySelectorAll('button')).find(node => node.textContent?.includes('Run Preflight'))!.click())
    expect(CameraSetupWizard).toHaveBeenCalled()
    expect(getSessionApi).not.toHaveBeenCalled()
    expect(RoomPanel).not.toHaveBeenCalled()
  })

  it.each(['error', 'active'])('does not restore a saved %s session when Room studio opens', async (savedStatus) => {
    window.localStorage.setItem('stix-vc-node:session-status', JSON.stringify(savedStatus))
    window.localStorage.setItem('stix-vc-node:selected-video-device', JSON.stringify('saved-camera'))
    await renderSignedIn()
    expect(roomStudioHeader().textContent).toContain('NOT IN A ROOM')
    expect(roomStudioHeader().textContent).not.toMatch(/ERROR|LIVE|ACTIVE/)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(window.localStorage.getItem('stix-vc-node:session-status')).toBeNull()
    expect(window.localStorage.getItem('stix-vc-node:selected-video-device')).toBe(JSON.stringify('saved-camera'))
    expect(window.localStorage.getItem('stix-vc-node:input-protocol')).toBe(JSON.stringify('virtual-camera'))
    const preflight = Array.from(container.querySelectorAll('button')).find(node => node.textContent?.includes('Run Preflight'))!
    expect(preflight.disabled).toBe(false)
    expect(container.textContent).not.toContain('Retry preflight')
    expect(container.textContent).not.toContain('PREFLIGHT ACTIVE')
    expect(getSessionApi).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(RoomPanel).not.toHaveBeenCalled()
    expect(videoTrack.stop).not.toHaveBeenCalled()
    expect(audioTrack.stop).not.toHaveBeenCalled()
  })

  it('describes an opened room without claiming the call is live', async () => {
    await renderSignedIn()
    await click('Set up camera & microphone')
    await click('Finish mocked device checks')
    await click('Join invited room')
    await act(async () => latestRoomProps()?.onRoomChange?.('invited-room'))
    expect(roomStudioHeader().textContent).toContain('ROOM OPEN')
    expect(roomStudioHeader().textContent).not.toMatch(/LIVE|ACTIVE/)
    expect(getSessionApi).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('flags a stopped prepared output instead of continuing to claim readiness', async () => {
    await renderSignedIn()
    await click('Prepare mocked video')
    await click('Share selected preview')
    expect(roomStudioHeader().textContent).toContain('READY TO JOIN')
    await click('Stop mocked video')
    expect(roomStudioHeader().textContent).toContain('CHECK OUTPUT')
    expect(roomStudioHeader().textContent).not.toMatch(/LIVE|ACTIVE|READY TO JOIN/)
    expect(RoomPanel).not.toHaveBeenCalled()
    expect(getSessionApi).not.toHaveBeenCalled()
  })

  it('passes a camera-only stream with an accurate notice while staying in standby', async () => {
    selection = {
      ...selection,
      audioDeviceId: '',
      stream: { getTracks: () => [videoTrack], getVideoTracks: () => [videoTrack], getAudioTracks: () => [] } as unknown as MediaStream,
    }
    await renderSignedIn()
    await click('Set up camera & microphone')
    await click('Finish mocked device checks')
    await act(async () => Array.from(container.querySelectorAll('button')).find(node => node.textContent?.includes('Run Preflight'))!.click())
    expect(container.textContent).toContain('Camera check passed. Camera only; no active microphone. Join the room when you are ready.')
    expect(container.textContent).not.toContain('Microphone ready.')
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(window.localStorage.getItem('stix-vc-node:session-status')).toBeNull()
    expect(roomStudioHeader().textContent).toContain('READY TO JOIN')
    expect(container.textContent).not.toContain('PREFLIGHT ACTIVE')
    expect(vi.mocked(CameraReadyPreview).mock.calls.slice(-1)[0][0].stream).toBe(selection.stream)
    expect(getSessionApi).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(RoomPanel).not.toHaveBeenCalled()
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(videoTrack.stop).not.toHaveBeenCalled()
  })
})
