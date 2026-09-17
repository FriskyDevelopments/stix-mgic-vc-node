import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, Camera, Check, Clapperboard, Expand, Monitor, Play, Radio, VideoOff } from 'lucide-react'
import SpotlightCard from '@/components/react-bits/SpotlightCard'
import '@/styles/studio-monitor.css'

export type StudioSourceId = 'camera' | 'screen' | 'studio'
export type StudioSource = { id: StudioSourceId; label: string; stream: MediaStream | null }

export interface StudioMonitorProps {
  sources: StudioSource[]
  previewId: StudioSourceId
  onPreviewChange: (id: StudioSourceId) => void
  programId: StudioSourceId | null
  /** The confirmed stream snapshot, which can differ from the source's new stream. */
  programStream: MediaStream | null
  roomId: string | null
  pending: boolean
  error?: string | null
  onShare: () => void
  onClear: () => void
  onOpenCameraSetup?: () => void
  onOpenScreenControls?: () => void
  onOpenStudioControls?: () => void
}

type FrameState = 'empty' | 'audio-only' | 'loading' | 'ready' | 'waiting' | 'ended' | 'disabled' | 'error' | 'blocked'
const sourceIcons = { camera: Camera, screen: Monitor, studio: Clapperboard }
const stateText: Record<FrameState, string> = {
  empty: 'No video selected', 'audio-only': 'This source has audio only', loading: 'Loading the video',
  ready: 'Video ready', waiting: 'Waiting for video frames', ended: 'This video source has ended',
  disabled: 'Video is turned off', error: 'This video could not be displayed', blocked: 'Press Resume preview to display the video',
}

function hasLiveVideo(stream: MediaStream | null): boolean {
  return Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled))
}

type PaneProps = {
  name: string
  stream: MediaStream | null
  sourceLabel: string
  emptyTitle: string
  emptyDescription: string
  onReadyChange?: (ready: boolean) => void
}

