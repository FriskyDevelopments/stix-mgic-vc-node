import { apiHeaders, apiUrl } from '@/lib/api-client'

/**
 * rooms-api.ts — the REST half of the media plane, from the browser.
 *
 * Opening a room is one call: the node answers with the room AND the signalling details,
 * so the client never has to guess an ICE configuration or a socket path that the node
 * might have changed.
 */

export type RoomParticipant = {
  id: string
  operatorId: string
  name: string
  role: 'operator' | 'guest'
  joinedAt: number
}

export type RoomView = {
  id: string
  name: string
  ownerOperatorId: string
  platform: 'telegram' | 'discord' | 'web'
  maxParticipants: number
  createdAt: number
  scheduledFor: number | null
  participants: RoomParticipant[]
  participantCount: number
}

export type SignalingInfo = {
  path: string
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>
}

export type MediaAdapterStatus = {
  id: 'webrtc' | 'telegram-vc' | 'discord-voice' | 'rtmp'
  state: 'ready' | 'degraded' | 'not_implemented' | 'disabled'
  reason: string
}

export type MediaPlaneStatus = {
  ready: boolean
  enabled: boolean
  adapters: MediaAdapterStatus[]
  reason: string
  signalingPath?: string
  maxParticipants?: number
}

export class RoomsApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'RoomsApiError'
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: apiHeaders(init.headers),
  })

  if (!response.ok) {
    // Surface the node's own message: "Only the room owner can close it" is more use to an
    // operator than a bare status code.
    let message = `Request failed with ${response.status}`
    try {
      const body = (await response.json()) as { error?: string }
      if (body?.error) message = body.error
    } catch {
      // Non-JSON error body; keep the status line.
    }
    throw new RoomsApiError(response.status, message)
  }

  return (await response.json()) as T
}

export async function createRoom(input: {
  name?: string
  platform?: 'telegram' | 'discord' | 'web'
  maxParticipants?: number
} = {}): Promise<{ room: RoomView; signaling: SignalingInfo }> {
  return request('/v1/rooms', { method: 'POST', body: JSON.stringify(input) })
}

export async function listRooms(): Promise<RoomView[]> {
  const body = await request<{ rooms: RoomView[] }>('/v1/rooms')
  return body.rooms
}

export async function getRoom(roomId: string): Promise<{ room: RoomView; signaling: SignalingInfo }> {
  return request(`/v1/rooms/${encodeURIComponent(roomId)}`)
}

export async function closeRoom(roomId: string): Promise<void> {
  await request(`/v1/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE' })
}

export async function scheduleRoomAt(roomId: string, scheduledFor: number): Promise<RoomView> {
  const body = await request<{ room: RoomView }>(`/v1/rooms/${encodeURIComponent(roomId)}/schedule`, {
    method: 'PATCH',
    body: JSON.stringify({ scheduledFor }),
  })
  return body.room
}

export async function getMediaPlaneStatus(): Promise<MediaPlaneStatus> {
  return request('/v1/media/status')
}
