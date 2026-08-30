import { getAppEnv } from '@/lib/env'
import { solveAltcha } from '@/lib/altcha'
import { apiHeaders, apiUrl } from '@/lib/api-client'
import { log } from '@/lib/log'
import { clearOperatorToken, getOperatorToken, setOperatorToken } from '@/lib/operator-token'

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
  remainingSeconds?: number
  mediaPlane?: {
    enabled: boolean
    ready: boolean
    reason: string
  }
}

export interface SessionApi {
  isLiveConfigured(): boolean
  ensureOperatorToken(): Promise<string | null>
  startSession(request: StartSessionRequest): Promise<SessionSnapshot>
  stopSession(): Promise<SessionSnapshot>
  extendOperatorTime(seconds: number): Promise<{ remainingSeconds: number }>
}


async function liveRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: apiHeaders(init?.headers),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Session API ${response.status}: ${body || response.statusText}`)
  }

  return response.json() as Promise<T>
}

class UnavailableSessionApi implements SessionApi {
  isLiveConfigured(): boolean {
    return false
  }

  async ensureOperatorToken(): Promise<string | null> {
    return null
  }

  async startSession(): Promise<SessionSnapshot> {
    throw new Error('Session API is unavailable. Start the node control plane before opening a session.')
  }

  async stopSession(): Promise<SessionSnapshot> {
    throw new Error('Session API is unavailable. No remote session was stopped.')
  }

  async extendOperatorTime(): Promise<{ remainingSeconds: number }> {
    throw new Error('Session API is unavailable. Operator time cannot be extended.')
  }
}

class LiveSessionApi implements SessionApi {
  isLiveConfigured(): boolean {
    return true
  }

  async ensureOperatorToken(): Promise<string | null> {
    const existing = getOperatorToken()
    if (existing) return existing

    if (getAppEnv().authRequired) {
      return null
    }

    const response = await fetch(apiUrl('/v1/auth/anonymous'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ altcha: await solveAltcha() }),
    })
    if (!response.ok) {
      throw new Error('Unable to mint anonymous operator token')
    }
    const data = (await response.json()) as { token: string }
    setOperatorToken(data.token)
    return data.token
  }

  async startSession(request: StartSessionRequest): Promise<SessionSnapshot> {
    log.info('session', 'Live startSession', request)
    await this.ensureOperatorToken()
    const snapshot = await liveRequest<SessionSnapshot>('/v1/sessions/start', {
      method: 'POST',
      body: JSON.stringify(request),
    })
    return { ...snapshot, source: 'live-api' }
  }

  async stopSession(): Promise<SessionSnapshot> {
    log.info('session', 'Live stopSession')
    await this.ensureOperatorToken()
    const snapshot = await liveRequest<SessionSnapshot>('/v1/sessions/stop', {
      method: 'POST',
    })
    return { ...snapshot, source: 'live-api' }
  }

  async extendOperatorTime(seconds: number): Promise<{ remainingSeconds: number }> {
    await this.ensureOperatorToken()
    return liveRequest<{ remainingSeconds: number }>('/v1/sessions/extend', {
      method: 'POST',
      body: JSON.stringify({ seconds }),
    })
  }
}

let sessionApi: SessionApi | null = null

export function getSessionApi(): SessionApi {
  if (sessionApi) return sessionApi
  sessionApi = getAppEnv().isLiveApiConfigured ? new LiveSessionApi() : new UnavailableSessionApi()
  return sessionApi
}

export function resetSessionApi(): void {
  sessionApi = null
}

export { clearOperatorToken, setOperatorToken, getOperatorToken }
