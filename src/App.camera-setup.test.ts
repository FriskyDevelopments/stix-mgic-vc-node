import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { RoomPanel } from '@/components/RoomPanel'
import { CameraSetupWizard, type CameraSetupSelection } from '@/components/CameraSetupWizard'
import { StudioMonitor } from '@/components/StudioMonitor'

// Keep the real App state, device preferences, preview and entry controls. Isolate
// unrelated provider/canvas panels and the two already-tested media boundaries.
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
  videoTrack = { enabled: true, stop: vi.fn() }
  audioTrack = { enabled: true, stop: vi.fn() }
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

describe('App camera setup and invitation entry', () => {
  it('keeps an invitation private until setup and a separate Join action, then hands off the exact tested stream', async () => {
    await renderSignedIn()
    expect(RoomPanel).not.toHaveBeenCalled()
    expect(CameraSetupWizard).not.toHaveBeenCalled()
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?room=invited-room')
    await click('Set up camera & microphone')
    expect(vi.mocked(CameraSetupWizard).mock.calls.slice(-1)[0]?.[0].autoStart).toBe(true)
    expect(RoomPanel).not.toHaveBeenCalled()
    await click('Finish mocked device checks')
    expect(RoomPanel).not.toHaveBeenCalled()
    expect(container.querySelector('video')?.srcObject).toBe(selection.stream)
    expect(window.localStorage.getItem('stix-vc-node:selected-video-device')).toBe(JSON.stringify('selected-camera'))
    expect(window.localStorage.getItem('stix-vc-node:selected-audio-device')).toBe(JSON.stringify('selected-microphone'))
    expect(videoTrack.stop).not.toHaveBeenCalled()
    expect(audioTrack.stop).not.toHaveBeenCalled()

    await click('Join invited room')
    expect(latestRoomProps()?.localStream).toBe(selection.stream)
    const roomProps = latestRoomProps()!
    await act(async () => roomProps.onRoomChange?.('invited-room'))
    expect(button('Change camera & microphone').disabled).toBe(true)
    expect(button('Stop preview')).toBeUndefined()
    await click('Change camera & microphone')
    expect(videoTrack.stop).not.toHaveBeenCalled()
    expect(audioTrack.stop).not.toHaveBeenCalled()
    expect(getUserMedia).not.toHaveBeenCalled()

    await act(async () => root.render(null))
    expect(videoTrack.stop).toHaveBeenCalledOnce()
    expect(audioTrack.stop).toHaveBeenCalledOnce()
  })

  it('mounts a receive-only invitation only after the user explicitly chooses it', async () => {
    await renderSignedIn()
    expect(RoomPanel).not.toHaveBeenCalled()
    await click('Join without camera & microphone')
    expect(latestRoomProps()?.localStream).toBeNull()
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?room=invited-room')
  })

  it('keeps a screen preview separate from the camera already in the room until the explicit switch is confirmed', async () => {
    await renderSignedIn()
    await click('Set up camera & microphone')
    await click('Finish mocked device checks')
    await click('Join invited room')
    await act(async () => latestRoomProps()?.onRoomChange?.('invited-room'))
    await act(async () => latestRoomProps()?.onLocalStreamChange?.({ status: 'applied', stream: selection.stream }))
    await click('Prepare mocked screen')
    expect(latestRoomProps()?.localStream).toBe(selection.stream)
    expect(vi.mocked(StudioMonitor).mock.calls.slice(-1)[0][0].programStream).toBe(selection.stream)
    await click('Share selected preview')
    expect(latestRoomProps()?.localStream).toBe(screenSelection)
    expect(vi.mocked(StudioMonitor).mock.calls.slice(-1)[0][0].programStream).toBe(selection.stream)
    expect(vi.mocked(StudioMonitor).mock.calls.slice(-1)[0][0].pending).toBe(true)
    await act(async () => latestRoomProps()?.onLocalStreamChange?.({ status: 'applied', stream: screenSelection }))
    expect(vi.mocked(StudioMonitor).mock.calls.slice(-1)[0][0].programStream).toBe(screenSelection)
    expect(videoTrack.stop).not.toHaveBeenCalled()
  })

  it('sends a prepared video from a receive-only room only after Share, and detaches it when the video source stops', async () => {
    await renderSignedIn()
    await click('Join without camera & microphone')
    await act(async () => latestRoomProps()?.onRoomChange?.('invited-room'))
    await act(async () => latestRoomProps()?.onLocalStreamChange?.({ status: 'applied', stream: null }))
    await click('Prepare mocked video')
    expect(latestRoomProps()?.localStream).toBeNull()
    await click('Share selected preview')
    expect(latestRoomProps()?.localStream).toBe(studioSelection)
    await act(async () => latestRoomProps()?.onLocalStreamChange?.({ status: 'applied', stream: studioSelection }))
    expect(vi.mocked(StudioMonitor).mock.calls.slice(-1)[0][0].programId).toBe('studio')
    await click('Stop mocked video')
    expect(latestRoomProps()?.localStream).toBeNull()
    expect(vi.mocked(StudioMonitor).mock.calls.slice(-1)[0][0].programId).toBeNull()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

})
