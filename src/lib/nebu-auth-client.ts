import { createAuthClient } from 'better-auth/client'

/**
 * Browser client for NEBU Better Auth. Talks to `/api/auth` on the same origin
 * (Vite proxies to the control plane in dev). No secrets live here.
 */
export const nebuAuthClient = createAuthClient({
  basePath: '/api/auth',
})

export type NebuSocialProvider = 'google' | 'microsoft' | 'apple'
