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

export async function joinCall(chatId: string): Promise<{ call: TelegramVcStatus['call'] }> {
  return request('/join', { method: 'POST', body: JSON.stringify({ chatId }) })
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

export async function getParticipants(): Promise<TelegramVcParticipantsResponse> {
  return request('/participants')
}

export async function muteParticipant(participantId: string): Promise<{ ok: boolean }> {
  return request('/mute', { method: 'POST', body: JSON.stringify({ participantId }) })
}
