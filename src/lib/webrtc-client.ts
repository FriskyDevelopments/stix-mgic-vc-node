import { getAppEnv } from '@/lib/env'
import { apiHeaders, apiUrl } from '@/lib/api-client'
import { log } from '@/lib/log'
import { getOperatorToken } from '@/lib/operator-token'

/**
 * webrtc-client.ts — the browser half of the media plane.
 *
 * The node relays SDP and ICE; this is what actually holds the peer connections. One
 * `RTCPeerConnection` per remote participant (the room is a mesh), the local camera and
 * microphone attached to each, and remote tracks surfaced to the UI as they arrive.
 *
 * Two things that are easy to get wrong and are handled here explicitly:
 *
 *   GLARE. If both peers create an offer at the same moment, the negotiation deadlocks —
 *   both are waiting for an answer that will never come. The rule below is the usual one:
 *   the participant with the lexicographically smaller id is the POLITE side and waits;
 *   the other one offers. Deterministic on both ends without another round trip.
 *
 *   EARLY CANDIDATES. ICE candidates routinely arrive before the remote description is
 *   set, and `addIceCandidate` throws in that window. They are queued and flushed once the
 *   description lands, rather than dropped — a dropped candidate is a call that connects
 *   over a worse path, or not at all.
 *
 * Everything external is injectable (`WebSocket`, `RTCPeerConnection`, the media stream)
 * so the state machine is testable without a browser: jsdom has no WebRTC at all.
 */

export type Participant = {
  id: string
  operatorId: string
  name: string
  role: 'operator' | 'guest'
  joinedAt: number
}

export type IceServerConfig = {
  urls: string | string[]
  username?: string
  credential?: string
}

export type CallState = 'idle' | 'connecting' | 'joined' | 'closed' | 'error'

export type RemotePeer = {
  participant: Participant
  stream: MediaStream | null
  connectionState: string
}

export type CallEvents = {
  onStateChange?: (state: CallState) => void
  onPeersChange?: (peers: RemotePeer[]) => void
  /** Surfaced to the operator; the client keeps running unless the state also goes `error`. */
  onError?: (error: { code: string; message: string }) => void
}

/** Minimal structural view of what this client uses, so a test can supply a double. */
export type PeerConnectionLike = Pick<
  RTCPeerConnection,
  | 'addTrack'
  | 'close'
  | 'createOffer'
  | 'createAnswer'
  | 'setLocalDescription'
  | 'setRemoteDescription'
  | 'addIceCandidate'
  | 'getStats'
> & {
  connectionState: string
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null
  ontrack: ((event: { streams: MediaStream[] }) => void) | null
  onconnectionstatechange: (() => void) | null
  localDescription: RTCSessionDescription | null
  remoteDescription: RTCSessionDescription | null
}

export type SocketLike = {
  send: (data: string) => void
  close: (code?: number, reason?: string) => void
  readyState: number
  onopen: ((event: unknown) => void) | null
  onclose: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
}

export type CallClientOptions = {
  roomId: string
  /** Local camera/microphone. Null joins as a listener with nothing to send. */
  localStream: MediaStream | null
  events?: CallEvents
  /** Injected for tests. Defaults to the browser globals. */
  createSocket?: (url: string) => SocketLike
  createPeerConnection?: (config: { iceServers: IceServerConfig[] }) => PeerConnectionLike
  /** How often measured stats are reported upward. Zero disables reporting. */
  telemetryIntervalMs?: number
}

type PeerEntry = {
  participant: Participant
  connection: PeerConnectionLike
  stream: MediaStream | null
  /** Candidates that arrived before the remote description was set. */
  pendingCandidates: RTCIceCandidateInit[]
  makingOffer: boolean
}

const SIGNALING_PATH = '/v1/signal'
const DEFAULT_TELEMETRY_INTERVAL_MS = 5000

/**
 * Build the signaling URL. The token rides in the query string because a browser cannot
 * set headers on a WebSocket; it is short-lived and the connection is TLS-terminated at
 * the edge.
 */
