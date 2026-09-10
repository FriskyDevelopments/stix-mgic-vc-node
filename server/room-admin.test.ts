import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  actionsForRole,
  describeRoomAdminCapabilities,
  executeRoomAdmin,
  httpStatusForRoomAdmin,
  isNebuLinkedRoom,
  parseRoomAdminAction,
  resolveNebuSessionForRoomAdmin,
  resolveRoomAdminAuthPlane,
  resolveRoomAdminRole,
  roleAllowsAction,
  roleCanModerate,
  validateRoomAdminAccess,
  validateRoomAdminRequest,
  type RoomAdminActor,
} from './room-admin'
import { createRoom, joinRoom, resetRooms } from './rooms'

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
const FRISKY_OWNER = 'friskydev:owner-1'
const NEBU_OWNER = 'nebu:user-42'

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

  it('allows telegram room owners (legacy dens-host) and rejects guests', () => {
    const web = createRoom({ ownerOperatorId: OWNER, platform: 'web' })
    expect(validateRoomAdminAccess(web, OWNER)?.code).toBe('telegram_only')

    const tg = createRoom({ ownerOperatorId: OWNER, platform: 'telegram' })
    expect(validateRoomAdminAccess(tg, 'other')?.code).toBe('forbidden')
    expect(validateRoomAdminAccess(tg, OWNER)).toBeNull()
    expect(validateRoomAdminAccess(null, OWNER)?.code).toBe('room_not_found')
  })
})

