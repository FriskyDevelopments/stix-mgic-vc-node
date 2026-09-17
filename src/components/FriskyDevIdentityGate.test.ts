import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FriskyDevIdentityGate } from './FriskyDevIdentityGate'
import { signOut, syncSessionOnLoad } from '@/lib/supabase-identity'

vi.mock('@/lib/supabase-identity', () => ({
  PROVIDER_LABELS: { 'custom:friskydev': 'FriskyDev' },
  getIdentityConfigState: () => ({ configured: true, missing: [] }),
  signInWithProvider: vi.fn(),
  signOut: vi.fn(),
  syncSessionOnLoad: vi.fn(),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.mocked(syncSessionOnLoad).mockReset()
  vi.mocked(signOut).mockReset().mockResolvedValue(undefined)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('identity gate session lifecycle', () => {
  it('checks the session once while parent controls re-render with new callbacks', async () => {
    vi.mocked(syncSessionOnLoad).mockResolvedValue(null)
    await act(async () => root.render(createElement(FriskyDevIdentityGate, { onChange: () => {} })))
    await act(async () => root.render(createElement(FriskyDevIdentityGate, { onChange: () => {} })))
    await act(async () => root.render(createElement(FriskyDevIdentityGate, { onChange: () => {} })))
    expect(syncSessionOnLoad).toHaveBeenCalledTimes(1)
  })

  it('delivers a pending identity check to the latest parent callback', async () => {
    const identity = { id: 'operator', name: 'Operator' }
    let finish!: (value: typeof identity) => void
    vi.mocked(syncSessionOnLoad).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const first = vi.fn()
    const latest = vi.fn()
    await act(async () => root.render(createElement(FriskyDevIdentityGate, { onChange: first })))
    await act(async () => root.render(createElement(FriskyDevIdentityGate, { onChange: latest })))
    await act(async () => finish(identity))
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledExactlyOnceWith(identity)
    expect(syncSessionOnLoad).toHaveBeenCalledTimes(1)
  })

  it('does not restore the gate from a late session check after unmount', async () => {
    let finish!: (value: { id: string; name: string }) => void
    vi.mocked(syncSessionOnLoad).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const onChange = vi.fn()
    await act(async () => root.render(createElement(FriskyDevIdentityGate, { onChange })))
    await act(async () => root.render(null))
    await act(async () => finish({ id: 'operator', name: 'Operator' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
