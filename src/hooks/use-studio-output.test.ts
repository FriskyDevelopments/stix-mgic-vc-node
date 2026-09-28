import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStudioOutput, type StudioSourceId } from './use-studio-output'

function media() {
  const track = Object.assign(new EventTarget(), { kind: 'video', readyState: 'live', enabled: true, stop: vi.fn() })
  const stream = { getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [] } as unknown as MediaStream
  return { stream, track }
}
let host: HTMLDivElement
let root: Root
let camera: ReturnType<typeof media>
let screen: ReturnType<typeof media>
let sources: Array<{ id: StudioSourceId; stream: MediaStream | null }>
let room: string | null
let output: ReturnType<typeof useStudioOutput>
function Harness() { output = useStudioOutput(sources, room); return null }
const render = () => act(async () => root.render(createElement(Harness)))

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  camera = media(); screen = media()
  sources = [{ id: 'camera', stream: camera.stream }, { id: 'screen', stream: screen.stream }, { id: 'studio', stream: null }]
  room = null
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })

describe('studio output consent and confirmation', () => {
  it('prepares the exact confirmed camera without a room, then waits for actual join acknowledgement', async () => {
    await render()
    expect(output.requested).toBeNull()
    await act(async () => output.prepareCamera(camera.stream))
    expect(output.applied?.stream).toBe(camera.stream)
    room = 'room-a'; await render()
    expect(output.requested?.stream).toBe(camera.stream)
    expect(output.applied).toBeNull()
    expect(output.pending).toBe(true)
    await act(async () => output.onChange({ status: 'applied', stream: camera.stream }))
    expect(output.applied?.id).toBe('camera')
    expect(output.pending).toBe(false)
    expect(camera.track.stop).not.toHaveBeenCalled()
  })

  it('keeps room camera confirmed until explicit screen selection succeeds and ignores stale acknowledgements', async () => {
    await render()
    await act(async () => output.prepareCamera(camera.stream))
    room = 'room-a'; await render()
    await act(async () => output.onChange({ status: 'applied', stream: camera.stream }))
    await act(async () => output.select('screen'))
    expect(output.requested?.stream).toBe(screen.stream)
    expect(output.applied?.stream).toBe(camera.stream)
    await act(async () => output.onChange({ status: 'applied', stream: camera.stream }))
    expect(output.pending).toBe(true)
    await act(async () => output.onChange({ status: 'applied', stream: screen.stream }))
    expect(output.applied?.stream).toBe(screen.stream)
  })

  it('restores the confirmed choice after a failed switch and supports an explicit retry', async () => {
    await render()
    await act(async () => output.prepareCamera(camera.stream))
    room = 'room-a'; await render()
    await act(async () => output.onChange({ status: 'applied', stream: camera.stream }))
    await act(async () => output.select('screen'))
    await act(async () => output.onChange({ status: 'failed', stream: screen.stream, error: 'Source could not switch' }))
    expect(output.requested?.stream).toBe(camera.stream)
    expect(output.applied?.stream).toBe(camera.stream)
    expect(output.error).toContain('could not switch')
    await act(async () => output.select('screen'))
    expect(output.error).toBeNull()
    expect(output.pending).toBe(true)
  })

  it('invalidates output when the same source ID is replaced without silently sharing the new stream', async () => {
    await render()
    await act(async () => output.select('screen'))
    const replacement = media()
    sources = sources.map(source => source.id === 'screen' ? { ...source, stream: replacement.stream } : source)
    await render()
    expect(output.requested).toBeNull()
    expect(output.applied).toBeNull()
    expect(output.error).toContain('source stopped')
    expect(screen.track.stop).not.toHaveBeenCalled()
    expect(replacement.track.stop).not.toHaveBeenCalled()
  })

  it('detaches ended video without switching to another available source', async () => {
    await render()
    await act(async () => output.select('screen'))
    await act(async () => { screen.track.readyState = 'ended'; screen.track.dispatchEvent(new Event('ended')) })
    expect(output.requested).toBeNull()
    expect(output.applied).toBeNull()
    expect(output.error).toContain('source ended')
    expect(camera.track.stop).not.toHaveBeenCalled()
  })

  it('does not select an unavailable compositor or mutate caller tracks when clearing', async () => {
    await render()
    await act(async () => output.select('studio'))
    expect(output.requested).toBeNull()
    expect(output.error).toContain('not ready')
    await act(async () => output.select('camera'))
    await act(async () => output.clear())
    expect(output.applied).toBeNull()
    expect(camera.track.stop).not.toHaveBeenCalled()
  })
})
