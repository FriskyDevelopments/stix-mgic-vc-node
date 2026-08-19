import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CallStage } from '@/components/CallStage'
import { GlassCard } from '@/components/GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  closeRoom,
  createRoom,
  getMediaPlaneStatus,
  getRoom,
  type MediaPlaneStatus,
  type RoomView,
} from '@/lib/rooms-api'
import { shareToTelegram } from '@/lib/telegram-webapp'

/**
 * RoomPanel — open a room, or join one someone sent you, and see who is on the call.
 *
 * The media-plane banner is the honest part. The node reports per adapter whether it can
 * carry a session, and an operator who is about to run a live session needs to read
 * "WebRTC degraded: no TURN relay" BEFORE the call rather than discover it as a peer that
 * never connects.
 */

export type RoomPanelProps = {
  /** The operator's own camera/microphone, already acquired by the preview. */
  localStream: MediaStream | null
  onRoomChange?: (roomId: string | null) => void
  /** Selected speaker deviceId, routed down to the remote tiles. */
  sinkId?: string
  /** Surfaces the live CallClient so the shell can switch devices mid-call. */
  onClientReady?: (client: import('@/lib/webrtc-client').CallClient | null) => void
}

function adapterTone(state: MediaPlaneStatus['adapters'][number]['state']): string {
  switch (state) {
    case 'ready':
      return 'border-accent text-accent'
    case 'degraded':
      return 'border-yellow-500/60 text-yellow-500'
    default:
      return 'border-muted text-muted-foreground'
  }
}

export function RoomPanel({ localStream, onRoomChange, sinkId, onClientReady }: RoomPanelProps) {
  const [room, setRoom] = useState<RoomView | null>(null)
  const [joinId, setJoinId] = useState(() => new URLSearchParams(window.location.search).get('room') || '')
  const [busy, setBusy] = useState(false)
  const [media, setMedia] = useState<MediaPlaneStatus | null>(null)

  useEffect(() => { onRoomChange?.(room?.id || null) }, [room?.id, onRoomChange])

  useEffect(() => {
    let cancelled = false
    getMediaPlaneStatus()
      .then((status) => {
        if (!cancelled) setMedia(status)
      })
      .catch(() => {
        // The banner is advisory; a control plane that cannot be reached shows elsewhere.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const action = new URLSearchParams(window.location.search).get('action')
    if (action === 'new-room') {
      void handleCreate()
      return
    }
    if (joinId && !room) void handleJoin()
    // The invite UUID is read once on mount; manual edits still use the Join button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate(): Promise<void> {
    setBusy(true)
    try {
      const { room: created } = await createRoom({ platform: 'web' })
      setRoom(created)
      toast.success('Room opened', { description: created.id })
    } catch (error) {
      toast.error('Could not open a room', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin(): Promise<void> {
    const id = joinId.trim()
    if (!id) return
    setBusy(true)
    try {
      const { room: found } = await getRoom(id)
      setRoom(found)
    } catch (error) {
      toast.error('Could not join that room', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleLeave(): Promise<void> {
    const current = room
    setRoom(null) // Unmounting CallStage is what actually leaves the call.
    if (!current) return
    try {
      await closeRoom(current.id)
    } catch {
      // Closing is the owner's privilege; a guest simply leaves and the room stands.
    }
  }

  const webrtc = media?.adapters.find((adapter) => adapter.id === 'webrtc')

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Room</span>
          {webrtc && (
            <Badge variant="outline" className={`font-mono text-[10px] ${adapterTone(webrtc.state)}`}>
              webrtc: {webrtc.state}
            </Badge>
          )}
        </div>

        {webrtc && webrtc.state !== 'ready' && (
          <p className="mb-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200/90">
            {webrtc.reason}
          </p>
        )}

        {room ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 font-mono text-[11px]">{room.id}</code>
            <Button
              variant="outline"
              size="sm"
              className="h-8 font-mono text-[10px]"
              onClick={() => {
                const invite = `${window.location.origin}/?room=${encodeURIComponent(room.id)}`
                void navigator.clipboard?.writeText(invite)
                toast.success('Invite link copied')
              }}
            >
              Copy invite
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 font-mono text-[10px]"
              onClick={() => {
                const invite = `${window.location.origin}/?room=${encodeURIComponent(room.id)}`
                shareToTelegram(invite, 'Join my VC Node room')
              }}
            >
              Send by Telegram
            </Button>
            <Button variant="destructive" size="sm" className="h-8 font-mono text-[10px]" onClick={() => void handleLeave()}>
              Leave
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-8 font-mono text-[10px]" disabled={busy} onClick={() => void handleCreate()}>
              Open a room
            </Button>
            <Input
              value={joinId}
              onChange={(event) => setJoinId(event.target.value)}
              placeholder="or paste a room id"
              className="h-8 max-w-xs font-mono text-[11px]"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 font-mono text-[10px]"
              disabled={busy || !joinId.trim()}
              onClick={() => void handleJoin()}
            >
              Join
            </Button>
          </div>
        )}
      </GlassCard>

      {room && (
        <CallStage
          roomId={room.id}
          localStream={localStream}
          sinkId={sinkId}
          onClientReady={onClientReady}
        />
      )}
    </div>
  )
}
