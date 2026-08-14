import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CallClient, type PeerConnectionLike, type SocketLike } from './webrtc-client'

/** A socket double that returns a fresh instance per connect attempt. */
function fakeSocket() {
  const sent: Array<Record<string, unknown>> = []
  const socket: SocketLike = {
    readyState: 1,
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    send: (data: string) => void sent.push(JSON.parse(data) as Record<string, unknown>),
    close: () => socket.onclose?.({}),
  }
  return {
    socket,
    sent,
    open: () => socket.onopen?.({}),
    deliver: (message: unknown) => socket.onmessage?.({ data: JSON.stringify(message) }),
    drop: () => socket.onclose?.({}),
    sentOfType: (type: string) => sent.filter((m) => m.type === type),
  }
}

function fakePeerConnection(): PeerConnectionLike {
  const pc = {
    connectionState: 'new',
    localDescription: null,
    remoteDescription: null,
    onicecandidate: null,
    ontrack: null,
    onconnectionstatechange: null,
    addTrack: vi.fn(),
    close: vi.fn(),
    createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'v=0 offer' })),
    createAnswer: vi.fn(async () => ({ type: 'answer', sdp: 'v=0 answer' })),
    setLocalDescription: vi.fn(async () => {}),
    setRemoteDescription: vi.fn(async () => {}),
    addIceCandidate: vi.fn(async () => {}),
    getStats: vi.fn(async () => new Map() as unknown as RTCStatsReport),
  }
  return pc as unknown as PeerConnectionLike
}

const SELF = { id: 'zzz-self', operatorId: 'op:self', name: 'Self', role: 'operator' as const, joinedAt: 1 }
const PEER = { id: 'aaa-peer', operatorId: 'op:peer', name: 'Peer', role: 'guest' as const, joinedAt: 2 }

function joinedSnapshot(transport: ReturnType<typeof fakeSocket>) {
  transport.open()
  transport.deliver({ type: 'welcome', operatorId: 'op:self', iceServers: [] })
  transport.deliver({ type: 'joined', self: SELF, room: { participants: [SELF, PEER] }, iceServers: [] })
}

describe('CallClient — reconnection', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-opens the socket and re-joins after an unexpected drop', async () => {
    const transports: ReturnType<typeof fakeSocket>[] = []
    const states: string[] = []
    const client = new CallClient({
      roomId: 'room-1',
      localStream: null,
      telemetryIntervalMs: 0,
      reconnect: { enabled: true, baseDelayMs: 100 },
      createSocket: () => {
        const t = fakeSocket()
        transports.push(t)
        return t.socket
      },
      createPeerConnection: () => fakePeerConnection(),
      events: { onStateChange: (s) => states.push(s) },
    })

    const joining = client.join()
    joinedSnapshot(transports[0]!)
    await joining
    expect(client.getState()).toBe('joined')
    expect(transports).toHaveLength(1)

    // Server drops the socket mid-call.
    transports[0]!.drop()
    expect(client.getState()).toBe('connecting')

    // Backoff elapses → a brand-new socket is created.
    await vi.advanceTimersByTimeAsync(150)
    expect(transports).toHaveLength(2)

    // Opening it sends a fresh join, and completing the snapshot returns to joined.
    transports[1]!.open()
    expect(transports[1]!.sentOfType('join')[0]).toMatchObject({ roomId: 'room-1' })
    transports[1]!.deliver({ type: 'welcome', operatorId: 'op:self', iceServers: [] })
    transports[1]!.deliver({ type: 'joined', self: SELF, room: { participants: [SELF, PEER] }, iceServers: [] })
    expect(client.getState()).toBe('joined')
  })

  it('does not reconnect after an intentional close()', async () => {
    const transports: ReturnType<typeof fakeSocket>[] = []
    const client = new CallClient({
      roomId: 'room-1',
      localStream: null,
      telemetryIntervalMs: 0,
      reconnect: { enabled: true, baseDelayMs: 100 },
      createSocket: () => {
        const t = fakeSocket()
        transports.push(t)
        return t.socket
      },
      createPeerConnection: () => fakePeerConnection(),
    })

    const joining = client.join()
    joinedSnapshot(transports[0]!)
    await joining

    client.close()
    await vi.advanceTimersByTimeAsync(500)
    expect(transports).toHaveLength(1)
    expect(client.getState()).toBe('closed')
  })

  it('gives up after the configured attempt cap', async () => {
    const transports: ReturnType<typeof fakeSocket>[] = []
    const errors: string[] = []
    const client = new CallClient({
      roomId: 'room-1',
      localStream: null,
      telemetryIntervalMs: 0,
      reconnect: { enabled: true, baseDelayMs: 10, maxAttempts: 2 },
      createSocket: () => {
        const t = fakeSocket()
        transports.push(t)
        return t.socket
      },
      createPeerConnection: () => fakePeerConnection(),
      events: { onError: (e) => errors.push(e.code) },
    })

    const joining = client.join()
    joinedSnapshot(transports[0]!)
    await joining

    // Each new attempt drops immediately, without ever re-joining.
    for (let i = 0; i < 5; i++) {
      transports[transports.length - 1]!.drop()
      await vi.advanceTimersByTimeAsync(200)
    }

    expect(errors).toContain('reconnect_exhausted')
    expect(client.getState()).toBe('error')
  })
})
