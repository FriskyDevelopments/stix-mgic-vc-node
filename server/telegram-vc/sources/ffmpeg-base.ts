/**
 * sources/ffmpeg-base.ts — shared ffmpeg child process management.
 *
 * Every media source ultimately runs an ffmpeg process that transcodes its input
 * to the raw format Telegram's group call SFU expects. This base handles:
 *   - Spawning with proper args
 *   - Monitoring stderr for progress/errors
 *   - Killing on stop or timeout
 *   - Reporting liveness
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { getTelegramVcEnv } from '../env'

export type FfmpegProcessInfo = {
  alive: boolean
  pid: number | null
  exitCode: number | null
  stderrTail: string
}

export class FfmpegRunner {
  private proc: ChildProcess | null = null
  private stderrBuf: string[] = []
  private exitCode: number | null = null
  private killTimer: ReturnType<typeof setTimeout> | null = null
  private _startedAt: number | null = null

  get alive(): boolean {
    return this.proc !== null && this.exitCode === null
  }

  get startedAt(): number | null {
    return this._startedAt
  }

  get info(): FfmpegProcessInfo {
    return {
      alive: this.alive,
      pid: this.proc?.pid ?? null,
      exitCode: this.exitCode,
      stderrTail: this.stderrBuf.slice(-5).join('\n'),
    }
  }

  /**
   * Start ffmpeg with the given arguments.
   * Resolves when the process has been spawned (not when it finishes).
   */
  start(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.proc = spawn('ffmpeg', args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          // Don't let ffmpeg keep the node process alive
          detached: false,
        })

        this._startedAt = Date.now()

        this.proc.stderr?.on('data', (chunk: Buffer) => {
          const line = chunk.toString().trim()
          if (line) {
            this.stderrBuf.push(line)
            // Keep only last 20 lines
            if (this.stderrBuf.length > 20) this.stderrBuf.shift()
          }
        })

        this.proc.on('error', (err) => {
          this.exitCode = -1
          this.stderrBuf.push(`spawn error: ${err.message}`)
        })

        this.proc.on('close', (code) => {
          this.exitCode = code ?? -1
          this.clearKillTimer()
        })

        // Set a kill timer based on env config
        const env = getTelegramVcEnv()
        const timeout = (env?.ffmpegTimeoutSeconds ?? 300) * 1000
        if (timeout > 0) {
          this.killTimer = setTimeout(() => {
            this.stderrBuf.push(`killed: exceeded ${timeout / 1000}s timeout`)
            this.kill()
          }, timeout)
          this.killTimer.unref?.()
        }

        // Give it a moment to fail on bad args
        setTimeout(() => {
          if (this.exitCode !== null && this.exitCode !== 0) {
            reject(new Error(`ffmpeg exited immediately: ${this.stderrBuf.slice(-2).join(' ')}`))
          } else {
            resolve()
          }
        }, 200)
      } catch (err) {
        reject(err)
      }
    })
  }

  /** Write data to ffmpeg's stdin (for piped input). */
  write(data: Buffer): boolean {
    if (!this.proc?.stdin?.writable) return false
    return this.proc.stdin.write(data)
  }

  /** Get the stdout stream (for piped output). */
  get stdout() {
    return this.proc?.stdout ?? null
  }

  /** Get the stdin stream (for piped input). */
  get stdin() {
    return this.proc?.stdin ?? null
  }

  kill(): void {
    this.clearKillTimer()
    if (this.proc && this.exitCode === null) {
      this.proc.kill('SIGTERM')
      // Force kill if it doesn't die within 3 seconds
      const forceKill = setTimeout(() => {
        if (this.proc && this.exitCode === null) {
          this.proc.kill('SIGKILL')
        }
      }, 3000)
      forceKill.unref?.()
    }
  }

  private clearKillTimer(): void {
    if (this.killTimer) {
      clearTimeout(this.killTimer)
      this.killTimer = null
    }
  }
}