describe('authorization matrix (three auth planes)', () => {
  it('exposes role capability sets without merging planes', () => {
    expect([...actionsForRole('studio_operator')]).toEqual([
      'mute',
      'unmute',
      'kick',
      'pin',
      'end',
      'title',
      'invite',
    ])
    expect([...actionsForRole('nebu_host')]).toEqual(['mute', 'unmute', 'kick', 'pin', 'end'])
    expect([...actionsForRole('guest')]).toEqual([])
    expect(roleCanModerate('guest')).toBe(false)
    expect(roleAllowsAction('nebu_host', 'title')).toBe(false)
    expect(roleAllowsAction('studio_operator', 'invite')).toBe(true)
  })

  it('maps FriskyDev / Authentik owners and operators to studio_operator (full)', () => {
    const room = createRoom({ ownerOperatorId: FRISKY_OWNER, platform: 'telegram' })
    const ownerActor: RoomAdminActor = {
      operatorId: FRISKY_OWNER,
      operatorPlatform: 'friskydev',
    }
    expect(resolveRoomAdminAuthPlane(ownerActor)).toBe('friskydev')
    expect(resolveRoomAdminRole(room, ownerActor)).toBe('studio_operator')
    expect(validateRoomAdminAccess(room, ownerActor, 'title')).toBeNull()
    expect(validateRoomAdminAccess(room, ownerActor, 'invite')).toBeNull()

    const coOp: RoomAdminActor = {
      operatorId: 'friskydev:co-op',
      operatorPlatform: 'friskydev',
    }
    joinRoom(room.id, { operatorId: coOp.operatorId, name: 'Co-Op', role: 'operator' })
    expect(resolveRoomAdminRole(room, coOp)).toBe('studio_operator')
    expect(validateRoomAdminAccess(room, coOp, 'mute')).toBeNull()

    const guestActor: RoomAdminActor = {
      operatorId: 'friskydev:guest',
      operatorPlatform: 'friskydev',
    }
    joinRoom(room.id, { operatorId: guestActor.operatorId, name: 'Guest', role: 'guest' })
    expect(resolveRoomAdminRole(room, guestActor)).toBe('guest')
    expect(validateRoomAdminAccess(room, guestActor, 'mute')?.code).toBe('forbidden')
  })

  it('maps supabase-brokered FriskyDev identity to the studio plane', () => {
    const room = createRoom({ ownerOperatorId: 'supabase:acct', platform: 'telegram' })
    const actor: RoomAdminActor = {
      operatorId: 'supabase:acct',
      operatorPlatform: 'supabase',
    }
    expect(resolveRoomAdminAuthPlane(actor)).toBe('friskydev')
    expect(resolveRoomAdminRole(room, actor)).toBe('studio_operator')
  })

  it('limits NEBU Better Auth dens hosts (no title/invite) when session verified', () => {
    const room = createRoom({ ownerOperatorId: NEBU_OWNER, platform: 'telegram' })
    expect(isNebuLinkedRoom(room)).toBe(true)

    const densHost: RoomAdminActor = {
      operatorId: NEBU_OWNER,
      operatorPlatform: 'anonymous',
      nebuUserId: 'user-42',
      nebuSessionVerified: true,
    }
    expect(resolveRoomAdminAuthPlane(densHost)).toBe('nebu')
    expect(resolveRoomAdminRole(room, densHost)).toBe('nebu_host')
    expect(validateRoomAdminAccess(room, densHost, 'mute')).toBeNull()
    expect(validateRoomAdminAccess(room, densHost, 'end')).toBeNull()
    const titleDenied = validateRoomAdminAccess(room, densHost, 'title')
    expect(titleDenied?.code).toBe('forbidden')
    expect(titleDenied?.error).toContain('nebu_host')
    expect(validateRoomAdminAccess(room, densHost, 'invite')?.code).toBe('forbidden')
  })

  it('documents STUB when NEBU identity is asserted without a verified session', () => {
    const room = createRoom({ ownerOperatorId: NEBU_OWNER, platform: 'telegram' })
    const stubbed: RoomAdminActor = {
      operatorId: 'anonymous:local',
      operatorPlatform: 'anonymous',
      nebuUserId: 'user-42',
      nebuSessionVerified: false,
    }
    const denied = validateRoomAdminAccess(room, stubbed, 'mute')
    // Not the NEBU owner via operatorId, and stub path surfaces clearly.
    expect(denied?.code === 'forbidden' || denied?.code === 'nebu_session_stub').toBe(true)
  })

  it('keeps resolveNebuSessionForRoomAdmin as an explicit STUB (returns null)', () => {
    expect(resolveNebuSessionForRoomAdmin('nebu_session=fake')).toBeNull()
    expect(resolveNebuSessionForRoomAdmin(undefined)).toBeNull()
  })

  it('denies telegram guests / participants all moderation actions', () => {
    const room = createRoom({ ownerOperatorId: OWNER, platform: 'telegram' })
    const guest: RoomAdminActor = {
      operatorId: 'telegram:guest-99',
      operatorPlatform: 'telegram',
    }
    joinRoom(room.id, { operatorId: guest.operatorId, name: 'Tg Guest', role: 'guest' })
    expect(resolveRoomAdminAuthPlane(guest)).toBe('telegram_guest')
    expect(resolveRoomAdminRole(room, guest)).toBe('guest')
    const caps = describeRoomAdminCapabilities(room, guest)
    expect(caps.canModerate).toBe(false)
    expect(caps.allowedActions).toEqual([])
    for (const action of ['mute', 'unmute', 'kick', 'pin', 'end', 'title', 'invite'] as const) {
      expect(validateRoomAdminAccess(room, guest, action)?.code).toBe('forbidden')
    }
  })

  it('gives legacy telegram room owners dens-host actions but not studio title/invite', () => {
    const room = createRoom({ ownerOperatorId: OWNER, platform: 'telegram' })
    const actor: RoomAdminActor = { operatorId: OWNER, operatorPlatform: 'telegram' }
    expect(resolveRoomAdminRole(room, actor)).toBe('nebu_host')
    expect(validateRoomAdminAccess(room, actor, 'mute')).toBeNull()
    expect(validateRoomAdminAccess(room, actor, 'title')?.code).toBe('forbidden')
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

  it('returns 403 with clear role context when a guest tries to mute', async () => {
    const room = createRoom({ ownerOperatorId: FRISKY_OWNER, platform: 'telegram' })
    const result = await executeRoomAdmin(
      room.id,
      { operatorId: 'friskydev:guest', operatorPlatform: 'friskydev' },
      { action: 'mute', target: '1' }
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('forbidden')
    expect(result.role).toBe('guest')
    expect(httpStatusForRoomAdmin(result)).toBe(403)
  })

  it('allows FriskyDev owners to set title; dens hosts cannot', async () => {
    const studioRoom = createRoom({ ownerOperatorId: FRISKY_OWNER, platform: 'telegram' })
    const studioOk = await executeRoomAdmin(
      studioRoom.id,
      { operatorId: FRISKY_OWNER, operatorPlatform: 'friskydev' },
      { action: 'title', title: 'Friday set' }
    )
    expect(studioOk.ok).toBe(true)

    const densRoom = createRoom({ ownerOperatorId: NEBU_OWNER, platform: 'telegram' })
    const densDenied = await executeRoomAdmin(
      densRoom.id,
      {
        operatorId: NEBU_OWNER,
        operatorPlatform: 'anonymous',
        nebuUserId: 'user-42',
        nebuSessionVerified: true,
      },
      { action: 'title', title: 'Dens title' }
    )
    expect(densDenied.ok).toBe(false)
    if (densDenied.ok) return
    expect(densDenied.code).toBe('forbidden')
  })

  it('maps failure codes to HTTP statuses', () => {
    expect(httpStatusForRoomAdmin({ ok: false, code: 'room_not_found', error: 'x' })).toBe(404)
    expect(httpStatusForRoomAdmin({ ok: false, code: 'forbidden', error: 'x' })).toBe(403)
    expect(httpStatusForRoomAdmin({ ok: false, code: 'nebu_session_stub', error: 'x' })).toBe(403)
    expect(httpStatusForRoomAdmin({ ok: false, code: 'target_required', error: 'x' })).toBe(400)
    expect(httpStatusForRoomAdmin({ ok: false, code: 'adapter_error', error: 'x' })).toBe(503)
  })
})
