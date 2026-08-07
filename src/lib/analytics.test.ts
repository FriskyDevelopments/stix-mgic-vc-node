import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('posthog-js', () => {
  const posthog = {
    init: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    capture: vi.fn(),
  }
  return { default: posthog }
})

import posthog from 'posthog-js'
import { getAppEnv, resetAppEnvCache } from './env'
import {
  identifyFriskyDevUser,
  initAnalytics,
  isAnalyticsEnabled,
  resetAnalytics,
  resetAnalyticsState,
  track,
} from './analytics'

describe('analytics / PostHog', () => {
  beforeEach(() => {
    resetAppEnvCache()
    resetAnalyticsState()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('skips init when PostHog token is unset', () => {
    expect(initAnalytics()).toBe(false)
    expect(isAnalyticsEnabled()).toBe(false)
    expect(posthog.init).not.toHaveBeenCalled()
  })

  it('initializes PostHog when project token is set', () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_test_token')
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://eu.i.posthog.com')
    resetAppEnvCache()

    expect(getAppEnv().posthogProjectToken).toBe('phc_test_token')
    expect(getAppEnv().posthogHost).toBe('https://eu.i.posthog.com')
    expect(initAnalytics()).toBe(true)
    expect(isAnalyticsEnabled()).toBe(true)
    expect(posthog.init).toHaveBeenCalledWith(
      'phc_test_token',
      expect.objectContaining({
        api_host: 'https://eu.i.posthog.com',
        person_profiles: 'identified_only',
      }),
    )
  })

  it('identifies, tracks, and resets only after init', () => {
    identifyFriskyDevUser({
      id: 'acc_1',
      email: 'a@example.com',
      displayName: 'A',
      createdAt: 1,
    })
    track('noop')
    resetAnalytics()
    expect(posthog.identify).not.toHaveBeenCalled()
    expect(posthog.capture).not.toHaveBeenCalled()
    expect(posthog.reset).not.toHaveBeenCalled()

    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_test_token')
    resetAppEnvCache()
    initAnalytics()

    identifyFriskyDevUser({
      id: 'acc_1',
      email: 'a@example.com',
      displayName: 'A',
      createdAt: 1,
    })
    track('friskydev_login', { account_id: 'acc_1' })
    resetAnalytics()

    expect(posthog.identify).toHaveBeenCalledWith('acc_1', {
      email: 'a@example.com',
      name: 'A',
    })
    expect(posthog.capture).toHaveBeenCalledWith('friskydev_login', { account_id: 'acc_1' })
    expect(posthog.reset).toHaveBeenCalled()
  })
})
