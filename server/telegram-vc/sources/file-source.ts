/**
 * sources/file-source.ts — stream a local audio/video file into the group call.
 *
 * Takes any file ffmpeg can read (mp3, mp4, wav, ogg, flac, mkv, etc.) and transcodes
 * it to the format the Telegram SFU expects: PCM s16le mono 48kHz for audio, and
 * optionally rawvideo yuv420p for video.
 *
 * Looping is supported: ffmpeg's `-stream_loop -1` replays the file indefinitely,
 * useful for hold music or a background loop in DJ mode.
 */
import { existsSync } from 'node:fs'
import { FfmpegRunner } from './ffmpeg-base'
import type { MediaSource, MediaSourceOptions, MediaSourceState, MediaSourceStats } from '../media-source'

export type FileSourceOptions = MediaSourceOptions & {
  loop?: boolean
}

export function createFileSource(filePath: string, options: FileSourceOptions = {}): MediaSource {
  let state: MediaSourceState = 'idle'
  let error: string | null = null
  let startedAt: number | null = null
  const ffmpeg = new FfmpegRunner()

  return {
    type: 'file',
    get state() { return state },
    get error() { return error },
    get startedAt() { return startedAt },

    async start() {
      if (state === 'active') return

      if (!filePath || !existsSync(filePath)) {
        state = 'error'
        error = `File not found: ${filePath}`
        throw new Error(error)
      }

      state = 'starting'

      const args: string[] = [
        '-hide_banner',
        '-loglevel', 'warning',
      ]

      // Loop if requested
      if (options.loop) {
        args.push('-stream_loop', '-1')
      }

      args.push(
        '-re', // Read at native frame rate — don't dump the whole file instantly
        '-i', filePath,
      )

      // Audio output: PCM s16le, mono, 48kHz to stdout
      args.push(
        '-vn', // No video for now (simplifies initial implementation)
        '-acodec', 'pcm_s16le',
        '-ar', '48000',
        '-ac', '1',
        '-f', 's16le',
        'pipe:1', // Output to stdout
      )

      try {
        await ffmpeg.start(args)
        state = 'active'
        startedAt = Date.now()
      } catch (err) {
        state = 'error'
        error = err instanceof Error ? err.message : 'Failed to start ffmpeg'
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
        type: 'file',
        state,
        durationSeconds: startedAt ? Math.floor((now - startedAt) / 1000) : 0,
        ffmpegAlive: ffmpeg.alive,
        error,
      }
    },
  }
}
