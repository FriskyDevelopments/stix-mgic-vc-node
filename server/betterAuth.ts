/**
 * NEBU (nebu.quest) Better Auth — separate from the VC studio Authentik/OIDC path.
 *
 * Studio (vc.friskydev.com) keeps FriskyDev ID via Authentik OIDC + Supabase identity.
 * NEBU consumer login lives here: Better Auth with Google / Apple / Microsoft when
 * the corresponding env vars are present. Do not share session cookies between the two.
 *
 * Pattern mirrored from Folios (folios-kyc-kyb-better-auth/server/betterAuth.ts).
 */
import { betterAuth } from 'better-auth'
import { createPool, type Pool } from 'mysql2/promise'
import { importPKCS8, SignJWT } from 'jose'

export type NebuSocialProviderId = 'google' | 'microsoft' | 'apple'

export type NebuSocialProviders = ReturnType<typeof buildSocialProviders>

type NebuAuthInstance = {
  handler: (request: Request) => Response | Promise<Response>
  api: {
    getSession: (...args: never[]) => unknown
  }
  options: {
    baseURL?: string
    basePath?: string
    advanced?: {
      cookiePrefix?: string
      useSecureCookies?: boolean
      cookies?: {
        session_token?: {
          name?: string
          attributes?: Record<string, unknown>
        }
      }
    }
    session?: {
      cookieCache?: {
        enabled?: boolean
      }
    }
  }
}

let pool: Pool | null = null
let authInstance: NebuAuthInstance | null = null

export function isNebuBetterAuthConfigured(): boolean {
  const secret = process.env.BETTER_AUTH_SECRET
  const databaseUrl = process.env.DATABASE_URL
  return Boolean(databaseUrl && secret && secret.length >= 32)
}

export function listConfiguredSocialProviders(): NebuSocialProviderId[] {
  return Object.keys(buildSocialProviders()) as NebuSocialProviderId[]
}

async function generateAppleClientSecret(): Promise<string> {
  const clientId = process.env.APPLE_CLIENT_ID
  const teamId = process.env.APPLE_TEAM_ID
  const keyId = process.env.APPLE_KEY_ID
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!clientId || !teamId || !keyId || !privateKey) {
    throw new Error(
      'Apple Sign In requires APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY.'
    )
  }

  const key = await importPKCS8(privateKey, 'ES256')
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 60 * 60)
    .sign(key)
}

/** Pure helper — safe to call without DATABASE_URL / BETTER_AUTH_SECRET. */
export function buildSocialProviders() {
  const googleId = process.env.GOOGLE_CLIENT_ID
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET
  const microsoftId = process.env.MICROSOFT_CLIENT_ID ?? process.env.MS_CLIENT_ID
  const microsoftSecret = process.env.MICROSOFT_CLIENT_SECRET ?? process.env.MS_CLIENT_SECRET
  const appleId = process.env.APPLE_CLIENT_ID
  const appleSecret = process.env.APPLE_CLIENT_SECRET
  const appleCanMint = Boolean(
    appleId && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY
  )

  return {
    ...(googleId && googleSecret
      ? {
          google: {
            clientId: googleId,
            clientSecret: googleSecret,
          },
        }
      : {}),
    ...(microsoftId && microsoftSecret
      ? {
          microsoft: {
            clientId: microsoftId,
            clientSecret: microsoftSecret,
            tenantId: process.env.MICROSOFT_TENANT_ID ?? 'common',
            prompt: 'select_account' as const,
          },
        }
      : {}),
    ...(appleId && (appleSecret || appleCanMint)
      ? {
          apple: appleCanMint
            ? async () => ({
                clientId: appleId,
                clientSecret: await generateAppleClientSecret(),
              })
            : {
                clientId: appleId,
                clientSecret: appleSecret as string,
              },
        }
      : {}),
  }
}

const extraTrustedOrigins = [
  'https://appleid.apple.com',
  'https://nebu.quest',
  'https://www.nebu.quest',
]

/**
 * Lazily builds the Better Auth instance. Returns null when NEBU auth env is absent
 * so the VC studio control plane can boot and test without MySQL / Better Auth secrets.
 */
export function getNebuAuth() {
  if (!isNebuBetterAuthConfigured()) {
    return null
  }
  if (authInstance) return authInstance

  const databaseUrl = process.env.DATABASE_URL!
  const secret = process.env.BETTER_AUTH_SECRET!
  const baseURL = process.env.BETTER_AUTH_URL ?? 'https://nebu.quest'
  const socialProviders = buildSocialProviders()
  const useSecureCookies = process.env.NODE_ENV === 'production'

  pool = createPool(databaseUrl)

  authInstance = betterAuth({
    database: pool,
    secret,
    baseURL,
    basePath: '/api/auth',
    trustedOrigins: Array.from(new Set([baseURL, ...extraTrustedOrigins])),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    socialProviders,
    account: {
      modelName: 'ba_account',
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'microsoft', 'apple'],
      },
    },
    user: {
      modelName: 'ba_user',
    },
    session: {
      modelName: 'ba_session',
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 15,
      cookieCache: {
        enabled: false,
      },
    },
    verification: {
      modelName: 'ba_verification',
    },
    advanced: {
      cookiePrefix: 'nebu',
      useSecureCookies,
      cookies: {
        session_token: {
          name: useSecureCookies ? '__Host-nebu_session' : 'nebu_session',
          attributes: {
            httpOnly: true,
            secure: useSecureCookies,
            sameSite: 'lax' as const,
            path: '/',
          },
        },
      },
      database: {
        joins: true,
      },
    },
  }) as NebuAuthInstance

  return authInstance
}

/** Test helper — drop cached auth/pool between cases. */
export function resetNebuAuthCache(): void {
  authInstance = null
  if (pool) {
    void pool.end().catch(() => undefined)
    pool = null
  }
}

export type NebuAuth = NonNullable<ReturnType<typeof getNebuAuth>>
