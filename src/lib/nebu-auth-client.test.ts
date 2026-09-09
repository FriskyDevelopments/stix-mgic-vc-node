import { describe, expect, it } from 'vitest'
import { nebuAuthClient } from './nebu-auth-client'

describe('nebuAuthClient', () => {
  it('exposes Better Auth client actions for the NEBU surface', () => {
    expect(nebuAuthClient).toBeTruthy()
    expect(typeof nebuAuthClient.signIn.email).toBe('function')
    expect(typeof nebuAuthClient.signIn.social).toBe('function')
    expect(typeof nebuAuthClient.signUp.email).toBe('function')
  })
})
