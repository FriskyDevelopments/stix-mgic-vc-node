import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GlassCard } from '@/components/GlassCard'
import {
  clearSpotifySession,
  getSpotifyPlayback,
  getSpotifyUser,
  initiateSpotifyAuth,
  isSpotifyConfigured,
  spotifyNext,
  spotifyPause,
  spotifyPlay,
  spotifyPrevious,
  spotifySetVolume,
  type SpotifyPlaybackState,
} from '@/lib/spotify'
import { ObsWebSocketClient, type ObsState } from '@/lib/obs-websocket'
import { scheduleRoomAt } from '@/lib/rooms-api'
import { shareToTelegram } from '@/lib/telegram-webapp'

type Props = {
  cameraStream: MediaStream | null
  screenStream: MediaStream | null
  onScreenStream: (stream: MediaStream | null) => void
  roomId: string | null
}

const OBS_INITIAL: ObsState = { connected: false, streaming: false, recording: false, virtualCamera: false, inputMuted: false, scene: '', scenes: [] }

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function calendarStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function CreatorTools({ cameraStream, screenStream, onScreenStream, roomId }: Props) {
  const [spotifyToken, setSpotifyToken] = useState<string | null>(null)
  const [spotifyUser, setSpotifyUser] = useState('')
  const [playback, setPlayback] = useState<SpotifyPlaybackState | null>(null)
  const [spotifyBusy, setSpotifyBusy] = useState(false)
  const [obs, setObs] = useState<ObsState>(OBS_INITIAL)
  const [obsUrl, setObsUrl] = useState(() => localStorage.getItem('vc_obs_url') || 'ws://127.0.0.1:4455')
  const [obsPassword, setObsPassword] = useState('')
  const [obsInput, setObsInput] = useState(() => localStorage.getItem('vc_obs_input') || 'Mic/Aux')
  const [recording, setRecording] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const obsClient = useMemo(() => new ObsWebSocketClient(setObs), [])

  useEffect(() => () => obsClient.disconnect(), [obsClient])

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'spotify-auth') return
      const token = String(event.data.accessToken || '')
      if (!token) return
      setSpotifyToken(token)
      void getSpotifyUser(token).then((user) => setSpotifyUser(user?.display_name || user?.id || 'Spotify'))
      void refreshSpotify(token)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [refreshSpotify])

  useEffect(() => {
    if (!spotifyToken) return
    const timer = window.setInterval(() => void refreshSpotify(spotifyToken), 5000)
    return () => window.clearInterval(timer)
  }, [spotifyToken, refreshSpotify])

  const refreshSpotify = useCallback(async (token = spotifyToken) => {
    if (!token) return
    try { setPlayback(await getSpotifyPlayback(token)) } catch (error) { toast.error('Spotify playback unavailable', { description: error instanceof Error ? error.message : '' }) }
  }, [spotifyToken])

  async function spotifyAction(action: (token: string) => Promise<void>) {
    if (!spotifyToken) return
    setSpotifyBusy(true)
    try { await action(spotifyToken); await refreshSpotify() } catch (error) { toast.error('Spotify control failed', { description: error instanceof Error ? error.message : '' }) } finally { setSpotifyBusy(false) }
  }

  async function shareScreen() {
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop())
      onScreenStream(null)
      return
    }
    try {
      const next = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      next.getVideoTracks()[0]?.addEventListener('ended', () => onScreenStream(null), { once: true })
      onScreenStream(next)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') return
      toast.error('Screen sharing failed', { description: error instanceof Error ? error.message : '' })
    }
  }

  function startRecording() {
    const source = screenStream || cameraStream
    if (!source) { toast.error('Enable a camera or screen first'); return }
    const mimeType = ['video/mp4;codecs=h264,aac', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(MediaRecorder.isTypeSupported)
    const recorder = new MediaRecorder(source, mimeType ? { mimeType } : undefined)
    chunksRef.current = []
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
      const extension = recorder.mimeType.includes('mp4') ? 'mp4' : 'webm'
      downloadBlob(blob, `vc-node-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`)
      setRecording(false)
    }
    recorder.start(1000)
    recorderRef.current = recorder
    setRecording(true)
  }

  function stopRecording() { recorderRef.current?.stop() }

  async function scheduleInvite(kind: 'ics' | 'google') {
    if (!roomId) { toast.error('Open a room first'); return }
    const start = scheduleAt ? new Date(scheduleAt) : new Date(Date.now() + 60 * 60 * 1000)
    if (Number.isNaN(start.getTime())) { toast.error('Choose a valid date'); return }
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    try {
      await scheduleRoomAt(roomId, start.getTime())
    } catch (error) {
      toast.error('Could not schedule this room', { description: error instanceof Error ? error.message : '' })
      return
    }
    const invite = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`
    const title = 'VC Node room'
    if (kind === 'google') {
      const query = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${calendarStamp(start)}/${calendarStamp(end)}`, details: `Join: ${invite}`, location: invite })
      window.open(`https://calendar.google.com/calendar/render?${query}`, '_blank', 'noopener,noreferrer')
      return
    }
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FriskyDev//VC Node//EN', 'BEGIN:VEVENT', `UID:${roomId}@vc.friskydev.com`, `DTSTAMP:${calendarStamp(new Date())}`, `DTSTART:${calendarStamp(start)}`, `DTEND:${calendarStamp(end)}`, `SUMMARY:${title}`, `DESCRIPTION:Join ${invite}`, `URL:${invite}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    downloadBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), `vc-node-${roomId}.ics`)
  }

  return (
    <section className="creator-tools grid gap-4 md:grid-cols-2">
      <GlassCard className="p-5">
        <div className="flex items-center justify-between"><h2 className="font-mono text-sm text-cyan-300">SPOTIFY</h2><span className="text-[10px] text-white/40">metadata + remote control</span></div>
        {!spotifyToken ? <Button className="mt-4" disabled={!isSpotifyConfigured()} onClick={() => void initiateSpotifyAuth()}>Connect Spotify</Button> : (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-white/50">{spotifyUser}</p>
            <div className="flex gap-3"><div className="h-14 w-14 overflow-hidden rounded bg-white/5">{playback?.item?.album.images[0]?.url && <img src={playback.item.album.images[0].url} className="h-full w-full object-cover" />}</div><div><p className="text-sm font-medium">{playback?.item?.name || 'No active playback'}</p><p className="text-xs text-white/50">{playback?.item?.artists.map((artist) => artist.name).join(', ')}</p><p className="text-[10px] text-white/35">{playback?.device?.name}</p></div></div>
            <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={spotifyBusy} onClick={() => void spotifyAction(spotifyPrevious)}>Previous</Button><Button size="sm" disabled={spotifyBusy} onClick={() => void spotifyAction(playback?.is_playing ? spotifyPause : spotifyPlay)}>{playback?.is_playing ? 'Pause' : 'Play'}</Button><Button size="sm" variant="outline" disabled={spotifyBusy} onClick={() => void spotifyAction(spotifyNext)}>Next</Button><Button size="sm" variant="ghost" onClick={() => { clearSpotifySession(); setSpotifyToken(null); setPlayback(null) }}>Disconnect</Button></div>
            <label className="block text-[10px] text-white/45">Volume <input className="mt-1 w-full accent-cyan-400" type="range" min="0" max="100" defaultValue={playback?.device?.volume_percent ?? 50} onChange={(event) => void spotifyAction((token) => spotifySetVolume(token, Number(event.target.value)))} /></label>
          </div>
        )}
        {!isSpotifyConfigured() && <p className="mt-3 text-xs text-amber-300/80">Spotify Client ID is not configured on this deployment.</p>}
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex items-center justify-between"><h2 className="font-mono text-sm text-cyan-300">OBS</h2><span className="text-[10px] text-white/40">WebSocket 5.x</span></div>
        {!obs.connected ? <div className="mt-4 space-y-2"><Input value={obsUrl} onChange={(e) => setObsUrl(e.target.value)} placeholder="ws://127.0.0.1:4455" /><Input value={obsPassword} onChange={(e) => setObsPassword(e.target.value)} type="password" placeholder="OBS WebSocket password" /><Button onClick={() => { localStorage.setItem('vc_obs_url', obsUrl); void obsClient.connect(obsUrl, obsPassword).catch((error) => toast.error('OBS connection failed', { description: error.message })) }}>Connect OBS</Button></div> : (
          <div className="mt-4 space-y-3"><select className="h-9 w-full rounded border border-white/15 bg-black px-3 text-sm" value={obs.scene} onChange={(e) => void obsClient.setScene(e.target.value)}>{obs.scenes.map((scene) => <option key={scene}>{scene}</option>)}</select><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void obsClient.toggleVirtualCamera()}>{obs.virtualCamera ? 'Stop camera' : 'Virtual camera'}</Button><Button size="sm" variant="outline" onClick={() => void obsClient.toggleRecord()}>{obs.recording ? 'Stop OBS recording' : 'Record in OBS'}</Button><Button size="sm" className={obs.streaming ? 'bg-red-600 hover:bg-red-500' : ''} onClick={() => void obsClient.toggleStream()}>{obs.streaming ? 'Stop Live' : 'Go Live'}</Button></div><div className="flex gap-2"><Input value={obsInput} onChange={(e) => setObsInput(e.target.value)} placeholder="Mic/Aux input name" /><Button size="sm" variant="outline" onClick={() => { localStorage.setItem('vc_obs_input', obsInput); void obsClient.toggleMute(obsInput) }}>{obs.inputMuted ? 'Unmute' : 'Mute'}</Button></div><Button size="sm" variant="ghost" onClick={() => obsClient.disconnect()}>Disconnect</Button></div>
        )}
      </GlassCard>

      <GlassCard className="p-5"><h2 className="font-mono text-sm text-cyan-300">CAPTURE + RECORD</h2><p className="mt-2 text-xs text-white/50">Choose a screen/window and optionally include system audio. Files stay on this device.</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => void shareScreen()}>{screenStream ? 'Stop sharing' : 'Share screen + audio'}</Button><Button disabled={!cameraStream && !screenStream} onClick={recording ? stopRecording : startRecording}>{recording ? 'Stop & download' : 'Record locally'}</Button></div><p className="mt-3 text-[10px] text-white/35">Uses MP4 when the browser exposes a native H.264/AAC recorder; otherwise it downloads WebM. Nothing is uploaded.</p></GlassCard>

      <GlassCard className="p-5"><h2 className="font-mono text-sm text-cyan-300">INVITE + CALENDAR</h2><p className="mt-2 text-xs text-white/50">Create the room once, then send the same secure invite through Telegram or a calendar event.</p><Input className="mt-4" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} /><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" disabled={!roomId} onClick={() => void scheduleInvite('google')}>Google Calendar</Button><Button variant="outline" disabled={!roomId} onClick={() => void scheduleInvite('ics')}>Download .ics</Button>{roomId && <Button onClick={() => { const invite = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`; shareToTelegram(invite, 'Join my scheduled VC Node room') }}>Send to Telegram</Button>}</div></GlassCard>
    </section>
  )
}
