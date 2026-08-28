import type { ServerEnv } from './env'

export type IdentityProviderId = 'google' | 'apple' | 'microsoft' | 'friskydev-id'
export type IdentityProviderMethod = 'supabase' | 'oidc'

export type IdentityProvider = {
  id: IdentityProviderId
  label: string
  ready: boolean
  method: IdentityProviderMethod
  start?: string
  supabaseProvider?: 'google' | 'apple' | 'azure'
}

export function buildIdentityCatalog(env: Pick<ServerEnv, 'supabaseConfigured' | 'oidcConfigured'>): IdentityProvider[] {
  return [
    {
      id: 'google',
      label: 'Google',
      ready: env.supabaseConfigured,
      method: 'supabase',
      supabaseProvider: 'google',
    },
    {
      id: 'apple',
      label: 'Apple',
      ready: env.supabaseConfigured,
      method: 'supabase',
      supabaseProvider: 'apple',
    },
    {
      id: 'microsoft',
      label: 'Microsoft',
      ready: env.supabaseConfigured,
      method: 'supabase',
      supabaseProvider: 'azure',
    },
    {
      id: 'friskydev-id',
      label: 'FriskyDev ID',
      ready: env.oidcConfigured,
      method: 'oidc',
      start: '/v1/auth/oidc/start',
    },
  ]
}

export function publicSupabaseIdentity(env: Pick<ServerEnv, 'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY' | 'SUPABASE_ANON_KEY'>) {
  return {
    url: env.SUPABASE_URL || null,
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || null,
  }
}
