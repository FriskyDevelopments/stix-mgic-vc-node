import { useEffect, useId, useRef, useState } from 'react'
import { Camera, CheckCircle, Microphone, ShieldCheck } from '@phosphor-icons/react'
import { usePersistedState } from '@/hooks/use-persisted-state'
import '@/styles/camera-setup-wizard.css'

export type CameraSetupSelection = {
  videoDeviceId: string
  audioDeviceId: string
  /** Ownership transfers to the parent only after the user confirms the final step. */
  stream: MediaStream
}

type Props = {
  initialVideoDeviceId?: string
  initialAudioDeviceId?: string
  /** Set only when the parent opened setup from an explicit user action. */
  autoStart?: boolean
  onComplete: (selection: CameraSetupSelection) => void
  onCancel?: () => void
}

function mediaError(cause: unknown): string {
  const name = cause && typeof cause === 'object' && 'name' in cause ? cause.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera or microphone access was blocked. Allow both in your browser’s site settings, then try again.'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'A camera or microphone was not found. Connect both devices, then try again.'
  if (name === 'OverconstrainedError') return 'The selected device is no longer available. Choose another device or System default, then try again.'
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'The device could not start. Close other apps using it, check its connection, then try again.'
  return 'Your camera and microphone could not start. Check browser permissions and device connections, then try again.'
}

