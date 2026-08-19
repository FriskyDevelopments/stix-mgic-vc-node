import { beforeEach, describe, expect, it } from 'vitest'
import {
  closeRoom,
  createRoom,
  currentTelemetry,
  findRoomForOperator,
  getRoom,
  isOperatorInRoom,
  joinRoom,
  leaveRoom,
  listRoomsForOperator,
  recordTelemetry,
  resetRooms,
  scheduleRoom,
  roomCount,
  sweepEmptyRooms,
  toView,
  EMPTY_ROOM_TTL_MS,
  MAX_PARTICIPANTS_LIMIT,
  TELEMETRY_MAX_AGE_MS,
  SCHEDULED_ROOM_GRACE_MS,
} from './rooms'

const OWNER = 'telegram:1'
const GUEST = 'discord:2'

beforeEach(() => {
  resetRooms()
})

describe('createRoom', () => {
  it('names an unnamed room after its id rather than leaving it blank', () => {
    const room = createRoom({ ownerOperatorId: OWNER })
    expect(room.name).toContain(room.id.slice(0, 8))
    expect(room.participants.size).toBe(0)
  })

  it('clamps the participant cap to what a mesh can carry', () => {
    expect(createRoom({ ownerOperatorId: OWNER, maxParticipants: 99 }).maxParticipants).toBe(
      MAX_PARTICIPANTS_LIMIT
    )
    // Below two there is nobody to call.
    expect(createRoom({ ownerOperatorId: OWNER, maxParticipants: 1 }).maxParticipants).toBe(2)
    expect(createRoom({ ownerOperatorId: OWNER, maxParticipants: 3.7 }).maxParticipants).toBe(3)
  })

  it('defaults to the web platform, not to a messenger', () => {
    expect(createRoom({ ownerOperatorId: OWNER }).platform).toBe('web')
  })
})

