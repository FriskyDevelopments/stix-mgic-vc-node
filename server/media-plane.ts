/**
 * media-plane.ts — what this node can actually carry, per transport.
 *
 * The old report was a single boolean pinned to `ready: false`. That was honest while
 * nothing existed, and became wrong the moment WebRTC rooms did: the node can now host a
 * real call, but still cannot join a Telegram group call. One boolean cannot say that, so
 * the status is per adapter and each unavailable one carries the reason it is unavailable.
 *
 * The three deferred adapters are deferred for concrete reasons, not for lack of time:
 *
 *   telegram-vc  Joining a Telegram group call is MTProto, not the Bot API. A bot token
 *                cannot do it at all — it needs a USER session, which is a real account
 *                credential with real account risk, and an owner decision before anyone
 *                wires it. (Same conclusion the LORE "VC Control" bot reached.)
 *   discord-voice Reachable with @discordjs/voice, but it is AUDIO ONLY: the Discord API
 *                gives bots no camera or screen share. Worth building for DJ Mode, worth
 *                nobody's time if the goal is video.
 *   rtmp         Needs ffmpeg on the host and a stream key that, for Telegram, itself comes
 *                from MTProto. Blocked behind the same decision as telegram-vc.
 *
 * Reporting them as "not_implemented" with a reason is the point: a false `ready` here
 * sends an operator to a live session that will not connect.
 */
import { getServerEnv } from './env'
import { existsSync } from 'node:fs'
import { hasTurn } from './ice'

export type AdapterState = 'ready' | 'degraded' | 'not_implemented' | 'disabled'

export type AdapterStatus = {
  id: 'webrtc' | 'telegram-vc' | 'discord-voice' | 'rtmp'
  state: AdapterState
  /** Always populated when the state is not `ready`. */
  reason: string
}

export type MediaPlaneStatus = {
  /** True when at least one adapter can carry a live session right now. */
  ready: boolean
  enabled: boolean
  adapters: AdapterStatus[]
  /** Kept for the older clients that read a single reason string. */
  reason: string
}

export function buildMediaPlaneStatus(input: { signalingReady: boolean }): MediaPlaneStatus {
  const env = getServerEnv()

  const webrtc: AdapterStatus = input.signalingReady
    ? hasTurn()
      ? {
        id: 'webrtc',
        state: 'ready',
        reason: env.cloudflareTurnConfigured
          ? env.cloudflareRealtimeConfigured
            ? 'signaling live, STUN and Cloudflare TURN relay configured, Cloudflare SFU available for scale'
            : 'signaling live, STUN and Cloudflare TURN relay configured'
          : 'signaling live, STUN and TURN configured',
      }
      : {
          id: 'webrtc',
          state: 'degraded',
          // Said plainly because it decides who can be on the call: no relay means the
          // callers behind symmetric NAT simply never connect.
          reason:
            'signaling live with STUN only — no TURN relay configured, so peers behind symmetric NAT or a restrictive firewall will fail to connect',
        }
    : { id: 'webrtc', state: 'disabled', reason: 'signaling not attached to this process' }

  const adapters: AdapterStatus[] = [
    webrtc,
    env.mtprotoConfigured && existsSync(`${process.env.MTPROTO_STATE_DIR || '/data/mtproto'}/operator.session`)
      ? { id: 'telegram-vc', state: 'ready', reason: 'native MTProto/WebRTC adapter paired and ready for an RTMP or media source' }
      : {
          id: 'telegram-vc',
          state: 'disabled',
          reason: env.mtprotoConfigured
            ? 'native MTProto/WebRTC adapter installed — pair the dedicated Telegram account once in Studio'
            : 'native adapter installed — Telegram API credentials are not configured on this node',
        },
    {
      id: 'discord-voice',
      state: 'not_implemented',
      reason: 'reachable via @discordjs/voice but audio only — Discord grants bots no camera or screen share',
    },
    env.rtmpConfigured
      ? { id: 'rtmp', state: 'ready', reason: `authenticated RTMP ingest ready on ${env.RTMP_PUBLIC_HOST}:1935/${env.RTMP_PATH}` }
      : {
          id: 'rtmp',
          state: 'disabled',
          reason: 'RTMP ingest sidecar is not configured on this node',
        },
  ]

  const ready = adapters.some((adapter) => adapter.state === 'ready' || adapter.state === 'degraded')

  return {
    ready,
    enabled: env.MEDIA_PLANE_ENABLED,
    adapters,
    reason: ready
      ? webrtc.reason
      : 'no media adapter can carry a session in this deployment',
  }
}
