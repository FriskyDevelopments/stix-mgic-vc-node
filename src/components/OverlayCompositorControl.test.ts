import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverlayCompositorControl } from './OverlayCompositorControl'
import { createStarterPack } from '@/lib/overlays'
import { clearOverlayOutput, sendOverlayOutput } from '@/lib/overlay-session'

afterEach(() => { window.localStorage.clear(); vi.unstubAllGlobals() })

describe('compositor overlay opt-in', () => {
  it('keeps sent scenes inactive until selected and follows later explicit sends', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const pack = createStarterPack()
    sendOverlayOutput(pack, 'screen-01')
    const div = document.createElement('div')
    const root = createRoot(div)
    const onSelect = vi.fn()
    await act(async () => root.render(createElement(OverlayCompositorControl, { onSelect })))
    expect(onSelect).not.toHaveBeenCalled()
    const checkbox = div.querySelector('input')!
    await act(async () => checkbox.click())
    expect(onSelect.mock.calls.slice(-1)[0][0].screenId).toBe('screen-01')
    await act(async () => sendOverlayOutput(pack, 'screen-13'))
    expect(onSelect.mock.calls.slice(-1)[0][0].screenId).toBe('screen-13')
    await act(async () => clearOverlayOutput())
    expect(onSelect).toHaveBeenLastCalledWith(null)
    await act(async () => checkbox.click())
    onSelect.mockClear()
    await act(async () => sendOverlayOutput(pack, 'screen-20'))
    expect(onSelect).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })
})
