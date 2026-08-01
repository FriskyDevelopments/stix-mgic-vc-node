/**
 * sources/webrtc-relay-source.ts — relay audio from a WebRTC room into the group call.
 *
 * This bridges the node's own WebRTC rooms (peer-to-peer mesh) into a Telegram group call.
 * The approach:
 *   1. The operator's browser captures audio and sends it to a local WebRTC room
 *   2. A server-side "bot" peer joins the same room via signaling
 *   3. That peer's incoming audio track is piped to ffmpeg for format conversion
 *   4. ffmpeg outputs PCM s16le for the Telegram SFU
 *
 * IMPORTANT LIMITATION: Server-side WebRTC (receiving tracks without a browser) requires
 * a native WebRTC implementation. In Node.js, this means `wrtc` (node-webrtc) or `werift`.
 * Neither is a lightweight dependency.
 *
 * Current implementation: The relay works by having the BROWSER do the bridging instead.
 * The client captures its local audio, sends it to both:
 *   - The WebRTC room (for other participants)
 *   - An HTTP upload endpoint that pipes to ffmpeg → Telegram
 *
 * This avoids server-side WebRTC entirely. The tradeoff is the audio travels:
 *   browser → server (upload) → ffmpeg → Telegram SFU
 * instead of:
 *   browser → server-side peer → ffmpeg → Telegram SFU
 *
 * For a v1 this is acceptable. A future version could use werift for true server-side relay.
 */
import { FfmpegRunner } from './ffmpeg-base'
import type { MediaSource, MediaSourceOptions, MediaSourceState, MediaSourceStats } from '../media-source'

export type WebRtcRelaySourceOptions = MediaSourceOptions

/**
 * The relay source starts an ffmpeg process that reads PCM from stdin.
 * Audio chunks are pushed via the `pushAudio` method, called by the upload endpoint.
 */
export function createWebRtcRelaySource(
  roomId: string,
  options: WebRtcRelaySourceOptions = {}
): MediaSource & { pushAudio(chunk: Buffer): boolean } {
  let state: MediaSourceState = 'idle'
  let error: string | null = null
  let startedAt: number | null = null
  const ffmpeg = new FfmpegRunner()

  return {
    type: 'webrtc-relay',
    get state() { return state },
    get error() { return error },
    get startedAt() { return startedAt },

    async start() {
      if (state === 'active') return
      if (!roomId) {
        state = 'error'
        error = 'Room ID is required for WebRTC relay source'
        throw new Error(error)
      }

      state = 'starting'

      // ffmpeg reads raw PCM from stdin (the browser pushes audio chunks)
      // and outputs the same format (passthrough for now — future: could add
      // noise gate, compression, or mixing).
      const args: string[] = [
        '-hide_banner',
        '-loglevel', 'warning',
        // Input: raw PCM from stdin
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '1',
        '-i', 'pipe:0',
        // Output: same format, passthrough
        '-acodec', 'pcm_s16le',
        '-ar', '48000',
        '-ac', '1',
        '-f', 's16le',
        'pipe:1',
      ]

      try {
        await ffmpeg.start(args)
        state = 'active'
        startedAt = Date.now()
      } catch (err) {
        state = 'error'
        error = err instanceof Error ? err.message : 'Failed to start relay ffmpeg'
        throw err
      }
    },

    async stop() {
      ffmpeg.kill()
      state = 'stopped'
    },

    /** Push a chunk of PCM audio data from the browser upload. */
    pushAudio(chunk: Buffer): boolean {
      if (state !== 'active') return false
      return ffmpeg.write(chunk)
    },

    stats(): MediaSourceStats {
      const now = Date.now()
      return {
        type: 'webrtc-relay',
        state,
        durationSeconds: startedAt ? Math.floor((now - startedAt) / 1000) : 0,
        ffmpegAlive: ffmpeg.alive,
        error,
      }
    },
  }
}
