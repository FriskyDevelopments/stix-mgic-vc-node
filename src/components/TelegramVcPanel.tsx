import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { GlassCard } from '@/components/GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getStatus,
  joinCall,
  leaveCall,
  switchSource,
  getParticipants,
  muteParticipant,
  type TelegramVcStatus,
  type TelegramVcParticipant,
} from '@/lib/telegram-vc-api'

/**
 * TelegramVcPanel — operator control panel for the Telegram group call adapter.
 *
 * Shows: connection status, join/leave, media source picker, participant list with mute.
 * Polls status every 5s when active.
 */

function stateColor(state: TelegramVcStatus['call']['state']): string {
  switch (state) {
    case 'active': return 'border-green-500/60 text-green-400'
    case 'joining':
    case 'leaving': return 'border-yellow-500/60 text-yellow-500'
    case 'error': return 'border-red-500/60 text-red-400'
    default: return 'border-muted text-muted-foreground'
  }
}

export function TelegramVcPanel() {
  const [status, setStatus] = useState<TelegramVcStatus | null>(null)
  const [participants, setParticipants] = useState<TelegramVcParticipant[]>([])
  const [chatId, setChatId] = useState('')
  const [busy, setBusy] = useState(false)
  const [sourcePath, setSourcePath] = useState('')
  const [rtmpUrl, setRtmpUrl] = useState('')
  const [relayRoomId, setRelayRoomId] = useState('')
  const [unavailable, setUnavailable] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const s = await getStatus()
      setStatus(s)
      setUnavailable(false)
      if (s.call.state === 'active') {
        const p = await getParticipants()
        setParticipants(p.participants)
      } else {
        setParticipants([])
      }
    } catch (err: any) {
      if (err?.status === 503) {
        setUnavailable(true)
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    const interval = setInterval(() => void refresh(), 5000)
    return () => clearInterval(interval)
  }, [refresh])

  async function handleJoin() {
    if (!chatId.trim()) return
    setBusy(true)
    try {
      const result = await joinCall(chatId.trim())
      if (result.call.error) {
        toast.error('Join failed', { description: result.call.error })
      } else {
        toast.success('Joined group call')
      }
      await refresh()
    } catch (err) {
      toast.error('Join failed', { description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleLeave() {
    setBusy(true)
    try {
      await leaveCall()
      toast.success('Left group call')
      await refresh()
    } catch (err) {
      toast.error('Leave failed', { description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleSource(type: 'file' | 'rtmp' | 'webrtc-relay') {
    setBusy(true)
    try {
      let config: Record<string, string> = {}
      if (type === 'file') config = { path: sourcePath, loop: 'true' }
      else if (type === 'rtmp') config = { url: rtmpUrl }
      else if (type === 'webrtc-relay') config = { roomId: relayRoomId }

      const result = await switchSource(type, config)
      if (result.call.error) {
        toast.error('Source error', { description: result.call.error })
      } else {
        toast.success(`Source: ${type}`)
      }
      await refresh()
    } catch (err) {
      toast.error('Source switch failed', { description: err instanceof Error ? err.message : 'Unknown' })
    } finally {
      setBusy(false)
    }
  }

  async function handleMute(participantId: string, name: string) {
    try {
      await muteParticipant(participantId)
      toast.success(`Muted ${name || participantId}`)
      await refresh()
    } catch (err) {
      toast.error('Mute failed', { description: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  if (unavailable) {
    return (
      <GlassCard className="p-4">
        <p className="text-xs text-muted-foreground">
          Telegram VC adapter not configured. Set TELEGRAM_VC_* env vars.
        </p>
      </GlassCard>
    )
  }

  const call = status?.call
  const isActive = call?.state === 'active'

  return (
    <div className="space-y-3">
      {/* Header */}
      <GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Telegram VC
          </span>
          {call && (
            <Badge variant="outline" className={`font-mono text-[10px] ${stateColor(call.state)}`}>
              {call.state}
            </Badge>
          )}
        </div>

        {/* Client info */}
        {status?.client.connected && status.client.username && (
          <p className="mb-2 text-[11px] text-muted-foreground">
            Connected as <span className="text-foreground">@{status.client.username}</span>
          </p>
        )}

        {/* Error display */}
        {call?.error && (
          <p className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200/90">
            {call.error}
          </p>
        )}

        {/* Join / Leave */}
        {isActive ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 font-mono text-[11px]">
              chat: {call.chatId}
            </code>
            {call.activeSource && (
              <Badge variant="outline" className="font-mono text-[10px] border-accent text-accent">
                {call.activeSource}
              </Badge>
            )}
            <Button
              variant="destructive"
              size="sm"
              className="h-8 ml-auto font-mono text-[10px]"
              disabled={busy}
              onClick={() => void handleLeave()}
            >
              Leave
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="Chat ID (e.g. 3446305734)"
              className="h-8 max-w-[200px] font-mono text-[11px]"
            />
            <Button
              size="sm"
              className="h-8 font-mono text-[10px]"
              disabled={busy || !chatId.trim()}
              onClick={() => void handleJoin()}
            >
              Join VC
            </Button>
          </div>
        )}
      </GlassCard>

      {/* Media Source Selector */}
      {isActive && (
        <GlassCard className="p-4">
          <span className="mb-3 block font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Media Source
          </span>

          <div className="space-y-2">
            {/* File source */}
            <div className="flex items-center gap-2">
              <Input
                value={sourcePath}
                onChange={(e) => setSourcePath(e.target.value)}
                placeholder="/path/to/audio.mp3"
                className="h-8 font-mono text-[11px] flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 font-mono text-[10px]"
                disabled={busy || !sourcePath.trim()}
                onClick={() => void handleSource('file')}
              >
                File
              </Button>
            </div>

            {/* RTMP source */}
            <div className="flex items-center gap-2">
              <Input
                value={rtmpUrl}
                onChange={(e) => setRtmpUrl(e.target.value)}
                placeholder="rtmp://relay:1935/live/key"
                className="h-8 font-mono text-[11px] flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 font-mono text-[10px]"
                disabled={busy || !rtmpUrl.trim()}
                onClick={() => void handleSource('rtmp')}
              >
                RTMP
              </Button>
            </div>

            {/* WebRTC Relay */}
            <div className="flex items-center gap-2">
              <Input
                value={relayRoomId}
                onChange={(e) => setRelayRoomId(e.target.value)}
                placeholder="Room ID for relay"
                className="h-8 font-mono text-[11px] flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 font-mono text-[10px]"
                disabled={busy || !relayRoomId.trim()}
                onClick={() => void handleSource('webrtc-relay')}
              >
                Relay
              </Button>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Participants */}
      {isActive && (
        <GlassCard className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Participants ({participants.length})
            </span>
          </div>

          {participants.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No participants yet</p>
          ) : (
            <div className="space-y-1">
              {participants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-md border border-border/50 bg-muted/30 px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-sm">
                      {p.name || `User ${p.id}`}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {p.muted ? '🔇 muted' : '🔊 speaking'}
                    </span>
                  </div>
                  {!p.muted && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 font-mono text-[10px] text-red-400 border-red-500/40 hover:bg-red-500/10"
                      onClick={() => void handleMute(p.id, p.name)}
                    >
                      Mute
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}
    </div>
  )
}
