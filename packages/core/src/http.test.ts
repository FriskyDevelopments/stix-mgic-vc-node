import { describe, expect, it } from 'vitest'
import { readJson } from './http.ts'

describe('readJson', () => {
  it('rejects a body once the UTF-8 byte cap is crossed', async () => {
    const over = await readJson(new Request('https://tenant.test', { method: 'POST', body: '12345' }), 4)
    expect(over).toEqual({ ok: false, error: 'body_too_large', status: 413 })

    const accented = '{"a":"é"}'
    expect(new TextEncoder().encode(accented).byteLength).toBeGreaterThan(accented.length)
    const bytes = await readJson(new Request('https://tenant.test', { method: 'POST', body: accented }), accented.length)
    expect(bytes).toEqual({ ok: false, error: 'body_too_large', status: 413 })
  })

  it('parses a body inside the byte cap', async () => {
    const ok = await readJson(new Request('https://tenant.test', { method: 'POST', body: '{"a":1}' }), 100)
    expect(ok).toEqual({ ok: true, value: { a: 1 } })
  })
})
