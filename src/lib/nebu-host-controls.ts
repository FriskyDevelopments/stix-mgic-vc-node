/**
 * Nebu Host Controls — pure types and state helpers for live/session host actions.
 *
 * Consent-forward: camera/mic requests never imply secret activation.
 * Backend signals that are not yet on the wire are marked STUB_BACKEND so the UI
 * stays honest while CallClient/signaling grow the relay.
 */

export type CameraRequestState =
  | 'idle'
  | 'request_sent'
  | 'waiting'
  | 'camera_live'
  | 'declined'
  | 'unavailable'

export type MicAudioState =
  | 'live'
  | 'muted'
  | 'host_muted'
  | 'speaking'
  | 'request_sent'
  | 'audio_unavailable'

export type ParticipantConnectionState =
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'pending_request'

export type MiniWidgetSize = 'compact' | 'standard' | 'expanded_mini'

export type SessionChromeMode = 'full' | 'mini'

export type HostNudgeKind =
  | 'please_turn_on_camera'
  | 'please_unmute'
  | 'check_mic'
  | 'check_connection'
  | 'stand_by'
  | 'youre_live_next'
  | 'host_needs_attention'
  | 'custom'

export type HostNudge = {
  id: string
  kind: HostNudgeKind
  message: string
  participantId?: string
  createdAt: number
}

export type HostParticipantView = {
  id: string
  name: string
  role: 'operator' | 'guest'
  connection: ParticipantConnectionState
  cameraOn: boolean
  micState: MicAudioState
  cameraRequest: CameraRequestState
  isActiveSpeaker: boolean
  isSpotlighted: boolean
  isPinned: boolean
}

export type RoomHostState = {
  locked: boolean
  inviteUrl: string | null
  sessionHealth: 'healthy' | 'degraded' | 'unknown'
  ended: boolean
}

export type BusyNoteState = {
  active: boolean
  label: string
  /** When set, the mini widget can surface a one-tap resume. */
  resumeHint?: string
}

export type AttentionItem = {
  id: string
  priority: number
  title: string
  detail: string
  /** One-click safe action id the chrome can resolve. */
  actionId: string
  participantId?: string
}

export type RoomAdminParticipantView = {
  id: string
  name: string
  muted: boolean
  speaking?: boolean
  pinned?: boolean
}

export type HostControlAction =
  | { type: 'request_camera'; participantId: string }
  | { type: 'remind_camera'; participantId: string }
  | { type: 'disable_camera'; participantId: string }
  | { type: 'spotlight'; participantId: string | null }
  | { type: 'pin'; participantId: string | null }
  | { type: 'return_auto_view' }
  | { type: 'mute_participant'; participantId: string }
  | { type: 'request_unmute'; participantId: string }
  | { type: 'request_turn_mic_on'; participantId: string }
  | { type: 'mute_all' }
  | { type: 'flag_audio_problem'; participantId: string }
  | { type: 'select_participant'; participantId: string | null }
  | { type: 'private_notice'; participantId: string; message: string }
  | { type: 'remove_participant'; participantId: string }
  | { type: 'invite_copy' }
  | { type: 'lock_room'; locked: boolean }
  | { type: 'broadcast_notice'; message: string }
  | { type: 'end_session' }
  | { type: 'send_nudge'; kind: HostNudgeKind; participantId?: string; customMessage?: string }
  | { type: 'camera_request_response'; accepted: boolean }
  | { type: 'set_chrome_mode'; mode: SessionChromeMode }
  | { type: 'set_mini_size'; size: MiniWidgetSize }
  | { type: 'set_busy_note'; note: BusyNoteState }
  | { type: 'dismiss_attention'; id: string }
  | { type: 'resolve_attention'; id: string }
  | { type: 'set_telegram_vc_live'; live: boolean }
  | {
      type: 'set_room_admin_participants'
      participants: RoomAdminParticipantView[]
      pendingMtproto?: string | null
      title?: string | null
    }
  | { type: 'room_admin_unmute'; participantId: string }
  | { type: 'room_admin_kick'; participantId: string }
  | { type: 'room_admin_mute'; participantId: string }
  | { type: 'room_admin_pin'; participantId: string }
  | { type: 'room_admin_end' }
  | {
      type: 'set_room_admin_capabilities'
      role: RoomAdminUiRole
      authPlane: RoomAdminUiAuthPlane
      canModerate?: boolean
    }

