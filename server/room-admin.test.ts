import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  executeRoomAdmin,
  httpStatusForRoomAdmin,
  parseRoomAdminAction,
  validateRoomAdminAccess,
  validateRoomAdminRequest,
} from './room-admin'
import { createRoom, resetRooms } from './rooms'

vi.mock('./telegram-vc-adapter', () => ({
  telegramVcAdapter: {
    mute: vi.fn(async (target: string) => ({
      participants: [{ id: target, name: `User ${target}`, muted: true }],
      count: 1,
      pendingMtproto: 'phone.EditGroupCallParticipant (mute)',
    })),
    unmute: vi.fn(async (target: string) => ({
      participants: [{ id: target, name: `User ${target}`, muted: false }],
      count: 1,
    })),
    kick: vi.fn(async () => ({ participants: [], count: 0 })),
    pin: vi.fn(async (target: string) => ({
      participants: [{ id: target, name: `User ${target}`, muted: false, pinned: true }],
      count: 1,
    })),
    end: vi.fn(async () => ({ participants: [], count: 0, active: false })),
    title: vi.fn(async (title: string) => ({
      participants: [],
      count: 0,
      title,
    })),
    invite: vi.fn(async () => ({ participants: [], count: 0, pendingMtproto: 'invite' })),
  },
}))

const OWNER = 'telegram:owner'

beforeEach(() => {
  resetRooms()
})

describe('room admin validation', () => {
  it('parses known actions only', () => {
    expect(parseRoomAdminAction('mute')).toBe('mute')
    expect(parseRoomAdminAction('end')).toBe('end')
    expect(parseRoomAdminAction('ban')).toBeNull()
  })

  it('requires target for mute/kick/pin and title for title', () => {
    expect(validateRoomAdminRequest({ action: 'mute' })?.code).toBe('target_required')
    expect(validateRoomAdminRequest({ action: 'end' })).toBeNull()
    expect(validateRoomAdminRequest({ action: 'title' })?.code).toBe('title_required')
    expect(validateRoomAdminRequest({ action: 'title', title: 'Set' })).toBeNull()
  })

  it('allows only telegram room owners', () => {
    const web = createRoom({ ownerOperatorId: OWNER, platform: 'web' })
    expect(validateRoomAdminAccess(web, OWNER)?.code).toBe('telegram_only')

    const tg = createRoom({ ownerOperatorId: OWNER, platform: 'telegram' })
    expect(validateRoomAdminAccess(tg, 'other')?.code).toBe('forbidden')
    expect(validateRoomAdminAccess(tg, OWNER)).toBeNull()
    expect(validateRoomAdminAccess(null, OWNER)?.code).toBe('room_not_found')
  })
})

describe('executeRoomAdmin', () => {
  it('mutes a participant and returns the updated list', async () => {
    const room = createRoom({ ownerOperatorId: OWNER, platform: 'telegram' })
    const result = await executeRoomAdmin(room.id, OWNER, { action: 'mute', target: '99' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.participants[0]?.muted).toBe(true)
    expect(result.pendingMtproto).toContain('EditGroupCallParticipant')
  })

  it('ends the call without a target', async () => {
    const room = createRoom({ ownerOperatorId: OWNER, platform: 'telegram' })
    const result = await executeRoomAdmin(room.id, OWNER, { action: 'end' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.count).toBe(0)
  })

  it('maps failure codes to HTTP statuses', () => {
    expect(httpStatusForRoomAdmin({ ok: false, code: 'room_not_found', error: 'x' })).toBe(404)
    expect(httpStatusForRoomAdmin({ ok: false, code: 'forbidden', error: 'x' })).toBe(403)
    expect(httpStatusForRoomAdmin({ ok: false, code: 'target_required', error: 'x' })).toBe(400)
    expect(httpStatusForRoomAdmin({ ok: false, code: 'adapter_error', error: 'x' })).toBe(503)
  })
})
