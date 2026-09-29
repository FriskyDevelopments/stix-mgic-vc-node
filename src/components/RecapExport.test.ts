import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecapExport } from './RecapExport'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('RecapExport', () => {
  let container: HTMLDivElement
  let root: Root
  const recap = { room: 'Friday set' }
  const render = (roomId: string | null = 'room-1') =>
    act(async () => root.render(createElement(RecapExport, { roomId, buildRecap: () => recap })))

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const button = (label: string) =>
    Array.from(container.querySelectorAll('button')).find(b => b.textContent === label)!
  const input = (label: string) =>
    container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement

  it('offers the three cloud providers and the Apple-device path', async () => {
    await render()
    expect(container.textContent).toContain('Google Drive')
    expect(container.textContent).toContain('OneDrive')
    expect(container.textContent).toContain('Dropbox')
    expect(container.textContent).toContain('iCloud has no upload API')
  })

  it('posts the recap with the one-time token, then clears the token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ provider: 'google-drive', fileId: 'f1', filename: 'friday.json', bytes: 42 }),
    } as Response)
    await render()
    await act(async () => {
      input('Provider access token').focus()
      // React controlled input: set native value then dispatch.
      const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      native.call(input('Provider access token'), 'ya.one-time')
      input('Provider access token').dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button('Export recap').click())
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/v1/recap/export')
    const body = JSON.parse(String(init.body))
    expect(body.provider).toBe('google-drive')
    expect(body.accessToken).toBe('ya.one-time')
    expect(body.recap).toEqual(recap)
    expect(input('Provider access token').value).toBe('')
    expect(container.textContent).toContain('friday.json')
  })

  it('refuses to export with no room and no recap', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await act(async () => root.render(createElement(RecapExport, { roomId: null, buildRecap: () => null })))
    await act(async () => button('Export recap').click())
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('switches provider before exporting', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ provider: 'dropbox', fileId: 'd1', filename: 'r.json', bytes: 2 }),
    } as Response)
    await render()
    await act(async () => button('Dropbox').click())
    await act(async () => {
      const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      native.call(input('Provider access token'), 'dbx.tok')
      input('Provider access token').dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button('Export recap').click())
    const body = JSON.parse(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body))
    expect(body.provider).toBe('dropbox')
  })
})
