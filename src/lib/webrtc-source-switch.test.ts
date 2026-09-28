import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CallClient, type PeerConnectionLike, type SocketLike } from './webrtc-client'

class TestStream {
  id = crypto.randomUUID()
  private tracks: MediaStreamTrack[]
  constructor(tracks: MediaStreamTrack[] = []) { this.tracks = [...tracks] }
  getTracks() { return [...this.tracks] }
  getAudioTracks() { return this.tracks.filter((track) => track.kind === 'audio') }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === 'video') }
  addTrack(track: MediaStreamTrack) { this.tracks.push(track) }
  removeTrack(track: MediaStreamTrack) { this.tracks = this.tracks.filter((item) => item !== track) }
}
const track = (kind: string, id: string) => ({ kind, id, readyState: 'live', enabled: true, stop: vi.fn() }) as unknown as MediaStreamTrack
const stream = (...tracks: MediaStreamTrack[]) => new TestStream(tracks) as unknown as MediaStream
const SELF = { id: 'zzz-self', operatorId: 'self', name: 'Self', role: 'operator', joinedAt: 1 }
const peer = (id: string) => ({ id, operatorId: id, name: id, role: 'guest', joinedAt: 2 })

function connection() {
  const transceivers: RTCRtpTransceiver[] = []
  const makeTransceiver = (source: MediaStreamTrack | string, init?: RTCRtpTransceiverInit) => {
    const kind = typeof source === 'string' ? source : source.kind
    const sender = { track: typeof source === 'string' ? null : source, setStreams: vi.fn(), replaceTrack: vi.fn(async (next: MediaStreamTrack | null) => { sender.track = next }) }
    const transceiver = { sender, receiver: { track: track(kind, `remote-${kind}`) }, direction: init?.direction ?? 'recvonly', currentDirection: null, mid: String(transceivers.length) } as unknown as RTCRtpTransceiver
    transceivers.push(transceiver)
    return transceiver
  }
  const pc = {
    connectionState: 'connected', localDescription: null, remoteDescription: null,
    onicecandidate: null, ontrack: null, onconnectionstatechange: null,
    addTrack: vi.fn(), addTransceiver: vi.fn(makeTransceiver), getTransceivers: () => transceivers,
    createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'offer' })),
    createAnswer: vi.fn(async () => ({ type: 'answer', sdp: 'answer' })),
    setLocalDescription: vi.fn(async (description) => { pc.localDescription = description }),
    setRemoteDescription: vi.fn(async (description) => {
      pc.remoteDescription = description
      if (description.type === 'offer' && !transceivers.length) { makeTransceiver('audio'); makeTransceiver('video') }
    }),
    addIceCandidate: vi.fn(async () => {}), getStats: vi.fn(async () => new Map()), close: vi.fn(),
  }
  return { pc: pc as unknown as PeerConnectionLike, transceivers,
    sender: (kind: string) => transceivers.find((item) => item.receiver.track.kind === kind)!.sender,
  }
}

async function joined(initial: MediaStream | null, participants = [peer('a'), peer('b')]) {
  const sockets: SocketLike[] = []
  const connections: ReturnType<typeof connection>[] = []
  const errors = vi.fn()
  const client = new CallClient({
    roomId: 'room', localStream: initial, telemetryIntervalMs: 0,
    reconnect: { enabled: true, baseDelayMs: 1 },
    events: { onError: errors },
    createSocket: () => {
      const socket: SocketLike = { readyState: 1, onopen: null, onclose: null, onerror: null, onmessage: null, send: vi.fn(), close: vi.fn() }
      sockets.push(socket)
      return socket
    },
    createPeerConnection: () => { const next = connection(); connections.push(next); return next.pc },
  })
  const deliver = (message: unknown) => sockets[sockets.length - 1].onmessage?.({ data: JSON.stringify(message) })
  const joining = client.join()
  sockets[0].onopen?.({})
  deliver({ type: 'joined', self: SELF, room: { participants: [SELF, ...participants] } })
  await joining
  return { client, connections, sockets, deliver, errors }
}

