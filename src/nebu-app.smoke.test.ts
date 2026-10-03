import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Root } from 'react-dom/client'

const mocks = vi.hoisted(() => ({
  social: vi.fn(),
  createAuthClient: vi.fn(),
  root: null as Root | null,
}))

vi.mock('better-auth/client', () => ({
  createAuthClient: mocks.createAuthClient.mockImplementation(() => ({
    signIn: { social: mocks.social },
  })),
}))
vi.mock('react-dom/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-dom/client')>()
  return {
    ...original,
    createRoot: (container: Element) => {
      mocks.root = original.createRoot(container)
      return mocks.root
    },
  }
})
vi.mock('./App', () => ({ default: () => null }))
vi.mock('./components/NebuStudio', () => ({ NebuStudio: () => null }))
vi.mock('./components/DiscordCallback', () => ({ DiscordCallback: () => null }))
vi.mock('./components/SpotifyCallback', () => ({ SpotifyCallback: () => null }))
vi.mock('./ErrorFallback', () => ({ ErrorFallback: () => null }))
vi.mock('sonner', () => ({ Toaster: () => null }))
vi.mock('./lib/analytics', () => ({
  initAnalytics: vi.fn(),
  getAnalyticsClient: () => null,
  isAnalyticsEnabled: () => false,
}))
vi.mock('./lib/public-config', () => ({
  fetchPublicConfig: vi.fn(),
  getCachedPublicConfig: () => ({
    nebuBetterAuthConfigured: true,
    nebuSocialProviders: ['apple', 'google'],
  }),
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.social.mockResolvedValue({ error: { message: 'Mock provider; no redirect' } })
  document.body.innerHTML = '<div id="root"></div>'
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden in NEBU smoke tests') }))
})

afterEach(async () => {
  await act(async () => mocks.root?.unmount())
  mocks.root = null
  document.body.innerHTML = ''
  window.history.replaceState({}, '', '/')
  vi.unstubAllGlobals()
})

async function openRoute(path: string) {
  window.history.replaceState({}, '', path)
  await act(async () => { await import('./main') })
}

describe('NEBU SPA route smoke (local non-NEBU host)', () => {
  it.each(['apple', 'google'])('/login renders and signs in with %s through Better Auth', async (provider) => {
    await openRoute('/login')
    expect(mocks.createAuthClient).toHaveBeenCalledWith({ basePath: '/api/auth' })
    for (const label of ['Continue with Apple', 'Continue with Google']) {
      expect(document.body.textContent).toContain(label)
    }
    const label = provider === 'apple' ? 'Continue with Apple' : 'Continue with Google'
    const button = Array.from(document.querySelectorAll('button')).find(node => node.textContent?.includes(label))
    expect(button).toBeDefined()
    expect(button!.disabled).toBe(false)
    await act(async () => button!.click())
    expect(mocks.social).toHaveBeenCalledExactlyOnceWith({ provider, callbackURL: '/' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['/units/ashy', '/units/ashy/'])('%s renders the Ashy walkthrough', async (path) => {
    await openRoute(path)
    expect(document.body.textContent).toContain('Ashy')
    expect(document.body.textContent).toContain('Ashy’s practice path.')
    for (const pipe of ['Local preview', 'Room output', 'Telegram dens']) {
      expect(document.body.textContent).toContain(pipe)
    }
    expect(document.querySelector('a[href="/units/ashy"]')).not.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  // The earlier Studio host predicate shadows these declared routes on nebu.quest.
  it.todo('/login on nebu.quest renders Better Auth Apple and Google login, not Studio')
  it.todo('/units/ashy on nebu.quest renders the walkthrough, not Studio')
})
