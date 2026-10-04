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
/**
 * Database injected by the host runtime (Cloudflare D1 binding in the Worker, an in-memory
 * adapter in tests). When present it wins over DATABASE_URL (MySQL), which cannot run on Workers.
 */
let injectedDatabase: unknown = null

/** Hands Better Auth a runtime-provided database (D1 binding or adapter). Call before first use. */
export function configureNebuDatabase(db: unknown): void {
  if (db === injectedDatabase) return
  injectedDatabase = db ?? null
  authInstance = null
}

const PBKDF2_ITERATIONS = 100_000 // Workers WebCrypto caps PBKDF2 at 100k iterations.

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256)
}

/**
 * Password hashing via native WebCrypto PBKDF2. Better Auth's default (JS scrypt) burns far more
 * CPU than a Worker request is allowed; WebCrypto runs natively.
 */
export async function hashNebuPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`
}

export async function verifyNebuPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const [scheme, iterations, saltHex, hashHex] = hash.split('$')
  if (scheme !== 'pbkdf2-sha256' || !iterations || !saltHex || !hashHex) return false
  const derived = new Uint8Array(await pbkdf2(password, fromHex(saltHex), Number(iterations)))
  const expected = fromHex(hashHex)
  if (derived.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < derived.length; i++) diff |= derived[i]! ^ expected[i]!
  return diff === 0
}

/** Reports whether the required NEBU database and auth secret are configured. */
export function isNebuBetterAuthConfigured(): boolean {
  const secret = process.env.BETTER_AUTH_SECRET
  const databaseUrl = process.env.DATABASE_URL
  return Boolean((databaseUrl || injectedDatabase) && secret && secret.length >= 32)
}

/** Lists the NEBU social providers whose required environment variables are present. */
export function listConfiguredSocialProviders(): NebuSocialProviderId[] {
  return Object.keys(buildSocialProviders()) as NebuSocialProviderId[]
}

/** Generates the short-lived Apple OAuth client secret from the configured signing key. */
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

  const secret = process.env.BETTER_AUTH_SECRET!
  const baseURL = process.env.BETTER_AUTH_URL ?? 'https://nebu.quest'
  const socialProviders = buildSocialProviders()
  const useSecureCookies = process.env.NODE_ENV === 'production'

  let database: unknown = injectedDatabase
  if (!database) {
    pool = createPool(process.env.DATABASE_URL!)
    database = pool
  }

  authInstance = betterAuth({
    database: database as never,
    secret,
    baseURL,
    basePath: '/api/auth',
    trustedOrigins: Array.from(new Set([baseURL, ...extraTrustedOrigins])),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      password: { hash: hashNebuPassword, verify: verifyNebuPassword },
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
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
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

/** Resolves the Better Auth session behind a request's cookies, or null. Never throws. */
export async function resolveNebuSession(
  headers: Headers
): Promise<{ userId: string; name: string; email: string | null } | null> {
  const auth = getNebuAuth()
  if (!auth) return null
  try {
    const result = (await (auth.api.getSession as (a: { headers: Headers }) => Promise<unknown>)({ headers })) as {
      user?: { id?: string; name?: string; email?: string }
    } | null
    const user = result?.user
    if (!user?.id) return null
    return { userId: user.id, name: user.name || user.email || 'NEBU user', email: user.email ?? null }
  } catch {
    return null
  }
}

/** Test helper — drop cached auth/pool between cases. */
export function resetNebuAuthCache(): void {
  authInstance = null
  injectedDatabase = null
  if (pool) {
    void pool.end().catch(() => undefined)
    pool = null
  }
}

export type NebuAuth = NonNullable<ReturnType<typeof getNebuAuth>>
