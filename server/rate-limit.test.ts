import { describe, test, expect } from 'vitest'
import { createApp } from './app'

describe('Rate Limiting', () => {
  test('rate limits public API requests by IP/key', async () => {
    const app = createApp()

    // Create a new key to avoid test interference
    const key = 'test-key-' + Date.now()

    // Make 100 requests (assuming limit is 100)
    for (let i = 0; i < 100; i++) {
      const res = await app.request('/healthz', {
        headers: { 'Authorization': `Bearer ${key}` }
      })
      expect(res.status).toBe(200)
    }

    const res = await app.request('/healthz', {
      headers: { 'Authorization': `Bearer ${key}` }
    })
    expect(res.status).toBe(429)
  })

  test('does not limit if key is different', async () => {
    const app = createApp()

    // Create a new key to avoid test interference
    const key = 'test-key-' + Date.now()

    // Make 100 requests
    for (let i = 0; i < 100; i++) {
      const res = await app.request('/healthz', {
        headers: { 'Authorization': `Bearer ${key}` }
      })
      expect(res.status).toBe(200)
    }

    // Make request with a different key
    const newKey = 'test-key-new-' + Date.now()
    const res = await app.request('/healthz', {
        headers: { 'Authorization': `Bearer ${newKey}` }
    })
    expect(res.status).toBe(200)
  })
})
