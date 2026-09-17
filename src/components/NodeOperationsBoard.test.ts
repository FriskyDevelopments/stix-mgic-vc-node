import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NodeOperationsBoard } from './NodeOperationsBoard'

vi.mock('@/lib/api-client', () => ({ apiUrl: (path: string) => `https://node.example.test${path}` }))

const health = {
  ok: true,
  discordConfigured: true,
  discordInteractionsConfigured: true,
  discordBotConfigured: true,
  supabaseIdentityConfigured: true,
}
const media = { adapters: [{ id: 'webrtc', state: 'ready', reason: 'Signaling and relay configured' }] }
const healthyResponse = (url: string) => Promise.resolve({ ok: true, json: async () => url.endsWith('/healthz') ? health : media })

describe('NodeOperationsBoard telemetry', () => {
  let container: HTMLDivElement
  let root: Root | null
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    fetchMock = vi.fn().mockImplementation(healthyResponse)
    vi.stubGlobal('fetch', fetchMock)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    container.remove()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const status = () => container.querySelector('[role="status"]')?.textContent
  const render = async () => { await act(async () => { root?.render(createElement(NodeOperationsBoard)) }) }
  const advance = async (milliseconds: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) }) }
  const expectUnknown = () => {
    expect(status()).toBe('UNREACHABLE')
    expect(container.querySelectorAll('.is-ready')).toHaveLength(0)
    expect(container.textContent).not.toContain('LIVE TELEMETRY')
    expect(container.textContent).not.toContain('CREDENTIALS REQUIRED')
    expect(container.textContent).not.toContain('CONFIGURATION REQUIRED')
    expect(container.textContent).toContain('UNKNOWN')
  }

  it('shows checking without claiming missing credentials before responses arrive', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    await render()

    expect(status()).toBe('CHECKING')
    expect(container.textContent).not.toContain('REQUIRED')
    expect(container.querySelectorAll('.is-ready')).toHaveLength(0)
  })

  it('uses the API base and clears stale ready states after an outage, then recovers on the next poll', async () => {
    await render()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://node.example.test/healthz', 'https://node.example.test/v1/media/status',
    ])
    expect(status()).toBe('LIVE TELEMETRY')
    expect(container.textContent).toContain('FRISKYDEV SIGN-IN')
    expect(container.textContent).not.toContain('GOOGLE · APPLE · MICROSOFT')
    expect(container.querySelectorAll('.is-ready').length).toBeGreaterThan(0)

    fetchMock.mockRejectedValue(new Error('network unavailable'))
    await advance(15_000)
    expectUnknown()

    fetchMock.mockImplementation(healthyResponse)
    await advance(15_000)
    expect(status()).toBe('LIVE TELEMETRY')
    expect(container.textContent).toContain('READY')
  })

  it.each(['/healthz', '/v1/media/status'])('rejects non-OK responses from %s even with healthy JSON', async (failedPath) => {
    fetchMock.mockImplementation(async (url: string) => ({
      ...(await healthyResponse(url)), ok: !url.endsWith(failedPath),
    }))
    await render()
    expectUnknown()
  })

  it.each([
    { health: { ...health, ok: false }, media },
    { health: { ok: true }, media },
    { health, media: { adapters: [null] } },
  ])('treats unsuccessful or malformed telemetry as unknown ($health.ok)', async (payload) => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true, json: async () => url.endsWith('/healthz') ? payload.health : payload.media,
    }))
    await render()
    expectUnknown()
  })

  it('reports absent credentials only after the node confirms they are absent', async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/healthz')
        ? { ...health, supabaseIdentityConfigured: false, discordBotConfigured: false }
        : media,
    }))
    await render()
    expect(status()).toBe('LIVE TELEMETRY')
    expect(container.textContent).toContain('CONFIGURATION REQUIRED')
    expect(container.textContent).toContain('CREDENTIALS REQUIRED')
  })

  it('bounds hung requests, aborts both fetches, and retries on schedule', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    await render()
    const signals = fetchMock.mock.calls.map(([, options]) => options.signal as AbortSignal)
    await advance(8_000)
    expectUnknown()
    expect(signals.every((signal) => signal.aborted)).toBe(true)

    fetchMock.mockImplementation(healthyResponse)
    await advance(7_000)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(status()).toBe('LIVE TELEMETRY')
  })

  it('aborts in-flight fetches and stops polling when unmounted', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    await render()
    const signals = fetchMock.mock.calls.map(([, options]) => options.signal as AbortSignal)
    await act(async () => { root?.unmount(); root = null })
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    await advance(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
