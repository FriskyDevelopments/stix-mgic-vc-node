import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveNebuSession = vi.fn()
vi.mock('./betterAuth', () => ({ resolveNebuSession: (h: Headers) => resolveNebuSession(h) }))

import { gateNebuSession, requiresNebuSession } from './nebu-gate'
import { resetServerEnvCache } from './env'

const ws = (path = '/v1/signal') => new Request(`https://nebu.quest${path}`, { headers: { upgrade: 'websocket' } })
const post = (path = '/v1/rooms') => new Request(`https://nebu.quest${path}`, { method: 'POST' })

describe('Better Auth gate for POST /v1/rooms and /v1/signal', () => {
  beforeEach(() => {
    resolveNebuSession.mockReset()
    process.env.AUTH_REQUIRED = 'true'
    resetServerEnvCache()
  })

  it('only covers room creation and the signalling socket', () => {
    expect(requiresNebuSession(post())).toBe(true)
    expect(requiresNebuSession(ws())).toBe(true)
    expect(requiresNebuSession(new Request('https://nebu.quest/v1/rooms'))).toBe(false)
    expect(requiresNebuSession(post('/v1/rooms/abc/join'))).toBe(false)
    expect(requiresNebuSession(new Request('https://nebu.quest/v1/signal'))).toBe(false)
  })

  it('answers 401 without a session (rooms + websocket)', async () => {
    resolveNebuSession.mockResolvedValue(null)
    for (const req of [post(), ws()]) {
      const { denied } = await gateNebuSession(req)
      expect(denied?.status).toBe(401)
      expect(await denied!.json()).toMatchObject({ code: 'login_required' })
    }
  })

  it('lets a Better Auth session through and returns it', async () => {
    resolveNebuSession.mockResolvedValue({ userId: 'u1', name: 'Ana', email: null })
    const { denied, session } = await gateNebuSession(post())
    expect(denied).toBeNull()
    expect(session?.userId).toBe('u1')
  })

  it('does nothing when AUTH_REQUIRED is not true', async () => {
    process.env.AUTH_REQUIRED = 'false'
    resetServerEnvCache()
    const { denied } = await gateNebuSession(post())
    expect(denied).toBeNull()
    expect(resolveNebuSession).not.toHaveBeenCalled()
  })

  it('does not look up a session for other routes', async () => {
    const { denied } = await gateNebuSession(new Request('https://nebu.quest/v1/config/public'))
    expect(denied).toBeNull()
    expect(resolveNebuSession).not.toHaveBeenCalled()
  })
})
