import { describe, expect, it, beforeEach } from 'vitest'
import { createApp } from './app'
import { resetServerEnvCache } from './env'
import { configureAccountStore, resetAccountStore } from './account-store'
import { setSignalingReady } from './sessions'

describe('control plane API', () => {
  beforeEach(() => {
    resetServerEnvCache()
    configureAccountStore({ persist: false })
    resetAccountStore()
    process.env.NODE_ENV = 'test'
    process.env.OPERATOR_TOKEN_SECRET = 'test-operator-token-secret'
    process.env.AUTH_REQUIRED = 'false'
    process.env.MEDIA_PLANE_ENABLED = 'false'
    setSignalingReady(false)
    delete process.env.DISCORD_CLIENT_ID
    delete process.env.DISCORD_CLIENT_SECRET
    delete process.env.TELEGRAM_BOT_TOKEN
  })

  it('reports health', async () => {
    const app = createApp()
    const res = await app.request('/healthz')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.mediaPlaneEnabled).toBe(false)
    expect(body.friskydevAccounts).toBe(true)
  })

  it('reports adapter-level media availability', async () => {
    setSignalingReady(true)
    const app = createApp()
    const res = await app.request('/v1/media/status')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ready).toBe(true)
    expect(body.adapters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'webrtc', state: 'degraded' }),
        expect.objectContaining({ id: 'telegram-vc', state: 'not_implemented' }),
      ])
    )
  })

  it('starts and stops a session without auth when AUTH_REQUIRED=false', async () => {
    const app = createApp()
    const start = await app.request('/v1/sessions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'telegram', protocol: 'dj-mode', mode: 'dj' }),
    })
    expect(start.status).toBe(200)
    const started = await start.json()
    expect(started.status).toBe('dj-mode')
    expect(started.source).toBe('live-api')
    expect(started.mediaPlane.ready).toBe(false)

    const stop = await app.request('/v1/sessions/stop', { method: 'POST' })
    expect(stop.status).toBe(200)
    const stopped = await stop.json()
    expect(stopped.status).toBe('standby')
  })

  it('rejects discord exchange when not configured', async () => {
    const app = createApp()
    const res = await app.request('/v1/auth/discord/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'abc' }),
    })
    expect(res.status).toBe(503)
  })

  it('mints anonymous operator tokens', async () => {
    const app = createApp()
    const res = await app.request('/v1/auth/anonymous', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.token).toBe('string')
    expect(body.token.includes('.')).toBe(true)
  })

  it('registers and logs into a FriskyDev account', async () => {
    const app = createApp()
    const register = await app.request('/v1/account/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'operator@frisky.dev',
        password: 'securepass1',
        displayName: 'Operator',
      }),
    })
    expect(register.status).toBe(200)
    const created = await register.json()
    expect(created.account.email).toBe('operator@frisky.dev')
    expect(typeof created.sessionToken).toBe('string')

    const me = await app.request('/v1/account/me', {
      headers: { Authorization: `Bearer ${created.sessionToken}` },
    })
    expect(me.status).toBe(200)
    const profile = await me.json()
    expect(profile.account.id).toBe(created.account.id)
    expect(profile.linked).toEqual([])
  })

  it('requires FriskyDev session to link platforms', async () => {
    const app = createApp()
    const res = await app.request('/v1/account/link/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, first_name: 'A', auth_date: 1, hash: 'x' }),
    })
    expect(res.status).toBe(401)
  })
})
