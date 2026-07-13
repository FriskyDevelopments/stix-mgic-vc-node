import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAppEnv, resetAppEnvCache } from './env'
import { getSessionApi, resetSessionApi } from './session-api'

describe('getAppEnv', () => {
  beforeEach(() => {
    resetAppEnvCache()
    vi.unstubAllEnvs()
  })

  it('defaults to demo mode without API URL', () => {
    const env = getAppEnv()
    expect(env.demoMode).toBe(true)
    expect(env.isLiveApiConfigured).toBe(false)
    expect(env.operatorTier).toBe('premium')
  })

  it('enables live API when demo is false and API URL is set', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false')
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
    resetAppEnvCache()

    const env = getAppEnv()
    expect(env.demoMode).toBe(false)
    expect(env.isLiveApiConfigured).toBe(true)
    expect(env.apiBaseUrl).toBe('https://api.example.com')
  })
})

describe('getSessionApi', () => {
  beforeEach(() => {
    resetAppEnvCache()
    resetSessionApi()
    vi.unstubAllEnvs()
  })

  it('uses demo API by default', async () => {
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