beforeEach(() => { vi.stubGlobal('MediaStream', TestStream); sessionStorage.clear() })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('transactional room source selection', () => {
  it('reserves both channels and replaces camera, audio-only, video-only and receive-only sources without rejoining', async () => {
    const audio = track('audio', 'mic'), video = track('video', 'camera')
    const original = stream(audio, video)
    const { client, connections } = await joined(original)
    const replacement = track('video', 'file')
    await client.replaceLocalStream(stream(replacement))
    for (const entry of connections) {
      expect(entry.sender('video').track).toBe(replacement)
      expect(entry.sender('audio').track).toBeNull()
      expect(entry.pc.createOffer).toHaveBeenCalledOnce()
      const calls = vi.mocked(entry.pc.addTransceiver).mock.calls
      expect(calls).toHaveLength(2)
      expect(calls[0][1]?.streams?.[0]).toBe(calls[1][1]?.streams?.[0])
    }
    await client.replaceLocalStream(null)
    await client.replaceLocalStream(stream(audio))
    for (const entry of connections) { expect(entry.sender('video').track).toBeNull(); expect(entry.sender('audio').track).toBe(audio) }
    expect(original.getTracks()).toEqual([audio, video])
    expect(audio.stop).not.toHaveBeenCalled()
    expect(video.stop).not.toHaveBeenCalled()
    client.close()
  })

  it('supports initially receive-only participants adding media and new peers inheriting the confirmed choice', async () => {
    const { client, connections, deliver } = await joined(null)
    const video = track('video', 'camera')
    await client.replaceLocalStream(stream(video))
    expect(connections[0].sender('video').track).toBe(video)
    deliver({ type: 'peer-joined', participant: peer('c') })
    await vi.waitFor(() => expect(connections).toHaveLength(3))
    expect(connections[2].sender('video').track).toBe(video)
    client.close()
  })

  it('adopts offered transceivers on the answering side instead of creating duplicate media sections', async () => {
    const original = stream(track('video', 'camera'))
    const { client, connections, deliver } = await joined(original, [peer('zzzz-offerer')])
    expect(connections[0].pc.addTransceiver).not.toHaveBeenCalled()
    deliver({ type: 'offer', from: 'zzzz-offerer', sdp: 'audio-video-offer' })
    await vi.waitFor(() => expect(connections[0].pc.createAnswer).toHaveBeenCalled())
    expect(connections[0].sender('video').track).toBe(original.getVideoTracks()[0])
    expect(connections[0].sender('audio').setStreams).toHaveBeenCalledOnce()
    const audio = track('audio', 'new-mic')
    await client.replaceLocalStream(stream(audio))
    expect(connections[0].sender('audio').track).toBe(audio)
    expect(connections[0].sender('video').track).toBeNull()
    client.close()
  })

  it('rolls back successful replacements if a later peer rejects, and preserves the previous source for future peers', async () => {
    const oldVideo = track('video', 'old'), oldAudio = track('audio', 'old-audio')
    const { client, connections, deliver, errors } = await joined(stream(oldAudio, oldVideo))
    vi.mocked(connections[1].sender('video').replaceTrack).mockRejectedValueOnce(new Error('codec change requires negotiation'))
    await expect(client.replaceLocalStream(stream(track('audio', 'new-audio'), track('video', 'new')))).rejects.toThrow('previous source is retained')
    for (const entry of connections) { expect(entry.sender('video').track).toBe(oldVideo); expect(entry.sender('audio').track).toBe(oldAudio) }
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ code: 'source_switch_failed' }))
    deliver({ type: 'peer-joined', participant: peer('c') })
    await vi.waitFor(() => expect(connections).toHaveLength(3))
    expect(connections[2].sender('video').track).toBe(oldVideo)
    client.close()
  })

  it('closes a peer that cannot be restored and reports uncertainty instead of false success', async () => {
    const oldVideo = track('video', 'old')
    const { client, connections } = await joined(stream(oldVideo))
    const sender = connections[0].sender('video')
    vi.mocked(sender.replaceTrack).mockImplementation(async (next) => {
      if (next === oldVideo) throw new Error('rollback rejected')
      Object.assign(sender, { track: next })
    })
    vi.mocked(connections[1].sender('video').replaceTrack).mockRejectedValueOnce(new Error('replacement rejected'))
    await expect(client.replaceLocalStream(stream(track('video', 'new')))).rejects.toThrow('could not be fully restored')
    expect(connections[0].pc.close).toHaveBeenCalledOnce()
    expect(client.getPeers()).toHaveLength(1)
    client.close()
  })

  it('serializes competing choices, including legacy track replacement, without mutating caller streams', async () => {
    const oldAudio = track('audio', 'old-audio'), oldVideo = track('video', 'old-video')
    const original = stream(oldAudio, oldVideo)
    const { client, connections } = await joined(original)
    const sender = connections[0].sender('video')
    const camera = track('video', 'new-camera'), mic = track('audio', 'new-mic')
    let finish!: () => void
    vi.mocked(sender.replaceTrack).mockImplementationOnce((next) => new Promise<void>((resolve) => { finish = () => { Object.assign(sender, { track: next }); resolve() } }))
    const first = client.replaceLocalTrack(camera)
    const second = client.replaceLocalTrack(mic)
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(connections[0].sender('audio').track).toBe(oldAudio)
    finish()
    await Promise.all([first, second])
    for (const entry of connections) { expect(entry.sender('video').track).toBe(camera); expect(entry.sender('audio').track).toBe(mic) }
    expect(original.getTracks()).toEqual([oldAudio, oldVideo])
    client.close()
  })

  it('reattaches the selected source after signaling reconnects', async () => {
    const { client, connections, sockets, deliver } = await joined(null)
    const selected = track('video', 'selected')
    await client.replaceLocalStream(stream(selected))
    sockets[0].onclose?.({})
    await vi.waitFor(() => expect(sockets).toHaveLength(2))
    deliver({ type: 'joined', self: SELF, room: { participants: [SELF, peer('a')] } })
    await vi.waitFor(() => expect(connections).toHaveLength(3))
    expect(connections[2].sender('video').track).toBe(selected)
    client.close()
  })

  it('preserves streamless incoming tracks so later media is visible', async () => {
    const { client, connections } = await joined(null)
    const video = track('video', 'remote-video'), audio = track('audio', 'remote-audio')
    connections[0].pc.ontrack?.({ streams: [], track: video })
    connections[0].pc.ontrack?.({ streams: [], track: audio })
    expect(client.getPeers()[0].stream?.getTracks()).toEqual([video, audio])
    client.close()
  })

  it('rejects stopped sources and attempts after leaving without changing sender tracks', async () => {
    const { client, connections } = await joined(null)
    const stopped = Object.assign(track('video', 'stopped'), { readyState: 'ended' })
    await expect(client.replaceLocalStream(stream(stopped))).rejects.toThrow('selected source has stopped')
    expect(connections[0].sender('video').replaceTrack).not.toHaveBeenCalled()
    client.close()
    await expect(client.replaceLocalStream(null)).rejects.toThrow('call has ended')
  })
})
