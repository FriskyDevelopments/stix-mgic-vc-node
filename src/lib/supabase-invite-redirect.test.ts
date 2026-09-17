import { afterEach, describe, expect, it, vi } from 'vitest'
import { PROVIDER_LABELS, signInWithProvider, type OAuthProvider } from './supabase-identity'

const { authorize } = vi.hoisted(() => ({ authorize: vi.fn().mockResolvedValue({ error: null }) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signInWithOAuth: authorize } }) }))
vi.mock('@/lib/public-config', () => ({
  getCachedPublicConfig: () => ({ supabaseUrl: 'https://identity.example', supabasePublishableKey: 'public-test-config' }),
}))

afterEach(() => {
  window.history.replaceState(null, '', '/')
  authorize.mockClear()
})

describe('sign-in from an invitation', () => {
  it('sends the original room destination to the identity provider', async () => {
    window.history.replaceState(null, '', '/?room=room-123&code=old-code')
    const provider = Object.keys(PROVIDER_LABELS)[0] as OAuthProvider
    await signInWithProvider(provider)
    expect(authorize).toHaveBeenCalledExactlyOnceWith({
      provider,
      options: { redirectTo: `${window.location.origin}/?room=room-123` },
    })
  })
})
