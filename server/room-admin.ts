/**
 * room-admin.ts — Telegram VC room moderation (ROOM-ADMIN.md).
 *
 * Studio operators mute / kick / pin / end against the active Telegram connection.
 * This module validates the request shape and maps actions onto telegramVcAdapter.
 * Full MTProto phone.* mapping still pending in the Python adapter for several actions.
 *
 * Authorization uses THREE separate auth planes (do not merge Better Auth with Authentik):
 *  1. FriskyDev ID / Authentik (operatorPlatform friskydev | supabase) — full room admin
 *     when the actor owns or operates the room.
 *  2. NEBU Better Auth consumer — limited dens-host actions only when they own/host a
 *     NEBU-linked room. Session resolution into this route is STUB until wired.
 *  3. Telegram guest / participant — no moderation (participant list read stays elsewhere).
 */

import {
  telegramVcAdapter,
  type TelegramVcAdminParticipant,
  type TelegramVcAdminResult,
} from './telegram-vc-adapter'
import { getRoom, type Room } from './rooms'

export const ROOM_ADMIN_ACTIONS = [
  'mute',
  'unmute',
  'kick',
  'pin',
  'end',
  'title',
  'invite',
] as const

export type RoomAdminActionName = (typeof ROOM_ADMIN_ACTIONS)[number]

/** Auth planes stay separate — never collapse NEBU cookies into studio sessions. */
export type RoomAdminAuthPlane = 'friskydev' | 'nebu' | 'telegram_guest'

/**
 * Capability roles derived from auth plane + room relationship.
 * - studio_operator: full mute/unmute/kick/pin/end/title/invite
 * - nebu_host: limited dens host (mute/unmute/kick/pin/end) — no studio title/invite
 * - guest: no moderation actions
 */
export type RoomAdminRole = 'studio_operator' | 'nebu_host' | 'guest'

export type OperatorPlatform =
  | 'telegram'
  | 'discord'
  | 'anonymous'
  | 'friskydev'
  | 'supabase'

export type RoomAdminRequest = {
  action: RoomAdminActionName
  target?: string
  title?: string
}

export type RoomAdminActor = {
  operatorId: string
  operatorPlatform: OperatorPlatform
  /**
   * STUB: set when /v1/rooms/:id/admin resolves a verified NEBU Better Auth session.
   * Prefer `nebu:${userId}` owner ids for NEBU-linked rooms. Do not reuse studio cookies.
   */
  nebuUserId?: string | null
  /** True only after a real Better Auth getSession succeeds (never invent). */
  nebuSessionVerified?: boolean
}

export type RoomAdminErrorCode =
  | 'room_not_found'
  | 'forbidden'
  | 'telegram_only'
  | 'invalid_action'
  | 'target_required'
  | 'title_required'
  | 'adapter_error'
  | 'nebu_session_stub'

export type RoomAdminSuccess = {
  ok: true
  action: RoomAdminActionName
  participants: TelegramVcAdminParticipant[]
  count: number
  pendingMtproto?: string
  title?: string | null
  role?: RoomAdminRole
  authPlane?: RoomAdminAuthPlane
  canModerate?: boolean
}

export type RoomAdminFailure = {
  ok: false
  error: string
  code: RoomAdminErrorCode
  role?: RoomAdminRole
  authPlane?: RoomAdminAuthPlane
}

export type RoomAdminResult = RoomAdminSuccess | RoomAdminFailure

const ACTIONS_NEEDING_TARGET: ReadonlySet<RoomAdminActionName> = new Set([
  'mute',
  'unmute',
  'kick',
  'pin',
  'invite',
])

/** Full studio / Authentik operator surface. */
export const STUDIO_OPERATOR_ACTIONS: readonly RoomAdminActionName[] = [
  'mute',
  'unmute',
  'kick',
  'pin',
  'end',
  'title',
  'invite',
]

/** Limited NEBU dens-host surface — no studio title/invite powers. */
export const NEBU_HOST_ACTIONS: readonly RoomAdminActionName[] = [
  'mute',
  'unmute',
  'kick',
  'pin',
  'end',
]

/** Guests cannot moderate. */
export const GUEST_ACTIONS: readonly RoomAdminActionName[] = []

export const ROOM_ADMIN_ROLE_MATRIX: Record<RoomAdminRole, readonly RoomAdminActionName[]> = {
  studio_operator: STUDIO_OPERATOR_ACTIONS,
  nebu_host: NEBU_HOST_ACTIONS,
  guest: GUEST_ACTIONS,
}

export function actionsForRole(role: RoomAdminRole): ReadonlySet<RoomAdminActionName> {
  return new Set(ROOM_ADMIN_ROLE_MATRIX[role])
}

export function roleCanModerate(role: RoomAdminRole): boolean {
  return actionsForRole(role).size > 0
}

export function roleAllowsAction(role: RoomAdminRole, action: RoomAdminActionName): boolean {
  return actionsForRole(role).has(action)
}

export function parseRoomAdminAction(raw: unknown): RoomAdminActionName | null {
  if (typeof raw !== 'string') return null
  return (ROOM_ADMIN_ACTIONS as readonly string[]).includes(raw)
    ? (raw as RoomAdminActionName)
    : null
}

