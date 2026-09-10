/**
 * room-admin.ts — Telegram VC room moderation (ROOM-ADMIN.md).
 *
 * Studio operators mute / kick / pin / end against the active Telegram connection.
 * This module validates the request shape and maps actions onto telegramVcAdapter.
 * Full MTProto phone.* mapping still pending in the Python adapter for several actions.
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

export type RoomAdminRequest = {
  action: RoomAdminActionName
  target?: string
  title?: string
}

export type RoomAdminErrorCode =
  | 'room_not_found'
  | 'forbidden'
  | 'telegram_only'
  | 'invalid_action'
  | 'target_required'
  | 'title_required'
  | 'adapter_error'

export type RoomAdminSuccess = {
  ok: true
  action: RoomAdminActionName
  participants: TelegramVcAdminParticipant[]
  count: number
  pendingMtproto?: string
  title?: string | null
}

export type RoomAdminFailure = {
  ok: false
  error: string
  code: RoomAdminErrorCode
}

export type RoomAdminResult = RoomAdminSuccess | RoomAdminFailure

const ACTIONS_NEEDING_TARGET: ReadonlySet<RoomAdminActionName> = new Set([
  'mute',
  'unmute',
  'kick',
  'pin',
  'invite',
])

export function parseRoomAdminAction(raw: unknown): RoomAdminActionName | null {
  if (typeof raw !== 'string') return null
  return (ROOM_ADMIN_ACTIONS as readonly string[]).includes(raw)
    ? (raw as RoomAdminActionName)
    : null
}

export function validateRoomAdminAccess(
  room: Room | null,
  operatorId: string
): RoomAdminFailure | null {
  if (!room) {
    return { ok: false, code: 'room_not_found', error: 'Room not found' }
  }
  if (room.ownerOperatorId !== operatorId) {
    return { ok: false, code: 'forbidden', error: 'Only the room owner can run admin commands' }
  }
  // ROOM-ADMIN.md: Telegram-only in v1 (no Discord voice moderation surface).
  if (room.platform !== 'telegram') {
    return {
      ok: false,
      code: 'telegram_only',
      error: 'Room admin is Telegram-only in v1 — set the room platform to telegram',
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

function toSuccess(action: RoomAdminActionName, result: TelegramVcAdminResult): RoomAdminSuccess {
  return {
    ok: true,
    action,
    participants: result.participants ?? [],
    count: result.count ?? result.participants?.length ?? 0,
    pendingMtproto: result.pendingMtproto,
    title: result.title ?? null,
  }
}

/**
 * Execute a room-admin command against the live Telegram VC adapter.
 * Errors from the adapter (not live, permission denied, pending mapping) surface to the caller.
 */
export async function executeRoomAdmin(
  roomId: string,
  operatorId: string,
  body: RoomAdminRequest
): Promise<RoomAdminResult> {
  const room = getRoom(roomId)
  const access = validateRoomAdminAccess(room, operatorId)
  if (access) return access

  const parsed = parseRoomAdminAction(body.action)
  if (!parsed) {
    return validateRoomAdminRequest(body) as RoomAdminFailure
  }

  const shape = validateRoomAdminRequest({ ...body, action: parsed })
  if (shape) return shape

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
    return toSuccess(parsed, result)
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
      return 403
    case 'invalid_action':
    case 'target_required':
    case 'title_required':
      return 400
    case 'adapter_error':
      return 503
  }
}
