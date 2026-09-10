import { getAppEnv } from '@/lib/env'
import { getOperatorToken } from '@/lib/operator-token'

/**
 * telegram-vc-api.ts — client-side API for the Telegram VC adapter.
 */

export type TelegramVcStatus = {
  adapter: string
  client: {
    connected: boolean
    userId: string | null
    username: string | null
  }
  call: {
    state: 'idle' | 'joining' | 'active' | 'leaving' | 'error'
    chatId: string | null
    ssrc: number | null
    activeSource: 'file' | 'rtmp' | 'webrtc-relay' | null
    error: string | null
    joinedAt: number | null
    hasTransport: boolean
  }
}

export type TelegramVcParticipant = {
  id: string
  name: string
  muted: boolean
  volume: number
  date: number
}

export type TelegramVcParticipantsResponse = {
  participants: TelegramVcParticipant[]
  count: number
}

export type TelegramVcGroup = { id: string; title: string; kind: 'group' | 'channel' }

export type TelegramPairStatus = {
  available: boolean
  awaitingCode: boolean
  verified: { id: string; username: string; verifiedAt: number } | null
}

export type RtmpPublishConfig = {
  ready: boolean
  path: string
  server: string
  username: string
  streamKey: string
  publishUrl: string
}

class TelegramVcApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'TelegramVcApiError'
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const env = getAppEnv()
  const token = getOperatorToken()
  const response = await fetch(`${env.apiBaseUrl}/v1/telegram-vc${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (!response.ok) {
    let message = `Request failed with ${response.status}`
    try {
      const body = (await response.json()) as { error?: string }
      if (body?.error) message = body.error
    } catch { /* non-JSON */ }
    throw new TelegramVcApiError(response.status, message)
  }
  return (await response.json()) as T
}

export async function getStatus(): Promise<TelegramVcStatus> {
  return request('/status')
}

export async function getPairStatus(): Promise<TelegramPairStatus> {
  return request('/pair/status')
}

export async function sendPairCode(phone: string): Promise<{ awaitingCode: boolean }> {
  return request('/pair/start', { method: 'POST', body: JSON.stringify({ phone }) })
}

export async function confirmPairCode(code: string, password?: string): Promise<TelegramPairStatus['verified']> {
  return request('/pair/confirm', { method: 'POST', body: JSON.stringify({ code, password }) })
}

export async function joinCall(chatId: string, source: string): Promise<{ call: TelegramVcStatus['call'] }> {
  return request('/join', { method: 'POST', body: JSON.stringify({ chatId, source }) })
}

export async function leaveCall(): Promise<{ call: TelegramVcStatus['call'] }> {
  return request('/leave', { method: 'POST' })
}

export async function switchSource(
  type: 'file' | 'rtmp' | 'webrtc-relay',
  config: Record<string, string>
): Promise<{ call: TelegramVcStatus['call'] }> {
  return request('/source', { method: 'POST', body: JSON.stringify({ type, config }) })
}

export async function getTelegramGroups(): Promise<{ groups: TelegramVcGroup[] }> {
  return request('/groups')
}

export async function muteParticipant(
  participantId: string,
  options?: { chatId?: string; expectedCallId?: string; onlyIfCameraOff?: boolean; target?: string }
): Promise<{ ok: boolean }> {
  return request('/mute', {
    method: 'POST',
    body: JSON.stringify({
      participantId,
      target: options?.target || participantId,
      chatId: options?.chatId,
      expectedCallId: options?.expectedCallId,
      onlyIfCameraOff: options?.onlyIfCameraOff,
    }),
  })
}

export async function getRtmpPublishConfig(): Promise<RtmpPublishConfig> {
  const env = getAppEnv()
  const token = getOperatorToken()
  const response = await fetch(`${env.apiBaseUrl}/v1/rtmp/publish`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) {
    let message = `Request failed with ${response.status}`
    try { message = ((await response.json()) as { error?: string }).error || message } catch { /* non-JSON */ }
    throw new TelegramVcApiError(response.status, message)
  }
  return (await response.json()) as RtmpPublishConfig
}

export async function pause(): Promise<{ call: TelegramVcStatus['call'] }> {
  return request('/pause', { method: 'POST' })
}

export async function resume(): Promise<{ call: TelegramVcStatus['call'] }> {
  return request('/resume', { method: 'POST' })
}

export async function skip(): Promise<{ call: TelegramVcStatus['call'] }> {
  return request('/skip', { method: 'POST' })
}

export async function stopVc(): Promise<{ call: TelegramVcStatus['call'] }> {
  return request('/stop', { method: 'POST' })
}

export async function setCamera(on: boolean): Promise<{ call: TelegramVcStatus['call'] }> {
  return request('/cam', { method: 'POST', body: JSON.stringify({ on }) })
}

export async function getParticipants(chatId?: string): Promise<{ participants: any[]; count?: number; complete?: boolean; canManageCalls?: boolean }> {
  const qs = chatId ? `?chatId=${encodeURIComponent(chatId)}` : ''
  return request(`/participants${qs}`)
}

async function studioRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const env = getAppEnv()
  const token = getOperatorToken()
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (!response.ok) {
    let message = `Request failed with ${response.status}`
    try {
      const body = (await response.json()) as { error?: string }
      if (body?.error) message = body.error
    } catch { /* non-JSON */ }
    throw new TelegramVcApiError(response.status, message)
  }
  return (await response.json()) as T
}

export type StudioPlaylist = {
  id: string
  name: string
  items: Array<{ id: string; url: string; title: string }>
  currentIndex: number
  playing: boolean
}

export type StudioMediaFile = { id: string; name: string; url: string; path: string }

export async function listPlaylists(): Promise<{ playlists: StudioPlaylist[] }> {
  return studioRequest('/v1/playlists')
}

export async function createPlaylist(name: string): Promise<{ playlist: StudioPlaylist }> {
  return studioRequest('/v1/playlists', { method: 'POST', body: JSON.stringify({ name }) })
}

export async function addPlaylistItem(id: string, item: { url: string; title?: string }) {
  return studioRequest(`/v1/playlists/${id}/items`, { method: 'POST', body: JSON.stringify(item) })
}

export async function playPlaylist(id: string) {
  return studioRequest(`/v1/playlists/${id}/play`, { method: 'POST' })
}

export async function listMediaFiles(): Promise<{ files: StudioMediaFile[] }> {
  return studioRequest('/v1/media/files')
}

export async function uploadMediaFile(name: string, dataBase64: string): Promise<{ file: StudioMediaFile }> {
  return studioRequest('/v1/media/upload', {
    method: 'POST',
    body: JSON.stringify({ name, data: dataBase64 }),
  })
}