/** FriskyDev ID / Authentik studio plane (also supabase-brokered FriskyDev identity). */
export function isStudioAuthPlane(platform: OperatorPlatform): boolean {
  return platform === 'friskydev' || platform === 'supabase'
}

/**
 * NEBU-linked room heuristic for dens-host gating.
 * Prefer owner ids minted as `nebu:<better-auth-user-id>` once Better Auth is wired.
 */
export function isNebuLinkedRoom(room: Room): boolean {
  return room.ownerOperatorId.startsWith('nebu:')
}

export function actorOwnsRoom(room: Room, actor: RoomAdminActor): boolean {
  if (room.ownerOperatorId === actor.operatorId) return true
  if (actor.nebuSessionVerified && actor.nebuUserId) {
    return room.ownerOperatorId === `nebu:${actor.nebuUserId}`
  }
  return false
}

/** True when the actor is already in the room with ParticipantRole operator. */
export function actorOperatesRoom(room: Room, operatorId: string): boolean {
  for (const participant of room.participants.values()) {
    if (participant.operatorId === operatorId && participant.role === 'operator') {
      return true
    }
  }
  return false
}

/**
 * Resolve which auth plane is speaking. Planes stay separate:
 * Authentik/FriskyDev is never inferred from a NEBU cookie, and vice versa.
 */
export function resolveRoomAdminAuthPlane(actor: RoomAdminActor): RoomAdminAuthPlane {
  if (actor.nebuSessionVerified && actor.nebuUserId) return 'nebu'
  if (isStudioAuthPlane(actor.operatorPlatform)) return 'friskydev'
  return 'telegram_guest'
}

/**
 * Map actor + room relationship onto a capability role.
 *
 * Matrix (ROOM-ADMIN.md):
 * | Plane              | Relationship                         | Role             | Actions                          |
 * |--------------------|--------------------------------------|------------------|----------------------------------|
 * | friskydev/Authentik| owns OR operates room                | studio_operator  | mute…invite (full)               |
 * | nebu Better Auth   | owns/hosts NEBU-linked room          | nebu_host        | mute unmute kick pin end         |
 * | telegram guest     | participant / everyone else          | guest            | (none — no moderation)           |
 *
 * Legacy telegram/discord/anonymous room *owners* (not guests) get dens-host limited
 * capabilities so existing owner flows keep mute/kick/end without studio title/invite.
 */
export function resolveRoomAdminRole(room: Room, actor: RoomAdminActor): RoomAdminRole {
  const owns = actorOwnsRoom(room, actor)
  const operates = actorOperatesRoom(room, actor.operatorId)
  const plane = resolveRoomAdminAuthPlane(actor)

  if (plane === 'friskydev' && (owns || operates)) {
    return 'studio_operator'
  }

  if (plane === 'nebu') {
    if (owns && isNebuLinkedRoom(room)) return 'nebu_host'
    if (owns) return 'nebu_host'
    return 'guest'
  }

  // telegram / discord / anonymous: owners get limited dens-host; participants do not.
  if (owns) return 'nebu_host'
  return 'guest'
}

export type RoomAdminCapabilityView = {
  role: RoomAdminRole
  authPlane: RoomAdminAuthPlane
  canModerate: boolean
  allowedActions: RoomAdminActionName[]
}

export function describeRoomAdminCapabilities(
  room: Room,
  actor: RoomAdminActor
): RoomAdminCapabilityView {
  const role = resolveRoomAdminRole(room, actor)
  const authPlane = resolveRoomAdminAuthPlane(actor)
  const allowed = [...actionsForRole(role)]
  return {
    role,
    authPlane,
    canModerate: allowed.length > 0,
    allowedActions: allowed,
  }
}

/**
 * STUB gate: Better Auth session is not yet resolved inside /v1/rooms/:id/admin.
 * Wire getNebuAuth().api.getSession({ headers }) here without touching studio cookies.
 * Returns null until that hook lands — callers must not invent a NEBU identity.
 */
export function resolveNebuSessionForRoomAdmin(_cookieHeader: string | undefined): {
  userId: string
  email?: string
} | null {
  // STUB — Better Auth session not wired into room-admin yet (see docs/NEBU-LOGIN.md).
  void _cookieHeader
  return null
}

