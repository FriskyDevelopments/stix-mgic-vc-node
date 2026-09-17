import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CallStage } from '@/components/CallStage'
import type { OutputChange } from '@/hooks/use-studio-output'
import { GlassCard } from '@/components/GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  closeRoom,
  createRoom,
  getMediaPlaneStatus,
  getRoom,
  RoomsApiError,
  type MediaPlaneStatus,
  type RoomView,
} from '@/lib/rooms-api'
import { shareToTelegram } from '@/lib/telegram-webapp'
import { roomIdFromInput, roomInviteUrl } from '@/lib/room-invites'

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
  onLocalStreamChange?: (result: OutputChange) => void
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

export function RoomPanel({ localStream, onRoomChange, sinkId, onClientReady, onLocalStreamChange }: RoomPanelProps) {
  const [room, setRoom] = useState<RoomView | null>(null)
  const [joinId, setJoinId] = useState(() => new URLSearchParams(window.location.search).get('room') || '')
  const [busy, setBusy] = useState(false)
  const [media, setMedia] = useState<MediaPlaneStatus | null>(null)
  const [roomError, setRoomError] = useState<string | null>(null)

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
    if (joinId && !room) {
      void handleJoin()
      return
    }
    const action = new URLSearchParams(window.location.search).get('action')
    if (action === 'new-room') {
      void handleCreate()
      return
    }
    // The invite UUID is read once on mount; manual edits still use the Join button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate(): Promise<void> {
    setBusy(true)
    setRoomError(null)
    try {
      const { room: created } = await createRoom({ platform: 'web' })
      setRoom(created)
      setJoinId(created.id)
      window.history.replaceState(null, '', roomInviteUrl(created.id))
      toast.success('Room opened', { description: created.id })
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : 'Could not open a room')
      toast.error('Could not open a room', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin(): Promise<void> {
    setBusy(true)
    setRoomError(null)
    let id = ''
    try {
      id = roomIdFromInput(joinId)
      if (!id) return
      const { room: found } = await getRoom(id)
      setRoom(found)
      setJoinId(found.id)
      window.history.replaceState(null, '', roomInviteUrl(found.id))
    } catch (error) {
      const missing = error instanceof RoomsApiError && error.status === 404
      const message = missing
        ? 'This room link is invalid or the room has closed. Open a room or paste another invite.'
        : error instanceof Error ? error.message : 'Could not join that room'
      if (missing) {
        // Stop retrying a confirmed missing invitation on every refresh/sign-in. Keep
        // the field visible for correction; never silently create a different room.
        const current = new URL(window.location.href)
        if (current.searchParams.get('room')?.trim() === id) {
          current.searchParams.delete('room')
          current.searchParams.delete('action')
          window.history.replaceState(null, '', current.toString())
        }
      }
      setRoomError(message)
      toast.error('Could not join that room', {
        description: message,
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleLeave(): Promise<void> {
    const current = room
    setRoom(null) // Unmounting CallStage is what actually leaves the call.
    setJoinId('')
    setRoomError(null)
    window.history.replaceState(null, '', window.location.pathname)
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
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Call room</span>
          {webrtc && (
            <Badge variant="outline" className={`font-mono text-[10px] ${adapterTone(webrtc.state)}`}>
              {webrtc.state === 'ready' ? 'Ready for calls' : webrtc.state === 'degraded' ? 'Limited connection' : 'Calls unavailable'}
            </Badge>
          )}
        </div>

        {webrtc && webrtc.state !== 'ready' && (
          <p className="mb-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200/90">
            {webrtc.state === 'degraded' ? 'Some networks may have trouble connecting. Check your connection before starting a call.' : 'Calls are unavailable right now. Please try again shortly.'}
          </p>
        )}

        {room ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 font-mono text-[11px]">{room.id}</code>
            <Button
              variant="outline"
              size="sm"
              className="h-8 font-mono text-[10px]"
              onClick={async () => {
                try {
                  if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable')
                  await navigator.clipboard.writeText(roomInviteUrl(room.id))
                  toast.success('Invite link copied')
                } catch {
                  toast.error('Could not copy the invite', { description: 'Select the invite link below to copy it manually.' })
                }
              }}
            >
              Copy invite
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 font-mono text-[10px]"
              onClick={() => {
                const invite = roomInviteUrl(room.id)
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
              placeholder="Paste a room ID or invite link"
              aria-label="Room ID or invite link"
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
        {room && (
          <div className="mt-3 space-y-2">
            <label className="block text-xs text-muted-foreground" htmlFor="room-invite">Invite link</label>
            <Input id="room-invite" readOnly value={roomInviteUrl(room.id)} onFocus={(event) => event.currentTarget.select()} />
            <a className="block break-all text-xs text-accent underline" href={roomInviteUrl(room.id)}>Open room invite</a>
          </div>
        )}
        {roomError && <p role="alert" className="mt-3 text-sm text-destructive">{roomError}</p>}
      </GlassCard>

      {room && (
        <CallStage
          roomId={room.id}
          localStream={localStream}
          onLocalStreamChange={onLocalStreamChange}
          sinkId={sinkId}
          onClientReady={onClientReady}
        />
      )}
    </div>
  )
}
