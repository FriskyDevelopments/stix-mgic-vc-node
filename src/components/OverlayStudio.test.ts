import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OverlayStudio } from './OverlayStudio'
import { readOverlayDraft, readOverlayOutput } from '@/lib/overlay-session'

vi.mock('@/lib/overlays', async original => ({ ...await original<object>(), drawOverlayScreen: vi.fn() }))

describe('Overlay Studio draft-to-output workflow', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    window.localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  const button = (label: string) => Array.from(container.querySelectorAll('button')).find(item => item.textContent?.trim() === label)!
  const click = async (label: string) => { await act(async () => button(label).click()) }
  const render = async () => { await act(async () => root.render(createElement(OverlayStudio))) }

  it('opens twenty blank scenes without acquiring media or sending output', async () => {
    await render()
    expect(container.querySelectorAll('.overlay-studio__scene')).toHaveLength(20)
    expect(container.querySelectorAll('video,audio,iframe')).toHaveLength(0)
    expect(readOverlayOutput()).toBeNull()
    expect(readOverlayDraft()).toBeNull()
    expect(container.textContent).toContain('No layers yet.')
  })

  it('keeps scene selection and draft edits separate from the sent output', async () => {
    await render()
    await act(async () => container.querySelectorAll<HTMLButtonElement>('.overlay-studio__scene')[1].click())
    await click('Send to output')
    expect(readOverlayOutput()?.screenId).toBe('screen-02')
    expect(readOverlayOutput()?.pack.screens[1].layers).toHaveLength(0)
    await click('Text')
    expect(readOverlayDraft()?.screens[1].layers).toHaveLength(1)
    expect(readOverlayOutput()?.pack.screens[1].layers).toHaveLength(0)
    await click('Send to output')
    expect(readOverlayOutput()?.pack.screens[1].layers).toHaveLength(1)
    await click('Undo')
    expect(readOverlayDraft()?.screens[1].layers).toHaveLength(0)
    expect(readOverlayOutput()?.pack.screens[1].layers).toHaveLength(1)
    await click('Clear output')
    expect(readOverlayOutput()).toBeNull()
  })

  it('can hide and remove authored graphics without losing the empty scene', async () => {
    await render()
    await click('Panel')
    await click('Hide')
    expect(readOverlayDraft()?.screens[0].layers[0].visible).toBe(false)
    await click('Remove layer')
    expect(readOverlayDraft()?.screens[0].layers).toHaveLength(0)
    expect(readOverlayDraft()?.screens).toHaveLength(20)
  })

  it('rejects unsafe imports without replacing a saved draft or output', async () => {
    await render()
    await click('Text')
    await click('Send to output')
    const original = readOverlayOutput()
    const file = new File(['{}'], 'bad.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify({ ...readOverlayDraft(), scripts: ['bad'] }) })
    const input = container.querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    expect(container.querySelector('[role=status]')?.textContent).toContain('Unrecognized key')
    expect(readOverlayOutput()).toEqual(original)
    expect(readOverlayDraft()?.screens[0].layers).toHaveLength(1)
  })
})