export function validateRoomAdminAccess(
  room: Room | null,
  actorOrOperatorId: RoomAdminActor | string,
  action?: RoomAdminActionName
): RoomAdminFailure | null {
  const actor: RoomAdminActor =
    typeof actorOrOperatorId === 'string'
      ? {
          operatorId: actorOrOperatorId,
          // Backward-compatible overload: treat bare operatorId as legacy owner check path
          // used by older tests; platform defaults to anonymous dens-host-if-owner.
          operatorPlatform: 'anonymous',
        }
      : actorOrOperatorId

  if (!room) {
    return { ok: false, code: 'room_not_found', error: 'Room not found' }
  }

  // ROOM-ADMIN.md: Telegram-only in v1 (no Discord voice moderation surface).
  if (room.platform !== 'telegram') {
    return {
      ok: false,
      code: 'telegram_only',
      error: 'Room admin is Telegram-only in v1 — set the room platform to telegram',
      role: 'guest',
      authPlane: resolveRoomAdminAuthPlane(actor),
    }
  }

  const caps = describeRoomAdminCapabilities(room, actor)

  if (!caps.canModerate) {
    return {
      ok: false,
      code: 'forbidden',
      error:
        'Room admin denied — Telegram guests and non-host participants cannot moderate. Sign in as the room owner/host (FriskyDev studio or NEBU dens host).',
      role: caps.role,
      authPlane: caps.authPlane,
    }
  }

  if (action && !roleAllowsAction(caps.role, action)) {
    return {
      ok: false,
      code: 'forbidden',
      error: `Action "${action}" is not allowed for role ${caps.role} (${caps.authPlane} plane). Allowed: ${caps.allowedActions.join(', ') || '(none)'}`,
      role: caps.role,
      authPlane: caps.authPlane,
    }
  }

  // Explicit STUB signal when a caller asserts NEBU intent without a verified session.
  if (
    actor.nebuUserId &&
    !actor.nebuSessionVerified &&
    caps.authPlane !== 'friskydev'
  ) {
    return {
      ok: false,
      code: 'nebu_session_stub',
      error:
        'NEBU Better Auth session is not wired into /v1/rooms/:id/admin yet (STUB). Dens-host moderation requires a verified nebu_session — do not reuse studio Authentik cookies.',
      role: 'guest',
      authPlane: 'nebu',
    }
  }

  return null
}

export function validateRoomAdminRequest(body: RoomAdminRequest): RoomAdminFailure | null {
  if (!parseRoomAdminAction(body.action)) {
    return {
      ok: false,
      code: 'invalid_action',
      error: `Invalid action. Expected one of: ${ROOM_ADMIN_ACTIONS.join(', ')}`,
    }
  }
  if (ACTIONS_NEEDING_TARGET.has(body.action) && !body.target?.trim()) {
    return { ok: false, code: 'target_required', error: 'target user id is required for this action' }
  }
  if (body.action === 'title' && !body.title?.trim()) {
    return { ok: false, code: 'title_required', error: 'title is required for the title action' }
  }
  return null
}

function toSuccess(
  action: RoomAdminActionName,
  result: TelegramVcAdminResult,
  caps?: RoomAdminCapabilityView
): RoomAdminSuccess {
  return {
    ok: true,
    action,
    participants: result.participants ?? [],
    count: result.count ?? result.participants?.length ?? 0,
    pendingMtproto: result.pendingMtproto,
    title: result.title ?? null,
    role: caps?.role,
    authPlane: caps?.authPlane,
    canModerate: caps?.canModerate,
  }
}

/**
 * Execute a room-admin command against the live Telegram VC adapter.
 * Errors from the adapter (not live, permission denied, pending mapping) surface to the caller.
 */
export async function executeRoomAdmin(
  roomId: string,
  actorOrOperatorId: RoomAdminActor | string,
  body: RoomAdminRequest
): Promise<RoomAdminResult> {
  const actor: RoomAdminActor =
    typeof actorOrOperatorId === 'string'
      ? { operatorId: actorOrOperatorId, operatorPlatform: 'anonymous' }
      : actorOrOperatorId

  const room = getRoom(roomId)
  const parsed = parseRoomAdminAction(body.action)
  if (!parsed) {
    return validateRoomAdminRequest(body) as RoomAdminFailure
  }

  const access = validateRoomAdminAccess(room, actor, parsed)
  if (access) return access

  const shape = validateRoomAdminRequest({ ...body, action: parsed })
  if (shape) return shape

  const caps = room ? describeRoomAdminCapabilities(room, actor) : undefined

  try {
    let result: TelegramVcAdminResult
    switch (parsed) {
      case 'mute':
        result = await telegramVcAdapter.mute(body.target!.trim())
        break
      case 'unmute':
        result = await telegramVcAdapter.unmute(body.target!.trim())
        break
      case 'kick':
        result = await telegramVcAdapter.kick(body.target!.trim())
        break
      case 'pin':
        result = await telegramVcAdapter.pin(body.target!.trim())
        break
      case 'end':
        result = await telegramVcAdapter.end()
        break
      case 'title':
        result = await telegramVcAdapter.title(body.title!.trim())
        break
      case 'invite':
        result = await telegramVcAdapter.invite(body.target!.trim())
        break
    }
    return toSuccess(parsed, result, caps)
  } catch (error) {
    return {
      ok: false,
      code: 'adapter_error',
      error: error instanceof Error ? error.message : 'Telegram room admin failed',
    }
  }
}

export function httpStatusForRoomAdmin(
  result: RoomAdminFailure
): 400 | 403 | 404 | 503 {
  switch (result.code) {
    case 'room_not_found':
      return 404
    case 'forbidden':
    case 'telegram_only':
    case 'nebu_session_stub':
      return 403
    case 'invalid_action':
    case 'target_required':
    case 'title_required':
      return 400
    case 'adapter_error':
      return 503
  }
}
