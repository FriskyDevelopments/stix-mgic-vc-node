import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CallClient,
  buildSignalingUrl,
  shouldInitiateOffer,
  summarizeStats,
  type PeerConnectionLike,
  type SocketLike,
} from './webrtc-client'

/** A socket double: records what was sent, lets a test push messages in. */
function fakeSocket() {
  const sent: Array<Record<string, unknown>> = []
  const socket: SocketLike = {
    readyState: 1,
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    send: (data: string) => void sent.push(JSON.parse(data) as Record<string, unknown>),
    close: () => {
      socket.onclose?.({})
    },
  }
  return {
    socket,
    sent,
    open: () => socket.onopen?.({}),
    deliver: (message: unknown) => socket.onmessage?.({ data: JSON.stringify(message) }),
    sentOfType: (type: string) => sent.filter((m) => m.type === type),
  }
}

/** A peer-connection double with just enough behaviour to drive the state machine. */
function fakePeerConnection(): PeerConnectionLike & { added: RTCIceCandidateInit[] } {
  const pc = {
    connectionState: 'new',
    localDescription: null as RTCSessionDescription | null,
    remoteDescription: null as RTCSessionDescription | null,
    onicecandidate: null as PeerConnectionLike['onicecandidate'],
    ontrack: null as PeerConnectionLike['ontrack'],
    onconnectionstatechange: null as PeerConnectionLike['onconnectionstatechange'],
    added: [] as RTCIceCandidateInit[],
    addTrack: vi.fn(),
    close: vi.fn(),
    createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'v=0 offer' })),
    createAnswer: vi.fn(async () => ({ type: 'answer', sdp: 'v=0 answer' })),
    setLocalDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
      pc.localDescription = description as RTCSessionDescription
    }),
    setRemoteDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
      pc.remoteDescription = description as RTCSessionDescription
    }),
    addIceCandidate: vi.fn(async (candidate: RTCIceCandidateInit) => {
      pc.added.push(candidate)
    }),
    getStats: vi.fn(async () => new Map() as unknown as RTCStatsReport),
  }
  return pc as unknown as PeerConnectionLike & { added: RTCIceCandidateInit[] }
}

const SELF = { id: 'zzz-self', operatorId: 'op:self', name: 'Self', role: 'operator' as const, joinedAt: 1 }
const PEER = { id: 'aaa-peer', operatorId: 'op:peer', name: 'Peer', role: 'guest' as const, joinedAt: 2 }

