/**
 * signaling.ts — the WebRTC signaling plane.
 *
 * Two browsers cannot start a call by themselves: each has to hand the other an SDP
 * offer/answer and a trickle of ICE candidates, and something has to carry those. That is
 * all this does. It relays negotiation messages between participants of a room and
 * forwards nothing else — no media ever passes through this process, which is why the
 * control-plane box can host sessions without a media budget.
 *
 * Design notes worth keeping:
 *
 *   - AUTHORIZATION IS PER SOCKET AND PER ROOM. The operator token is verified at upgrade,
 *     and a relayed message may only be addressed to a participant of the SAME room the
 *     sender joined. Without that second check, knowing any participant id would let an
 *     outsider inject an offer into someone else's call.
 *   - THE SERVER NEVER PARSES SDP. It relays the blob. Understanding codecs is the
 *     browsers' job, and a signaling server that tries to rewrite SDP is how calls break
 *     on the client versions nobody tested.
 *   - EVERY SOCKET IS ASSUMED HOSTILE: message size is capped, payloads are schema-checked,
 *     a flood is throttled, and a socket that stops answering heartbeats is terminated.
 *     A dead socket that lingers holds a slot in a room with `maxParticipants`.
 */
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import { z } from 'zod'
import { getServerEnv } from './env'
import { getIceServers } from './ice'
import { verifyOperatorToken } from './tokens'
import {
  getRoom,
  joinRoom,
  leaveRoom,
  toView,
  type Participant,
  type Room,
} from './rooms'

export const SIGNALING_PATH = '/v1/signal'

/** Close codes above 4000 are application-defined; these are ours. */
export const CLOSE_UNAUTHORIZED = 4401
export const CLOSE_ROOM_GONE = 4404
export const CLOSE_FLOOD = 4429

const MAX_MESSAGE_BYTES = 64 * 1024
const HEARTBEAT_MS = 30_000
/** Generous for negotiation (a trickle of ICE is chatty), tight enough to stop a flood. */
const RATE_LIMIT_MESSAGES = 120
const RATE_LIMIT_WINDOW_MS = 10_000

const sdpMessage = z.object({
  type: z.enum(['offer', 'answer']),
  to: z.string().min(1),
  sdp: z.string().min(1).max(MAX_MESSAGE_BYTES),
})

const iceMessage = z.object({
  type: z.literal('ice'),
  to: z.string().min(1),
  candidate: z.unknown(),
})

const joinMessage = z.object({
  type: z.literal('join'),
  roomId: z.string().min(1),
})

const simpleMessage = z.object({
  type: z.enum(['leave', 'ping']),
})

const clientMessage = z.union([joinMessage, sdpMessage, iceMessage, simpleMessage])

export type ClientMessage = z.infer<typeof clientMessage>

type SocketState = {
  socket: WebSocket
  operatorId: string
  operatorName: string
  /** Set once the socket has joined a room; null while it is only authenticated. */
  roomId: string | null
  participantId: string | null
  alive: boolean
  messageCount: number
  windowStartedAt: number
}

export type SignalingHub = {
  /** Sockets currently connected, joined or not. */
  connectionCount: () => number
  /** True once the upgrade handler is attached — the media plane's readiness signal. */
  ready: boolean
  close: () => Promise<void>
}

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState !== socket.OPEN) return
  socket.send(JSON.stringify(payload))
}

function fail(socket: WebSocket, code: string, message: string): void {
  send(socket, { type: 'error', code, message })
}

/**
 * Read the operator identity off the upgrade request. A browser cannot set headers on a
 * WebSocket, so the token rides in the query string — it is short-lived, HMAC-signed, and
 * the connection is expected to be TLS-terminated at the edge.
 */
function authenticate(req: IncomingMessage): { operatorId: string; operatorName: string } | null {
  const env = getServerEnv()
  const url = new URL(req.url ?? '/', 'http://localhost')
  const token = url.searchParams.get('token')

  if (token) {
    const claims = verifyOperatorToken(token)
    if (!claims) return null
    return { operatorId: claims.sub, operatorName: claims.name }
  }

  if (env.AUTH_REQUIRED) return null

  const clientId = url.searchParams.get('clientId')?.slice(0, 64) || 'local'
  return { operatorId: `anonymous:${clientId}`, operatorName: 'Anonymous Operator' }
}

/** Everyone in the room except the sender. */
function peersOf(room: Room, exceptParticipantId: string): Participant[] {
  return [...room.participants.values()].filter((p) => p.id !== exceptParticipantId)
}