/** Wire payload relayed over signaling when both peers are online. */
export type HostControlWirePayload =
  | {
      kind: 'camera_request'
      requestId: string
      fromParticipantId: string
      toParticipantId: string
    }
  | {
      kind: 'camera_request_result'
      requestId: string
      fromParticipantId: string
      toParticipantId: string
      result: 'camera_live' | 'declined' | 'unavailable'
    }
  | {
      kind: 'unmute_request'
      requestId: string
      fromParticipantId: string
      toParticipantId: string
      mode: 'request_unmute' | 'turn_mic_on'
    }
  | {
      kind: 'host_mute'
      fromParticipantId: string
      toParticipantId: string
    }
  | {
      kind: 'nudge'
      nudge: HostNudge
      toParticipantId?: string
    }
  | {
      kind: 'private_notice'
      fromParticipantId: string
      toParticipantId: string
      message: string
    }
  | {
      kind: 'broadcast_notice'
      fromParticipantId: string
      message: string
    }
  | {
      kind: 'remove'
      fromParticipantId: string
      toParticipantId: string
    }
  | {
      kind: 'room_lock'
      fromParticipantId: string
      locked: boolean
    }
  | {
      kind: 'session_end'
      fromParticipantId: string
    }

/** Room-admin capability role — mirrors server/room-admin.ts (planes stay separate). */
export type RoomAdminUiRole = 'studio_operator' | 'nebu_host' | 'guest'

export type RoomAdminUiAuthPlane = 'friskydev' | 'nebu' | 'telegram_guest'

export type RoomAdminUiAction =
  | 'mute'
  | 'unmute'
  | 'kick'
  | 'pin'
  | 'end'
  | 'title'
  | 'invite'

export const ROOM_ADMIN_UI_ACTIONS: Record<RoomAdminUiRole, readonly RoomAdminUiAction[]> = {
  studio_operator: ['mute', 'unmute', 'kick', 'pin', 'end', 'title', 'invite'],
  nebu_host: ['mute', 'unmute', 'kick', 'pin', 'end'],
  guest: [],
}

export function roomAdminUiCan(role: RoomAdminUiRole, action: RoomAdminUiAction): boolean {
  return ROOM_ADMIN_UI_ACTIONS[role].includes(action)
}

export function roomAdminUiCanModerate(role: RoomAdminUiRole): boolean {
  return ROOM_ADMIN_UI_ACTIONS[role].length > 0
}

export type HostSessionSnapshot = {
  selfId: string | null
  isHost: boolean
  /**
   * Capability mirror of server room-admin role.
   * Host UI roles remain operator|guest on participants; canModerate gates moderation chrome.
   */
  roomAdminRole: RoomAdminUiRole
  roomAdminAuthPlane: RoomAdminUiAuthPlane
  /** Derived from roomAdminRole — false for telegram guests / non-hosts. */
  canModerate: boolean
  participants: HostParticipantView[]
  selectedParticipantId: string | null
  room: RoomHostState
  nudges: HostNudge[]
  incomingCameraRequest: { requestId: string; fromName: string } | null
  incomingUnmuteRequest: {
    requestId: string
    fromName: string
    mode: 'request_unmute' | 'turn_mic_on'
  } | null
  chromeMode: SessionChromeMode
  miniSize: MiniWidgetSize
  busyNote: BusyNoteState
  attention: AttentionItem | null
  localMicEnabled: boolean
  localCameraEnabled: boolean
  callLive: boolean
  /** True when the Telegram VC adapter reports an active group call. */
  telegramVcLive: boolean
  /** Participants returned from POST /v1/rooms/:id/admin (Telegram overlay). */
  roomAdminParticipants: RoomAdminParticipantView[]
  roomAdminPendingMtproto: string | null
  roomAdminTitle: string | null
  /** Actions that only update local UI until the signaling relay lands. */
  stubbedActionKinds: readonly string[]
}

export const STUB_BACKEND_ACTIONS = [
  'disable_camera',
  'remove_participant',
  'lock_room',
  'mute_all',
] as const

export const NUDGE_COPY: Record<Exclude<HostNudgeKind, 'custom'>, string> = {
  please_turn_on_camera: 'Please turn on camera',
  please_unmute: 'Please unmute',
  check_mic: 'Check your microphone',
  check_connection: 'Check your connection',
  stand_by: 'Stand by',
  youre_live_next: "You're live next",
  host_needs_attention: 'Host needs attention',
}

