import { buildMediaPlaneStatus } from './media-plane'
import { currentTelemetry, findRoomForOperator } from './rooms'

/**
 * Whether the signaling plane is attached in this process. index.ts flips it once the
 * upgrade handler is installed; a test importing the app alone leaves it false, and the
 * snapshot then honestly says no transport is available.
 */
let signalingReady = false

export function setSignalingReady(ready: boolean): void {
  signalingReady = ready
}

export function isSignalingReady(): boolean {
  return signalingReady
}

export type SessionProtocol =
  | 'dj-mode'
  | 'clipsflow'
  | 'virtual-camera'
  | 'rtmp'
  | 'local'
  | 'relay'

export type SessionPlatform = 'telegram' | 'discord'

export type SessionStatus = 'standby' | 'connecting' | 'active' | 'dj-mode' | 'error'

export type SessionSnapshot = {
  status: SessionStatus
  signalQuality: number
  latency: number
  frameRate: number
  bitrate: number
  packetLoss: number
  audioSync: 'stable' | 'drift' | 'muted'
  resolution: string
  streamKey?: string
  source: 'live-api' | 'demo'
  /**
   * Where the numbers above came from. `measured` means a participant reported them from
   * its own RTCPeerConnection stats; `unavailable` means nothing is measuring and the
   * numbers are zeros. They are never estimated — an invented bitrate reads exactly like a
   * real one on the operator's screen, and that is how a broken session looks healthy.
   */
  telemetrySource: 'measured' | 'unavailable'
  /** Age of the measurement in milliseconds, when there is one. */
  telemetryAgeMs?: number
  roomId?: string
  participantCount?: number
  operatorId?: string
  platform?: SessionPlatform
  protocol?: SessionProtocol
  remainingSeconds?: number
  mediaPlane: {
    enabled: boolean
    ready: boolean
    reason: string
  }
}

type ActiveSession = {
  snapshot: SessionSnapshot
  expiresAt: number
}

const sessions = new Map<string, ActiveSession>()

/**
 * Condensed view of the media plane for a session snapshot. The full per-adapter report,
 * with the reason each unavailable transport is unavailable, is on `/v1/media/status`.
 */
function mediaPlaneMeta(enabled: boolean) {
  const status = buildMediaPlaneStatus({ signalingReady: isSignalingReady() })
  return {
    enabled,
    ready: status.ready,
    reason: status.reason,
  }
}

/**
 * Build a snapshot. Telemetry is taken from the operator's room when a participant has
 * reported a measurement, and is otherwise zeroed and marked `unavailable`.
 *
 * This used to return hardcoded numbers — 92% signal, 42 ms latency, 2500 kbps for RTMP —
 * regardless of whether anything was connected, while also reporting `source: 'live-api'`.
 * The README's promise that adapters are "not faked as live" was true of the adapters and
 * false of the metrics beside them.
 */
function buildSnapshot(
  status: SessionStatus,
  protocol: SessionProtocol,
  mediaEnabled: boolean,
  extras?: Partial<SessionSnapshot>
): SessionSnapshot {
  const isRtmp = protocol === 'rtmp'
  const operatorId = extras?.operatorId
  const membership = operatorId ? findRoomForOperator(operatorId) : null
  const measurement = membership ? currentTelemetry(membership.room) : null

  return {
    status,
    signalQuality: measurement?.signalQuality ?? 0,
    latency: measurement?.latency ?? 0,
    frameRate: measurement?.frameRate ?? 0,
    bitrate: measurement?.bitrate ?? 0,
    packetLoss: measurement?.packetLoss ?? 0,
    audioSync: status === 'standby' ? 'muted' : measurement ? 'stable' : 'muted',
    resolution: isRtmp ? '1080p' : '720p',
    streamKey: isRtmp ? `sk_node_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}` : undefined,
    source: 'live-api',
    telemetrySource: measurement ? 'measured' : 'unavailable',
    ...(measurement ? { telemetryAgeMs: Date.now() - measurement.reportedAt } : {}),
    ...(membership
      ? { roomId: membership.room.id, participantCount: membership.room.participants.size }
      : {}),
    protocol,
    mediaPlane: mediaPlaneMeta(mediaEnabled),
    ...extras,
  }
}

export function startSession(input: {
  operatorId: string
  platform: SessionPlatform
  protocol: SessionProtocol
  mode: 'operator' | 'dj'
  mediaPlaneEnabled: boolean
  ttlSeconds: number
}): SessionSnapshot {
  const status: SessionStatus = input.mode === 'dj' ? 'dj-mode' : 'active'
  const snapshot = buildSnapshot(status, input.protocol, input.mediaPlaneEnabled, {
    operatorId: input.operatorId,
    platform: input.platform,
    remainingSeconds: input.ttlSeconds,
  })

  sessions.set(input.operatorId, {
    snapshot,
    expiresAt: Date.now() + input.ttlSeconds * 1000,
  })

  return snapshot
}

export function stopSession(operatorId: string, mediaPlaneEnabled: boolean): SessionSnapshot {
  sessions.delete(operatorId)
  return buildSnapshot('standby', 'dj-mode', mediaPlaneEnabled, { operatorId })
}

export function extendSession(operatorId: string, seconds: number): { remainingSeconds: number } | null {
  const current = sessions.get(operatorId)
  if (!current) return null
  current.expiresAt = Math.max(Date.now(), current.expiresAt) + seconds * 1000
  const remainingSeconds = Math.max(0, Math.floor((current.expiresAt - Date.now()) / 1000))
  current.snapshot = {
    ...current.snapshot,
    remainingSeconds,
  }
  return { remainingSeconds }
}

export function getSession(operatorId: string): SessionSnapshot | null {
  const current = sessions.get(operatorId)
  if (!current) return null
  if (current.expiresAt < Date.now()) {
    sessions.delete(operatorId)
    return null
  }
  return {
    ...current.snapshot,
    remainingSeconds: Math.max(0, Math.floor((current.expiresAt - Date.now()) / 1000)),
  }
}