export function attachSignaling(server: Server): SignalingHub {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })
  const states = new Map<WebSocket, SocketState>()
  /** participantId -> socket, so a relayed message can find its addressee in O(1). */
  const byParticipant = new Map<string, WebSocket>()

  function detach(state: SocketState, notify = true): void {
    if (state.roomId && state.participantId) {
      const room = getRoom(state.roomId)
      const gone = leaveRoom(state.roomId, state.participantId)
      byParticipant.delete(state.participantId)
      if (notify && room && gone) {
        for (const peer of room.participants.values()) {
          const peerSocket = byParticipant.get(peer.id)
          if (peerSocket) send(peerSocket, { type: 'peer-left', participantId: gone.id })
        }
      }
    }
    state.roomId = null
    state.participantId = null
  }

  /** Simple fixed-window throttle. Returns false when the socket has spent its budget. */
  function withinRateLimit(state: SocketState): boolean {
    const now = Date.now()
    if (now - state.windowStartedAt > RATE_LIMIT_WINDOW_MS) {
      state.windowStartedAt = now
      state.messageCount = 0
    }
    state.messageCount++
    return state.messageCount <= RATE_LIMIT_MESSAGES
  }

  function handleJoin(state: SocketState, roomId: string): void {
    if (state.roomId) {
      // A socket is one seat. Re-joining without leaving would strand the first seat.
      detach(state)
    }

    const room = getRoom(roomId)
    if (!room) {
      fail(state.socket, 'room_not_found', 'No such room')
      return
    }

    const result = joinRoom(roomId, { operatorId: state.operatorId, name: state.operatorName })
    if (!result.ok) {
      fail(state.socket, result.error, `Cannot join room: ${result.error}`)
      return
    }

    state.roomId = roomId
    state.participantId = result.participant.id
    byParticipant.set(result.participant.id, state.socket)

    send(state.socket, {
      type: 'joined',
      self: result.participant,
      room: toView(room),
      // Sent here rather than over REST so a client always negotiates with the ICE
      // configuration of the node it is actually signalling through.
      iceServers: getIceServers(),
    })

    for (const peer of peersOf(room, result.participant.id)) {
      const peerSocket = byParticipant.get(peer.id)
      if (peerSocket) send(peerSocket, { type: 'peer-joined', participant: result.participant })
    }
  }

  /** Relay one negotiation message, but only inside the sender's own room. */
  function handleRelay(state: SocketState, message: z.infer<typeof sdpMessage> | z.infer<typeof iceMessage>): void {
    if (!state.roomId || !state.participantId) {
      fail(state.socket, 'not_in_room', 'Join a room before signalling')
      return
    }

    const room = getRoom(state.roomId)
    if (!room) {
      fail(state.socket, 'room_not_found', 'The room has closed')
      detach(state, false)
      return
    }

    // The check that matters: the addressee must be in the SAME room as the sender.
    const target = room.participants.get(message.to)
    if (!target) {
      fail(state.socket, 'peer_not_found', 'No such participant in this room')
      return
    }

    const targetSocket = byParticipant.get(target.id)
    if (!targetSocket) {
      fail(state.socket, 'peer_offline', 'That participant is not connected')
      return
    }

    if (message.type === 'ice') {
      send(targetSocket, { type: 'ice', from: state.participantId, candidate: message.candidate })
      return
    }
    // SDP is relayed verbatim — this server does not parse or rewrite it.
    send(targetSocket, { type: message.type, from: state.participantId, sdp: message.sdp })
  }

  wss.on('connection', (socket: WebSocket, _req: IncomingMessage, identity: { operatorId: string; operatorName: string }) => {
    const state: SocketState = {
      socket,
      operatorId: identity.operatorId,
      operatorName: identity.operatorName,
      roomId: null,
      participantId: null,
      alive: true,
      messageCount: 0,
      windowStartedAt: Date.now(),
    }
    states.set(socket, state)

    // Credentials are only needed after a room admission; do not disclose them to a socket
    // that has not yet proved it can join a room.
    send(socket, { type: 'welcome', operatorId: state.operatorId })

    socket.on('pong', () => {
      state.alive = true
    })

    socket.on('message', (raw) => {
      if (!withinRateLimit(state)) {
        fail(socket, 'rate_limited', 'Too many messages')
        socket.close(CLOSE_FLOOD, 'rate limited')
        return
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(raw.toString())
      } catch {
        fail(socket, 'bad_json', 'Message must be JSON')
        return
      }

      const result = clientMessage.safeParse(parsed)
      if (!result.success) {
        fail(socket, 'bad_message', 'Unrecognized message shape')
        return
      }

      const message = result.data
      switch (message.type) {
        case 'join':
          handleJoin(state, message.roomId)
          return
        case 'offer':
        case 'answer':
        case 'ice':
          handleRelay(state, message)
          return
        case 'leave':
          detach(state)
          send(socket, { type: 'left' })
          return
        case 'ping':
          send(socket, { type: 'pong' })
          return
      }
    })

    socket.on('close', () => {
      detach(state)
      states.delete(socket)
    })

    socket.on('error', () => {
      // A socket error is followed by 'close'; nothing to do but not crash the process.
    })
  })

  // A half-open TCP connection looks alive forever. Without this, a participant who lost
  // connectivity keeps its seat in a room that has only a handful of them.
  const heartbeat = setInterval(() => {
    for (const [socket, state] of states) {
      if (!state.alive) {
        socket.terminate()
        continue
      }
      state.alive = false
      socket.ping()
    }
  }, HEARTBEAT_MS)
  heartbeat.unref?.()

  function onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== SIGNALING_PATH) return

    const identity = authenticate(req)
    if (!identity) {
      // Refuse before the handshake completes; an unauthenticated socket never exists.
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, identity)
    })
  }

  server.on('upgrade', onUpgrade)

  return {
    connectionCount: () => states.size,
    ready: true,
    close: async () => {
      clearInterval(heartbeat)
      server.off('upgrade', onUpgrade)
      for (const socket of states.keys()) socket.close(1001, 'server shutting down')
      states.clear()
      byParticipant.clear()
      await new Promise<void>((resolve) => wss.close(() => resolve()))
    },
  }
}
