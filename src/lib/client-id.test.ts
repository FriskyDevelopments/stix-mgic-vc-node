import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getClientId } from './client-id'
import { apiHeaders } from './api-client'

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    clear: () => values.clear(),
  })
})

describe('browser client identity', () => {
  it('stays stable across REST calls in one browser profile', () => {
    expect(getClientId()).toBe(getClientId())
  })

  it('is attached to room API requests', () => {
    expect(apiHeaders().get('x-client-id')).toBe(getClientId())
  })
})
