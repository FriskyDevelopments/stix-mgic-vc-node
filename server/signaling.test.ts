import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import WebSocket from 'ws'
import { attachSignaling, CLOSE_UNAUTHORIZED, SIGNALING_PATH, type SignalingHub } from './signaling'
import { createRoom, resetRooms, getRoom } from './rooms'
import { resetServerEnvCache } from './env'
import { mintOperatorToken } from './tokens'

let server: Server
let hub: SignalingHub
let port: number
const openSockets: WebSocket[] = []

function setEnv(overrides: Record<string, string> = {}): void {
  resetServerEnvCache()
  process.env.NODE_ENV = 'test'
  process.env.OPERATOR_TOKEN_SECRET = 'test-operator-token-secret'
  process.env.AUTH_REQUIRED = 'false'
  delete process.env.STUN_URLS
  delete process.env.TURN_URLS
  delete process.env.TURN_USERNAME
  delete process.env.TURN_CREDENTIAL
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value
  resetServerEnvCache()
}

beforeEach(async () => {
  setEnv()
  resetRooms()
  server = createServer((_req, res) => {
    res.writeHead(404)
    res.end()
  })
  hub = attachSignaling(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterEach(async () => {
  for (const socket of openSockets.splice(0)) socket.close()
  await hub.close()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

type Message = Record<string, unknown> & { type: string }

/**
 * Every message a socket has received, buffered from construction. The server sends the
 * welcome the instant the socket opens, so a listener attached after `open` resolves would
 * miss it — the buffer removes that race instead of sleeping around it.
 */
const inbox = new WeakMap<WebSocket, Message[]>()
const waiters = new WeakMap<WebSocket, Array<() => void>>()

function connect(query = ''): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${SIGNALING_PATH}${query}`)
  openSockets.push(socket)
  inbox.set(socket, [])
  waiters.set(socket, [])

  socket.on('message', (raw: WebSocket.RawData) => {
    inbox.get(socket)?.push(JSON.parse(raw.toString()) as Message)
    for (const notify of waiters.get(socket)?.splice(0) ?? []) notify()
  })

  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve(socket))
    socket.once('error', reject)
  })
}

/** Consume the next buffered message of a type, waiting for one if none has arrived. */
async function nextMessage(socket: WebSocket, type?: string, timeoutMs = 2000): Promise<Message> {
  const deadline = Date.now() + timeoutMs

  for (;;) {
    const queue = inbox.get(socket) ?? []
    const index = type ? queue.findIndex((m) => m.type === type) : 0
    if (index >= 0 && queue.length > 0) {
      const [message] = queue.splice(index, 1)
      if (message) return message
    }

    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error(`timed out waiting for ${type ?? 'any message'}`)

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, Math.min(remaining, 50))
      waiters.get(socket)?.push(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}

function send(socket: WebSocket, payload: unknown): void {
  socket.send(JSON.stringify(payload))
}

describe('signaling — connection and identity', () => {
  it('welcomes an anonymous socket with ICE servers when auth is not required', async () => {
    const socket = await connect('?clientId=alice')
    const welcome = await nextMessage(socket, 'welcome')
    expect(welcome.operatorId).toBe('anonymous:alice')
    expect(Array.isArray(welcome.iceServers)).toBe(true)
  })

  it('accepts a valid operator token and adopts its identity', async () => {
    const token = mintOperatorToken({ sub: 'telegram:42', platform: 'telegram', name: '@ana' })
    const socket = await connect(`?token=${encodeURIComponent(token)}`)
    const welcome = await nextMessage(socket, 'welcome')
    expect(welcome.operatorId).toBe('telegram:42')
  })

  it('refuses a socket with no token when AUTH_REQUIRED=true', async () => {
    setEnv({ AUTH_REQUIRED: 'true' })
    await expect(connect('?clientId=alice')).rejects.toBeTruthy()
  })

  it('refuses a forged token before the handshake completes', async () => {
    setEnv({ AUTH_REQUIRED: 'true' })
    await expect(connect('?token=not.a.real.token')).rejects.toBeTruthy()
  })

  it('closes a socket that never joins without leaving a seat behind', async () => {
    const room = createRoom({ ownerOperatorId: 'anonymous:alice' })
    const socket = await connect('?clientId=alice')
    await nextMessage(socket, 'welcome')
    socket.close()
    await new Promise((r) => setTimeout(r, 50))
    expect(getRoom(room.id)?.participants.size).toBe(0)
  })
})

describe('signaling — joining a room', () => {
  it('reports the room, the seat and the ICE configuration on join', async () => {
    const room = createRoom({ ownerOperatorId: 'anonymous:alice' })
    const socket = await connect('?clientId=alice')
    await nextMessage(socket, 'welcome')

    send(socket, { type: 'join', roomId: room.id })
    const joined = await nextMessage(socket, 'joined')
    expect((joined.self as { operatorId: string }).operatorId).toBe('anonymous:alice')
    expect((joined.room as { participantCount: number }).participantCount).toBe(1)
    expect(Array.isArray(joined.iceServers)).toBe(true)
  })

  it('tells the people already in the room that someone arrived', async () => {
    const room = createRoom({ ownerOperatorId: 'anonymous:alice' })
    const alice = await connect('?clientId=alice')
    await nextMessage(alice, 'welcome')
    send(alice, { type: 'join', roomId: room.id })
    await nextMessage(alice, 'joined')

    const bob = await connect('?clientId=bob')
    await nextMessage(bob, 'welcome')
    const arrival = nextMessage(alice, 'peer-joined')
    send(bob, { type: 'join', roomId: room.id })

    const event = await arrival
    expect((event.participant as { name: string }).name).toBe('Anonymous Operator')
    expect(getRoom(room.id)?.participants.size).toBe(2)
  })

  it('tells the room when someone leaves', async () => {
    const room = createRoom({ ownerOperatorId: 'anonymous:alice' })
    const alice = await connect('?clientId=alice')
    await nextMessage(alice, 'welcome')
    send(alice, { type: 'join', roomId: room.id })
    await nextMessage(alice, 'joined')

    const bob = await connect('?clientId=bob')
    await nextMessage(bob, 'welcome')
    send(bob, { type: 'join', roomId: room.id })
    await nextMessage(alice, 'peer-joined')

    const departure = nextMessage(alice, 'peer-left')
    send(bob, { type: 'leave' })
    await departure
    expect(getRoom(room.id)?.participants.size).toBe(1)
  })

  it('frees the seat when a socket drops without saying goodbye', async () => {
    const room = createRoom({ ownerOperatorId: 'anonymous:alice' })
    const alice = await connect('?clientId=alice')
    await nextMessage(alice, 'welcome')
    send(alice, { type: 'join', roomId: room.id })
    await nextMessage(alice, 'joined')

    const bob = await connect('?clientId=bob')
    await nextMessage(bob, 'welcome')
    send(bob, { type: 'join', roomId: room.id })
    await nextMessage(alice, 'peer-joined')

    const departure = nextMessage(alice, 'peer-left')
    bob.terminate()
    await departure
    expect(getRoom(room.id)?.participants.size).toBe(1)
  })

  it('refuses an unknown room', async () => {
    const socket = await connect('?clientId=alice')
    await nextMessage(socket, 'welcome')
    send(socket, { type: 'join', roomId: 'does-not-exist' })
    expect((await nextMessage(socket, 'error')).code).toBe('room_not_found')
  })

  it('refuses a full room', async () => {
    const room = createRoom({ ownerOperatorId: 'anonymous:alice', maxParticipants: 2 })
    for (const id of ['alice', 'bob']) {
      const socket = await connect(`?clientId=${id}`)
      await nextMessage(socket, 'welcome')
      send(socket, { type: 'join', roomId: room.id })
      await nextMessage(socket, 'joined')
    }
    const carol = await connect('?clientId=carol')
    await nextMessage(carol, 'welcome')
    send(carol, { type: 'join', roomId: room.id })
    expect((await nextMessage(carol, 'error')).code).toBe('room_full')
  })
})

describe('signaling — relaying negotiation', () => {
  /** Two joined sockets in one room, with their participant ids. */
  async function pair() {
    const room = createRoom({ ownerOperatorId: 'anonymous:alice', maxParticipants: 4 })
    const alice = await connect('?clientId=alice')
    await nextMessage(alice, 'welcome')
    send(alice, { type: 'join', roomId: room.id })
    const aliceJoined = await nextMessage(alice, 'joined')

    const bob = await connect('?clientId=bob')
    await nextMessage(bob, 'welcome')
    send(bob, { type: 'join', roomId: room.id })
    const bobJoined = await nextMessage(bob, 'joined')
    await nextMessage(alice, 'peer-joined')

    return {
      room,
      alice,
      bob,
      aliceId: (aliceJoined.self as { id: string }).id,
      bobId: (bobJoined.self as { id: string }).id,
    }
  }

  it('carries an offer to the addressee, stamped with the sender', async () => {
    const { alice, bob, aliceId, bobId } = await pair()
    const incoming = nextMessage(bob, 'offer')
    send(alice, { type: 'offer', to: bobId, sdp: 'v=0 fake-offer' })

    const offer = await incoming
    expect(offer.from).toBe(aliceId)
    // Relayed verbatim: this server does not parse or rewrite SDP.
    expect(offer.sdp).toBe('v=0 fake-offer')
  })

  it('carries the answer back', async () => {
    const { alice, bob, aliceId, bobId } = await pair()
    const incoming = nextMessage(alice, 'answer')
    send(bob, { type: 'answer', to: aliceId, sdp: 'v=0 fake-answer' })
    const answer = await incoming
    expect(answer.from).toBe(bobId)
  })

  it('carries ICE candidates', async () => {
    const { alice, bob, bobId } = await pair()
    const incoming = nextMessage(bob, 'ice')
    send(alice, { type: 'ice', to: bobId, candidate: { candidate: 'candidate:1 udp', sdpMid: '0' } })
    const ice = await incoming
    expect((ice.candidate as { sdpMid: string }).sdpMid).toBe('0')
  })

  it('refuses to signal before joining a room', async () => {
    const socket = await connect('?clientId=alice')
    await nextMessage(socket, 'welcome')
    send(socket, { type: 'offer', to: 'someone', sdp: 'v=0' })
    expect((await nextMessage(socket, 'error')).code).toBe('not_in_room')
  })

  it('will not deliver into a room the sender is not in', async () => {
    const { bobId } = await pair()
    // A third operator in a room of their own, addressing a participant of the first room.
    const other = createRoom({ ownerOperatorId: 'anonymous:mallory' })
    const mallory = await connect('?clientId=mallory')
    await nextMessage(mallory, 'welcome')
    send(mallory, { type: 'join', roomId: other.id })
    await nextMessage(mallory, 'joined')

    send(mallory, { type: 'offer', to: bobId, sdp: 'v=0 injected' })
    expect((await nextMessage(mallory, 'error')).code).toBe('peer_not_found')
  })

  it('reports an addressee that is not in the room', async () => {
    const { alice } = await pair()
    send(alice, { type: 'offer', to: 'no-such-participant', sdp: 'v=0' })
    expect((await nextMessage(alice, 'error')).code).toBe('peer_not_found')
  })
})

describe('signaling — hostile input', () => {
  it('answers a ping so a client can measure the link', async () => {
    const socket = await connect('?clientId=alice')
    await nextMessage(socket, 'welcome')
    send(socket, { type: 'ping' })
    expect((await nextMessage(socket, 'pong')).type).toBe('pong')
  })

  it('rejects a non-JSON frame without dropping the socket', async () => {
    const socket = await connect('?clientId=alice')
    await nextMessage(socket, 'welcome')
    socket.send('not json at all')
    expect((await nextMessage(socket, 'error')).code).toBe('bad_json')
    expect(socket.readyState).toBe(WebSocket.OPEN)
  })

  it('rejects a message whose shape it does not recognize', async () => {
    const socket = await connect('?clientId=alice')
    await nextMessage(socket, 'welcome')
    send(socket, { type: 'exec', command: 'rm -rf /' })
    expect((await nextMessage(socket, 'error')).code).toBe('bad_message')
  })

  it('rejects an offer with no addressee', async () => {
    const socket = await connect('?clientId=alice')
    await nextMessage(socket, 'welcome')
    send(socket, { type: 'offer', sdp: 'v=0' })
    expect((await nextMessage(socket, 'error')).code).toBe('bad_message')
  })

  it('throttles a flood and closes the socket', async () => {
    const socket = await connect('?clientId=alice')
    await nextMessage(socket, 'welcome')
    const closed = new Promise<number>((resolve) => socket.once('close', (code) => resolve(code)))
    for (let i = 0; i < 200; i++) send(socket, { type: 'ping' })
    expect(await closed).toBe(4429)
  })
})

describe('signaling — hub lifecycle', () => {
  it('counts live connections and closes them on shutdown', async () => {
    const socket = await connect('?clientId=alice')
    await nextMessage(socket, 'welcome')
    expect(hub.connectionCount()).toBe(1)

    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()))
    await hub.close()
    await closed
    expect(hub.connectionCount()).toBe(0)
  })

  it('stops answering upgrades on the signaling path once closed', async () => {
    await hub.close()
    await expect(connect('?clientId=alice')).rejects.toBeTruthy()
  })
})

describe('signaling — close codes are documented', () => {
  it('uses application close codes above 4000', () => {
    expect(CLOSE_UNAUTHORIZED).toBeGreaterThan(4000)
  })
})
