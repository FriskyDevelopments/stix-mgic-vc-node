import { afterEach, describe, expect, it } from 'vitest'
import { roomIdFromInput, roomInviteUrl, signInReturnUrl } from './room-invites'

afterEach(() => window.history.replaceState(null, '', '/'))

describe('room invitation URLs', () => {
  it('accepts a copied invite as well as a bare room ID', () => {
    const invite = roomInviteUrl('room-123')
    expect(roomIdFromInput(invite)).toBe('room-123')
    expect(roomIdFromInput(' room-123 ')).toBe('room-123')
    expect(roomIdFromInput('/?room=room-123')).toBe('room-123')
  })

  it('rejects a link to another service or without an invitation', () => {
    expect(() => roomIdFromInput('https://other.example/?room=room-123')).toThrow('different site')
    expect(() => roomIdFromInput('/?action=new-room')).toThrow('does not contain')
  })

  it('preserves the invited room through sign-in, excluding previous OAuth parameters', () => {
    window.history.replaceState(null, '', '/?room=room-123&code=old-code&state=old-state&error=old-error')
    expect(signInReturnUrl()).toBe(roomInviteUrl('room-123'))
  })

  it('preserves the new-room action but prioritizes an explicit invitation', () => {
    window.history.replaceState(null, '', '/?action=new-room')
    expect(new URL(signInReturnUrl()).search).toBe('?action=new-room')
    window.history.replaceState(null, '', '/?action=new-room&room=room-123')
    expect(signInReturnUrl()).toBe(roomInviteUrl('room-123'))
  })

  it('keeps NEBU studio invites on /studio', () => {
    window.history.replaceState(null, '', '/studio')
    const invite = roomInviteUrl('room-123')
    expect(new URL(invite).pathname).toBe('/studio')
    expect(roomIdFromInput(invite)).toBe('room-123')
  })
})
