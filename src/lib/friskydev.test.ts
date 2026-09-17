import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFriskyDevMe } from './friskydev'
import { resetAppEnvCache } from './env'

describe('fetchFriskyDevMe', () => {
  beforeEach(() => {
    resetAppEnvCache()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
    resetAppEnvCache()
  })

  it('loads the account panel from the vc_session cookie when no bearer is stored', async () => {
    const account = { id: 'supabase-auth-users-id', email: null, displayName: 'Social Operator', createdAt: null }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ account, linked: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchFriskyDevMe()).resolves.toEqual({ account, linked: [] })
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/account/me',
      expect.objectContaining({ credentials: 'include' }),
    )
  })
})
