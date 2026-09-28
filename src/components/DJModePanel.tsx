import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { MediaDisclosure } from '@/components/MediaDisclosure'
import { GlassCard } from '@/components/GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MediaCompositor, AudioMixer, combineStreams } from '@/lib/compositor'
import type { OverlayConfig } from '@/lib/compositor'
import type { SpotifyTrack } from '@/lib/spotify'
import { OverlayCompositorControl } from '@/components/OverlayCompositorControl'
import type { OverlayOutput } from '@/lib/overlay-session'

type VideoSourceType = 'camera' | 'file' | 'spotify-artwork' | 'none'

type DeviceInfo = { deviceId: string; label: string }

/**
 * DJModePanel — Full compositor for DJ Mode.
 *
 * Allows the operator to:
 *  - Choose video source: camera (with device picker) or local video file
 *  - Choose audio source: microphone or file audio
 *  - Control gain per source
 *  - Toggle the Frisky Developments overlay
 *  - Preview the composite output
 *  - Return the output stream only when the parent has connected a consumer
 */
export function DJModePanel({
  onOutputStream,
  spotifyTrack = null,
}: {
  onOutputStream?: (stream: MediaStream | null) => void
  /** The confirmed now-playing track, never a pending library selection. */
  spotifyTrack?: SpotifyTrack | null
}) {
  const compositorRef = useRef<MediaCompositor | null>(null)
  const mixerRef = useRef<AudioMixer | null>(null)
  const outputRef = useRef<MediaStream | null>(null)
  const outputCallbackRef = useRef(onOutputStream)
  outputCallbackRef.current = onOutputStream
  const generationRef = useRef(0)
  const previewRequestRef = useRef(0)
  const previewPendingRef = useRef(false)
  const mountedRef = useRef(false)

  const [videoSource, setVideoSource] = useState<VideoSourceType>('none')
  const [cameras, setCameras] = useState<DeviceInfo[]>([])
  const [selectedCamera, setSelectedCamera] = useState('')
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const [cameraState, setCameraState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const videoFileRef = useRef<HTMLVideoElement | null>(null)
  const videoFileUrlRef = useRef<string | null>(null)
  const fileLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [videoFileName, setVideoFileName] = useState<string | null>(null)
  const [fileState, setFileState] = useState<'idle' | 'loading' | 'ready' | 'starting' | 'playing' | 'blocked' | 'error'>('idle')
  const [fileDetails, setFileDetails] = useState('')
  const [sourceError, setSourceError] = useState('')
  const [previewStarting, setPreviewStarting] = useState(false)
  const [artworkState, setArtworkState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'missing'>('idle')
  const artworkUrl = spotifyTrack?.album?.images?.[0]?.url || ''
  const artworkTrackId = spotifyTrack?.id || ''
  const sourceChoiceRef = useRef<VideoSourceType>('none')

  const [micGain, setMicGain] = useState(80)
  const [fileGain, setFileGain] = useState(80)
  const [overlayEnabled, setOverlayEnabled] = useState(true)
  const [overlayPosition, setOverlayPosition] = useState<OverlayConfig['position']>('bottom-right')
  const [overlayOpacity, setOverlayOpacity] = useState(70)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const canvasContainerRef = useRef<HTMLDivElement | null>(null)
  const selectOverlayScene = useCallback((output: OverlayOutput | null) => {
    compositorRef.current?.setOverlayScene(output?.pack ?? null, output?.screenId)
  }, [])

  // Detach the old program before changing any source. The parent owns routing;
  // this component owns and stops the composed media.
  const invalidatePreview = useCallback(() => {
    previewRequestRef.current += 1
    previewPendingRef.current = false
    if (outputRef.current) {
      outputRef.current = null
      outputCallbackRef.current?.(null)
    }
    compositorRef.current?.stop()
    canvasContainerRef.current?.replaceChildren()
    videoFileRef.current?.pause()
    if (videoFileRef.current) videoFileRef.current.muted = true
    mixerRef.current?.removeSource('file')
    mixerRef.current?.removeSource('mic')
    if (mountedRef.current) {
      setIsPreviewing(false)
      setPreviewStarting(false)
    }
  }, [])

  const releaseCamera = useCallback(() => {
    const stream = cameraStreamRef.current
    cameraStreamRef.current = null
    stream?.getTracks().forEach(track => { track.onended = null; track.stop() })
    mixerRef.current?.removeSource('mic')
    if (mountedRef.current) setCameraState('idle')
  }, [])

  const releaseFile = useCallback(() => {
    if (fileLoadTimerRef.current) clearTimeout(fileLoadTimerRef.current)
    fileLoadTimerRef.current = null
    const video = videoFileRef.current
    videoFileRef.current = null
    if (video) {
      video.onloadeddata = null
      video.oncanplay = null
      video.onerror = null
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    mixerRef.current?.removeSource('file')
    if (videoFileUrlRef.current) URL.revokeObjectURL(videoFileUrlRef.current)
    videoFileUrlRef.current = null
  }, [])

  useEffect(() => {
    mountedRef.current = true
    // AudioContext construction waits for Preview, keeping mount and file choice silent.
    compositorRef.current = new MediaCompositor({ width: 640, height: 360, fps: 24 })
    return () => {
      mountedRef.current = false
      generationRef.current += 1
      sourceChoiceRef.current = 'none'
      invalidatePreview()
      releaseCamera()
      releaseFile()
      compositorRef.current?.setSource({ type: 'none' })
      compositorRef.current = null
      mixerRef.current?.destroy()
      mixerRef.current = null
    }
  }, [invalidatePreview, releaseCamera, releaseFile])

  useEffect(() => {
    let active = true
    navigator.mediaDevices?.enumerateDevices?.().then(devices => {
      if (!active) return
      const videoDevices = devices.filter(d => d.kind === 'videoinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }))
      setCameras(videoDevices)
      setSelectedCamera(current => current || videoDevices[0]?.deviceId || '')
    }).catch(() => {})
    return () => { active = false }
  }, [])

  const chooseSource = useCallback((source: VideoSourceType) => {
    if (source === sourceChoiceRef.current && source !== 'file') return
    generationRef.current += 1
    invalidatePreview()
    releaseCamera()
    releaseFile()
    sourceChoiceRef.current = source
    compositorRef.current?.setSource({ type: 'none' })
    setVideoSource(source)
    setSourceError('')
    setFileState('idle')
    setVideoFileName(null)
    setFileDetails('')
  }, [invalidatePreview, releaseCamera, releaseFile])

  useEffect(() => {
    if (videoSource !== 'spotify-artwork') return
    let active = true
    // A now-playing change requires a fresh preview and explicit program selection.
    generationRef.current += 1
    invalidatePreview()
    compositorRef.current?.setSource({ type: 'none' })
    if (!artworkUrl) { setArtworkState('missing'); return }
    try {
      if (new URL(artworkUrl).protocol !== 'https:') throw new Error('Artwork requires HTTPS')
    } catch { setArtworkState('error'); return }
    setArtworkState('loading')
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.referrerPolicy = 'no-referrer'
    image.onload = () => {
      if (!active || sourceChoiceRef.current !== 'spotify-artwork') return
      if (!image.naturalWidth || !image.naturalHeight) { setArtworkState('error'); return }
      compositorRef.current?.setSource({ type: 'image', image })
      setArtworkState('ready')
    }
    image.onerror = () => { if (active) setArtworkState('error') }
    image.src = artworkUrl
    return () => { active = false; image.onload = null; image.onerror = null }
  }, [videoSource, artworkUrl, artworkTrackId, invalidatePreview])

  const acquireCamera = async (deviceId: string): Promise<MediaStream | null> => {
    const generation = generationRef.current
    setCameraState('loading')
    setSourceError('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera capture needs a supported browser and HTTPS.')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), width: 640, height: 360 },
        audio: true,
      })
      if (!mountedRef.current || generation !== generationRef.current || sourceChoiceRef.current !== 'camera') {
        stream.getTracks().forEach(track => track.stop())
        return null
      }
      cameraStreamRef.current = stream
      compositorRef.current?.setSource({ type: 'camera', stream })
      stream.getVideoTracks().forEach(track => {
        track.onended = () => {
          if (cameraStreamRef.current !== stream) return
          generationRef.current += 1
          invalidatePreview()
          releaseCamera()
          setCameraState('error')
          setSourceError('Camera disconnected. Reconnect it, then retry the preview.')
        }
      })
      setCameraState('ready')
      return stream
    } catch (cause) {
      if (mountedRef.current && generation === generationRef.current) {
        setCameraState('error')
        setSourceError(cause instanceof Error && cause.name === 'NotAllowedError'
          ? 'Camera or microphone permission was denied. Allow access in your browser, then retry.'
          : 'Camera could not start. Check the device connection and browser permissions, then retry.')
      }
      return null
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = '' // Picking the same file again must fire change after a decode failure.
    if (!file) return
    chooseSource('file')
    const video = document.createElement('video')
    videoFileRef.current = video
    video.loop = true
    video.playsInline = true
    video.preload = 'auto'
    video.muted = true
    setVideoFileName(file.name)
    setFileState('loading')
    const isCurrent = () => mountedRef.current && sourceChoiceRef.current === 'file' && videoFileRef.current === video
    const fail = (message: string) => {
      if (!isCurrent()) return
      if (fileLoadTimerRef.current) clearTimeout(fileLoadTimerRef.current)
      fileLoadTimerRef.current = null
      invalidatePreview()
      setFileState('error')
      setSourceError(message)
    }
    const ready = () => {
      if (!isCurrent() || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return
      if (fileLoadTimerRef.current) clearTimeout(fileLoadTimerRef.current)
      fileLoadTimerRef.current = null
      compositorRef.current?.setSource({ type: 'file', element: video })
      setFileDetails(`${video.videoWidth} × ${video.videoHeight}${Number.isFinite(video.duration) ? ` · ${Math.round(video.duration)} sec` : ''}`)
      if (!outputRef.current && !previewPendingRef.current) setFileState('ready')
      setSourceError('')
    }
    video.onloadeddata = ready
    video.oncanplay = ready
    video.onerror = () => fail(video.error?.code === 4 || video.error?.code === 3
      ? 'This browser could not decode the video. Try an MP4 exported with H.264 video and AAC audio, or choose another file.'
      : 'The video could not be loaded. Choose the file again or try another video.')
    fileLoadTimerRef.current = setTimeout(() => fail('The video is taking too long to load. Download it fully to this device, then choose it again.'), 20_000)
    try {
      videoFileUrlRef.current = URL.createObjectURL(file)
      video.src = videoFileUrlRef.current
      video.load()
    } catch { fail('This file could not be opened. Choose a video stored on this device.') }
  }

  useEffect(() => {
    compositorRef.current?.setOverlay({ enabled: overlayEnabled, position: overlayPosition, opacity: overlayOpacity / 100 })
  }, [overlayEnabled, overlayPosition, overlayOpacity])
  useEffect(() => { mixerRef.current?.setGain('mic', micGain / 100) }, [micGain])
  useEffect(() => { mixerRef.current?.setGain('file', fileGain / 100) }, [fileGain])

  const startPreview = async () => {
    const compositor = compositorRef.current
    if (!compositor || previewPendingRef.current || outputRef.current || sourceChoiceRef.current === 'none') return
    if (sourceChoiceRef.current === 'file' && !['ready', 'blocked'].includes(fileState)) return
    const request = ++previewRequestRef.current
    const generation = generationRef.current
    const file = sourceChoiceRef.current === 'file' ? videoFileRef.current : null
    const isCurrent = () => mountedRef.current && generation === generationRef.current && request === previewRequestRef.current
    previewPendingRef.current = true
    setPreviewStarting(true)
    setSourceError('')
    try {
      const mixer = mixerRef.current ?? (mixerRef.current = new AudioMixer())
      mixer.setGain('mic', micGain / 100)
      mixer.setGain('file', fileGain / 100)
      // Invoke play/resume in the gesture so Safari can honor explicit playback.
      const playback: Promise<unknown>[] = [mixer.resume()]
      if (file) {
        mixer.addMediaElement(file)
        file.muted = false
        setFileState('starting')
        playback.push(file.play())
      }
      await Promise.all(playback)
      if (!isCurrent()) { if (file && (videoFileRef.current !== file || !previewPendingRef.current)) file.pause(); return }
      if (sourceChoiceRef.current === 'camera') {
        const stream = cameraStreamRef.current ?? await acquireCamera(selectedCamera)
        if (!stream || !isCurrent()) return
        if (stream.getAudioTracks().length) mixer.addMic(new MediaStream(stream.getAudioTracks()))
      }
      await compositor.prepareSource()
      if (!isCurrent()) return
      const combined = combineStreams(compositor.start(), mixer.getOutputStream())
      outputRef.current = combined
      outputCallbackRef.current?.(combined)
      setIsPreviewing(true)
      if (file) setFileState('playing')
      const canvas = compositor.getCanvas()
      canvas.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;border-radius:8px'
      canvasContainerRef.current?.replaceChildren(canvas)
    } catch (cause) {
      if (!isCurrent()) return
      invalidatePreview()
      if (file) {
        setFileState(cause instanceof Error && cause.name === 'NotSupportedError' ? 'error' : 'blocked')
        setSourceError(cause instanceof Error && cause.name === 'NotSupportedError'
          ? 'This browser cannot play this video. Try an H.264/AAC MP4 or choose another file.'
          : 'Playback did not start. Press Retry preview to allow playback, or choose another file.')
      } else {
        releaseCamera()
        setSourceError('Preview could not start. Check browser media support and retry.')
      }
    } finally {
      if (request === previewRequestRef.current) {
        previewPendingRef.current = false
        if (mountedRef.current) setPreviewStarting(false)
      }
    }
  }

  const stopPreview = () => {
    generationRef.current += 1
    invalidatePreview()
    releaseCamera()
    if (sourceChoiceRef.current === 'file' && videoFileRef.current?.readyState && videoFileRef.current.readyState >= 2) setFileState('ready')
    toast.success('Preview stopped')
  }

  return (
    <div className="space-y-3">
      <GlassCard className="p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="font-mono text-xs uppercase text-muted-foreground">Media Output</h3>
          <Badge variant="outline">{isPreviewing ? onOutputStream ? 'Output ready' : 'Preview active' : 'Preview stopped'}</Badge>
        </div>
        <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
          <div ref={canvasContainerRef} className="absolute inset-0" />
          {!isPreviewing && <div className="absolute inset-0 grid place-items-center p-5 text-center text-sm text-muted-foreground">Choose a source below, then start the preview.</div>}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{onOutputStream ? 'Preview locally, then use the studio controls to send it to your room. Changing the source stops the previous output.' : 'Local preview only. This does not start a room or broadcast.'}</p>
      </GlassCard>
      <MediaDisclosure id="studio-controls" title="Video, audio & overlay" status={isPreviewing ? "Preview active" : undefined}><GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            DJ Mode Compositor
          </span>
          <Badge
            variant="outline"
            className={`font-mono text-[10px] ${isPreviewing ? 'border-green-500/60 text-green-400' : 'border-muted text-muted-foreground'}`}
          >
            {isPreviewing ? 'PREVIEW' : 'STANDBY'}
          </Badge>
        </div>

        {/* Video Source */}
        <div className="space-y-2 mb-4">
          <Label className="text-xs font-mono uppercase text-muted-foreground">Video Source</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={videoSource === 'camera' ? 'default' : 'outline'}
              size="sm"
              className="h-8 font-mono text-[10px]"
              onClick={() => chooseSource('camera')}
            >
              Camera
            </Button>
            <Button
              variant={videoSource === 'file' ? 'default' : 'outline'}
              size="sm"
              className="h-8 font-mono text-[10px]"
              onClick={() => fileInputRef.current?.click()}
            >
              Video File
            </Button>
            <Button
              variant={videoSource === 'spotify-artwork' ? 'default' : 'outline'}
              size="sm"
              className="h-8 font-mono text-[10px]"
              onClick={() => chooseSource('spotify-artwork')}
            >
              Spotify artwork
            </Button>
            <Button
              variant={videoSource === 'none' ? 'default' : 'outline'}
              size="sm"
              className="h-8 font-mono text-[10px]"
              onClick={() => chooseSource('none')}
            >
              None
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          {videoFileName && videoSource === 'file' && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="font-mono truncate">{videoFileName}</p>
              <p role="status">{fileState === 'loading' ? 'Loading video…' : fileState === 'starting' ? 'Starting video…' : fileState === 'playing' ? 'Playing in local preview' : fileState === 'ready' ? `Ready to preview${fileDetails ? ` · ${fileDetails}` : ''}` : fileState === 'blocked' ? 'Playback needs your action' : fileState === 'error' ? 'Video unavailable' : ''}</p>
              <p>Local file · stays on this device until you explicitly send the preview to a room.</p>
            </div>
          )}
          {videoSource === 'spotify-artwork' && <div className="space-y-1 text-xs text-muted-foreground">
            <p role="status">{artworkState === 'ready' ? `${spotifyTrack?.name} · ${spotifyTrack?.artists.map(artist => artist.name).join(', ')}` : artworkState === 'loading' ? 'Loading current Spotify artwork…' : artworkState === 'error' ? 'This artwork could not be loaded for the video source. Try another track.' : 'Play a track with artwork in the Spotify player to use it here.'}</p>
            <p>Album image only. Spotify audio stays on your selected player; animated Spotify Canvas videos are not available here.</p>
          </div>}
        </div>

        {/* Camera Picker */}
        {videoSource === 'camera' && cameras.length > 0 && (
          <div className="space-y-2 mb-4">
            <Label className="text-xs font-mono uppercase text-muted-foreground">Camera Device</Label>
            <Select value={selectedCamera} onValueChange={deviceId => {
              generationRef.current += 1
              invalidatePreview()
              releaseCamera()
              compositorRef.current?.setSource({ type: 'none' })
              setSelectedCamera(deviceId)
              setSourceError('')
            }}>
              <SelectTrigger className="h-8 font-mono text-[11px]">
                <SelectValue placeholder="Select camera" />
              </SelectTrigger>
              <SelectContent>
                {cameras.map(cam => (
                  <SelectItem key={cam.deviceId} value={cam.deviceId} className="font-mono text-[11px]">
                    {cam.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {videoSource === 'camera' && <p className="mb-3 text-xs text-muted-foreground" role="status">{cameraState === 'loading' ? 'Waiting for camera & microphone…' : cameraState === 'ready' ? 'Camera & microphone ready' : 'Camera & microphone access starts when you press Preview.'}</p>}
        {sourceError && <p role="alert" className="mb-3 rounded-md border border-amber-400/40 p-3 text-sm text-amber-200">{sourceError}</p>}

        {/* Audio Controls */}
        <div className="space-y-2 mb-4">
          <Label className="text-xs font-mono uppercase text-muted-foreground">Audio Mix</Label>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono w-12 text-muted-foreground">MIC</span>
              <Slider
                value={[micGain]}
                onValueChange={([v]) => setMicGain(v)}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className="text-[10px] font-mono w-8 text-right">{micGain}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono w-12 text-muted-foreground">FILE</span>
              <Slider
                value={[fileGain]}
                onValueChange={([v]) => setFileGain(v)}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className="text-[10px] font-mono w-8 text-right">{fileGain}%</span>
            </div>
          </div>
        </div>

        <OverlayCompositorControl onSelect={selectOverlayScene} />

        {/* Frisky Developments Overlay */}
        <div className="space-y-2 mb-4">
          <Label className="text-xs font-mono uppercase text-muted-foreground">Frisky Developments overlay</Label>
          <div className="flex items-center gap-4">
            <Button
              variant={overlayEnabled ? 'default' : 'outline'}
              size="sm"
              className="h-7 font-mono text-[10px]"
              onClick={() => setOverlayEnabled(!overlayEnabled)}
            >
              {overlayEnabled ? '✦ ON' : 'OFF'}
            </Button>
            <Select value={overlayPosition} onValueChange={(v) => setOverlayPosition(v as OverlayConfig['position'])}>
              <SelectTrigger className="h-7 w-[130px] font-mono text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom-right" className="font-mono text-[10px]">Bottom Right</SelectItem>
                <SelectItem value="bottom-left" className="font-mono text-[10px]">Bottom Left</SelectItem>
                <SelectItem value="top-right" className="font-mono text-[10px]">Top Right</SelectItem>
                <SelectItem value="top-left" className="font-mono text-[10px]">Top Left</SelectItem>
                <SelectItem value="center" className="font-mono text-[10px]">Center</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 flex-1">
              <Slider
                value={[overlayOpacity]}
                onValueChange={([v]) => setOverlayOpacity(v)}
                max={100}
                step={5}
                className="flex-1"
              />
              <span className="text-[10px] font-mono w-8">{overlayOpacity}%</span>
            </div>
          </div>
        </div>

        {/* Preview / Stop */}
        <div className="flex gap-2">
          {!isPreviewing ? (
            <Button
              size="sm"
              className="h-9 font-mono text-[11px] bg-green-600 hover:bg-green-500"
              onClick={() => void startPreview()}
              disabled={previewStarting || videoSource === 'none' || (videoSource === 'file' && !['ready', 'blocked'].includes(fileState)) || (videoSource === 'spotify-artwork' && artworkState !== 'ready')}
            >
              {previewStarting ? 'Starting preview…' : fileState === 'blocked' || (videoSource === 'camera' && sourceError) ? 'Retry preview' : 'Start preview'}
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              className="h-9 font-mono text-[11px]"
              onClick={stopPreview}
            >
              Stop preview
            </Button>
          )}
        </div>
      </GlassCard></MediaDisclosure>


    </div>
  )
}
