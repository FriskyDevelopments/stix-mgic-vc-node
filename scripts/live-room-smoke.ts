import WebSocket from 'ws'
import { mintOperatorToken } from '../server/tokens'

const httpBase = process.env.VC_SMOKE_HTTP_BASE || 'http://127.0.0.1:8797'
const wsBase = process.env.VC_SMOKE_WS_BASE || 'ws://127.0.0.1:8797'

type Message = Record<string, unknown> & { type: string }

function openSocket(token: string) {
  const socket = new WebSocket(`${wsBase}/v1/signal?token=${encodeURIComponent(token)}`)
  const messages: Message[] = []
  socket.on('message', (raw) => messages.push(JSON.parse(raw.toString()) as Message))
  return new Promise<{ socket: WebSocket; messages: Message[] }>((resolve, reject) => {
    socket.once('open', () => resolve({ socket, messages }))
    socket.once('error', reject)
  })
}

async function next(messages: Message[], type: string, timeoutMs = 3000): Promise<Message> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const index = messages.findIndex((message) => message.type === type)
    if (index >= 0) return messages.splice(index, 1)[0]!
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Timed out waiting for ${type}`)
}

const aliceToken = mintOperatorToken({ sub: 'smoke:alice', platform: 'friskydev', name: 'Alice Smoke' })
const bobToken = mintOperatorToken({ sub: 'smoke:bob', platform: 'friskydev', name: 'Bob Smoke' })
const roomResponse = await fetch(`${httpBase}/v1/rooms`, {
  method: 'POST',
  headers: { authorization: `Bearer ${aliceToken}`, 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Live smoke room', platform: 'web', maxParticipants: 2 }),
})
if (!roomResponse.ok) throw new Error(`Room creation failed: ${roomResponse.status}`)
const { room } = await roomResponse.json() as { room: { id: string } }

const alice = await openSocket(aliceToken)
const bob = await openSocket(bobToken)
try {
  await Promise.all([next(alice.messages, 'welcome'), next(bob.messages, 'welcome')])
  alice.socket.send(JSON.stringify({ type: 'join', roomId: room.id }))
  const aliceJoined = await next(alice.messages, 'joined')
  bob.socket.send(JSON.stringify({ type: 'join', roomId: room.id }))
  const bobJoined = await next(bob.messages, 'joined')
  await next(alice.messages, 'peer-joined')
  const bobParticipantId = (bobJoined.self as { id: string }).id
  alice.socket.send(JSON.stringify({ type: 'offer', to: bobParticipantId, sdp: 'v=0\r\ns=VC Node live smoke\r\n' }))
  const relayed = await next(bob.messages, 'offer')
  if (relayed.sdp !== 'v=0\r\ns=VC Node live smoke\r\n') throw new Error('Relayed SDP changed')
  const aliceCount = (aliceJoined.room as { participantCount: number }).participantCount
  const bobCount = (bobJoined.room as { participantCount: number }).participantCount
  process.stdout.write(JSON.stringify({ ok: true, roomCreated: true, aliceJoined: aliceCount === 1, bobJoined: bobCount === 2, offerRelayed: true }))
} finally {
  alice.socket.close()
  bob.socket.close()
  await fetch(`${httpBase}/v1/rooms/${room.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${aliceToken}` } })
}
