// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isLoopbackOrDemoHost } from './hosts.ts'
import { isUnset } from './placeholders.ts'

describe('placeholders and hosts', () => {
  it('does not treat a real value that contains x as empty', () => {
    expect(isUnset('sk_test_xxxxxabc')).toBe(false)
    expect(isUnset('REPLACE_ME')).toBe(true)
    expect(isUnset('https://waha.example.invalid')).toBe(true)
  })

  it('allows loopback only when the return host is inferred', () => {
    expect(isLoopbackOrDemoHost('127.0.0.1')).toBe(true)
    expect(isLoopbackOrDemoHost('elementos-demo.someone.workers.dev')).toBe(false)
  })
})
