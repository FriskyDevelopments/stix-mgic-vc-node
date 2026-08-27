import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { GlassCard } from '@/components/GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getStatus,
  getPairStatus,
  sendPairCode,
  confirmPairCode,
  joinCall,
  leaveCall,
  switchSource,
  getParticipants,
  getTelegramGroups,
  muteParticipant,
  getRtmpPublishConfig,
  type TelegramVcStatus,
  type TelegramVcParticipant,
  type TelegramVcGroup,
  type TelegramPairStatus,
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

export function TelegramVcPanel({ accessGranted = true }: { accessGranted?: boolean }) {
  const [status, setStatus] = useState<TelegramVcStatus | null>(null)
  const [participants, setParticipants] = useState<TelegramVcParticipant[]>([])
  const [chatId, setChatId] = useState('')
  const [groups, setGroups] = useState<TelegramVcGroup[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [joinSource, setJoinSource] = useState('')
  const [sourceKind, setSourceKind] = useState<'screen' | 'clipsflow' | 'rtmp'>('screen')
  const [busy, setBusy] = useState(false)
  const [sourcePath, setSourcePath] = useState('')
  const [rtmpUrl, setRtmpUrl] = useState('')
  const [rtmpPublishUrl, setRtmpPublishUrl] = useState('')
  const [relayRoomId, setRelayRoomId] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const [pairing, setPairing] = useState<TelegramPairStatus | null>(null)
  const [pairPhone, setPairPhone] = useState('')
  const [pairCode, setPairCode] = useState('')
  const [pairPassword, setPairPassword] = useState('')

  // Telegram VC adapter — polls /v1/telegram-vc/status; if the server returns 503
  // (which it always does until a real MTProto user session is wired), show
  // "not configured" and render no functional Join/Leave/Source buttons.
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
    } catch (err: unknown) {
      const e = err as { status?: number }
      if (e?.status === 503 || e?.status === 404) {
        setUnavailable(true)
        try { setPairing(await getPairStatus()) } catch { /* operator session is required */ }
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
      const result = await joinCall(chatId.trim(), joinSource.trim())
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

  async function loadGroups() {
    setGroupsLoading(true)
    try {
      const result = await getTelegramGroups()
      setGroups(result.groups)
      if (result.groups.length === 0) toast('No eligible Telegram groups found for this operator account.')
    } catch (err) {
      toast.error('Could not load Telegram groups', { description: err instanceof Error ? err.message : 'Unknown error' })
    } finally { setGroupsLoading(false) }
  }

  async function applyVcNodeRtmp() {
    setBusy(true)
    try {
      const config = await getRtmpPublishConfig()
      setRtmpPublishUrl(config.publishUrl)
      setRtmpUrl(config.publishUrl)
      setJoinSource(config.publishUrl)
      setSourceKind('rtmp')
      toast.success('VC Node RTMP endpoint ready', { description: 'Paste it in OBS or join it directly to Telegram VC.' })
    } catch (err) {
      toast.error('RTMP endpoint unavailable', { description: err instanceof Error ? err.message : 'Unknown error' })
    } finally { setBusy(false) }
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

  async function handleSendPairCode() {
    setBusy(true)
    try {
      await sendPairCode(pairPhone)
      setPairing(await getPairStatus())
      toast.success('Telegram code sent')
    } catch (err) {
      toast.error('Could not send code', { description: err instanceof Error ? err.message : 'Unknown error' })
    } finally { setBusy(false) }
  }

  async function handleConfirmPairCode() {
    setBusy(true)
    try {
      await confirmPairCode(pairCode, pairPassword || undefined)
      setPairCode('')
      setPairPassword('')
      setPairing(await getPairStatus())
      toast.success('Telegram operator verified')
    } catch (err) {
      toast.error('Verification failed', { description: err instanceof Error ? err.message : 'Unknown error' })
    } finally { setBusy(false) }
  }

  if (!accessGranted) {
    return (
      <GlassCard className="p-5" data-testid="telegram-access-preview">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-sm text-cyan-300">TELEGRAM VC</p>
            <p className="mt-2 max-w-lg text-xs leading-relaxed text-white/55">
              Pair the dedicated Telegram operator, select a group call, then route OBS, screen,
              ClipsFlow or RTMP into it. Sign in above to unlock this broadcast lane.
            </p>
          </div>
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 font-mono text-[9px] tracking-[.16em] text-cyan-200">OPERATOR ACCESS</span>
        </div>
      </GlassCard>
    )
  }

  if (unavailable) {
    return (
      <GlassCard className="p-4">
<div className="flex items-start gap-3">
            <span className="rounded-full border border-accent/40 px-2 py-1 font-mono text-[10px] text-accent">STEP 2</span>
            <div>
              <p className="text-sm font-medium text-foreground">Pair the VC operator</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Your Telegram identity is signed in. Pair the dedicated operator account here;
                its encrypted session stays on this node and never enters the browser.
              </p>
            </div>
          </div>
        {pairing?.available && !pairing.verified && (
          <div className="mt-4 space-y-2">
            {!pairing.awaitingCode ? (
              <div className="flex gap-2">
                <Input value={pairPhone} onChange={(e) => setPairPhone(e.target.value)} inputMode="tel" placeholder="Dedicated Telegram phone (+country…)" />
                <Button size="sm" disabled={busy || !pairPhone.trim()} onClick={() => void handleSendPairCode()}>
                  Send code
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                <Input value={pairCode} onChange={(e) => setPairCode(e.target.value)} inputMode="numeric" placeholder="Telegram code" />
                <Button size="sm" disabled={busy || !pairCode} onClick={() => void handleConfirmPairCode()}>
                  Verify
                </Button>
                </div>
                <Input value={pairPassword} onChange={(e) => setPairPassword(e.target.value)} type="password" autoComplete="one-time-code" placeholder="Two-step password (only if enabled)" />
              </div>
            )}
          </div>
        )}
        {pairing?.verified && <p className="mt-3 text-xs text-emerald-400">Telegram operator paired securely on this node.</p>}
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
              Step 3 · Select group & join VC
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
            <Button variant="outline" size="sm" className="h-8 font-mono text-[10px]" disabled={busy || groupsLoading} onClick={() => void loadGroups()}>
              {groupsLoading ? 'Loading groups…' : 'Choose group'}
            </Button>
            {groups.length > 0 && <select aria-label="Telegram group" value={chatId} onChange={(event) => setChatId(event.target.value)} className="h-8 max-w-[240px] rounded border border-white/15 bg-black px-2 font-mono text-[11px]"><option value="">Select a Telegram group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}</select>}
            <Input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="Chat ID (e.g. 3446305734)"
              className="h-8 max-w-[200px] font-mono text-[11px]"
            />
            <select
              aria-label="Broadcast source"
              value={sourceKind}
              onChange={(event) => setSourceKind(event.target.value as 'screen' | 'clipsflow' | 'rtmp')}
              className="h-8 rounded border border-white/15 bg-black px-2 font-mono text-[11px]"
            >
              <option value="screen">Screen / OBS</option>
              <option value="clipsflow">ClipsFlow</option>
              <option value="rtmp">RTMP / IR stream</option>
            </select>
            <Input
              value={joinSource}
              onChange={(event) => setJoinSource(event.target.value)}
              placeholder={sourceKind === 'screen' ? 'OBS / screen relay URL' : sourceKind === 'clipsflow' ? 'ClipsFlow media URL' : 'RTMP / IR stream URL'}
              className="h-8 max-w-[240px] font-mono text-[11px]"
            />
            {sourceKind === 'rtmp' && (
              <Button variant="outline" size="sm" className="h-8 font-mono text-[10px]" disabled={busy} onClick={() => void applyVcNodeRtmp()}>
                Use VC Node RTMP
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 font-mono text-[10px]"
              disabled={busy || !chatId.trim() || !joinSource.trim()}
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
            {rtmpPublishUrl && (
              <p className="break-all rounded border border-cyan-400/20 bg-cyan-400/5 px-2 py-1 font-mono text-[10px] text-cyan-200">
                VC Node ingest: {rtmpPublishUrl}
              </p>
            )}

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
