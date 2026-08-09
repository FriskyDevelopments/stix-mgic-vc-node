import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Broadcast,
  Check,
  Copy,
  LinkSimple,
  Microphone,
  MicrophoneSlash,
  PhoneDisconnect,
  ShieldCheck,
  Sparkle,
  VideoCamera,
  VideoCameraSlash,
  Warning,
  Waveform,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  closeRoom,
  createRoom,
  getMediaPlaneStatus,
  getRoom,
  type MediaAdapterStatus,
  type MediaPlaneStatus,
  type RoomView,
} from '@/lib/rooms-api'
import type { CallState } from '@/lib/webrtc-client'
import './mvp.css'

const CallStage = lazy(async () => ({
  default: (await import('@/components/CallStage')).CallStage,
}))

type DeviceState = 'idle' | 'requesting' | 'ready' | 'audio-only' | 'blocked'

const CALL_COPY: Record<CallState, { label: string; detail: string }> = {
  idle: { label: 'Standby', detail: 'Open or join a room to begin.' },
  connecting: { label: 'Connecting', detail: 'Negotiating a direct WebRTC path.' },
  joined: { label: 'Live', detail: 'This browser is inside the room.' },
  closed: { label: 'Ended', detail: 'The connection has closed.' },
  error: { label: 'Recovery', detail: 'The call needs attention.' },
}

function adapterLabel(adapter: MediaAdapterStatus): string {
  if (adapter.id === 'webrtc') return 'Browser rooms'
  if (adapter.id === 'telegram-vc') return 'Telegram VC'
  if (adapter.id === 'discord-voice') return 'Discord voice'
  return 'RTMP'
}

function AdapterPill({ adapter }: { adapter: MediaAdapterStatus }) {
  return (
    <div className={`mvp-adapter mvp-adapter--${adapter.state}`} title={adapter.reason}>
      <span className="mvp-adapter__dot" />
      <span>{adapterLabel(adapter)}</span>
      <strong>{adapter.state.replace('_', ' ')}</strong>
    </div>
  )
}

function SignalCore({ state, roomId }: { state: CallState; roomId?: string }) {
  const copy = CALL_COPY[state]
  return (
    <div className={`signal-core signal-core--${state}`} aria-live="polite">
      <div className="signal-core__orbit signal-core__orbit--outer" />
      <div className="signal-core__orbit signal-core__orbit--inner" />
      <div className="signal-core__body">
        <Waveform size={34} weight="bold" aria-hidden="true" />
        <span>{copy.label}</span>
      </div>
      <p>{roomId ? `room ${roomId.slice(0, 8)}` : copy.detail}</p>
    </div>
  )
}

