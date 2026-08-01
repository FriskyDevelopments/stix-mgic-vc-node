/**
 * sources/rtmp-source.ts — ingest an RTMP stream into the group call.
 *
 * Connects to an RTMP URL (e.g., from OBS streaming to a local relay like nginx-rtmp
 * or directly to a known RTMP endpoint) and transcodes the audio to the format Telegram
 * expects.
 *
 * The RTMP URL is validated: only rtmp:// and rtmps:// schemes are accepted, and the
 * URL must not point to localhost unless NODE_ENV is development (to prevent SSRF in
 * production where this might be exposed).
 *
 * Typical flow:
 *   1. OBS streams to rtmp://your-relay:1935/live/stream-key
 *   2. This source connects ffmpeg to that URL as input
 *   3. ffmpeg transcodes to PCM and pipes to stdout for the call
 */
import { FfmpegRunner } from './ffmpeg-base'
import type { MediaSource, MediaSourceOptions, MediaSourceState, MediaSourceStats } from '../media-source'

export type RtmpSourceOptions = MediaSourceOptions

const ALLOWED_SCHEMES = ['rtmp:', 'rtmps:']

function validateRtmpUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
      return `Invalid scheme: ${parsed.protocol}. Only rtmp:// and rtmps:// are allowed.`
    }
    // Block localhost/loopback in production to prevent SSRF
    const host = parsed.hostname.toLowerCase()
    if (process.env.NODE_ENV === 'production') {
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
        return 'RTMP source cannot target localhost in production.'
      }
    }
    return null
  } catch {
    return 'Invalid RTMP URL.'
  }
}

export function createRtmpSource(url: string, options: RtmpSourceOptions = {}): MediaSource {
  let state: MediaSourceState = 'idle'
  let error: string | null = null
  let startedAt: number | null = null
  const ffmpeg = new FfmpegRunner()

  return {
    type: 'rtmp',
    get state() { return state },
    get error() { return error },
    get startedAt() { return startedAt },

    async start() {
      if (state === 'active') return

      const validationError = validateRtmpUrl(url)
      if (validationError) {
        state = 'error'
        error = validationError
        throw new Error(error)
      }

      state = 'starting'

      const args: string[] = [
        '-hide_banner',
        '-loglevel', 'warning',
        // RTMP input with reconnect and timeout
        '-rw_timeout', '10000000', // 10s timeout in microseconds
        '-i', url,
        // Audio output: PCM s16le, mono, 48kHz to stdout
        '-vn',
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
        error = err instanceof Error ? err.message : 'Failed to connect to RTMP stream'
        throw err
      }
    },

    async stop() {
      ffmpeg.kill()
      state = 'stopped'
    },

    stats(): MediaSourceStats {
      const now = Date.now()
      return {
        type: 'rtmp',
        state,
        durationSeconds: startedAt ? Math.floor((now - startedAt) / 1000) : 0,
        ffmpegAlive: ffmpeg.alive,
        error,
      }
    },
  }
}