function MonitorPane({ name, stream, sourceLabel, emptyTitle, emptyDescription, onReadyChange }: PaneProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<FrameState>('empty')
  const [dimensions, setDimensions] = useState('')
  const [fit, setFit] = useState<'contain' | 'cover'>('contain')
  const [fullscreenError, setFullscreenError] = useState('')
  const currentStream = useRef(stream)
  currentStream.current = stream

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let stopped = false
    let decodedFrame = false
    let waitingForFrame = false
    let mediaFailed = false
    const watchedTracks = new Set<MediaStreamTrack>()
    setDimensions('')
    setFullscreenError('')
    video.srcObject = stream
    const update = () => {
      if (stopped) return
      const tracks = stream?.getVideoTracks() || []
      const live = tracks.filter((track) => track.readyState === 'live')
      if (!stream) setState('empty')
      else if (!tracks.length) setState('audio-only')
      else if (!live.length) setState('ended')
      else if (!live.some((track) => track.enabled)) setState('disabled')
      else if (live.every((track) => track.muted)) setState('waiting')
      else if (mediaFailed) setState('error')
      else if (waitingForFrame) setState('waiting')
      else if (decodedFrame && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        setState('ready')
        setDimensions(`${video.videoWidth} × ${video.videoHeight}`)
      } else setState((current) => current === 'blocked' ? 'blocked' : 'loading')
    }
    const trackEvents = ['ended', 'mute', 'unmute'] as const
    const trackUpdate = () => {
      for (const track of watchedTracks) {
        if (stream?.getVideoTracks().includes(track)) continue
        trackEvents.forEach((event) => track.removeEventListener(event, update))
        watchedTracks.delete(track)
      }
      for (const track of stream?.getVideoTracks() || []) {
        if (watchedTracks.has(track)) continue
        trackEvents.forEach((event) => track.addEventListener(event, update))
        watchedTracks.add(track)
      }
      update()
    }
    const loaded = () => { decodedFrame = true; waitingForFrame = false; mediaFailed = false; update() }
    const waiting = () => { waitingForFrame = true; if (!stopped) setState('waiting') }
    const failed = () => { mediaFailed = true; if (!stopped) setState('error') }
    const readyEvents = ['loadeddata', 'canplay', 'playing', 'resize'] as const
    readyEvents.forEach((event) => video.addEventListener(event, loaded))
    video.addEventListener('waiting', waiting)
    video.addEventListener('stalled', waiting)
    video.addEventListener('error', failed)
    stream?.addEventListener('addtrack', trackUpdate)
    stream?.addEventListener('removetrack', trackUpdate)
    trackUpdate()
    // Track.enabled has no change event. Observe it without modifying its owner.
    const trackTimer = stream ? window.setInterval(update, 1_000) : undefined
    return () => {
      stopped = true
      window.clearInterval(trackTimer)
      readyEvents.forEach((event) => video.removeEventListener(event, loaded))
      video.removeEventListener('waiting', waiting)
      video.removeEventListener('stalled', waiting)
      video.removeEventListener('error', failed)
      stream?.removeEventListener('addtrack', trackUpdate)
      stream?.removeEventListener('removetrack', trackUpdate)
      for (const track of watchedTracks) trackEvents.forEach((event) => track.removeEventListener(event, update))
      // This component observes streams owned by the source controls. Never stop them.
      if (video.srcObject === stream) video.srcObject = null
    }
  }, [stream])

  useEffect(() => { onReadyChange?.(state === 'ready') }, [state, onReadyChange])

  async function resume() {
    const video = videoRef.current
    if (!video || !stream) return
    try {
      await video.play()
    } catch {
      if (currentStream.current === stream) setState('blocked')
    }
  }

  async function fullscreen() {
    const frame = frameRef.current
    if (!frame) return
    try {
      if (!frame.requestFullscreen) {
        setFullscreenError('Fullscreen is unavailable in this browser.')
        return
      }
      await frame.requestFullscreen()
      setFullscreenError('')
    } catch { setFullscreenError('Fullscreen could not open. Try again from this preview.') }
  }

  const empty = state === 'empty'
  const canResume = stream && ['loading', 'waiting', 'error', 'blocked'].includes(state)
  return <div className="studio-monitor__pane" data-pane={name.toLowerCase()} data-frame-state={state}>
    <div className="studio-monitor__frame" ref={frameRef}>
      <video ref={videoRef} autoPlay muted playsInline aria-label={`${name}: ${sourceLabel}`} style={{ objectFit: fit }} />
      {state !== 'ready' && <div className="studio-monitor__empty">
        <div className="studio-monitor__aperture" aria-hidden="true"><VideoOff size={25} strokeWidth={1.25} /></div>
        <h4>{empty ? emptyTitle : stateText[state]}</h4>
        <p>{empty ? emptyDescription : state === 'ended' ? 'Choose another source, or reopen this source in its controls.' : state === 'disabled' ? 'Turn video on in the source controls to see it here.' : state === 'audio-only' ? 'Select a source with a video track to prepare a visual output.' : 'Your preview appears here when the source sends video.'}</p>
        {canResume && <button type="button" className="studio-monitor__resume" onClick={() => void resume()}><Play size={13} aria-hidden="true" />Resume preview</button>}
      </div>}
      <span className="studio-monitor__frame-label">{sourceLabel}</span>
      <button type="button" className="studio-monitor__fullscreen" aria-label={`Fullscreen ${name.toLowerCase()}`} disabled={!stream} onClick={() => void fullscreen()}><Expand size={15} aria-hidden="true" /></button>
    </div>
    <div className="studio-monitor__pane-bar">
      <span className={`studio-monitor__signal ${state === 'ready' ? 'is-ready' : ''}`} role="status"><i />{stateText[state]}{state === 'ready' && dimensions && <small>{dimensions}</small>}</span>
      <div className="studio-monitor__framing" role="group" aria-label={`${name} framing`}><button type="button" aria-pressed={fit === 'contain'} onClick={() => setFit('contain')}>Fit</button><button type="button" aria-pressed={fit === 'cover'} onClick={() => setFit('cover')}>Fill</button></div>
    </div>
    {fullscreenError && <p className="studio-monitor__pane-error" role="status">{fullscreenError}</p>}
  </div>
}

