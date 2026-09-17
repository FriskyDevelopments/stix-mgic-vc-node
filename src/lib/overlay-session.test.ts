import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStarterPack } from './overlays'
import { clearOverlayOutput, OVERLAY_DRAFT_KEY, OVERLAY_OUTPUT_KEY, readOverlayDraft, readOverlayOutput, saveOverlayDraft, sendOverlayOutput, subscribeOverlayOutput } from './overlay-session'

describe('local overlay draft and output boundary', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear() })

  it('saves drafts without activating output and snapshots only an explicit scene send', () => {
    const pack = createStarterPack()
    saveOverlayDraft(pack)
    expect(readOverlayDraft()?.screens).toHaveLength(20)
    expect(readOverlayOutput()).toBeNull()
    sendOverlayOutput(pack, 'screen-02')
    pack.screens[1].title = 'Later draft'
    saveOverlayDraft(pack)
    expect(readOverlayOutput()?.pack.screens[1].title).toBe('Live Camera')
    expect(readOverlayOutput()?.screenId).toBe('screen-02')
    expect(readOverlayDraft()?.screens[1].title).toBe('Later draft')
  })

  it('rejects an invalid selected scene before changing output', () => {
    const pack = createStarterPack()
    sendOverlayOutput(pack, 'screen-01')
    expect(() => sendOverlayOutput(pack, 'missing')).toThrow('Choose a scene')
    expect(readOverlayOutput()?.screenId).toBe('screen-01')
  })

  it('treats malformed output as absent and preserves malformed draft for recovery', () => {
    window.localStorage.setItem(OVERLAY_OUTPUT_KEY, '{bad')
    window.localStorage.setItem(OVERLAY_DRAFT_KEY, '{bad')
    expect(readOverlayOutput()).toBeNull()
    expect(() => readOverlayDraft()).toThrow('saved draft')
    expect(window.localStorage.getItem(OVERLAY_DRAFT_KEY)).toBe('{bad')
  })

  it('notifies same-window and other-tab output changes and removes listeners', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeOverlayOutput(listener)
    sendOverlayOutput(createStarterPack(), 'screen-01')
    expect(listener).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new StorageEvent('storage', { key: OVERLAY_DRAFT_KEY }))
    expect(listener).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new StorageEvent('storage', { key: OVERLAY_OUTPUT_KEY }))
    expect(listener).toHaveBeenCalledTimes(2)
    clearOverlayOutput()
    expect(readOverlayOutput()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(3)
    unsubscribe()
    sendOverlayOutput(createStarterPack(), 'screen-01')
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('does not report or emit a sent output when storage rejects it', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeOverlayOutput(listener)
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Storage full', 'QuotaExceededError') })
    expect(() => sendOverlayOutput(createStarterPack(), 'screen-01')).toThrow('Storage full')
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('rejects an oversized valid output before replacing the current snapshot', () => {
    const pack = createStarterPack()
    sendOverlayOutput(pack, 'screen-01')
    for (const screen of pack.screens) screen.layers = Array.from({ length: 50 }, (_, i) => ({ id: `text-${i}`, type: 'text', text: 'x'.repeat(2000), bounds: { unit: 'px', x: 0, y: 0, width: 100, height: 100 }, color: 'paper', fontFamily: 'sans', fontSize: 12 }))
    // The pack itself fits; only the output envelope pushes it beyond the limit.
    let excess = JSON.stringify(pack).length - 1_999_999
    for (const screen of pack.screens) for (const layer of screen.layers) {
      if (layer.type === 'text' && excess > 0) {
        const removed = Math.min(excess, layer.text.length)
        layer.text = layer.text.slice(removed)
        excess -= removed
      }
    }
    expect(() => sendOverlayOutput(pack, 'screen-02')).toThrow('exceeds 2 MB')
    expect(readOverlayOutput()?.screenId).toBe('screen-01')
  })
})
