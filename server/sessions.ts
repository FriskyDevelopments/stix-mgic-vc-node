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

function mediaPlaneMeta(enabled: boolean) {
  return {
    enabled,
    ready: false,
    reason: enabled
      ? 'Media plane flag enabled but Telegram/Discord media adapters are not wired yet'
      : 'control-plane-only',
  }
}

function buildSnapshot(
  status: SessionStatus,
  protocol: SessionProtocol,
  mediaEnabled: boolean,
  extras?: Partial<SessionSnapshot>
): SessionSnapshot {
  const isRtmp = protocol === 'rtmp'
  const isCamera = protocol === 'virtual-camera'
  const isDj = status === 'dj-mode' || protocol === 'dj-mode'

  return {
    status,
    signalQuality: isDj ? 88 : isCamera ? 92 : isRtmp ? 90 : 85,
    latency: isCamera ? 42 : isRtmp ? 180 : 120,
    frameRate: isCamera || isRtmp ? 30 : 24,
    bitrate: isRtmp ? 2500 : 0,
    packetLoss: isRtmp ? 0.2 : 0,
    audioSync: status === 'standby' ? 'muted' : 'stable',
    resolution: isRtmp ? '1080p' : '720p',
    streamKey: isRtmp ? `sk_node_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}` : undefined,
    source: 'live-api',
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
