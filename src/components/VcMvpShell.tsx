import { useEffect, useRef, useState } from 'react'
import { Camera, DotsThree, Microphone, MicrophoneSlash, MonitorArrowUp, SlidersHorizontal, VideoCamera, VideoCameraSlash, X } from '@phosphor-icons/react'
import type { CallClient } from '@/lib/webrtc-client'
// The node chooses the IdP at runtime (IDENTITY_PROVIDER). Supabase FriskyDev is the
// Fenrir master identity (auth.users.id) and the intended destination; Authentik remains
// the default until this origin is on the Supabase redirect allow-list.
import { IdentityGate } from '@/components/IdentityGate'
import { RoomPanel } from '@/components/RoomPanel'
import { CreatorTools } from '@/components/CreatorTools'
import { TelegramVcPanel } from '@/components/TelegramVcPanel'
import { NodeOperationsBoard } from '@/components/NodeOperationsBoard'
import '@/styles/vc-mvp.css'
import { initializeTelegramWebApp } from '@/lib/telegram-webapp'

export function VcMvpShell() {
  const [authenticated, setAuthenticated] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  // The node is a control room, not a landing page. Keep its working surfaces visible
  // by default so OBS, capture, scheduling, Telegram and health never become hidden UI.
  const [studioOpen, setStudioOpen] = useState(true)
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false)
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([])
  const [videoDeviceId, setVideoDeviceId] = useState('')
  const [audioDeviceId, setAudioDeviceId] = useState('')
  const [speakerDeviceId, setSpeakerDeviceId] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const callClientRef = useRef<CallClient | null>(null)
  const previewStream = screenStream || stream
  // setSinkId exists on Chromium; used to flag the speaker control as effective.
  const canRouteSpeaker = typeof document !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = previewStream }, [previewStream])
  useEffect(() => { initializeTelegramWebApp() }, [])
  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream])
  useEffect(() => () => screenStream?.getTracks().forEach((track) => track.stop()), [screenStream])
  useEffect(() => {
    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.enumerateDevices) return
    let active = true
    const refresh = async () => {
      const available = await mediaDevices.enumerateDevices()
      if (!active) return
      setVideoDevices(available.filter((device) => device.kind === 'videoinput'))
      setAudioDevices(available.filter((device) => device.kind === 'audioinput'))
      setSpeakerDevices(available.filter((device) => device.kind === 'audiooutput'))
    }
    void refresh()
    mediaDevices.addEventListener?.('devicechange', refresh)
    return () => {
      active = false
      mediaDevices.removeEventListener?.('devicechange', refresh)
    }
  }, [stream])

  async function enableMedia(nextVideoDeviceId = videoDeviceId, nextAudioDeviceId = audioDeviceId) {
    setError(null)
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: nextVideoDeviceId ? { deviceId: { exact: nextVideoDeviceId } } : true,
        audio: nextAudioDeviceId ? { deviceId: { exact: nextAudioDeviceId } } : true,
      })
      stream?.getTracks().forEach((track) => track.stop())
      setStream(next)
      setVideoDeviceId(next.getVideoTracks()[0]?.getSettings().deviceId || nextVideoDeviceId)
      setAudioDeviceId(next.getAudioTracks()[0]?.getSettings().deviceId || nextAudioDeviceId)
      setMicEnabled(true); setCameraEnabled(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Camera and microphone permission was not granted.') }
  }

  /**
   * Switch camera or microphone, live. Before a stream exists it just acquires one; during
   * a call it grabs only the one new track, hands it to every peer via replaceTrack (no
   * renegotiation, no dropped call), swaps it into the local stream in place, and stops the
   * old one. The mute state carries over so switching never silently un-mutes.
   */
  async function switchDevice(kind: 'video' | 'audio', deviceId: string) {
    if (kind === 'video') setVideoDeviceId(deviceId)
    else setAudioDeviceId(deviceId)

    if (!stream) {
      await enableMedia(kind === 'video' ? deviceId : videoDeviceId, kind === 'audio' ? deviceId : audioDeviceId)
      return
    }

    setError(null)
    try {
      const constraints: MediaStreamConstraints =
        kind === 'video'
          ? { video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false }
          : { audio: deviceId ? { deviceId: { exact: deviceId } } : true, video: false }
      const fresh = await navigator.mediaDevices.getUserMedia(constraints)
      const nextTrack = kind === 'video' ? fresh.getVideoTracks()[0] : fresh.getAudioTracks()[0]
      if (!nextTrack) return

      nextTrack.enabled = kind === 'video' ? cameraEnabled : micEnabled
      await callClientRef.current?.replaceLocalTrack(nextTrack)

      const previous = kind === 'video' ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0]
      if (previous) {
        stream.removeTrack(previous)
        previous.stop()
      }
      stream.addTrack(nextTrack)
      if (videoRef.current) videoRef.current.srcObject = stream

      const settledId = nextTrack.getSettings().deviceId || deviceId
      if (kind === 'video') setVideoDeviceId(settledId)
      else setAudioDeviceId(settledId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not switch the selected device.')
    }
  }

  function selectSpeaker(deviceId: string) {
    setSpeakerDeviceId(deviceId)
  }

  function toggleMic() {
    const enabled = !micEnabled
    stream?.getAudioTracks().forEach((track) => { track.enabled = enabled }); setMicEnabled(enabled)
  }
  function toggleCamera() {
    const enabled = !cameraEnabled
    stream?.getVideoTracks().forEach((track) => { track.enabled = enabled }); setCameraEnabled(enabled)
  }
  async function toggleScreen() {
    if (screenStream) { screenStream.getTracks().forEach((track) => track.stop()); setScreenStream(null); return }
    try {
      const next = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      next.getVideoTracks()[0]?.addEventListener('ended', () => setScreenStream(null), { once: true }); setScreenStream(next)
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'NotAllowedError') return
      setError(cause instanceof Error ? cause.message : 'Screen sharing could not start.')
    }
  }

  return (
    <main className="vc-shell"><div className="vc-ambient" aria-hidden="true" /><div className="vc-app">
      <header className="vc-header">
        <a className="vc-brand" href="/" aria-label="VC Node home"><img className="vc-mark" src="/vc-node-icon.png?v=2" alt="" /><span><strong>VC NODE</strong><small>FRISKY DEVELOPMENTS</small></span></a>
        <div className="vc-header-right"><span className="vc-live"><i /> NODE ONLINE</span><button className="vc-studio-trigger" onClick={() => setStudioOpen((open) => !open)}><SlidersHorizontal size={17} /> {studioOpen ? 'Hide controls' : 'Control room'}</button></div>
      </header>
      <section className="vc-identity"><IdentityGate onChange={setAuthenticated} /></section>
      <section className="vc-stage" aria-label="Local video preview">
        <video ref={videoRef} autoPlay muted playsInline />
        {!previewStream && <div className="vc-stage-empty"><div className="vc-camera-orbit"><Camera size={32} weight="light" /></div><p>Ready when you are</p><span>Camera and microphone stay on this device until you join a room.</span><button className="vc-primary" onClick={() => void enableMedia()}>Start camera</button></div>}
        <div className="vc-stage-top"><span className="vc-preview-label"><i /> {screenStream ? 'SCREEN' : 'YOU'}</span><button className="vc-more" aria-label="Camera and microphone settings" aria-expanded={deviceMenuOpen} onClick={() => setDeviceMenuOpen((open) => !open)}><DotsThree size={22} weight="bold" /></button></div>
        {deviceMenuOpen && <div className="vc-device-menu">
          <div><span>CAMERA</span><select aria-label="Camera" value={videoDeviceId} disabled={!stream} onChange={(event) => void switchDevice('video', event.target.value)}><option value="">System default</option>{videoDevices.map((device, index) => <option key={device.deviceId || `camera-${index}`} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></div>
          <div><span>MICROPHONE</span><select aria-label="Microphone" value={audioDeviceId} disabled={!stream} onChange={(event) => void switchDevice('audio', event.target.value)}><option value="">System default</option>{audioDevices.map((device, index) => <option key={device.deviceId || `microphone-${index}`} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></div>
          {canRouteSpeaker && <div><span>SPEAKER</span><select aria-label="Speaker" value={speakerDeviceId} onChange={(event) => selectSpeaker(event.target.value)}><option value="">System default</option>{speakerDevices.map((device, index) => <option key={device.deviceId || `speaker-${index}`} value={device.deviceId}>{device.label || `Speaker ${index + 1}`}</option>)}</select></div>}
          {!stream && <p>Start the camera once to reveal device names.</p>}
          {stream && roomId && <p>Camera, mic and speaker switch live — the call stays connected.</p>}
        </div>}
        <div className="vc-control-dock">
          <button className={!micEnabled ? 'is-off' : ''} disabled={!stream} onClick={toggleMic} aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}>{micEnabled ? <Microphone size={21} /> : <MicrophoneSlash size={21} />}</button>
          <button className={!cameraEnabled ? 'is-off' : ''} disabled={!stream} onClick={toggleCamera} aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}>{cameraEnabled ? <VideoCamera size={21} /> : <VideoCameraSlash size={21} />}</button>
          <button className={screenStream ? 'is-active' : ''} onClick={() => void toggleScreen()} aria-label="Share screen"><MonitorArrowUp size={21} /></button>
        </div>
      </section>
      {error && <div className="vc-error">{error}<button onClick={() => setError(null)}><X size={14} /></button></div>}
      <section className="vc-room-area">
        <div className="vc-room-heading"><div><span>YOUR ROOM</span><h1>{roomId ? 'The room is open.' : 'Start a private room.'}</h1></div><p>{roomId ? 'Invite someone with the secure link below.' : authenticated ? 'Create a room, then share one link anywhere.' : 'Sign in with FriskyDev ID to continue.'}</p></div>
        {authenticated && stream ? (
          <RoomPanel
            localStream={previewStream}
            onRoomChange={setRoomId}
            sinkId={speakerDeviceId}
            onClientReady={(client) => { callClientRef.current = client }}
          />
        ) : (
          <div className="vc-locked">
            {authenticated
              ? 'Start your camera and microphone before opening or joining a room.'
              : 'Your room controls will appear here after sign-in.'}
          </div>
        )}
      </section>
      {studioOpen && <aside className="vc-studio-drawer"><div className="vc-drawer-head"><div><span>CREATOR STUDIO</span><h2>Broadcast tools</h2></div><button onClick={() => setStudioOpen(false)} aria-label="Close studio"><X size={19} /></button></div><div className="vc-studio-intro"><div><span>LIVE SIGNAL CONSOLE</span><h3>One scene.<br />Every signal.</h3></div><div className="vc-signal-orb" aria-hidden="true"><i /><i /><i /></div><div className="vc-studio-rail"><span>OBS</span><span>SCREEN</span><span>CLIPSFLOW</span><span>RTMP</span><span>SPOTIFY</span><span>TELEGRAM</span></div></div><NodeOperationsBoard /><CreatorTools cameraStream={stream} screenStream={screenStream} onScreenStream={setScreenStream} roomId={roomId} /><div className="mt-4"><TelegramVcPanel accessGranted={authenticated} /></div></aside>}
      <footer className="vc-footer"><span>Encrypted peer-to-peer media</span><span>vc.friskydev.com</span></footer>
    </div></main>
  )
}
