import { describe, expect, it } from 'vitest'
import { RoomsApiError } from './rooms-api'

describe('RoomsApiError capability hydrate', () => {
  it('carries role / authPlane / canModerate from denial bodies', () => {
    const err = new RoomsApiError(403, 'Room admin denied', {
      code: 'forbidden',
      role: 'guest',
      authPlane: 'telegram_guest',
      canModerate: false,
    })
    expect(err.status).toBe(403)
    expect(err.message).toBe('Room admin denied')
    expect(err.code).toBe('forbidden')
    expect(err.role).toBe('guest')
    expect(err.authPlane).toBe('telegram_guest')
    expect(err.canModerate).toBe(false)
  })
})
