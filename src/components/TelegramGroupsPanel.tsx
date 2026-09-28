import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { GlassCard } from '@/components/GlassCard'
import { Button } from '@/components/ui/button'
import { TelegramBroadcastTools } from '@/components/TelegramBroadcastTools'
import {
  beginTelegramLink, getTelegramLinkStatus, getTelegramGroups, getParticipants,
  getCameraPolicy, setCameraPolicy, muteParticipant,
  type TelegramVcGroup, type TelegramVcParticipantsResponse, type CameraPolicy,
} from '@/lib/telegram-vc-api'

export function TelegramGroupsPanel({ accessGranted = true }: { accessGranted?: boolean }) {
  const [linked, setLinked] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [groups, setGroups] = useState<TelegramVcGroup[]>([])
  const [bot, setBot] = useState('')
  const [partial, setPartial] = useState(false)
  const [chatId, setChatId] = useState('')
  const [snapshot, setSnapshot] = useState<TelegramVcParticipantsResponse | null>(null)
  const [policy, setPolicy] = useState<CameraPolicy | null>(null)
  const [grace, setGrace] = useState<0 | 30 | 60>(60)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [callError, setCallError] = useState('')
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const selection = useRef('')
  const policyVersion = useRef(0)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  function selectGroup(id: string) {
    policyVersion.current++
    selection.current = id
    setChatId(id)
    setSnapshot(null)
    setPolicy(null)
    setCallError('')
    setBroadcastOpen(false)
  }

  async function loadGroups() {
    setLoading(true)
    setError('')
    try {
      const link = await getTelegramLinkStatus()
      if (!mounted.current) return
      setLinked(link.linked)
      if (!link.linked) { setGroups([]); selectGroup(''); return }
      const result = await getTelegramGroups()
      if (!mounted.current) return
      setGroups(result.groups)
      setBot(result.botUsername)
      setPartial(result.discoveryPartial)
      if (selection.current && !result.groups.some(group => group.id === selection.current)) selectGroup('')
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Could not load your groups.')
    } finally { if (mounted.current) setLoading(false) }
  }

  useEffect(() => { if (accessGranted) void loadGroups() }, [accessGranted])  

  useEffect(() => {
    if (!accessGranted || !linked || !chatId) return
    let cancelled = false
    let running = false
    const refresh = async () => {
      if (running) return
      running = true
      const version = policyVersion.current
      try {
        const [next, rule] = await Promise.all([getParticipants(chatId), getCameraPolicy(chatId)])
        if (cancelled || version !== policyVersion.current) return
        setSnapshot(next)
        setPolicy(rule)
        if (rule.enabled) setGrace(rule.graceSeconds)
        setCallError('')
      } catch (failure) {
        if (!cancelled && version === policyVersion.current) {
          setSnapshot(null)
          setCallError(failure instanceof Error ? failure.message : 'Could not check this call. Please try again.')
        }
      } finally { running = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [accessGranted, linked, chatId])

  async function connect() {
    setBusy(true)
    setError('')
    try {
      const result = await beginTelegramLink()
      setLinkUrl(result.url)
      setBot(result.botUsername)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not connect Telegram.') }
    finally { setBusy(false) }
  }

  async function changeRule(enabled: boolean) {
    const selected = chatId
    policyVersion.current++
    setBusy(true)
    setCallError('')
    try {
      const result = await setCameraPolicy(selected, enabled, grace, snapshot?.callId)
      policyVersion.current++
      if (selection.current === selected) setPolicy(result)
      toast.success(enabled ? 'Camera rule enabled for this call' : 'Camera rule turned off')
    } catch (failure) { if (selection.current === selected) setCallError(failure instanceof Error ? failure.message : 'Could not update the camera rule.') }
    finally { policyVersion.current++; setBusy(false) }
  }

  async function mute(id: string) {
    if (!snapshot) return
    const selected = chatId
    setBusy(true)
    try {
      await muteParticipant(selected, id, snapshot.callId)
      const next = await getParticipants(selected)
      if (selection.current === selected) setSnapshot(next)
      toast.success('Microphone muted')
    } catch (failure) { if (selection.current === selected) setCallError(failure instanceof Error ? failure.message : 'Could not mute this microphone.') }
    finally { setBusy(false) }
  }

  if (!accessGranted) return <GlassCard className="p-5" data-testid="telegram-access-preview"><h2 className="font-medium">My groups</h2><p className="mt-2 text-sm text-muted-foreground">Sign in to choose a Telegram group and manage its calls.</p></GlassCard>

  const group = groups.find(item => item.id === chatId)
  const canModerate = Boolean(snapshot?.complete && snapshot.canManageCalls && group?.botCanManageCalls && group.botCanSendMessages && group.userCanManageCalls)
  return <div className="space-y-4">
    <GlassCard className="p-5">
      <div className="flex items-center justify-between gap-3"><h2 className="font-medium">My groups</h2><Button size="sm" variant="outline" disabled={loading || busy} onClick={() => void loadGroups()}>{loading ? 'Checking groups…' : 'Refresh groups'}</Button></div>
      <p className="mt-2 text-sm text-muted-foreground">Choose a Telegram group where you and {bot ? `@${bot}` : 'the bot'} are administrators.</p>
      {!linked && <div className="mt-4 space-y-3"><p className="text-sm">Connect your Telegram account so we can check which groups you manage.</p><Button disabled={busy || loading} onClick={() => void connect()}>Connect Telegram</Button>{linkUrl && <div className="space-y-2"><a href={linkUrl} target="_blank" rel="noopener noreferrer" className="block text-accent underline">Open Telegram and tap Start</a><p className="text-xs text-muted-foreground">Keep this link private. Then return here and refresh your groups. The link expires in a few minutes.</p></div>}</div>}
      {linked && <div className="mt-4 space-y-3">
        <label className="block text-sm" htmlFor="my-telegram-group">Telegram group</label>
        <select id="my-telegram-group" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={chatId} disabled={loading || busy} onChange={event => selectGroup(event.target.value)}><option value="">Choose a group</option>{groups.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
        {!loading && groups.length === 0 && <p className="text-sm text-muted-foreground">No shared admin groups found yet. Add the bot as an administrator, then refresh.</p>}
        <p className="text-xs text-muted-foreground">{partial ? 'Some groups could not be checked. ' : ''}Missing a group? Send /vc to the bot in that group, then refresh here.</p>
      </div>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </GlassCard>
    {group && <>
      <GlassCard className="p-5">
        <h3 className="font-medium">{group.title}</h3>
        <div className="mt-2 flex flex-wrap gap-2 text-xs"><span>{group.botCanSendMessages ? 'Messages allowed' : 'Messaging permission needed'}</span><span>·</span><span>{group.botCanManageCalls ? 'Call management allowed' : 'Call management permission needed'}</span></div>
        {!group.userCanManageCalls && <p className="mt-2 text-sm text-muted-foreground">Your Telegram account needs permission to manage calls before you can use moderation.</p>}
        <div className="mt-5 space-y-3">
          <h4 className="font-medium">Camera required</h4>
          <p className="text-sm text-muted-foreground">The bot warns people whose camera is off, then mutes their microphone after the time below. Admins are exempt. Turning a camera on cancels the warning; muted people are not automatically unmuted.</p>
          <label htmlFor="camera-grace" className="block text-sm">Time after the warning</label>
          <select id="camera-grace" className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={grace} disabled={busy || policy?.enabled} onChange={event => setGrace(Number(event.target.value) as 0 | 30 | 60)}><option value={60}>60 seconds</option><option value={30}>30 seconds</option><option value={0}>Mute immediately after the warning</option></select>
          <div><Button disabled={busy || (!policy?.enabled && !canModerate)} onClick={() => void changeRule(!policy?.enabled)}>{policy?.enabled ? 'Turn off camera rule' : 'Enable for this call'}</Button></div>
          <p role="status" className="text-xs text-muted-foreground">{policy?.enabled ? policy.status === 'paused' ? 'Camera rule paused while Telegram is checked.' : 'Camera rule is on for this call, even if you close this page.' : 'Camera rule is off. Start a group call in Telegram, then enable it here.'}</p>
          {policy?.error && <p className="text-sm text-muted-foreground">{policy.error}</p>}
        </div>
        {callError && <p role="alert" className="mt-3 text-sm text-destructive">{callError}</p>}
      </GlassCard>
      <GlassCard className="p-5"><h3 className="font-medium">People in the call</h3>
        {!snapshot ? <p className="mt-3 text-sm text-muted-foreground">Waiting for the call in this group.</p> : !snapshot.complete ? <p className="mt-3 text-sm text-muted-foreground">Telegram has not returned the full participant list. Automatic moderation is paused.</p> : snapshot.participants.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No one is in the call yet.</p> : <div className="mt-3 space-y-2">{snapshot.participants.map(person => <div key={person.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3"><div><p className="text-sm">{person.name}{person.isAdmin ? ' · Admin' : ''}</p><p className="text-xs text-muted-foreground">{person.cameraOn === true ? 'Camera on' : person.cameraOn === false ? 'Camera off' : 'Camera status unavailable'} · {person.muted ? 'Microphone muted' : 'Microphone available'}</p></div>{!person.isSelf && !person.isAdmin && !person.muted && <Button variant="outline" size="sm" disabled={busy || !canModerate} onClick={() => void mute(person.id)}>Mute microphone</Button>}</div>)}</div>}
      </GlassCard>
      <details className="rounded-lg border border-border p-4" onToggle={event => setBroadcastOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm">Broadcast settings</summary>{broadcastOpen && <div className="mt-4"><TelegramBroadcastTools groupId={chatId} /></div>}</details>
    </>}
  </div>
}
