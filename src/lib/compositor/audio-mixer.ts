/**
 * audio-mixer.ts — Web Audio API mixer.
 *
 * Combines multiple audio sources (microphone, video file audio, Spotify playback)
 * into a single output MediaStream. Each source has independent gain control.
 *
 * Architecture:
 *   [Mic] ──> GainNode ──┐
 *   [File] ─> GainNode ──┼──> Destination (MediaStreamAudioDestinationNode)
 *   [Spotify] > GainNode ┘
 *
 * The output stream's audio track can be combined with the compositor's video track
 * to create a complete MediaStream for the Telegram VC adapter.
 */

export type AudioSourceId = 'mic' | 'file' | 'spotify'

export type AudioMixerOptions = {
  /** Default gain for each source (0-1). */
  defaultGain?: number
}

export class AudioMixer {
  private ctx: AudioContext
  private destination: MediaStreamAudioDestinationNode
  private sources: Map<AudioSourceId, { node: MediaStreamAudioSourceNode | MediaElementAudioSourceNode; gain: GainNode }> = new Map()
  private gains: Map<AudioSourceId, number> = new Map()

  constructor(options: AudioMixerOptions = {}) {
    this.ctx = new AudioContext()
    this.destination = this.ctx.createMediaStreamDestination()

    const defaultGain = options.defaultGain ?? 0.8
    this.gains.set('mic', defaultGain)
    this.gains.set('file', defaultGain)
    this.gains.set('spotify', defaultGain)
  }

  /** Get the mixed audio output as a MediaStream. */
  getOutputStream(): MediaStream {
    return this.destination.stream
  }

  /** Add a microphone stream. */
  addMic(stream: MediaStream): void {
    this.removeSource('mic')
    const source = this.ctx.createMediaStreamSource(stream)
    const gain = this.ctx.createGain()
    gain.gain.value = this.gains.get('mic') ?? 0.8
    source.connect(gain)
    gain.connect(this.destination)
    this.sources.set('mic', { node: source, gain })
  }

  /** Add audio from a <video> or <audio> element (for file playback). */
  addMediaElement(element: HTMLMediaElement): void {
    this.removeSource('file')
    const source = this.ctx.createMediaElementSource(element)
    const gain = this.ctx.createGain()
    gain.gain.value = this.gains.get('file') ?? 0.8
    source.connect(gain)
    gain.connect(this.destination)
    // Also connect to speakers so the operator hears it
    gain.connect(this.ctx.destination)
    this.sources.set('file', { node: source, gain })
  }

  /** Add a Spotify/external audio stream. */
  addStream(id: AudioSourceId, stream: MediaStream): void {
    this.removeSource(id)
    const source = this.ctx.createMediaStreamSource(stream)
    const gain = this.ctx.createGain()
    gain.gain.value = this.gains.get(id) ?? 0.8
    source.connect(gain)
    gain.connect(this.destination)
    this.sources.set(id, { node: source, gain })
  }

  /** Set gain for a source (0-1). */
  setGain(id: AudioSourceId, value: number): void {
    this.gains.set(id, Math.max(0, Math.min(1, value)))
    const entry = this.sources.get(id)
    if (entry) {
      entry.gain.gain.value = this.gains.get(id)!
    }
  }

  /** Get current gain for a source. */
  getGain(id: AudioSourceId): number {
    return this.gains.get(id) ?? 0
  }

  /** Remove a source. */
  removeSource(id: AudioSourceId): void {
    const entry = this.sources.get(id)
    if (entry) {
      entry.node.disconnect()
      entry.gain.disconnect()
      this.sources.delete(id)
    }
  }

  /** Mute/unmute a source. */
  mute(id: AudioSourceId): void {
    const entry = this.sources.get(id)
    if (entry) entry.gain.gain.value = 0
  }

  unmute(id: AudioSourceId): void {
    const entry = this.sources.get(id)
    if (entry) entry.gain.gain.value = this.gains.get(id) ?? 0.8
  }

  /** Resume AudioContext (needed after user gesture). */
  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
  }

  /** Clean up everything. */
  destroy(): void {
    for (const [id] of this.sources) {
      this.removeSource(id)
    }
    this.ctx.close().catch(() => {})
  }
}
