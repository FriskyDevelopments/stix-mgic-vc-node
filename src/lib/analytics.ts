import posthog from 'posthog-js'
import { getAppEnv } from '@/lib/env'
import type { FriskyDevAccount } from '@/lib/friskydev'

const POSTHOG_DEFAULTS = '2026-05-30' as const

let initialized = false

/** Initialize PostHog once when a project token is configured. Safe no-op otherwise. */
export function initAnalytics(): boolean {
  if (initialized) return true
  if (typeof window === 'undefined') return false

  const { posthogProjectToken, posthogHost } = getAppEnv()
  if (!posthogProjectToken) return false

  posthog.init(posthogProjectToken, {
    api_host: posthogHost,
    defaults: POSTHOG_DEFAULTS,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
  })
  initialized = true
  return true
}

export function isAnalyticsEnabled(): boolean {
  return initialized
}

export function getAnalyticsClient() {
  return initialized ? posthog : null
}

export function identifyFriskyDevUser(account: FriskyDevAccount): void {
  if (!initialized) return
  posthog.identify(account.id, {
    email: account.email,
    name: account.displayName,
  })
}

export function resetAnalytics(): void {
  if (!initialized) return
  posthog.reset()
}

export function track(event: string, properties?: Record<string, unknown>): void {
  if (!initialized) return
  posthog.capture(event, properties)
}

/** Test helper */
export function resetAnalyticsState(): void {
  initialized = false
}
