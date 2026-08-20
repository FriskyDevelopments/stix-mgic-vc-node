import { getAppEnv } from '@/lib/env'
import { apiHeaders, apiUrl } from '@/lib/api-client'
import { getClientId } from '@/lib/client-id'
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
  /**
   * Automatic signaling reconnection. A dropped WebSocket is a lost call today; with this
   * enabled the client re-opens the socket and re-joins the same room with capped
   * exponential backoff. Off by default so existing callers keep their exact behaviour.
   */
  reconnect?: {
    enabled?: boolean
    /** Max consecutive attempts before giving up and going to `error`. Default 5. */
    maxAttempts?: number
    /** First backoff delay; doubles each attempt. Default 500ms. */
    baseDelayMs?: number
    /** Upper bound on any single backoff delay. Default 10000ms. */
    maxDelayMs?: number
  }
}

type PeerEntry = {
  participant: Participant
  connection: PeerConnectionLike
  stream: MediaStream | null
  /** Candidates that arrived before the remote description was set. */
  pendingCandidates: RTCIceCandidateInit[]
  makingOffer: boolean
  /** The senders for the local tracks, kept so a device switch can replaceTrack in place. */
  videoSender?: RTCRtpSender
  audioSender?: RTCRtpSender
}

const SIGNALING_PATH = '/v1/signal'
const DEFAULT_TELEMETRY_INTERVAL_MS = 5000

/**
 * Build the signaling URL. The token rides in the query string because a browser cannot
 * set headers on a WebSocket; it is short-lived and the connection is TLS-terminated at
 * the edge.
 */
export function buildSignalingUrl(
  roomId: string,
  token: string | null,
  apiBaseUrl: string,
  anonymousClientId = getClientId()
): string {
  const base = apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
  const url = new URL(SIGNALING_PATH, base || 'http://localhost')
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  if (token) url.searchParams.set('token', token)
  else url.searchParams.set('clientId', anonymousClientId)
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
  /** True once close() is called, so an intentional teardown never triggers a reconnect. */
  private closedByClient = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  /** Stable for this browser participant across signaling reconnects, unique across tabs. */
  private readonly anonymousClientId: string

  constructor(private readonly options: CallClientOptions) {
    this.anonymousClientId = getClientId()
  }

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

  /**
   * Swap the local camera or microphone track on every peer connection without
   * renegotiating — `RTCRtpSender.replaceTrack` changes the source mid-call, so a device
   * switch never drops the call. The local stream reference is kept current so a
   * reconnection re-attaches the track the operator actually chose.
   */
  async replaceLocalTrack(track: MediaStreamTrack): Promise<void> {
    for (const entry of this.peers.values()) {
      const sender = track.kind === 'video' ? entry.videoSender : entry.audioSender
      if (!sender) continue
      try {
        await sender.replaceTrack(track)
      } catch {
        // A failed replace on one peer must not abort the switch on the others.
      }
    }
    // Keep the stream the client re-attaches on reconnect in sync with the live choice.
    const stream = this.options.localStream
    if (stream) {
      for (const existing of stream.getTracks()) {
        if (existing.kind === track.kind && existing !== track) stream.removeTrack(existing)
      }
      if (!stream.getTracks().includes(track)) stream.addTrack(track)
    }
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
    this.closedByClient = false
    this.reconnectAttempts = 0
    return this.connectOnce()
  }

  /**
   * One connection attempt. Resolves when the room is joined, rejects if the socket fails
   * or closes before joining. A close *after* joining is a live-call disconnect and, when
   * reconnection is enabled, schedules a re-join rather than ending the call.
   */
  private connectOnce(): Promise<void> {
    const env = getAppEnv()
    const url = buildSignalingUrl(
      this.options.roomId,
      getOperatorToken(),
      env.apiBaseUrl,
      this.anonymousClientId
    )
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
        // Reconnection is scheduled from onclose, which follows an error, so a single
        // failure never schedules two attempts.
      }

      socket.onclose = () => {
        this.stopTelemetry()
        if (!settled) {
          settled = true
          if (this.state !== 'closed') this.setState('error')
          reject(new Error('Signaling connection closed before joining'))
        } else if (!this.closedByClient) {
          // Dropped mid-call. Try to get back in unless the caller opted out.
          if (this.state !== 'closed') this.setState('error')
        }
        this.scheduleReconnect()
      }

      socket.onmessage = (event) => {
        void this.handleMessage(event.data, () => {
          // A successful (re)join clears the backoff counter.
          this.reconnectAttempts = 0
          if (!settled) {
            settled = true
            resolve()
          }
        })
      }
    })
  }

  /**
   * Re-open the signaling socket and re-join the same room after an unexpected drop.
   * The node hands us a fresh participant id on re-join, so peers see us leave and return;
   * the local peer connections are torn down and rebuilt from the `joined` snapshot.
   */
  private scheduleReconnect(): void {
    if (this.closedByClient) return
    const cfg = this.options.reconnect
    if (!cfg?.enabled) return
    if (this.reconnectTimer) return

    const maxAttempts = cfg.maxAttempts ?? 5
    if (this.reconnectAttempts >= maxAttempts) {
      this.fail('reconnect_exhausted', `Gave up reconnecting after ${maxAttempts} attempts`)
      this.setState('error')
      return
    }

    const base = cfg.baseDelayMs ?? 500
    const cap = cfg.maxDelayMs ?? 10_000
    const delay = Math.min(base * 2 ** this.reconnectAttempts, cap)
    this.reconnectAttempts++
    this.setState('connecting')

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.closedByClient) return
      // Old peer connections belong to a participant id the room no longer knows; drop them
      // and let the `joined` snapshot rebuild the mesh.
      this.resetPeers()
      void this.connectOnce().catch(() => {
        // A failed attempt closes the socket, and onclose schedules the next one.
      })
    }, delay)
  }

  private resetPeers(): void {
    for (const entry of this.peers.values()) entry.connection.close()
    this.peers.clear()
    this.emitPeers()
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
        const sender = connection.addTrack(track, this.options.localStream)
        if (track.kind === 'video') entry.videoSender = sender
        else if (track.kind === 'audio') entry.audioSender = sender
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
    this.closedByClient = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
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
