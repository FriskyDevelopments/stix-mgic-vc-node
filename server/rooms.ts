/**
 * rooms.ts — the room registry behind the media plane.
 *
 * A room is where a live VC session actually happens: a small set of participants who
 * hold WebRTC peer connections with each other. The node is the SIGNALING authority, not
 * a media relay — audio and video travel peer to peer, and nothing here ever touches a
 * media frame. That is what keeps a control-plane box able to host sessions at all.
 *
 * Topology is a full mesh: every participant connects to every other one. Fine for the
 * operator-sized rooms this product is about, and it needs no SFU to deploy. `maxParticipants`
 * is capped low on purpose — a mesh costs each client (n-1) uploads, so a large room does
 * not degrade, it collapses.
 *
 * Telemetry is REPORTED, never invented. Frame rate, bitrate and packet loss only exist
 * inside a peer connection (`RTCPeerConnection.getStats()`), so participants post what
 * they measure and the snapshot serves the last measurement with its age. With nothing
 * reported the numbers read zero and the source reads `unavailable` — see sessions.ts.
 */
import { randomUUID } from 'node:crypto'

export type RoomPlatform = 'telegram' | 'discord' | 'web'

export type ParticipantRole = 'operator' | 'guest'

export type Participant = {
  id: string
  operatorId: string
  name: string
  role: ParticipantRole
  joinedAt: number
}

/** What a participant measured on its own peer connections. */
export type RoomTelemetry = {
  signalQuality: number
  latency: number
  frameRate: number
  bitrate: number
  packetLoss: number
  reportedAt: number
  reportedBy: string
}

export type Room = {
  id: string
  name: string
  ownerOperatorId: string
  platform: RoomPlatform
  maxParticipants: number
  createdAt: number
  participants: Map<string, Participant>
  telemetry: RoomTelemetry | null
}

export type RoomView = Omit<Room, 'participants'> & {
  participants: Participant[]
  participantCount: number
}

export type JoinError = 'room_not_found' | 'room_full' | 'already_joined'
export type JoinResult = { ok: true; participant: Participant } | { ok: false; error: JoinError }

/**
 * Mesh ceiling. Eight participants is already 56 peer connections across the room; past
 * that a mesh needs an SFU, which is a different product decision (see MEDIA-PLANE.md).
 */
export const MAX_PARTICIPANTS_LIMIT = 8
const DEFAULT_MAX_PARTICIPANTS = 4

/** An empty room is swept after this long, so an abandoned room id cannot be squatted. */
export const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000

/** Telemetry older than this is stale and reported as such rather than served as current. */
export const TELEMETRY_MAX_AGE_MS = 15 * 1000

const rooms = new Map<string, Room>()

function clampParticipants(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_MAX_PARTICIPANTS
  return Math.min(Math.max(Math.trunc(requested), 2), MAX_PARTICIPANTS_LIMIT)
}

export function toView(room: Room): RoomView {
  const { participants, ...rest } = room
  return {
    ...rest,
    participants: [...participants.values()],
    participantCount: participants.size,
  }
}

export function createRoom(input: {
  ownerOperatorId: string
  name?: string
  platform?: RoomPlatform
  maxParticipants?: number
}): Room {
  const id = randomUUID()
  const room: Room = {
    id,
    name: input.name?.trim() || `Room ${id.slice(0, 8)}`,
    ownerOperatorId: input.ownerOperatorId,
    platform: input.platform ?? 'web',
    maxParticipants: clampParticipants(input.maxParticipants),
    createdAt: Date.now(),
    participants: new Map(),
    telemetry: null,
  }
  rooms.set(id, room)
  return room
}

export function getRoom(roomId: string): Room | null {
  return rooms.get(roomId) ?? null
}

/** Rooms owned by one operator. There is no unscoped listing — see the route in app.ts. */
export function listRoomsForOperator(operatorId: string): Room[] {
  return [...rooms.values()].filter((room) => room.ownerOperatorId === operatorId)
}

/**
 * Add a participant. Refuses a full room and refuses the same operator twice: a second
 * tab joining as the same operator would otherwise negotiate against itself and each
 * client would render its own camera as the remote peer.
 */
export function joinRoom(
  roomId: string,
  input: { operatorId: string; name: string; role?: ParticipantRole }
): JoinResult {
  const room = rooms.get(roomId)
  if (!room) return { ok: false, error: 'room_not_found' }
  if (room.participants.size >= room.maxParticipants) return { ok: false, error: 'room_full' }

  for (const existing of room.participants.values()) {
    if (existing.operatorId === input.operatorId) return { ok: false, error: 'already_joined' }
  }

  const participant: Participant = {
    id: randomUUID(),
    operatorId: input.operatorId,
    name: input.name,
    role: input.role ?? (room.ownerOperatorId === input.operatorId ? 'operator' : 'guest'),
    joinedAt: Date.now(),
  }
  room.participants.set(participant.id, participant)
  return { ok: true, participant }
}

export function leaveRoom(roomId: string, participantId: string): Participant | null {
  const room = rooms.get(roomId)
  if (!room) return null
  const participant = room.participants.get(participantId)
  if (!participant) return null
  room.participants.delete(participantId)
  return participant
}

/** Close a room. Only its owner may; everyone else gets `false` and the room stands. */
export function closeRoom(roomId: string, byOperatorId: string): boolean {
  const room = rooms.get(roomId)
  if (!room) return false
  if (room.ownerOperatorId !== byOperatorId) return false
  rooms.delete(roomId)
  return true
}

export function recordTelemetry(
  roomId: string,
  reportedBy: string,
  measurement: Omit<RoomTelemetry, 'reportedAt' | 'reportedBy'>
): RoomTelemetry | null {
  const room = rooms.get(roomId)
  if (!room) return null
  room.telemetry = { ...measurement, reportedAt: Date.now(), reportedBy }
  return room.telemetry
}

/** The last measurement, or null when there is none or it has gone stale. */
export function currentTelemetry(room: Room, now = Date.now()): RoomTelemetry | null {
  if (!room.telemetry) return null
  return now - room.telemetry.reportedAt <= TELEMETRY_MAX_AGE_MS ? room.telemetry : null
}

/** The room this operator is currently in, if any. One live room per operator. */
export function findRoomForOperator(operatorId: string): { room: Room; participant: Participant } | null {
  for (const room of rooms.values()) {
    for (const participant of room.participants.values()) {
      if (participant.operatorId === operatorId) return { room, participant }
    }
  }
  return null
}

/** Drop rooms that have been empty past the TTL. Returns how many went. */
export function sweepEmptyRooms(now = Date.now(), ttlMs = EMPTY_ROOM_TTL_MS): number {
  let removed = 0
  for (const [id, room] of rooms) {
    if (room.participants.size === 0 && now - room.createdAt > ttlMs) {
      rooms.delete(id)
      removed++
    }
  }
  return removed
}

/** Test seam only — the process never resets its registry at runtime. */
export function resetRooms(): void {
  rooms.clear()
}

export function roomCount(): number {
  return rooms.size
}