export function createInitialHostSnapshot(partial?: Partial<HostSessionSnapshot>): HostSessionSnapshot {
  const role = partial?.roomAdminRole ?? (partial?.isHost ? 'nebu_host' : 'guest')
  return {
    selfId: null,
    isHost: false,
    roomAdminRole: role,
    roomAdminAuthPlane: partial?.roomAdminAuthPlane ?? 'telegram_guest',
    canModerate: partial?.canModerate ?? roomAdminUiCanModerate(role),
    participants: [],
    selectedParticipantId: null,
    room: {
      locked: false,
      inviteUrl: null,
      sessionHealth: 'unknown',
      ended: false,
    },
    nudges: [],
    incomingCameraRequest: null,
    incomingUnmuteRequest: null,
    chromeMode: 'full',
    miniSize: 'standard',
    busyNote: { active: false, label: '' },
    attention: null,
    localMicEnabled: true,
    localCameraEnabled: true,
    callLive: false,
    telegramVcLive: false,
    roomAdminParticipants: [],
    roomAdminPendingMtproto: null,
    roomAdminTitle: null,
    stubbedActionKinds: STUB_BACKEND_ACTIONS,
    ...partial,
  }
}

export function advanceCameraRequest(
  current: CameraRequestState,
  event: 'send' | 'ack_waiting' | 'live' | 'declined' | 'unavailable' | 'reset'
): CameraRequestState {
  switch (event) {
    case 'send':
      return current === 'idle' || current === 'declined' || current === 'unavailable'
        ? 'request_sent'
        : current
    case 'ack_waiting':
      return current === 'request_sent' ? 'waiting' : current
    case 'live':
      return 'camera_live'
    case 'declined':
      return 'declined'
    case 'unavailable':
      return 'unavailable'
    case 'reset':
      return 'idle'
    default:
      return current
  }
}

export function micLabel(state: MicAudioState): string {
  switch (state) {
    case 'live':
      return 'LIVE'
    case 'muted':
      return 'MUTED'
    case 'host_muted':
      return 'HOST MUTED'
    case 'speaking':
      return 'SPEAKING'
    case 'request_sent':
      return 'REQUEST SENT'
    case 'audio_unavailable':
      return 'AUDIO UNAVAILABLE'
  }
}

export function cameraRequestLabel(state: CameraRequestState): string {
  switch (state) {
    case 'idle':
      return 'REQUEST CAMERA'
    case 'request_sent':
      return 'REQUEST SENT'
    case 'waiting':
      return 'WAITING'
    case 'camera_live':
      return 'CAMERA LIVE'
    case 'declined':
      return 'DECLINED'
    case 'unavailable':
      return 'UNAVAILABLE'
  }
}

export function pickHighestAttention(items: AttentionItem[]): AttentionItem | null {
  if (items.length === 0) return null
  return [...items].sort((a, b) => b.priority - a.priority)[0] ?? null
}

export function deriveAttention(snapshot: HostSessionSnapshot): AttentionItem | null {
  const items: AttentionItem[] = []

  if (snapshot.incomingCameraRequest) {
    items.push({
      id: `cam-req-${snapshot.incomingCameraRequest.requestId}`,
      priority: 100,
      title: 'Host is requesting your camera',
      detail: 'Enable only when you are ready. Nothing turns on without you.',
      actionId: 'respond_camera_request',
    })
  }

  if (snapshot.incomingUnmuteRequest) {
    items.push({
      id: `mic-req-${snapshot.incomingUnmuteRequest.requestId}`,
      priority: 90,
      title:
        snapshot.incomingUnmuteRequest.mode === 'turn_mic_on'
          ? 'Host asked you to turn your microphone on'
          : 'Host is requesting unmute',
      detail: 'Your mic stays off until you choose to enable it.',
      actionId: 'respond_unmute_request',
    })
  }

  for (const p of snapshot.participants) {
    if (p.connection === 'reconnecting') {
      items.push({
        id: `reconnect-${p.id}`,
        priority: 70,
        title: `${p.name} reconnecting`,
        detail: 'Check connection or send a Nebu transmission.',
        actionId: 'nudge_check_connection',
        participantId: p.id,
      })
    }
    if (p.micState === 'audio_unavailable') {
      items.push({
        id: `audio-${p.id}`,
        priority: 65,
        title: `Audio unavailable — ${p.name}`,
        detail: 'Ask them to check their microphone.',
        actionId: 'nudge_check_mic',
        participantId: p.id,
      })
    }
  }

  if (snapshot.room.sessionHealth === 'degraded') {
    items.push({
      id: 'session-health',
      priority: 60,
      title: 'Session health degraded',
      detail: 'Media plane or peer links need attention.',
      actionId: 'open_host_controls',
    })
  }

  return pickHighestAttention(items)
}

