import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAppEnv, resetAppEnvCache } from './env'
import { getSessionApi, resetSessionApi } from './session-api'

describe('getAppEnv', () => {
  beforeEach(() => {
    resetAppEnvCache()
    vi.unstubAllEnvs()
  })

  it('defaults to demo mode in non-production builds', () => {
    const env = getAppEnv()
    expect(env.demoMode).toBe(true)
    expect(env.isLiveApiConfigured).toBe(false)
    expect(env.operatorTier).toBe('premium')
  })

  it('enables live API when demo is false', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false')
    resetAppEnvCache()

    const env = getAppEnv()
    expect(env.demoMode).toBe(false)
    expect(env.isLiveApiConfigured).toBe(true)
  })
})

describe('getSessionApi', () => {
  beforeEach(() => {
    resetAppEnvCache()
    resetSessionApi()
    vi.unstubAllEnvs()
  })

  it('uses demo API by default in vitest', async () => {
    const api = getSessionApi()
    expect(api.isLiveConfigured()).toBe(false)

    const snapshot = await api.startSession({
      platform: 'telegram',
      protocol: 'dj-mode',
      mode: 'dj',
    })

    expect(snapshot.source).toBe('demo')
    expect(snapshot.status).toBe('dj-mode')
  })

  it('stops demo sessions to standby', async () => {
    const api = getSessionApi()
    const snapshot = await api.stopSession()
    expect(snapshot.status).toBe('standby')
    expect(snapshot.source).toBe('demo')
  })
})
