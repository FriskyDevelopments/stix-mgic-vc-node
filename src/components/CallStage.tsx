import { useEffect, useRef, useState } from 'react'
import { CallClient, type CallState, type RemotePeer } from '@/lib/webrtc-client'
import { GlassCard } from '@/components/GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/**
 * CallStage — the remote side of a call.
 *
 * The preview panel shows the operator their own camera; this shows the people they are
 * actually connected to. It owns one CallClient for the lifetime of the room and tears it
 * down on unmount, because a client left running keeps a seat in a room with a small
 * participant cap.
 *
 * It is deliberately blunt about failure. A black tile with no explanation is the worst
 * possible outcome for an operator mid-session, so a connection that fails says so, and
 * says that a missing TURN relay is the usual cause.
 */

export type CallStageProps = {
  roomId: string
  /** The operator's own camera/microphone; passed to every peer connection. */
  localStream: MediaStream | null
  onStateChange?: (state: CallState) => void
  /** Selected audio-output deviceId — routed to every remote tile via setSinkId. */
  sinkId?: string
  /** Hands the live CallClient up so the shell can switch camera/mic mid-call. */
  onClientReady?: (client: CallClient | null) => void
}

const STATE_LABEL: Record<CallState, string> = {
  idle: 'Standby',
  connecting: 'Connecting',
  joined: 'Live',
  closed: 'Ended',
  error: 'Failed',
}

function RemoteTile({ peer, sinkId }: { peer: RemotePeer; sinkId?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (videoRef.current && peer.stream) {
      videoRef.current.srcObject = peer.stream
    }
  }, [peer.stream])

  // Route this peer's audio to the operator's chosen speaker. setSinkId is Chromium-only
  // and rejects on an unknown id; either way the call keeps playing on the default device.
  useEffect(() => {
    const el = videoRef.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null
    if (el && sinkId && typeof el.setSinkId === 'function') {
      void el.setSinkId(sinkId).catch(() => {})
    }
  }, [sinkId, peer.stream])

  const connected = peer.connectionState === 'connected'

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-black/60 aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        // Remote audio must NOT be muted — muting it is a silent call that looks fine.
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
        <span className="truncate font-mono text-[10px] text-white/90">{peer.participant.name}</span>
        <Badge
          variant="outline"
          className={`font-mono text-[10px] ${connected ? 'border-accent text-accent' : 'border-muted text-muted-foreground'}`}
        >
          {peer.connectionState}
        </Badge>
      </div>
      {!peer.stream && (
        <div className="absolute inset-0 grid place-items-center font-mono text-[10px] text-muted-foreground">
          waiting for media…
        </div>
      )}
    </div>
  )
}

export function CallStage({ roomId, localStream, onStateChange, sinkId, onClientReady }: CallStageProps) {
  const clientRef = useRef<CallClient | null>(null)
  const [state, setState] = useState<CallState>('idle')
  const [peers, setPeers] = useState<RemotePeer[]>([])
  const [error, setError] = useState<{ code: string; message: string } | null>(null)

  useEffect(() => {
    if (!roomId) return

    const client = new CallClient({
      roomId,
      localStream,
      // Survive a transient signaling drop: re-open the socket and re-join the same room
      // with capped exponential backoff rather than ending the call.
      reconnect: { enabled: true },
      events: {
        onStateChange: (next) => {
          setState(next)
          onStateChange?.(next)
        },
        onPeersChange: setPeers,
        onError: setError,
      },
    })
    clientRef.current = client
    onClientReady?.(client)

    // A join that never resolves still surfaces through onError/onStateChange.
    void client.join().catch(() => {})

    return () => {
      client.close()
      clientRef.current = null
      onClientReady?.(null)
    }
    // Re-joining on a localStream change would drop the call; tracks are attached at join.
  }, [roomId])

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Call stage</span>
          <Badge
            variant="outline"
            className={`font-mono text-[10px] ${
              state === 'joined' ? 'border-accent text-accent' : 'border-muted text-muted-foreground'
            }`}
          >
            {STATE_LABEL[state]}
          </Badge>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {peers.length} {peers.length === 1 ? 'peer' : 'peers'}
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-destructive">{error.code}</p>
          <p className="mt-1 text-xs text-destructive-foreground/90">{error.message}</p>
          {error.code === 'peer_connection_failed' && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-7 font-mono text-[10px]"
              onClick={() => setError(null)}
            >
              Dismiss
            </Button>
          )}
        </div>
      )}

      {peers.length === 0 ? (
        <p className="py-6 text-center font-mono text-[11px] text-muted-foreground">
          {state === 'joined'
            ? 'Nobody else has joined this room yet.'
            : 'Not connected to a room.'}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {peers.map((peer) => (
            <RemoteTile key={peer.participant.id} peer={peer} sinkId={sinkId} />
          ))}
        </div>
      )}
    </GlassCard>
  )
}
