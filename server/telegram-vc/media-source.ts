/**
 * telegram-vc/media-source.ts — interface for media sources.
 *
 * A media source produces audio (and optionally video) that gets streamed into the
 * Telegram group call. Each source type handles its own transcoding via ffmpeg.
 *
 * The required output format for Telegram group calls:
 *   Audio: PCM s16le, mono, 48kHz (Opus encoding happens at the transport layer)
 *   Video: rawvideo, yuv420p, 640x360 to 1280x720, 24-30fps
 *
 * All sources use ffmpeg as the transcoding engine. The ffmpeg process is spawned per
 * source and killed on stop. This is intentionally simple: one process, one pipe, no
 * state machine for the transcoder itself.
 */
import type { SfuTransport } from './group-call'

export type MediaSourceType = 'file' | 'rtmp' | 'webrtc-relay'

export type MediaSourceState = 'idle' | 'starting' | 'active' | 'error' | 'stopped'

export type MediaSourceOptions = {
  ssrc?: number | null
  transport?: SfuTransport | null
  /** Audio bitrate in kbps. Default: 48. */
  audioBitrate?: number
  /** Video resolution. Default: '640x360'. */
  videoResolution?: string
  /** Video fps. Default: 24. */
  videoFps?: number
}

export interface MediaSource {
  readonly type: MediaSourceType
  readonly state: MediaSourceState
  readonly error: string | null
  readonly startedAt: number | null

  start(): Promise<void>
  stop(): Promise<void>
  /** Returns basic stats about the running source. */
  stats(): MediaSourceStats
}

export type MediaSourceStats = {
  type: MediaSourceType
  state: MediaSourceState
  durationSeconds: number
  /** Whether ffmpeg is running. */
  ffmpegAlive: boolean
  error: string | null
}
