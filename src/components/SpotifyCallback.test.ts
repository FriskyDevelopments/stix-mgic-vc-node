import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SpotifyCallback } from './SpotifyCallback'
import { handleSpotifyCallback } from '@/lib/spotify'

vi.mock('@/lib/spotify', async original => ({ ...await original<typeof import('@/lib/spotify')>(), handleSpotifyCallback: vi.fn() }))
let host: HTMLDivElement
let root: Root
const postMessage = vi.fn()
const onAuthComplete = vi.fn()
const onAuthError = vi.fn()
const originalOpener = Object.getOwnPropertyDescriptor(window, 'opener')
const render = () => act(async () => root.render(createElement(StrictMode, {}, createElement(SpotifyCallback, { onAuthComplete, onAuthError }))))
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperty(window, 'opener', { configurable: true, value: { postMessage } })
  vi.spyOn(window, 'close').mockImplementation(() => {})
  sessionStorage.clear()
  window.history.replaceState(null, '', '/spotify-callback?code=test-code&state=test-state')
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove(); sessionStorage.clear(); window.history.replaceState(null, '', '/')
  if (originalOpener) Object.defineProperty(window, 'opener', originalOpener)
  else Reflect.deleteProperty(window, 'opener')
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})
it('hands the code and state to its exact-origin parent without copied popup storage or tokens', async () => {
  await render()
  expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'spotify-auth-code', code: 'test-code', state: 'test-state' }, window.location.origin)
  expect(handleSpotifyCallback).not.toHaveBeenCalled()
  expect(window.close).toHaveBeenCalledTimes(1)
  expect(onAuthError).not.toHaveBeenCalled()
})
it('reports popup denial to its parent before closing', async () => {
  window.history.replaceState(null, '', '/spotify-callback?error=access_denied&state=test-state')
  await render()
  expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'spotify-auth-error', state: 'test-state' }, window.location.origin)
  expect(window.close).toHaveBeenCalledTimes(1)
  expect(onAuthError).not.toHaveBeenCalled()
})
it('exchanges exactly once without an opener even when React repeats the effect', async () => {
  Object.defineProperty(window, 'opener', { configurable: true, value: null })
  vi.mocked(handleSpotifyCallback).mockResolvedValue({ accessToken: 'test-access', refreshToken: 'test-refresh', expiresIn: 3600 })
  await render()
  expect(handleSpotifyCallback).toHaveBeenCalledExactlyOnceWith('test-code', 'test-state')
  expect(onAuthComplete).toHaveBeenCalledExactlyOnceWith('test-access')
  expect(postMessage).not.toHaveBeenCalled()
})
it('handles a rejected local exchange and incomplete callbacks', async () => {
  Object.defineProperty(window, 'opener', { configurable: true, value: null })
  vi.mocked(handleSpotifyCallback).mockRejectedValue(new Error('Network unavailable'))
  await render()
  expect(onAuthError).toHaveBeenCalledTimes(1)
  expect(onAuthComplete).not.toHaveBeenCalled()
})