export function buildSignalingUrl(roomId: string, token: string | null, apiBaseUrl: string): string {
  const base = apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
  const url = new URL(SIGNALING_PATH, base || 'http://localhost')
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  if (token) url.searchParams.set('token', token)
  else url.searchParams.set('clientId', roomId.slice(0, 8))
  return url.toString()
}

/**
 * Who offers when two peers meet. Both sides run this and reach the same answer, so
 * exactly one offer is made and the negotiation cannot deadlock.
 */
export function shouldInitiateOffer(selfId: string, remoteId: string): boolean {
  return selfId > remoteId
}

export class CallClient {
  private socket: SocketLike | null = null
  private selfId: string | null = null
  private iceServers: IceServerConfig[] = []
  private readonly peers = new Map<string, PeerEntry>()
  private state: CallState = 'idle'
  private telemetryTimer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly options: CallClientOptions) {}

  getState(): CallState {
    return this.state
  }

  getPeers(): RemotePeer[] {
    return [...this.peers.values()].map((entry) => ({
      participant: entry.participant,
      stream: entry.stream,
      connectionState: entry.connection.connectionState,
    }))
  }

  private setState(state: CallState): void {
    this.state = state
    this.options.events?.onStateChange?.(state)
  }

  private emitPeers(): void {
    this.options.events?.onPeersChange?.(this.getPeers())
  }

  private fail(code: string, message: string): void {
    log.warn('webrtc', message, { code })
    this.options.events?.onError?.({ code, message })
  }

  private send(payload: unknown): void {
    if (!this.socket) return
    this.socket.send(JSON.stringify(payload))
  }

  /** Open the socket and join the room. Resolves once the room has been joined. */
  async join(): Promise<void> {
    const env = getAppEnv()
    const url = buildSignalingUrl(this.options.roomId, getOperatorToken(), env.apiBaseUrl)
    const createSocket =
      this.options.createSocket ?? ((target: string) => new WebSocket(target) as unknown as SocketLike)

    this.setState('connecting')
    const socket = createSocket(url)
    this.socket = socket

    return new Promise<void>((resolve, reject) => {
      let settled = false

      socket.onopen = () => {
        this.send({ type: 'join', roomId: this.options.roomId })
      }

      socket.onerror = () => {
        this.fail('socket_error', 'Signaling connection failed')
        if (!settled) {
          settled = true
          this.setState('error')
          reject(new Error('Signaling connection failed'))
        }
      }

      socket.onclose = () => {
        this.stopTelemetry()
        // A close after a successful join is a disconnect, not a join failure.
        if (this.state !== 'closed') this.setState(settled ? 'closed' : 'error')
        if (!settled) {
          settled = true
          reject(new Error('Signaling connection closed before joining'))
        }
      }

      socket.onmessage = (event) => {
        void this.handleMessage(event.data, () => {
          if (!settled) {
            settled = true
            resolve()
          }
        })
      }
    })
  }

  private async handleMessage(raw: unknown, onJoined: () => void): Promise<void> {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(String(raw)) as Record<string, unknown>
    } catch {
      this.fail('bad_message', 'Signaling sent something that was not JSON')
      return
    }

    switch (message.type) {
      case 'welcome':
        this.iceServers = (message.iceServers as IceServerConfig[]) ?? []
        return

      case 'joined': {
        const self = message.self as Participant
        const room = message.room as { participants: Participant[] }
        this.selfId = self.id
        this.iceServers = (message.iceServers as IceServerConfig[]) ?? this.iceServers
        this.setState('joined')

        // Everyone already in the room: connect to each, offering only where the glare
        // rule says this side offers.
        for (const participant of room.participants) {
          if (participant.id === self.id) continue
          const entry = this.ensurePeer(participant)
          if (shouldInitiateOffer(self.id, participant.id)) await this.makeOffer(entry)
        }

        this.emitPeers()
        this.startTelemetry()
        onJoined()
        return
      }

      case 'peer-joined': {
        const participant = message.participant as Participant
        const entry = this.ensurePeer(participant)
        if (this.selfId && shouldInitiateOffer(this.selfId, participant.id)) {
          await this.makeOffer(entry)
        }
        this.emitPeers()
        return
      }

      case 'peer-left': {
        const participantId = message.participantId as string
        const entry = this.peers.get(participantId)
        if (entry) {
          entry.connection.close()
          this.peers.delete(participantId)
          this.emitPeers()
        }
        return
      }

      case 'offer':
        await this.handleOffer(message.from as string, message.sdp as string)
        return

      case 'answer':
        await this.handleAnswer(message.from as string, message.sdp as string)
        return

      case 'ice':
        await this.handleCandidate(message.from as string, message.candidate as RTCIceCandidateInit)
        return

      case 'error':
        this.fail(String(message.code ?? 'signaling_error'), String(message.message ?? 'Signaling error'))
        // A refused join is terminal; a mid-call relay error is not.
        if (['room_not_found', 'room_full', 'already_joined'].includes(String(message.code))) {
          this.setState('error')
        }
        return

      default:
        return
    }
  }

  private ensurePeer(participant: Participant): PeerEntry {
    const existing = this.peers.get(participant.id)
    if (existing) return existing

    const createPeerConnection =
      this.options.createPeerConnection ??
      ((config: { iceServers: IceServerConfig[] }) =>
        new RTCPeerConnection(config as RTCConfiguration) as unknown as PeerConnectionLike)

    const connection = createPeerConnection({ iceServers: this.iceServers })

    const entry: PeerEntry = {
      participant,
      connection,
      stream: null,
      pendingCandidates: [],
      makingOffer: false,
    }

    if (this.options.localStream) {
      for (const track of this.options.localStream.getTracks()) {
        connection.addTrack(track, this.options.localStream)
      }
    }

    connection.onicecandidate = (event) => {
      if (!event.candidate) return
      this.send({ type: 'ice', to: participant.id, candidate: event.candidate })
    }

    connection.ontrack = (event) => {
      entry.stream = event.streams[0] ?? null
      this.emitPeers()
    }

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed') {
        // Most often: no TURN relay and a NAT that STUN cannot traverse. Named plainly so
        // the operator is not left guessing at a silent black tile.
        this.fail(
          'peer_connection_failed',
          `Connection to ${participant.name} failed — if this repeats, the deployment likely needs a TURN relay`
        )
      }
      this.emitPeers()
    }

    this.peers.set(participant.id, entry)
    return entry
  }

  private async makeOffer(entry: PeerEntry): Promise<void> {
    try {
      entry.makingOffer = true
      const offer = await entry.connection.createOffer()
      await entry.connection.setLocalDescription(offer)
      this.send({ type: 'offer', to: entry.participant.id, sdp: offer.sdp })
    } catch (error) {
      this.fail('offer_failed', error instanceof Error ? error.message : 'Could not create an offer')
    } finally {
      entry.makingOffer = false
    }
  }

  private async handleOffer(from: string, sdp: string): Promise<void> {
    const entry = this.peers.get(from)
    if (!entry) {
      this.fail('unknown_peer', 'Received an offer from someone not in this room')
      return
    }

    try {
      await entry.connection.setRemoteDescription({ type: 'offer', sdp } as RTCSessionDescriptionInit)
      await this.flushCandidates(entry)
      const answer = await entry.connection.createAnswer()
      await entry.connection.setLocalDescription(answer)
      this.send({ type: 'answer', to: from, sdp: answer.sdp })
    } catch (error) {
      this.fail('answer_failed', error instanceof Error ? error.message : 'Could not answer an offer')
    }
  }

  private async handleAnswer(from: string, sdp: string): Promise<void> {
    const entry = this.peers.get(from)
    if (!entry) return
    try {
      await entry.connection.setRemoteDescription({ type: 'answer', sdp } as RTCSessionDescriptionInit)
      await this.flushCandidates(entry)
    } catch (error) {
      this.fail('answer_rejected', error instanceof Error ? error.message : 'Could not apply an answer')
    }
  }

  private async handleCandidate(from: string, candidate: RTCIceCandidateInit): Promise<void> {
    const entry = this.peers.get(from)
    if (!entry) return

    // Before the remote description exists, addIceCandidate throws. Queue rather than drop.
    if (!entry.connection.remoteDescription) {
      entry.pendingCandidates.push(candidate)
      return
    }

    try {
      await entry.connection.addIceCandidate(candidate)
    } catch (error) {
      this.fail('ice_failed', error instanceof Error ? error.message : 'Could not add an ICE candidate')
    }
  }

  private async flushCandidates(entry: PeerEntry): Promise<void> {
    const queued = entry.pendingCandidates.splice(0)
    for (const candidate of queued) {
      try {
        await entry.connection.addIceCandidate(candidate)
      } catch {
        // One bad candidate must not abort the rest; ICE tries every path it has.
      }
    }
  }

  /**
   * Report measured stats upward. The node cannot see inside a peer connection, so if this
   * does not run its operator dashboard honestly shows nothing rather than an estimate.
   */
  private startTelemetry(): void {
    const interval = this.options.telemetryIntervalMs ?? DEFAULT_TELEMETRY_INTERVAL_MS
    if (interval <= 0) return

    this.telemetryTimer = setInterval(() => {
      void this.reportTelemetry()
    }, interval)
  }

  private stopTelemetry(): void {
    if (this.telemetryTimer) clearInterval(this.telemetryTimer)
    this.telemetryTimer = null
  }

  async reportTelemetry(): Promise<void> {
    const entry = [...this.peers.values()][0]
    if (!entry) return

    try {
      const stats = await entry.connection.getStats()
      const measurement = summarizeStats(stats)
      if (!measurement) return

      await fetch(apiUrl(`/v1/rooms/${this.options.roomId}/telemetry`), {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(measurement),
      })
    } catch {
      // Telemetry is observability, not the call. A failure here changes nothing audible.
    }
  }

  /** Leave the room and tear everything down. Safe to call twice. */
  close(): void {
    this.stopTelemetry()
    for (const entry of this.peers.values()) entry.connection.close()
    this.peers.clear()

    if (this.socket) {
      try {
        this.send({ type: 'leave' })
        this.socket.close(1000, 'client closed')
      } catch {
        // Already gone.
      }
      this.socket = null
    }

    this.setState('closed')
    this.emitPeers()
  }
}