/** A local rehearsal. Capture starts only after the user chooses device setup. */
export function CameraSetupWizard({ initialVideoDeviceId = '', initialAudioDeviceId = '', autoStart = false, onComplete, onCancel }: Props) {
  const id = useId()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [videoDeviceId, setVideoDeviceId] = useState(initialVideoDeviceId)
  const [audioDeviceId, setAudioDeviceId] = useState(initialAudioDeviceId)
  const [preview, setPreview] = useState<MediaStream | null>(null)
  const [previewFit, setPreviewFit] = usePersistedState<'cover' | 'contain'>('camera-preview-fit', 'cover')
  const [tested, setTested] = useState<{ video: string; audio: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cameraChecked, setCameraChecked] = useState(false)
  const [micChecked, setMicChecked] = useState(false)
  const [level, setLevel] = useState(0)
  const [meterAvailable, setMeterAvailable] = useState(false)
  const [heardAudio, setHeardAudio] = useState(false)
  const previewRef = useRef<HTMLVideoElement | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const ownedStream = useRef<MediaStream | null>(null)
  const stopMeterRef = useRef<(() => void) | null>(null)
  const generation = useRef(0)
  const mounted = useRef(true)
  const videoSelectionExplicit = useRef(false)
  const audioSelectionExplicit = useRef(false)
  const cameras = devices.filter((device) => device.kind === 'videoinput' && device.deviceId)
  const microphones = devices.filter((device) => device.kind === 'audioinput' && device.deviceId)
  const selectionTested = Boolean(preview && tested?.video === videoDeviceId && tested?.audio === audioDeviceId)
  const hasMicrophone = Boolean(preview?.getAudioTracks().length)

  function stopOwnedPreview() {
    stopMeterRef.current?.()
    stopMeterRef.current = null
    ownedStream.current?.getTracks().forEach((track) => track.stop())
    ownedStream.current = null
  }

  useEffect(() => {
    mounted.current = true
    const mediaDevices = navigator.mediaDevices
    let active = true
    const refresh = async () => {
      try {
        const available = await mediaDevices?.enumerateDevices?.()
        if (active && available) setDevices(available)
      } catch { /* Labels may be unavailable until the user grants access. */ }
    }
    void refresh()
    mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => {
      active = false
      mounted.current = false
      generation.current += 1
      mediaDevices?.removeEventListener?.('devicechange', refresh)
      stopOwnedPreview()
    }
  }, [])

  useEffect(() => {
    if (!autoStart) return
    // Defer one microtask so React's setup/cleanup rehearsal cancels the first
    // launch rather than requesting media twice. No capture happens on page load.
    let active = true
    void Promise.resolve().then(() => { if (active) void startPreview() })
    return () => { active = false }
    // autoStart is an entry action; device changes are tested by their own button.
     
  }, [autoStart])

  useEffect(() => {
    if (previewRef.current) previewRef.current.srcObject = preview
    if (!preview) return
    const ended = () => {
      if (ownedStream.current !== preview) return
      generation.current += 1
      stopOwnedPreview()
      setPreview(null)
      setTested(null)
      setCameraChecked(false)
      setMicChecked(false)
      setStep(0)
      setError('A device disconnected or stopped. Reconnect it, select your devices, then start setup again.')
    }
    preview.getTracks().forEach((track) => track.addEventListener('ended', ended))
    return () => preview.getTracks().forEach((track) => track.removeEventListener('ended', ended))
  }, [preview, step])

  useEffect(() => { if (step > 0) headingRef.current?.focus({ preventScroll: true }) }, [step])

  async function startPreview() {
    const request = ++generation.current
    setBusy(true)
    setError(null)
    setNotice(null)
    setCameraChecked(false)
    setMicChecked(false)
    setHeardAudio(false)
    setMeterAvailable(false)
    setLevel(0)
    stopOwnedPreview()
    setPreview(null)
    setTested(null)
    let context: AudioContext | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let analyser: AnalyserNode | null = null
    let frame = 0
    const stopMeter = () => {
      cancelAnimationFrame(frame)
      source?.disconnect()
      analyser?.disconnect()
      if (context && context.state !== 'closed') void context.close().catch(() => {})
    }
    stopMeterRef.current = stopMeter
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera setup needs a browser with camera access over HTTPS. Open this page in a supported browser.')
        return
      }
      // Create/resume inside the user gesture, including browsers with strict audio policies.
      try {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AudioContextClass) {
          context = new AudioContextClass()
          void context.resume().catch(() => {})
        }
      } catch { context = null }

      // Remembered IDs are preferences: browsers can rotate them after a
      // permission reset. Choices made in this setup must still be exact.
      const videoConstraint = videoDeviceId ? { deviceId: videoSelectionExplicit.current ? { exact: videoDeviceId } : { ideal: videoDeviceId } } : true
      const audioConstraint = audioDeviceId ? { deviceId: audioSelectionExplicit.current ? { exact: audioDeviceId } : { ideal: audioDeviceId } } : true
      let next: MediaStream
      try {
        next = await navigator.mediaDevices.getUserMedia({ video: videoConstraint, audio: audioConstraint })
      } catch (cause) {
        const name = cause && typeof cause === 'object' && 'name' in cause ? cause.name : ''
        if (name !== 'NotFoundError' && name !== 'DevicesNotFoundError') throw cause
        if (!mounted.current || request !== generation.current) return
        // A missing microphone rejects the combined request even when a camera
        // exists. Keep that camera usable, with explicit camera-only confirmation.
        next = await navigator.mediaDevices.getUserMedia({ video: videoConstraint, audio: false })
      }
      if (!mounted.current || request !== generation.current) {
        next.getTracks().forEach((track) => track.stop())
        stopMeter()
        return
      }
      ownedStream.current = next
      if (!next.getVideoTracks().length) {
        throw new DOMException('Camera is required', 'NotFoundError')
      }
      const video = next.getVideoTracks()[0].getSettings().deviceId || videoDeviceId
      const audio = next.getAudioTracks()[0]?.getSettings().deviceId || ''
      if (!next.getAudioTracks().length) setNotice('Your camera is ready. No microphone was found. Connect one and test again, or confirm camera-only setup below.')
      else if ((videoDeviceId && video !== videoDeviceId) || (audioDeviceId && audio !== audioDeviceId)) setNotice('A saved device is no longer available. Your current camera and microphone are selected below.')
      setVideoDeviceId(video)
      setAudioDeviceId(audio)
      setTested({ video, audio })
      setPreview(next)
      setStep(1)
      try {
        const available = await navigator.mediaDevices.enumerateDevices()
        if (mounted.current && request === generation.current) setDevices(available)
      } catch { /* Preview can still work when device enumeration is restricted. */ }
      if (!mounted.current || request !== generation.current) return
      if (context && next.getAudioTracks().length) {
        try {
          source = context.createMediaStreamSource(next)
          analyser = context.createAnalyser()
          analyser.fftSize = 256
          source.connect(analyser) // Deliberately never connect microphone audio to speakers.
          const samples = new Uint8Array(analyser.fftSize)
          const sample = () => {
            if (!mounted.current || request !== generation.current || !analyser || !context) return
            analyser.getByteTimeDomainData(samples)
            const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length)
            const value = Math.min(100, Math.round(rms * 300))
            setMeterAvailable(context.state === 'running')
            setLevel(value)
            if (value >= 3) setHeardAudio(true)
            frame = requestAnimationFrame(sample)
          }
          sample()
        } catch { setMeterAvailable(false) }
      }
    } catch (cause) {
      if (mounted.current && request === generation.current) {
        stopOwnedPreview()
        setPreview(null)
        setTested(null)
        setStep(0)
        setError(mediaError(cause))
      } else stopMeter()
    } finally {
      if (mounted.current && request === generation.current) setBusy(false)
    }
  }

  function cancel() {
    generation.current += 1
    stopOwnedPreview()
    setPreview(null)
    setTested(null)
    setBusy(false)
    setStep(0)
    setError(null)
    setNotice(null)
    onCancel?.()
  }

  function finish() {
    const stream = ownedStream.current
    if (!stream || !selectionTested || !cameraChecked || !micChecked) return
    // Only the parent now owns the confirmed tracks. Unmount must not stop its stream.
    stopMeterRef.current?.()
    stopMeterRef.current = null
    ownedStream.current = null
    onComplete({ videoDeviceId, audioDeviceId, stream })
  }

  const cameraLabel = cameras.find((device) => device.deviceId === videoDeviceId)?.label || preview?.getVideoTracks()[0]?.label || 'Selected camera'
  const microphoneLabel = !hasMicrophone ? 'No microphone — camera only' : microphones.find((device) => device.deviceId === audioDeviceId)?.label || preview?.getAudioTracks()[0]?.label || 'Selected microphone'

  return (
    <section className="camera-setup" aria-labelledby={`${id}-title`}>
      <header className="camera-setup__header"><div><p className="camera-setup__eyebrow">BEFORE YOU JOIN</p><h2 id={`${id}-title`}>Camera & microphone setup</h2></div><Camera size={28} weight="light" aria-hidden="true" /></header>
      <ol className="camera-setup__steps" aria-label="Setup progress">
        {['Choose devices', 'Check your preview', 'Ready to join'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} data-complete={step > index}><span>{step > index ? '✓' : index + 1}</span>{label}</li>)}
      </ol>
      <div className="camera-setup__body">
        <h3 ref={headingRef} tabIndex={-1}>{step === 0 ? 'Your best angle. Your own voice.' : step === 1 ? 'Make sure you look and sound right.' : 'You’re set.'}</h3>
        {step === 0 && <p>Allow access to find your cameras and microphones and open a private preview.</p>}
        {step < 2 && <div className="camera-setup__devices">
          <label htmlFor={`${id}-camera`}><span><Camera size={16} />Camera</span><select id={`${id}-camera`} value={videoDeviceId} disabled={busy} onChange={(event) => { videoSelectionExplicit.current = true; setVideoDeviceId(event.target.value); setCameraChecked(false); setMicChecked(false) }}><option value="">System default</option>{videoDeviceId && !cameras.some((device) => device.deviceId === videoDeviceId) && <option value={videoDeviceId}>Previously selected camera</option>}{cameras.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>
          <label htmlFor={`${id}-microphone`}><span><Microphone size={16} />Microphone</span><select id={`${id}-microphone`} value={audioDeviceId} disabled={busy} onChange={(event) => { audioSelectionExplicit.current = true; setAudioDeviceId(event.target.value); setCameraChecked(false); setMicChecked(false) }}><option value="">System default</option>{audioDeviceId && !microphones.some((device) => device.deviceId === audioDeviceId) && <option value={audioDeviceId}>Previously selected microphone</option>}{microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label>
        </div>}
        {step === 0 && <p className="camera-setup__hint">{busy ? 'Waiting for browser access. Allow the camera and microphone permission prompt to reveal your devices.' : !cameras.length ? 'Your browser has not revealed any cameras yet. Allow access to find devices; this does not mean no camera is connected.' : 'OBS Virtual Camera appears here when it is running.'}</p>}
        {step === 1 && <div className="camera-setup__test">
          <div className="camera-setup__preview"><video ref={previewRef} autoPlay playsInline muted style={{ objectFit: previewFit }} aria-label="Your local camera preview" /><span>LOCAL PREVIEW</span><div className="camera-setup__framing" role="group" aria-label="Camera framing"><button type="button" aria-pressed={previewFit === 'contain'} onClick={() => setPreviewFit('contain')}>Fit camera</button><button type="button" aria-pressed={previewFit === 'cover'} onClick={() => setPreviewFit('cover')}>Fill frame</button></div></div>
          <div className="camera-setup__checks"><div className="camera-setup__meter-head"><Microphone size={18} /><strong>Say a few words</strong></div><meter min={0} max={100} value={level} aria-label="Microphone input level" /><p role="status">{!hasMicrophone ? 'No microphone connected. Your camera can still be used.' : !meterAvailable ? 'Live audio levels are unavailable in this browser. Check your microphone in the room before speaking.' : heardAudio ? 'Your microphone is picking up sound.' : 'Waiting for sound. Speak normally and watch the level move.'}</p><label className="camera-setup__check"><input type="checkbox" checked={cameraChecked} disabled={!selectionTested} onChange={(event) => setCameraChecked(event.target.checked)} />I can see myself clearly.</label><label className="camera-setup__check"><input type="checkbox" checked={micChecked} disabled={!selectionTested} onChange={(event) => setMicChecked(event.target.checked)} />{!hasMicrophone ? 'Continue with my camera only, without a microphone.' : meterAvailable ? 'I checked my microphone level.' : 'I’ll check my microphone in the room.'}</label></div>
        </div>}
        {step === 1 && !selectionTested && <p className="camera-setup__notice">Your selection changed. Test these devices before continuing.</p>}
        {step === 2 && <div className="camera-setup__ready"><CheckCircle size={42} weight="light" aria-hidden="true" /><div><p><strong>Camera</strong>{cameraLabel}</p><p><strong>Microphone</strong>{microphoneLabel}</p><span>Your devices are ready. You decide when to join a room.</span></div></div>}
        {notice && <p className="camera-setup__notice" role="status">{notice}</p>}
        {error && <p className="camera-setup__error" role="alert">{error}</p>}
        <div className="camera-setup__actions">
          <button type="button" className="camera-setup__secondary" onClick={cancel}>Cancel setup</button>
          {step === 0 && <button type="button" className="camera-setup__primary" disabled={busy} onClick={() => void startPreview()}>{busy ? 'Opening devices…' : error ? 'Try again' : 'Allow access & find devices'}</button>}
          {step === 1 && (!selectionTested || busy) && <button type="button" className="camera-setup__primary" disabled={busy} onClick={() => void startPreview()}>{busy ? 'Opening devices…' : 'Test selected devices'}</button>}
          {step === 1 && selectionTested && !busy && <button type="button" className="camera-setup__secondary" onClick={() => void startPreview()}>Test devices again</button>}
          {step === 1 && selectionTested && !busy && <button type="button" className="camera-setup__primary" disabled={!cameraChecked || !micChecked} onClick={() => setStep(2)}>Continue</button>}
          {step === 2 && <><button type="button" className="camera-setup__secondary" onClick={() => setStep(1)}>Back to preview</button><button type="button" className="camera-setup__primary" onClick={finish}>Use these devices</button></>}
        </div>
      </div>
      <footer className="camera-setup__privacy"><ShieldCheck size={16} aria-hidden="true" />This setup does not join a room or send your preview to anyone.</footer>
    </section>
  )
}
