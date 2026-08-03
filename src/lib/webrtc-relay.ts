/**
 * webrtc-relay.ts — browser-side audio relay to the Telegram VC server.
 *
 * Captures a MediaStream's audio track via AudioContext, extracts raw PCM
 * (s16le, mono, 48000Hz), and POSTs chunks to POST /v1/telegram-vc/audio.
 *
 * The audio push endpoint expects: PCM s16le, mono, 48kHz, max 64KB per chunk.
 * At 48kHz mono s16le that's ~341ms per chunk at max. We send every 100ms (~9600 bytes)
 * to keep latency low while staying under the limit.
 *
 * Flow:
 *   DJ Mode compositor → MediaStream → AudioContext → ScriptProcessor → PCM chunks
 *   → POST /v1/telegram-vc/audio → server → ffmpeg → Telegram SFU
 */

import { getAppEnv } from "@/lib/env";
import { getOperatorToken } from "@/lib/operator-token";

const SAMPLE_RATE = 48000;
const CHUNK_INTERVAL_MS = 100; // send every 100ms
const BYTES_PER_CHUNK = Math.floor((SAMPLE_RATE * 2) / (1000 / CHUNK_INTERVAL_MS)); // 9600 bytes per chunk

export type RelayState = "idle" | "starting" | "streaming" | "error" | "stopped";

export interface RelayStats {
  state: RelayState;
  chunksSent: number;
  bytesSent: number;
  startedAt: number | null;
  error: string | null;
}

export class WebrtcRelay {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private stream: MediaStream | null = null;
  private intervalHandle: number | null = null;
  private pcmBuffer: Int16Array;
  private bufferWritePos = 0;

  private _state: RelayState = "idle";
  private _chunksSent = 0;
  private _bytesSent = 0;
  private _startedAt: number | null = null;
  private _error: string | null = null;

  // Callbacks
  onStateChange?: (state: RelayState) => void;
  onStats?: (stats: RelayStats) => void;

  get state(): RelayState {
    return this._state;
  }

  get stats(): RelayStats {
    return {
      state: this._state,
      chunksSent: this._chunksSent,
      bytesSent: this._bytesSent,
      startedAt: this._startedAt,
      error: this._error,
    };
  }

  private setState(state: RelayState, error?: string) {
    this._state = state;
    if (error !== undefined) this._error = error;
    this.onStateChange?.(state);
  }

  /**
   * Start relaying audio from the given MediaStream to the Telegram VC server.
   */
  async start(stream: MediaStream): Promise<void> {
    if (this._state === "streaming") {
      console.warn("WebrtcRelay: already streaming");
      return;
    }

    this.setState("starting");
    this.stream = stream;
    this.pcmBuffer = new Int16Array(SAMPLE_RATE * 2); // 2 seconds buffer max
    this.bufferWritePos = 0;
    this._chunksSent = 0;
    this._bytesSent = 0;
    this._startedAt = Date.now();

    try {
      // Set up AudioContext to capture the stream
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error("Stream has no audio track");
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(stream);

      // ScriptProcessorNode for PCM extraction.
      // bufferSize=4096 gives ~85ms latency at 48kHz, good balance.
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processorNode.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        // Convert Float32 [-1.0, 1.0] to Int16 (s16le)
        for (let i = 0; i < input.length; i++) {
          if (this.bufferWritePos >= this.pcmBuffer.length) break;
          const sample = Math.max(-1, Math.min(1, input[i]));
          this.pcmBuffer[this.bufferWritePos++] =
            sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
      };

      // Connect: source → processor → destination (silent, we don't want feedback)
      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      // Start sending chunks on interval
      this.intervalHandle = window.setInterval(() => {
        this.sendChunk();
      }, CHUNK_INTERVAL_MS);

      this.setState("streaming");
      console.log(
        `WebrtcRelay: streaming started, ${(
          CHUNK_INTERVAL_MS
        )}ms chunks, ~${BYTES_PER_CHUNK} bytes each`
      );
    } catch (err) {
      this.setState(
        "error",
        err instanceof Error ? err.message : "Failed to start relay"
      );
      throw err;
    }
  }

  private async sendChunk() {
    if (this.bufferWritePos === 0) return;

    // Slice the buffered PCM data
    const chunk = this.pcmBuffer.slice(0, this.bufferWritePos);
    this.bufferWritePos = 0;

    const env = getAppEnv();
    const token = getOperatorToken();

    try {
      const response = await fetch(`${env.apiBaseUrl}/v1/telegram-vc/audio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: chunk.buffer,
      });

      if (!response.ok) {
        // 409 = no active call — just skip, will retry
        if (response.status === 409) return;

        const body = await response.json().catch(() => ({}));
        console.warn(
          `WebrtcRelay: chunk rejected (${response.status}): ${(body as any)?.error}`
        );
      } else {
        this._chunksSent++;
        this._bytesSent += chunk.byteLength;
      }

      this.onStats?.(this.stats);
    } catch (err) {
      // Network errors during streaming are expected occasionally
      console.warn("WebrtcRelay: chunk send failed:", err);
    }
  }

  /**
   * Stop the relay and clean up all audio nodes.
   */
  async stop(): Promise<void> {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.stream = null;
    this.pcmBuffer = new Int16Array(0);
    this.setState("stopped");
    console.log(
      `WebrtcRelay: stopped. Sent ${this._chunksSent} chunks, ${this._bytesSent} bytes`
    );
  }
}

/** Singleton relay instance. */
let relayInstance: WebrtcRelay | null = null;

export function getWebrtcRelay(): WebrtcRelay {
  if (!relayInstance) {
    relayInstance = new WebrtcRelay();
  }
  return relayInstance;
}