export type Measurement = {
  signalQuality: number
  latency: number
  frameRate: number
  bitrate: number
  packetLoss: number
}

/**
 * Fold an `RTCStatsReport` into the five numbers the control plane stores. Returns null
 * when the report has no inbound video yet — better nothing than a zeroed reading that
 * looks like a measured zero.
 */
export function summarizeStats(report: RTCStatsReport): Measurement | null {
  let frameRate = 0
  let bitrate = 0
  let packetLoss = 0
  let latency = 0
  let sawInbound = false

  report.forEach((entry: Record<string, unknown>) => {
    if (entry.type === 'inbound-rtp' && entry.kind === 'video') {
      sawInbound = true
      frameRate = Number(entry.framesPerSecond ?? 0)
      const received = Number(entry.packetsReceived ?? 0)
      const lost = Number(entry.packetsLost ?? 0)
      packetLoss = received + lost > 0 ? (lost / (received + lost)) * 100 : 0
      // bytesReceived is cumulative; the rate is derived from the reported interval.
      const bytes = Number(entry.bytesReceived ?? 0)
      const seconds = Number(entry.timestamp ?? 0) > 0 ? 1 : 0
      bitrate = seconds > 0 ? Math.round((bytes * 8) / 1000) : 0
    }
    if (entry.type === 'candidate-pair' && entry.state === 'succeeded') {
      latency = Math.round(Number(entry.currentRoundTripTime ?? 0) * 1000)
    }
  })

  if (!sawInbound) return null

  // A single readable number for the dashboard: full marks minus what loss and delay cost.
  const signalQuality = Math.max(0, Math.min(100, Math.round(100 - packetLoss * 5 - latency / 20)))

  return {
    signalQuality,
    latency,
    frameRate: Math.min(frameRate, 240),
    bitrate: Math.min(bitrate, 100_000),
    packetLoss: Math.min(packetLoss, 100),
  }
}