function App() {
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const [mediaStatus, setMediaStatus] = useState<MediaPlaneStatus | null>(null)
  const [deviceState, setDeviceState] = useState<DeviceState>('idle')
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [room, setRoom] = useState<RoomView | null>(null)
  const [joinId, setJoinId] = useState(() => new URLSearchParams(window.location.search).get('room') || '')
  const [callState, setCallState] = useState<CallState>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)

  const webrtc = mediaStatus?.adapters.find((adapter) => adapter.id === 'webrtc')
  const roomLink = useMemo(() => {
    if (!room) return ''
    const url = new URL(window.location.href)
    url.searchParams.set('room', room.id)
    return url.toString()
  }, [room])

  useEffect(() => {
    let cancelled = false
    void getMediaPlaneStatus()
      .then((status) => {
        if (!cancelled) setMediaStatus(status)
      })
      .catch(() => {
        if (!cancelled) setError('The VC node is not reachable. Start the API, then reload this page.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream
  }, [localStream])

  useEffect(() => {
    return () => localStream?.getTracks().forEach((track) => track.stop())
  }, [localStream])

  async function enableDevices(): Promise<void> {
    setDeviceState('requesting')
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      setLocalStream(stream)
      setDeviceState('ready')
      setCameraEnabled(true)
      setMicEnabled(true)
    } catch {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        })
        setLocalStream(audioStream)
        setDeviceState('audio-only')
        setCameraEnabled(false)
        setMicEnabled(true)
      } catch {
        setDeviceState('blocked')
        setError('Camera and microphone are blocked. Allow access in the browser, then try again.')
      }
    }
  }

  function toggleTrack(kind: 'audio' | 'video'): void {
    const tracks = kind === 'audio' ? localStream?.getAudioTracks() : localStream?.getVideoTracks()
    if (!tracks?.length) return
    const enabled = !tracks[0].enabled
    tracks.forEach((track) => {
      track.enabled = enabled
    })
    if (kind === 'audio') setMicEnabled(enabled)
    else setCameraEnabled(enabled)
  }

  async function openRoom(): Promise<void> {
    if (!localStream) {
      setError('Enable your microphone before opening a room.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await createRoom({ name: 'STIX live room', platform: 'web', maxParticipants: 4 })
      setRoom(result.room)
      setCallState('connecting')
      const url = new URL(window.location.href)
      url.searchParams.set('room', result.room.id)
      window.history.replaceState({}, '', url)
      toast.success('Room open', { description: 'Share the invite link when your status turns Live.' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The room could not be opened.')
    } finally {
      setBusy(false)
    }
  }

  async function joinRoom(): Promise<void> {
    const id = joinId.trim()
    if (!id) return
    if (!localStream) {
      setError('Enable your microphone before joining a room.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await getRoom(id)
      setRoom(result.room)
      setCallState('connecting')
      const url = new URL(window.location.href)
      url.searchParams.set('room', result.room.id)
      window.history.replaceState({}, '', url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That room could not be joined.')
    } finally {
      setBusy(false)
    }
  }

  async function leaveRoom(): Promise<void> {
    const current = room
    setRoom(null)
    setCallState('closed')
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    window.history.replaceState({}, '', url)
    if (!current) return
    try {
      await closeRoom(current.id)
    } catch {
      // Guests are expected to be unable to close a room they do not own.
    }
  }

  async function copyInvite(): Promise<void> {
    if (!roomLink) return
    await navigator.clipboard.writeText(roomLink)
    toast.success('Invite link copied')
  }

  const deviceReady = deviceState === 'ready' || deviceState === 'audio-only'

  return (
    <main className="mvp-shell">
      <div className="mvp-noise" aria-hidden="true" />
      <header className="mvp-header">
        <a className="mvp-wordmark" href="/" aria-label="STIX MAGIC VC Node home">
          STIX M<span>Λ</span>GIC <small>VC NODE</small>
        </a>
        <div className="mvp-node-state">
          <span className={mediaStatus ? 'is-online' : ''} />
          {mediaStatus ? 'node online' : 'checking node'}
        </div>
      </header>

      <section className="mvp-hero">
        <div className="mvp-hero__copy">
          <div className="mvp-eyebrow"><Sparkle size={14} weight="fill" /> live room operator</div>
          <h1>Open the room.<br /><em>See it go live.</em></h1>
          <p>One honest path from device check to a working call. No simulated signal, no mystery state.</p>
        </div>
        <SignalCore state={room ? callState : 'idle'} roomId={room?.id} />
      </section>

      <section className="mvp-adapters" aria-label="Media adapter availability">
        {mediaStatus?.adapters.map((adapter) => <AdapterPill key={adapter.id} adapter={adapter} />)}
        {!mediaStatus && <span className="mvp-loading">Reading media plane…</span>}
      </section>

      {webrtc?.state === 'degraded' && (
        <div className="mvp-notice">
          <Warning size={18} weight="fill" />
          <div><strong>Direct connections only.</strong><span>{webrtc.reason}</span></div>
        </div>
      )}

      {error && (
        <div className="mvp-error" role="alert">
          <Warning size={18} weight="fill" />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <section className="mvp-flow">
        <article className={`mvp-step ${deviceReady ? 'is-complete' : 'is-active'}`}>
          <div className="mvp-step__index">01</div>
          <div className="mvp-step__heading">
            <div><h2>Check your signal</h2><p>Give the room a real microphone and camera.</p></div>
            {deviceReady && <Check size={18} weight="bold" />}
          </div>

          <div className="mvp-preview">
            {localStream?.getVideoTracks().length ? (
              <video ref={localVideoRef} autoPlay muted playsInline />
            ) : (
              <div className="mvp-preview__empty">
                {deviceState === 'audio-only' ? <Microphone size={30} /> : <VideoCamera size={30} />}
                <span>{deviceState === 'audio-only' ? 'Audio only' : 'Preview appears here'}</span>
              </div>
            )}
            {deviceReady && (
              <div className="mvp-preview__controls">
                <button type="button" onClick={() => toggleTrack('audio')} aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}>
                  {micEnabled ? <Microphone size={18} /> : <MicrophoneSlash size={18} />}
                </button>
                <button type="button" onClick={() => toggleTrack('video')} disabled={!localStream?.getVideoTracks().length} aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}>
                  {cameraEnabled ? <VideoCamera size={18} /> : <VideoCameraSlash size={18} />}
                </button>
              </div>
            )}
          </div>

          {!deviceReady && (
            <Button className="mvp-primary" onClick={() => void enableDevices()} disabled={deviceState === 'requesting'}>
              {deviceState === 'requesting' ? 'Requesting access…' : 'Enable camera & mic'}
              <ArrowRight size={17} weight="bold" />
            </Button>
          )}
        </article>

        <article className={`mvp-step ${deviceReady && !room ? 'is-active' : room ? 'is-complete' : ''}`}>
          <div className="mvp-step__index">02</div>
          <div className="mvp-step__heading">
            <div><h2>Choose the room</h2><p>Open a new room or enter an invite.</p></div>
            {room && <Check size={18} weight="bold" />}
          </div>

          {!room ? (
            <div className="mvp-room-actions">
              <Button className="mvp-primary" disabled={!deviceReady || busy} onClick={() => void openRoom()}>
                <Broadcast size={17} weight="fill" />
                {busy ? 'Opening…' : 'Open a room'}
              </Button>
              <div className="mvp-or"><span>or join</span></div>
              <div className="mvp-join">
                <Input value={joinId} onChange={(event) => setJoinId(event.target.value)} onKeyDown={(event) => {
                  if (event.key === 'Enter') void joinRoom()
                }} placeholder="Paste room id" aria-label="Room id" />
                <Button variant="outline" disabled={!deviceReady || busy || !joinId.trim()} onClick={() => void joinRoom()}>Join</Button>
              </div>
            </div>
          ) : (
            <div className="mvp-invite">
              <div><LinkSimple size={20} /><span>Invite ready</span><code>{room.id}</code></div>
              <Button variant="outline" onClick={() => void copyInvite()}><Copy size={16} /> Copy link</Button>
            </div>
          )}
        </article>

        <article className={`mvp-step mvp-step--stage ${room ? 'is-active' : ''}`}>
          <div className="mvp-step__index">03</div>
          <div className="mvp-step__heading">
            <div><h2>Run the call</h2><p>The stage reports what is actually connected.</p></div>
            {callState === 'joined' && <ShieldCheck size={20} weight="fill" />}
          </div>

          {room ? (
            <>
              <Suspense fallback={<div className="mvp-stage-empty">Loading call engine…</div>}>
                <CallStage roomId={room.id} localStream={localStream} onStateChange={setCallState} />
              </Suspense>
              <Button variant="destructive" className="mvp-leave" onClick={() => void leaveRoom()}>
                <PhoneDisconnect size={17} weight="fill" /> Leave room
              </Button>
            </>
          ) : (
            <div className="mvp-stage-empty"><Waveform size={28} /><span>The live stage unlocks after step 02.</span></div>
          )}
        </article>
      </section>

      <footer className="mvp-footer">
        <span>STIX MAGIC / VC NODE MVP</span>
        <span>WebRTC · measured state · max 4 seats</span>
      </footer>
    </main>
  )
}

export default App