/** Join a room with one peer already present. Self > peer, so self offers. */
async function joined(options: { peers?: typeof PEER[]; pc?: ReturnType<typeof fakePeerConnection> } = {}) {
  const transport = fakeSocket()
  const pc = options.pc ?? fakePeerConnection()
  const states: string[] = []

  const client = new CallClient({
    roomId: 'room-1',
    localStream: null,
    telemetryIntervalMs: 0,
    createSocket: () => transport.socket,
    createPeerConnection: () => pc,
    events: { onStateChange: (state) => states.push(state) },
  })

  const joining = client.join()
  transport.open()
  transport.deliver({ type: 'welcome', operatorId: 'op:self', iceServers: [{ urls: 'stun:example' }] })
  transport.deliver({
    type: 'joined',
    self: SELF,
    room: { participants: [SELF, ...(options.peers ?? [PEER])] },
    iceServers: [{ urls: 'stun:example' }],
  })
  await joining

  return { client, transport, pc, states }
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('buildSignalingUrl', () => {
  it('upgrades the scheme and carries the operator token', () => {
    const url = buildSignalingUrl('room-1', 'tok123', 'https://vc.example')
    expect(url).toBe('wss://vc.example/v1/signal?token=tok123')
  })

  it('falls back to ws for a plain-http base', () => {
    expect(buildSignalingUrl('room-1', 'tok', 'http://localhost:8787')).toMatch(/^ws:\/\//)
  })

  it('sends a client id instead when there is no token', () => {
    expect(buildSignalingUrl('room-abcdef12', null, 'https://vc.example')).toContain('clientId=')
  })
})

describe('shouldInitiateOffer — one offer, never two', () => {
  it('is decided by id order, and the two sides disagree', () => {
    expect(shouldInitiateOffer('b', 'a')).toBe(true)
    expect(shouldInitiateOffer('a', 'b')).toBe(false)
  })

  it('never has both sides offering', () => {
    const [x, y] = ['peer-1', 'peer-2']
    expect(shouldInitiateOffer(x!, y!)).not.toBe(shouldInitiateOffer(y!, x!))
  })
})

describe('CallClient — joining', () => {
  it('sends a join for the room as soon as the socket opens', async () => {
    const { transport } = await joined()
    expect(transport.sentOfType('join')[0]).toMatchObject({ roomId: 'room-1' })
  })

  it('reaches the joined state and reports the peers already present', async () => {
    const { client } = await joined()
    expect(client.getState()).toBe('joined')
    expect(client.getPeers()).toHaveLength(1)
    expect(client.getPeers()[0]?.participant.name).toBe('Peer')
  })

  it('offers to the peers where the glare rule says this side offers', async () => {
    const { transport } = await joined()
    const offers = transport.sentOfType('offer')
    expect(offers).toHaveLength(1)
    expect(offers[0]).toMatchObject({ to: PEER.id, sdp: 'v=0 offer' })
  })

  it('does not offer to a peer whose id sorts above its own', async () => {
    const higher = { ...PEER, id: 'zzzz-higher' }
    const { transport } = await joined({ peers: [higher] })
    expect(transport.sentOfType('offer')).toHaveLength(0)
  })

  it('attaches the local tracks to each peer connection', async () => {
    const track = { kind: 'video' } as MediaStreamTrack
    const stream = { getTracks: () => [track] } as unknown as MediaStream
    const transport = fakeSocket()
    const pc = fakePeerConnection()
    const client = new CallClient({
      roomId: 'room-1',
      localStream: stream,
      telemetryIntervalMs: 0,
      createSocket: () => transport.socket,
      createPeerConnection: () => pc,
    })
    const joining = client.join()
    transport.open()
    transport.deliver({ type: 'joined', self: SELF, room: { participants: [SELF, PEER] }, iceServers: [] })
    await joining

    expect(pc.addTrack).toHaveBeenCalledWith(track, stream)
  })
})

describe('CallClient — negotiation', () => {
  it('answers an incoming offer', async () => {
    const lower = { ...PEER, id: 'zzzz-offerer' } // sorts above self, so the peer offers
    const { transport, pc } = await joined({ peers: [lower] })

    transport.deliver({ type: 'offer', from: lower.id, sdp: 'v=0 remote-offer' })
    await vi.waitFor(() => expect(transport.sentOfType('answer')).toHaveLength(1))

    expect(pc.setRemoteDescription).toHaveBeenCalled()
    expect(transport.sentOfType('answer')[0]).toMatchObject({ to: lower.id, sdp: 'v=0 answer' })
  })

  it('applies an answer to the offer it made', async () => {
    const { transport, pc } = await joined()
    transport.deliver({ type: 'answer', from: PEER.id, sdp: 'v=0 remote-answer' })
    await vi.waitFor(() => expect(pc.setRemoteDescription).toHaveBeenCalled())
  })

  it('forwards its own ICE candidates to the right peer', async () => {
    const { transport, pc } = await joined()
    pc.onicecandidate?.({ candidate: { candidate: 'candidate:1' } as RTCIceCandidate })
    expect(transport.sentOfType('ice')[0]).toMatchObject({ to: PEER.id })
  })

  it('queues candidates that arrive before the remote description, then applies them', async () => {
    const { transport, pc } = await joined()

    transport.deliver({ type: 'ice', from: PEER.id, candidate: { candidate: 'early-1' } })
    transport.deliver({ type: 'ice', from: PEER.id, candidate: { candidate: 'early-2' } })
    await vi.waitFor(() => expect(pc.addIceCandidate).not.toHaveBeenCalled())

    transport.deliver({ type: 'answer', from: PEER.id, sdp: 'v=0 remote-answer' })
    // Dropping them would leave the call on a worse path, or unconnected.
    await vi.waitFor(() => expect(pc.added).toHaveLength(2))
  })

  it('applies a candidate directly once the remote description exists', async () => {
    const { transport, pc } = await joined()
    transport.deliver({ type: 'answer', from: PEER.id, sdp: 'v=0 remote-answer' })
    await vi.waitFor(() => expect(pc.setRemoteDescription).toHaveBeenCalled())

    transport.deliver({ type: 'ice', from: PEER.id, candidate: { candidate: 'late-1' } })
    await vi.waitFor(() => expect(pc.added.map((c) => c.candidate)).toContain('late-1'))
  })

  it('ignores signalling about a peer it does not know', async () => {
    const { transport, client } = await joined()
    transport.deliver({ type: 'answer', from: 'ghost', sdp: 'v=0' })
    transport.deliver({ type: 'ice', from: 'ghost', candidate: {} })
    expect(client.getPeers()).toHaveLength(1)
  })
})

describe('CallClient — peers coming and going', () => {
  it('adds a peer that arrives after the join', async () => {
    const { transport, client } = await joined({ peers: [] })
    expect(client.getPeers()).toHaveLength(0)

    transport.deliver({ type: 'peer-joined', participant: PEER })
    await vi.waitFor(() => expect(client.getPeers()).toHaveLength(1))
  })

  it('drops and closes a peer that leaves', async () => {
    const { transport, client, pc } = await joined()
    transport.deliver({ type: 'peer-left', participantId: PEER.id })
    await vi.waitFor(() => expect(client.getPeers()).toHaveLength(0))
    expect(pc.close).toHaveBeenCalled()
  })

  it('surfaces a remote stream when the track arrives', async () => {
    const { client, pc } = await joined()
    const stream = { id: 'remote-1' } as MediaStream
    pc.ontrack?.({ streams: [stream] })
    expect(client.getPeers()[0]?.stream).toBe(stream)
  })
})

describe('CallClient — errors are named, not swallowed', () => {
  it('reports a refused join and goes to the error state', async () => {
    const transport = fakeSocket()
    const errors: Array<{ code: string }> = []
    const client = new CallClient({
      roomId: 'room-1',
      localStream: null,
      telemetryIntervalMs: 0,
      createSocket: () => transport.socket,
      createPeerConnection: () => fakePeerConnection(),
      events: { onError: (error) => errors.push(error) },
    })

    void client.join().catch(() => {})
    transport.open()
    transport.deliver({ type: 'error', code: 'room_full', message: 'Cannot join room: room_full' })

    await vi.waitFor(() => expect(errors[0]?.code).toBe('room_full'))
    expect(client.getState()).toBe('error')
  })

  it('names the missing TURN relay when a peer connection fails', async () => {
    const transport = fakeSocket()
    const pc = fakePeerConnection()
    const errors: Array<{ code: string; message: string }> = []
    const client = new CallClient({
      roomId: 'room-1',
      localStream: null,
      telemetryIntervalMs: 0,
      createSocket: () => transport.socket,
      createPeerConnection: () => pc,
      events: { onError: (error) => errors.push(error) },
    })
    const joining = client.join()
    transport.open()
    transport.deliver({ type: 'joined', self: SELF, room: { participants: [SELF, PEER] }, iceServers: [] })
    await joining

    pc.connectionState = 'failed'
    pc.onconnectionstatechange?.()

    expect(errors[0]?.code).toBe('peer_connection_failed')
    expect(errors[0]?.message).toMatch(/TURN relay/)
  })

  it('does not treat a mid-call relay error as fatal', async () => {
    const { transport, client } = await joined()
    transport.deliver({ type: 'error', code: 'peer_offline', message: 'gone' })
    expect(client.getState()).toBe('joined')
  })

  it('survives a frame that is not JSON', async () => {
    const { transport, client } = await joined()
    transport.socket.onmessage?.({ data: 'not json' })
    expect(client.getState()).toBe('joined')
  })
})

describe('CallClient — close', () => {
  it('says goodbye, tears down the peers and is safe to call twice', async () => {
    const { client, transport, pc } = await joined()
    client.close()

    expect(transport.sentOfType('leave')).toHaveLength(1)
    expect(pc.close).toHaveBeenCalled()
    expect(client.getPeers()).toHaveLength(0)
    expect(client.getState()).toBe('closed')

    expect(() => client.close()).not.toThrow()
  })
})

describe('summarizeStats', () => {
  function report(entries: Array<Record<string, unknown>>): RTCStatsReport {
    return { forEach: (fn: (entry: Record<string, unknown>) => void) => entries.forEach(fn) } as unknown as RTCStatsReport
  }

  it('returns nothing before any video has arrived — better than a measured-looking zero', () => {
    expect(summarizeStats(report([{ type: 'outbound-rtp', kind: 'video' }]))).toBeNull()
    expect(summarizeStats(report([]))).toBeNull()
  })

  it('reads frame rate, loss and round-trip time out of the report', () => {
    const measurement = summarizeStats(
      report([
        {
          type: 'inbound-rtp',
          kind: 'video',
          framesPerSecond: 30,
          packetsReceived: 990,
          packetsLost: 10,
          bytesReceived: 250_000,
          timestamp: 1,
        },
        { type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.04 },
      ])
    )

    expect(measurement).not.toBeNull()
    expect(measurement?.frameRate).toBe(30)
    expect(measurement?.packetLoss).toBeCloseTo(1, 1)
    expect(measurement?.latency).toBe(40)
  })

  it('keeps every value inside what the control plane will accept', () => {
    const measurement = summarizeStats(
      report([
        {
          type: 'inbound-rtp',
          kind: 'video',
          framesPerSecond: 9000,
          packetsReceived: 0,
          packetsLost: 500,
          bytesReceived: 10 ** 12,
          timestamp: 1,
        },
      ])
    )
    expect(measurement?.frameRate).toBeLessThanOrEqual(240)
    expect(measurement?.bitrate).toBeLessThanOrEqual(100_000)
    expect(measurement?.packetLoss).toBeLessThanOrEqual(100)
    expect(measurement?.signalQuality).toBeGreaterThanOrEqual(0)
  })
})
