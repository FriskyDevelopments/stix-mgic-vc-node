import { afterEach, describe, expect, it, vi } from 'vitest'
import { mintCloudflareTurnCredential, createSfuSession } from './cloudflare-realtime'
import { resetServerEnvCache } from './env'

const TURN_ENV = {
  CLOUDFLARE_TURN_KEY_ID: 'key-123',
  CLOUDFLARE_TURN_KEY_API_TOKEN: 'turn-token',
}
const SFU_ENV = {
  CLOUDFLARE_REALTIME_APP_ID: 'app-123',
  CLOUDFLARE_REALTIME_APP_SECRET: 'app-secret',
}

function loadEnv(vars: Record<string, string>) {
  for (const [key, value] of Object.entries(vars)) process.env[key] = value
  resetServerEnvCache()
}

afterEach(() => {
  for (const key of [...Object.keys(TURN_ENV), ...Object.keys(SFU_ENV), 'CLOUDFLARE_TURN_TTL_SECONDS']) {
    delete process.env[key]
  }
  resetServerEnvCache()
  vi.restoreAllMocks()
})

describe('mintCloudflareTurnCredential', () => {
  it('returns null when TURN is not configured, so callers degrade to STUN', async () => {
    loadEnv({})
    const fetchImpl = vi.fn()
    expect(await mintCloudflareTurnCredential(fetchImpl as unknown as typeof fetch)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('mints an expiring credential with the API token, never exposing it in the result', async () => {
    loadEnv({ ...TURN_ENV, CLOUDFLARE_TURN_TTL_SECONDS: '1800' })
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          iceServers: { urls: ['turn:turn.cloudflare.com:3478'], username: 'u', credential: 'c' },
        }),
        { status: 200 },
      ),
    )

    const result = await mintCloudflareTurnCredential(fetchImpl as unknown as typeof fetch)

    expect(result).toEqual({
      iceServers: { urls: ['turn:turn.cloudflare.com:3478'], username: 'u', credential: 'c' },
      ttl: 1800,
    })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toContain('/turn/keys/key-123/credentials/generate-ice-servers')
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer turn-token' })
    expect(JSON.stringify(result)).not.toContain('turn-token')
  })

  it('throws on a non-ok response without leaking the token', async () => {
    loadEnv(TURN_ENV)
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 403 }))
    await expect(mintCloudflareTurnCredential(fetchImpl as unknown as typeof fetch)).rejects.toThrow('403')
  })
})

describe('createSfuSession', () => {
  it('returns null when the SFU is not configured', async () => {
    loadEnv({})
    const fetchImpl = vi.fn()
    expect(await createSfuSession(fetchImpl as unknown as typeof fetch)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('creates a session with the app secret and returns only the session id', async () => {
    loadEnv(SFU_ENV)
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ sessionId: 'sess-abc' }), { status: 200 }),
    )

    const result = await createSfuSession(fetchImpl as unknown as typeof fetch)

    expect(result).toEqual({ sessionId: 'sess-abc' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toContain('/apps/app-123/sessions/new')
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer app-secret' })
  })

  it('throws on a non-ok response', async () => {
    loadEnv(SFU_ENV)
    const fetchImpl = vi.fn(async () => new Response('err', { status: 500 }))
    await expect(createSfuSession(fetchImpl as unknown as typeof fetch)).rejects.toThrow('500')
  })
})