export function applyHostAction(
  snapshot: HostSessionSnapshot,
  action: HostControlAction,
  now = Date.now()
): HostSessionSnapshot {
  const next: HostSessionSnapshot = {
    ...snapshot,
    participants: snapshot.participants.map((p) => ({ ...p })),
    nudges: [...snapshot.nudges],
    room: { ...snapshot.room },
    busyNote: { ...snapshot.busyNote },
  }

  const touch = (id: string, patch: Partial<HostParticipantView>) => {
    next.participants = next.participants.map((p) => (p.id === id ? { ...p, ...patch } : p))
  }

  switch (action.type) {
    case 'request_camera': {
      const p = next.participants.find((x) => x.id === action.participantId)
      if (!p) break
      touch(action.participantId, {
        cameraRequest: advanceCameraRequest(p.cameraRequest, 'send'),
      })
      break
    }
    case 'remind_camera': {
      next.nudges.push({
        id: `nudge-${now}`,
        kind: 'please_turn_on_camera',
        message: NUDGE_COPY.please_turn_on_camera,
        participantId: action.participantId,
        createdAt: now,
      })
      break
    }
    case 'disable_camera':
      touch(action.participantId, { cameraOn: false, cameraRequest: 'idle' })
      break
    case 'spotlight':
      next.participants = next.participants.map((p) => ({
        ...p,
        isSpotlighted: action.participantId != null && p.id === action.participantId,
      }))
      break
    case 'pin':
      next.participants = next.participants.map((p) => ({
        ...p,
        isPinned: action.participantId != null && p.id === action.participantId,
      }))
      break
    case 'return_auto_view':
      next.participants = next.participants.map((p) => ({
        ...p,
        isSpotlighted: false,
        isPinned: false,
      }))
      break
    case 'mute_participant':
      touch(action.participantId, { micState: 'host_muted', isActiveSpeaker: false })
      break
    case 'request_unmute':
    case 'request_turn_mic_on':
      touch(action.participantId, { micState: 'request_sent' })
      break
    case 'mute_all':
      next.participants = next.participants.map((p) =>
        p.role === 'guest' ? { ...p, micState: 'host_muted', isActiveSpeaker: false } : p
      )
      break
    case 'flag_audio_problem':
      touch(action.participantId, { micState: 'audio_unavailable' })
      next.nudges.push({
        id: `nudge-${now}`,
        kind: 'check_mic',
        message: NUDGE_COPY.check_mic,
        participantId: action.participantId,
        createdAt: now,
      })
      break
    case 'select_participant':
      next.selectedParticipantId = action.participantId
      break
    case 'private_notice':
      next.nudges.push({
        id: `nudge-${now}`,
        kind: 'custom',
        message: action.message,
        participantId: action.participantId,
        createdAt: now,
      })
      break
    case 'remove_participant':
      next.participants = next.participants.filter((p) => p.id !== action.participantId)
      if (next.selectedParticipantId === action.participantId) next.selectedParticipantId = null
      break
    case 'invite_copy':
      break
    case 'lock_room':
      next.room.locked = action.locked
      break
    case 'broadcast_notice':
      next.nudges.push({
        id: `nudge-${now}`,
        kind: 'custom',
        message: action.message,
        createdAt: now,
      })
      break
    case 'end_session':
      next.room.ended = true
      next.callLive = false
      next.chromeMode = 'full'
      break
    case 'send_nudge': {
      const message =
        action.kind === 'custom'
          ? action.customMessage?.trim() || 'Host message'
          : NUDGE_COPY[action.kind]
      next.nudges.push({
        id: `nudge-${now}`,
        kind: action.kind,
        message,
        participantId: action.participantId,
        createdAt: now,
      })
      break
    }
    case 'camera_request_response':
      next.incomingCameraRequest = null
      next.localCameraEnabled = action.accepted ? true : next.localCameraEnabled
      break
    case 'set_chrome_mode':
      next.chromeMode = action.mode
      break
    case 'set_mini_size':
      next.miniSize = action.size
      break
    case 'set_busy_note':
      next.busyNote = action.note
      break
    case 'dismiss_attention':
    case 'resolve_attention':
      if (next.attention?.id === action.id) next.attention = null
      break
    case 'set_telegram_vc_live':
      next.telegramVcLive = action.live
      if (!action.live) {
        next.roomAdminParticipants = []
        next.roomAdminPendingMtproto = null
      }
      break
    case 'set_room_admin_participants':
      next.roomAdminParticipants = action.participants.map((p) => ({ ...p }))
      if (action.pendingMtproto !== undefined) next.roomAdminPendingMtproto = action.pendingMtproto
      if (action.title !== undefined) next.roomAdminTitle = action.title
      break
    case 'room_admin_mute':
      next.roomAdminParticipants = next.roomAdminParticipants.map((p) =>
        p.id === action.participantId ? { ...p, muted: true, speaking: false } : p
      )
      touch(action.participantId, { micState: 'host_muted', isActiveSpeaker: false })
      break
    case 'room_admin_unmute':
      next.roomAdminParticipants = next.roomAdminParticipants.map((p) =>
        p.id === action.participantId ? { ...p, muted: false } : p
      )
      touch(action.participantId, { micState: 'live' })
      break
    case 'room_admin_kick':
      next.roomAdminParticipants = next.roomAdminParticipants.filter((p) => p.id !== action.participantId)
      next.participants = next.participants.filter((p) => p.id !== action.participantId)
      if (next.selectedParticipantId === action.participantId) next.selectedParticipantId = null
      break
    case 'room_admin_pin':
      next.roomAdminParticipants = next.roomAdminParticipants.map((p) => ({
        ...p,
        pinned: p.id === action.participantId,
      }))
      next.participants = next.participants.map((p) => ({
        ...p,
        isPinned: p.id === action.participantId,
      }))
      break
    case 'room_admin_end':
      next.room.ended = true
      next.callLive = false
      next.telegramVcLive = false
      next.roomAdminParticipants = []
      next.chromeMode = 'full'
      break
    case 'set_room_admin_capabilities':
      next.roomAdminRole = action.role
      next.roomAdminAuthPlane = action.authPlane
      next.canModerate =
        action.canModerate ?? roomAdminUiCanModerate(action.role)
      next.isHost = next.canModerate
      break
  }

  next.attention = deriveAttention(next)
  return next
}