export function StudioMonitor({ sources, previewId, onPreviewChange, programId, programStream, roomId, pending, error, onShare, onClear, onOpenCameraSetup, onOpenScreenControls, onOpenStudioControls }: StudioMonitorProps) {
  const id = useId()
  const [readyStream, setReadyStream] = useState<MediaStream | null>(null)
  const preview = sources.find((source) => source.id === previewId)
  const program = sources.find((source) => source.id === programId)
  const selectedStream = preview?.stream || null
  const ready = hasLiveVideo(selectedStream) && readyStream === selectedStream
  const sameOutput = programId === previewId && programStream === selectedStream && Boolean(programStream)
  const outputExists = Boolean(programId && programStream)
  const canShare = ready && !pending && !sameOutput
  const updateReady = useCallback((value: boolean) => setReadyStream(value ? selectedStream : null), [selectedStream])
  const openSource = { camera: onOpenCameraSetup, screen: onOpenScreenControls, studio: onOpenStudioControls }
  const setupLabels = { camera: 'Camera setup', screen: 'Screen controls', studio: 'Studio controls' }

  return <section className="studio-monitor" aria-labelledby={`${id}-title`}>
    <header className="studio-monitor__header"><div><p className="studio-monitor__eyebrow">The visual workspace</p><h2 id={`${id}-title`}>Studio monitor<span>.</span></h2></div><p className="studio-monitor__intro">Choose your shot.<br />Preview it. Then share it.</p></header>
    <div className="studio-monitor__sources" role="group" aria-label="Preview source">
      {sources.map((source, index) => {
        const Icon = sourceIcons[source.id]
        return <SpotlightCard className={`studio-monitor__source ${previewId === source.id ? 'is-selected' : ''}`} key={source.id} spotlightColor="rgba(112, 200, 172, 0.12)">
          <button type="button" className="studio-monitor__source-select" aria-pressed={previewId === source.id} onClick={() => onPreviewChange(source.id)} disabled={pending}><span className="studio-monitor__source-number">0{index + 1}</span><Icon size={18} strokeWidth={1.5} aria-hidden="true" /><span><strong>{source.label}</strong><small>{hasLiveVideo(source.stream) ? 'Video source available' : 'No active video'}</small></span>{previewId === source.id && <Check className="studio-monitor__source-check" size={15} aria-hidden="true" />}</button>
          {openSource[source.id] && <button type="button" className="studio-monitor__source-setup" onClick={openSource[source.id]}>{setupLabels[source.id]}<ArrowRight size={11} aria-hidden="true" /></button>}
        </SpotlightCard>
      })}
    </div>

    <div className="studio-monitor__monitors">
      <div className="studio-monitor__column"><div className="studio-monitor__column-heading"><h3><span>01</span>Local preview</h3><span className="studio-monitor__tag">Only you</span></div>
        <MonitorPane key={`preview-${previewId}-${selectedStream?.id || 'empty'}`} name="Preview" stream={selectedStream} sourceLabel={preview?.label || 'Choose a source'} emptyTitle={`Preview your ${preview?.label.toLowerCase() || 'source'}`} emptyDescription="Open the source controls above to prepare a video. Choosing a preview does not share it." onReadyChange={updateReady} />
      </div>
      <div className={`studio-monitor__column ${outputExists ? 'has-output' : ''}`}><div className="studio-monitor__column-heading"><h3><span>02</span>{roomId ? 'Room output' : 'Prepared output'}</h3><span className={`studio-monitor__tag ${outputExists ? 'is-output' : ''}`}>{outputExists ? <><Radio size={10} aria-hidden="true" />{roomId ? 'Shared source' : 'Prepared'}</> : roomId ? 'No video shared' : 'Not shared'}</span></div>
        <MonitorPane key={`program-${programId || 'empty'}-${programStream?.id || 'empty'}`} name="Output" stream={programStream} sourceLabel={outputExists ? program?.label || 'Selected output' : 'Your output'} emptyTitle={roomId ? 'Choose what the room sees' : 'Your next scene goes here'} emptyDescription={roomId ? 'Preview a source on the left, then share it when you are ready.' : 'Prepare a source now. Joining a room is a separate step.'} />
      </div>
    </div>

    <div className="studio-monitor__action-bar"><p>{pending ? 'Updating your output…' : sameOutput ? roomId ? 'The preview matches your room source.' : 'This source is prepared. Join a room when you are ready.' : ready ? 'Your preview is ready. You decide when it becomes the output.' : 'Prepare a video source to choose your output.'}</p><div><button type="button" className="studio-monitor__clear" onClick={onClear} disabled={!outputExists || pending}>{roomId ? 'Stop sharing video' : 'Clear output'}</button><button type="button" className="studio-monitor__share" onClick={() => { if (canShare) onShare() }} disabled={!canShare}>{pending ? 'Updating…' : sameOutput ? <><Check size={15} aria-hidden="true" />{roomId ? 'Sharing this source' : 'Output prepared'}</> : <>{roomId ? 'Share preview with room' : 'Prepare output'}<ArrowRight size={15} aria-hidden="true" /></>}</button></div></div>
    {error && <p className="studio-monitor__error" role="alert">{error}</p>}
    <footer className="studio-monitor__footer"><span>Both monitors are muted on this device.</span><span>Fit &amp; Fill change your monitor view.</span></footer>
  </section>
}