describe('joinRoom', () => {
  it('admits a participant and marks the owner as the operator', () => {
    const room = createRoom({ ownerOperatorId: OWNER })
    const result = joinRoom(room.id, { operatorId: OWNER, name: 'Owner' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.participant.role).toBe('operator')
    expect(room.participants.size).toBe(1)
  })

  it('marks anyone else as a guest', () => {
    const room = createRoom({ ownerOperatorId: OWNER })
    const result = joinRoom(room.id, { operatorId: GUEST, name: 'Guest' })
    expect(result.ok && result.participant.role).toBe('guest')
  })

  it('refuses an unknown room', () => {
    expect(joinRoom('nope', { operatorId: OWNER, name: 'x' })).toEqual({
      ok: false,
      error: 'room_not_found',
    })
  })

  it('refuses a full room instead of overfilling the mesh', () => {
    const room = createRoom({ ownerOperatorId: OWNER, maxParticipants: 2 })
    joinRoom(room.id, { operatorId: 'a', name: 'A' })
    joinRoom(room.id, { operatorId: 'b', name: 'B' })
    expect(joinRoom(room.id, { operatorId: 'c', name: 'C' })).toEqual({
      ok: false,
      error: 'room_full',
    })
    expect(room.participants.size).toBe(2)
  })

  it('refuses the same operator twice — a second seat would negotiate against itself', () => {
    const room = createRoom({ ownerOperatorId: OWNER })
    joinRoom(room.id, { operatorId: OWNER, name: 'Owner' })
    expect(joinRoom(room.id, { operatorId: OWNER, name: 'Owner again' })).toEqual({
      ok: false,
      error: 'already_joined',
    })
  })
})

describe('leaveRoom', () => {
  it('frees the seat', () => {
    const room = createRoom({ ownerOperatorId: OWNER, maxParticipants: 2 })
    const joined = joinRoom(room.id, { operatorId: OWNER, name: 'Owner' })
    if (!joined.ok) throw new Error('setup failed')

    expect(leaveRoom(room.id, joined.participant.id)?.id).toBe(joined.participant.id)
    expect(room.participants.size).toBe(0)
    expect(joinRoom(room.id, { operatorId: 'c', name: 'C' }).ok).toBe(true)
  })

  it('is a no-op for an unknown room or participant', () => {
    const room = createRoom({ ownerOperatorId: OWNER })
    expect(leaveRoom('nope', 'x')).toBeNull()
    expect(leaveRoom(room.id, 'x')).toBeNull()
  })

  it('removes the participant from the membership index', () => {
    const room = createRoom({ ownerOperatorId: OWNER })
    const joined = joinRoom(room.id, { operatorId: OWNER, name: 'Owner' })
    if (!joined.ok) throw new Error('setup failed')

    expect(isOperatorInRoom(room.id, OWNER)).toBe(true)
    leaveRoom(room.id, joined.participant.id)
    expect(isOperatorInRoom(room.id, OWNER)).toBe(false)
  })
})

describe('closeRoom — a room id is a capability', () => {
  it('lets the owner close it', () => {
    const room = createRoom({ ownerOperatorId: OWNER })
    const joined = joinRoom(room.id, { operatorId: OWNER, name: 'Owner' })
    if (!joined.ok) throw new Error('setup failed')
    expect(closeRoom(room.id, OWNER)).toBe(true)
    expect(getRoom(room.id)).toBeNull()
    expect(isOperatorInRoom(room.id, OWNER)).toBe(false)
  })

  it('refuses anyone else, and the room stands', () => {
    const room = createRoom({ ownerOperatorId: OWNER })
    expect(closeRoom(room.id, GUEST)).toBe(false)
    expect(getRoom(room.id)).not.toBeNull()
  })
})

describe('listRoomsForOperator — no operator sees another operator’s calls', () => {
  it('returns only rooms the caller owns', () => {
    createRoom({ ownerOperatorId: OWNER, name: 'mine' })
    createRoom({ ownerOperatorId: GUEST, name: 'theirs' })
    const mine = listRoomsForOperator(OWNER)
    expect(mine).toHaveLength(1)
    expect(mine[0]?.name).toBe('mine')
  })
})

describe('telemetry is reported, never invented', () => {
  const measurement = {
    signalQuality: 91,
    latency: 38,
    frameRate: 30,
    bitrate: 1800,
    packetLoss: 0.4,
  }

  it('serves back what a participant measured', () => {
    const room = createRoom({ ownerOperatorId: OWNER })
    recordTelemetry(room.id, OWNER, measurement)
    expect(currentTelemetry(room)).toMatchObject({ ...measurement, reportedBy: OWNER })
  })

  it('has nothing to serve before anyone reports', () => {
    const room = createRoom({ ownerOperatorId: OWNER })
    expect(currentTelemetry(room)).toBeNull()
  })

  it('drops a stale measurement rather than presenting it as current', () => {
    const room = createRoom({ ownerOperatorId: OWNER })
    recordTelemetry(room.id, OWNER, measurement)
    const later = Date.now() + TELEMETRY_MAX_AGE_MS + 1000
    expect(currentTelemetry(room, later)).toBeNull()
  })

  it('ignores a report for a room that does not exist', () => {
    expect(recordTelemetry('nope', OWNER, measurement)).toBeNull()
  })
})

describe('findRoomForOperator', () => {
  it('finds the room and seat an operator currently holds', () => {
    const room = createRoom({ ownerOperatorId: OWNER })
    joinRoom(room.id, { operatorId: GUEST, name: 'Guest' })
    const found = findRoomForOperator(GUEST)
    expect(found?.room.id).toBe(room.id)
    expect(found?.participant.operatorId).toBe(GUEST)
  })

  it('returns null for an operator who is not in a call', () => {
    createRoom({ ownerOperatorId: OWNER })
    expect(findRoomForOperator(GUEST)).toBeNull()
  })
})

describe('sweepEmptyRooms', () => {
  it('drops an empty room past the TTL', () => {
    createRoom({ ownerOperatorId: OWNER })
    expect(sweepEmptyRooms(Date.now() + EMPTY_ROOM_TTL_MS + 1000)).toBe(1)
    expect(roomCount()).toBe(0)
  })

  it('keeps an empty room that is still young', () => {
    createRoom({ ownerOperatorId: OWNER })
    expect(sweepEmptyRooms(Date.now())).toBe(0)
  })

  it('never drops a room with someone in it, however old', () => {
    const room = createRoom({ ownerOperatorId: OWNER })
    joinRoom(room.id, { operatorId: OWNER, name: 'Owner' })
    expect(sweepEmptyRooms(Date.now() + EMPTY_ROOM_TTL_MS * 100)).toBe(0)
  })

  it('keeps a scheduled room until after its event window', () => {
    const now = Date.now()
    const scheduledFor = now + 24 * 60 * 60 * 1000
    const room = createRoom({ ownerOperatorId: OWNER })
    expect(scheduleRoom(room.id, OWNER, scheduledFor)?.scheduledFor).toBe(scheduledFor)
    expect(sweepEmptyRooms(now + EMPTY_ROOM_TTL_MS * 2)).toBe(0)
    expect(sweepEmptyRooms(scheduledFor + SCHEDULED_ROOM_GRACE_MS + 1)).toBe(1)
  })

  it('does not let another operator reschedule the room', () => {
    const room = createRoom({ ownerOperatorId: OWNER })
    expect(scheduleRoom(room.id, GUEST, Date.now() + 60_000)).toBeNull()
  })
})

describe('toView', () => {
  it('renders participants as an array so the room can be serialized', () => {
    const room = createRoom({ ownerOperatorId: OWNER })
    joinRoom(room.id, { operatorId: OWNER, name: 'Owner' })
    const view = toView(room)
    expect(Array.isArray(view.participants)).toBe(true)
    expect(view.participantCount).toBe(1)
    expect(JSON.parse(JSON.stringify(view)).participants).toHaveLength(1)
  })
})
