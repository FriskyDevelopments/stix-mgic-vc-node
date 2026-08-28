import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetPublicConfigCache } from './public-config'
import { syncSessionOnLoad } from './supabase-identity'

describe('syncSessionOnLoad', () => {
  beforeEach(() => {
    resetPublicConfigCache()
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    resetPublicConfigCache()
  })

  it('reads the node OIDC session even when client-side Supabase is not configured', async () => {
    const identity = { id: 'fd_alice', name: 'Alice' }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: identity }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(syncSessionOnLoad()).resolves.toEqual(identity)
    expect(fetchMock).toHaveBeenCalledWith('/v1/auth/oidc/me', { credentials: 'same-origin' })
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/v1/auth/supabase/session'))).toBe(
      false,
    )
  })
})