export function peersToHostParticipants(
  peers: Array<{
    participant: { id: string; name: string; role: 'operator' | 'guest' }
    stream: MediaStream | null
    connectionState: string
  }>,
  previous: HostParticipantView[]
): HostParticipantView[] {
  const prevById = new Map(previous.map((p) => [p.id, p]))
  return peers.map((peer) => {
    const prev = prevById.get(peer.participant.id)
    const video = peer.stream?.getVideoTracks()[0]
    const audio = peer.stream?.getAudioTracks()[0]
    const connection: ParticipantConnectionState =
      peer.connectionState === 'connected'
        ? 'connected'
        : peer.connectionState === 'connecting' || peer.connectionState === 'checking'
          ? 'reconnecting'
          : peer.connectionState === 'failed' || peer.connectionState === 'disconnected'
            ? 'disconnected'
            : prev?.connection ?? 'pending_request'

    let micState: MicAudioState = prev?.micState ?? 'muted'
    if (!audio) micState = 'audio_unavailable'
    else if (prev?.micState === 'host_muted' || prev?.micState === 'request_sent') micState = prev.micState
    else if (audio.enabled) micState = 'live'
    else micState = 'muted'

    const cameraOn = Boolean(video?.enabled && video.readyState !== 'ended')

    return {
      id: peer.participant.id,
      name: peer.participant.name,
      role: peer.participant.role,
      connection,
      cameraOn,
      micState,
      cameraRequest: cameraOn
        ? 'camera_live'
        : prev?.cameraRequest && prev.cameraRequest !== 'camera_live'
          ? prev.cameraRequest
          : 'idle',
      isActiveSpeaker: prev?.isActiveSpeaker ?? false,
      isSpotlighted: prev?.isSpotlighted ?? false,
      isPinned: prev?.isPinned ?? false,
    }
  })
}

export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Merge Telegram room-admin participants into host views for the widget list. */
export function mergeRoomAdminParticipants(
  existing: HostParticipantView[],
  admin: RoomAdminParticipantView[]
): HostParticipantView[] {
  if (admin.length === 0) return existing
  const byId = new Map(existing.map((p) => [p.id, p]))
  for (const row of admin) {
    const prev = byId.get(row.id)
    byId.set(row.id, {
      id: row.id,
      name: row.name || prev?.name || `User ${row.id}`,
      role: prev?.role ?? 'guest',
      connection: prev?.connection ?? 'connected',
      cameraOn: prev?.cameraOn ?? false,
      micState: row.muted ? 'host_muted' : prev?.micState === 'host_muted' ? 'muted' : prev?.micState ?? 'live',
      cameraRequest: prev?.cameraRequest ?? 'idle',
      isActiveSpeaker: Boolean(row.speaking),
      isSpotlighted: prev?.isSpotlighted ?? false,
      isPinned: Boolean(row.pinned) || (prev?.isPinned ?? false),
    })
  }
  return [...byId.values()]
}
