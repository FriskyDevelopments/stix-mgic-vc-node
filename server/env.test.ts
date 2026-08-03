import { afterEach, describe, expect, it } from 'vitest'
import { getServerEnv, resetServerEnvCache } from './env'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  resetServerEnvCache()
})

describe('server environment', () => {
  it('fails closed when production authentication is disabled', () => {
    process.env.NODE_ENV = 'production'
    process.env.OPERATOR_TOKEN_SECRET = 'test-operator-token-secret'
    process.env.AUTH_REQUIRED = 'false'
    resetServerEnvCache()

    expect(() => getServerEnv()).toThrow('AUTH_REQUIRED must be true in production')
  })
})
