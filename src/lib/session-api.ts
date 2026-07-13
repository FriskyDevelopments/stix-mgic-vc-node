import { getAppEnv } from '@/lib/env'
import { log } from '@/lib/log'

export type SessionProtocol =
  | 'dj-mode'
  | 'clipsflow'
  | 'virtual-camera'
  | 'rtmp'
  | 'local'
  | 'relay'

export type SessionPlatform = 'telegram' | 'discord'

export interface StartSessionRequest {
  platform: SessionPlatform
  protocol: SessionProtocol
  mode: 'operator' | 'dj'
}

export interface SessionSnapshot {
  status: 'standby' | 'connecting' | 'active' | 'dj-mode' | 'error'
  signalQuality: number
  latency: number
  frameRate: number
  bitrate: number
  packetLoss: number
  audioSync: 'stable' | 'drift' | 'muted'
  resolution: string
  streamKey?: string
  source: 'live-api' | 'demo'
}

export interface SessionApi {
  isLiveConfigured(): boolean
  startSession(request: StartSessionRequest): Promise<SessionSnapshot>
  stopSession(): Promise<SessionSnapshot>
  extendOperatorTime(seconds: number): Promise<{ remainingSeconds: number }>
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function demoSnapshot(
  status: SessionSnapshot['status'],
  protocol: SessionProtocol
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
    resolution: '720p',
    streamKey: isRtmp ? `sk_demo_${Math.random().toString(36).slice(2, 10)}` : undefined,
    source: 'demo',
  }
}

async function liveRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiBaseUrl } = getAppEnv()
  if (!apiBaseUrl) {
    throw new Error('VITE_API_BASE_URL is not configured')
  }

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Session API ${response.status}: ${body || response.statusText}`)
  }

  return response.json() as Promise<T>
}

class DemoSessionApi implements SessionApi {
  isLiveConfigured(): boolean {
    return false
  }

  async startSession(request: StartSessionRequest): Promise<SessionSnapshot> {
    log.info('session', 'Demo startSession', request)
    await delay(request.mode === 'dj' ? 1200 : 1500)
    return demoSnapshot(request.mode === 'dj' ? 'dj-mode' : 'active', request.protocol)
  }

  async stopSession(): Promise<SessionSnapshot> {
    log.info('session', 'Demo stopSession')
    await delay(400)
    return demoSnapshot('standby', 'dj-mode')
  }

  async extendOperatorTime(seconds: number): Promise<{ remainingSeconds: number }> {
    return { remainingSeconds: seconds }
  }
}

class LiveSessionApi implements SessionApi {
  isLiveConfigured(): boolean {
    return true
  }

  async startSession(request: StartSessionRequest): Promise<SessionSnapshot> {
    log.info('session', 'Live startSession', request)
    const snapshot = await liveRequest<SessionSnapshot>('/v1/sessions/start', {
      method: 'POST',
      body: JSON.stringify(request),
    })
    return { ...snapshot, source: 'live-api' }
  }

  async stopSession(): Promise<SessionSnapshot> {
    log.info('session', 'Live stopSession')
    const snapshot = await liveRequest<SessionSnapshot>('/v1/sessions/stop', {
      method: 'POST',
    })
    return { ...snapshot, source: 'live-api' }
  }

  async extendOperatorTime(seconds: number): Promise<{ remainingSeconds: number }> {
    return liveRequest<{ remainingSeconds: number }>('/v1/sessions/extend', {
      method: 'POST',
      body: JSON.stringify({ seconds }),
    })
  }
}

let sessionApi: SessionApi | null = null

export function getSessionApi(): SessionApi {
  if (sessionApi) return sessionApi
  sessionApi = getAppEnv().isLiveApiConfigured ? new LiveSessionApi() : new DemoSessionApi()
  return sessionApi
}

/** Test helper */
export function resetSessionApi(): void {
  sessionApi = null
}
