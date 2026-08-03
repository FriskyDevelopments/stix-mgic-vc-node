import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { GlassCard } from '@/components/GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MediaCompositor, AudioMixer, combineStreams } from '@/lib/compositor'
import type { VideoSource, OverlayConfig } from '@/lib/compositor'
import { getWebrtcRelay, type RelayState } from '@/lib/webrtc-relay'
import { joinCall, leaveCall, switchSource as switchVcSource } from '@/lib/telegram-vc-api'

type VideoSourceType = 'camera' | 'file' | 'none'
type AudioSourceType = 'mic' | 'file' | 'spotify' | 'none'

type DeviceInfo = { deviceId: string; label: string }

/**
 * DJModePanel — Full compositor for DJ Mode.
 *
 * Allows the operator to:
 *  - Choose video source: camera (with device picker) or local video file
 *  - Choose audio source: microphone, file audio, or Spotify
 *  - Control gain per source
 *  - Toggle the STIX MAGIC sticker overlay
 *  - Preview the composite output
 *  - The output stream goes to the Telegram VC adapter
 */
export function DJModePanel({
  onOutputStream,
}: {
  onOutputStream?: (stream: MediaStream | null) => void
}) {
  // Compositor & mixer refs
  const compositorRef = useRef<MediaCompositor | null>(null)
  const mixerRef = useRef<AudioMixer | null>(null)

  // Video state
  const [videoSource, setVideoSource] = useState<VideoSourceType>('none')
  const [cameras, setCameras] = useState<DeviceInfo[]>([])
  const [selectedCamera, setSelectedCamera] = useState<string>('')
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const videoFileRef = useRef<HTMLVideoElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [videoFileName, setVideoFileName] = useState<string | null>(null)

  // Audio state
  const [micEnabled, setMicEnabled] = useState(true)
  const [fileAudioEnabled, setFileAudioEnabled] = useState(true)
  const [micGain, setMicGain] = useState(80)
  const [fileGain, setFileGain] = useState(80)

  // Overlay state
  const [overlayEnabled, setOverlayEnabled] = useState(true)
  const [overlayPosition, setOverlayPosition] = useState<OverlayConfig['position']>('bottom-right')
  const [overlayOpacity, setOverlayOpacity] = useState(70)

  // Output
  const [isLive, setIsLive] = useState(false)
  const canvasContainerRef = useRef<HTMLDivElement | null>(null)

  // Telegram VC connection
  const [chatId, setChatId] = useState('')
  const [relayState, setRelayState] = useState<RelayState>('idle')
  const [relayChunksSent, setRelayChunksSent] = useState(0)
  const relayRef = useRef(getWebrtcRelay())
  const outputStreamRef = useRef<MediaStream | null>(null)

  // Initialize compositor & mixer
  useEffect(() => {
    compositorRef.current = new MediaCompositor({ width: 640, height: 360, fps: 24 })
    mixerRef.current = new AudioMixer()

    return () => {
      compositorRef.current?.stop()
      mixerRef.current?.destroy()
    }
  }, [])

  // Enumerate cameras
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices
        .filter(d => d.kind === 'videoinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }))
      setCameras(videoDevices)
      if (videoDevices.length > 0 && !selectedCamera) {
        setSelectedCamera(videoDevices[0].deviceId)
      }
    }).catch(() => {})
  }, [])

  // Camera stream management
  const startCamera = useCallback(async (deviceId: string) => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop())
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: 640, height: 360 },
        audio: micEnabled,
      })
      setCameraStream(stream)
      compositorRef.current?.setSource({ type: 'camera', stream })
      
      // Add mic from same stream
      if (micEnabled && mixerRef.current) {
        const audioStream = new MediaStream(stream.getAudioTracks())
        if (audioStream.getAudioTracks().length > 0) {
          mixerRef.current.addMic(audioStream)
        }
      }
      
      toast.success('Camera active')
    } catch (err) {
      toast.error('Camera failed', { description: err instanceof Error ? err.message : 'Unknown' })
    }
  }, [cameraStream, micEnabled])

  // Handle camera switch
  useEffect(() => {
    if (videoSource === 'camera' && selectedCamera) {
      void startCamera(selectedCamera)
    } else if (videoSource !== 'camera' && cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop())
      setCameraStream(null)
    }
  }, [videoSource, selectedCamera])

  // Handle video file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const url = URL.createObjectURL(file)
    if (!videoFileRef.current) {
      videoFileRef.current = document.createElement('video')
      videoFileRef.current.loop = true
      videoFileRef.current.playsInline = true
    }
    videoFileRef.current.src = url
    videoFileRef.current.play().catch(() => {})
    setVideoFileName(file.name)
    setVideoSource('file')
    compositorRef.current?.setSource({ type: 'file', element: videoFileRef.current })

    // Add file audio to mixer
    if (fileAudioEnabled && mixerRef.current && videoFileRef.current) {
      mixerRef.current.addMediaElement(videoFileRef.current)
    }

    toast.success(`Video: ${file.name}`)
  }

  // Update overlay in real time
  useEffect(() => {
    compositorRef.current?.setOverlay({
      enabled: overlayEnabled,
      position: overlayPosition,
      opacity: overlayOpacity / 100,
    })
  }, [overlayEnabled, overlayPosition, overlayOpacity])

  // Update gains in real time
  useEffect(() => {
    mixerRef.current?.setGain('mic', micGain / 100)
  }, [micGain])

  useEffect(() => {
    mixerRef.current?.setGain('file', fileGain / 100)
  }, [fileGain])

  // Subscribe to relay state changes
  useEffect(() => {
    const relay = relayRef.current
    relay.onStateChange = (state) => {
      setRelayState(state)
      if (state === 'streaming') {
        toast.success('Audio relay active — streaming to Telegram VC')
      } else if (state === 'error') {
        toast.error('Audio relay error')
      } else if (state === 'stopped') {
        setRelayChunksSent(0)
      }
    }
    relay.onStats = (stats) => {
      setRelayChunksSent(stats.chunksSent)
    }
  }, [])

  // Go live — start compositor, join Telegram VC, begin audio relay
  const goLive = async () => {
    if (!compositorRef.current || !mixerRef.current) return

    try {
      // 1. Join the Telegram VC call if chatId is provided
      if (chatId.trim()) {
        toast.info('Joining Telegram VC...')
        const joinResult = await joinCall(chatId.trim())
        if (joinResult.call.state !== 'active') {
          toast.error('Failed to join VC', {
            description: joinResult.call.error ?? 'Unknown error',
          })
          return
        }
        toast.success('Joined Telegram VC')

        // 2. Switch source to webrtc-relay
        await switchVcSource('webrtc-relay', {})
        toast.success('Relay source activated')
      }

      // 3. Start compositor
      await mixerRef.current.resume()
      const videoStream = compositorRef.current.start()
      const audioStream = mixerRef.current.getOutputStream()
      const combined = combineStreams(videoStream, audioStream)
      outputStreamRef.current = combined

      onOutputStream?.(combined)
      setIsLive(true)

      // 4. Start audio relay if VC is connected
      if (chatId.trim()) {
        try {
          await relayRef.current.start(combined)
        } catch (relayErr) {
          console.warn('Relay start failed (VC may not be active):', relayErr)
        }
      }

      // Attach canvas to preview
      if (canvasContainerRef.current) {
        const canvas = compositorRef.current.getCanvas()
        canvas.style.width = '100%'
        canvas.style.borderRadius = '8px'
        canvasContainerRef.current.innerHTML = ''
        canvasContainerRef.current.appendChild(canvas)
      }

      toast.success(chatId.trim() ? 'DJ Mode LIVE → Telegram VC' : 'DJ Mode LIVE (local only)')
    } catch (err) {
      toast.error('Go Live failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const stopLive = async () => {
    // 1. Stop audio relay
    if (relayRef.current.state === 'streaming') {
      await relayRef.current.stop()
    }

    // 2. Leave Telegram VC
    if (chatId.trim()) {
      try {
        await leaveCall()
        toast.info('Left Telegram VC')
      } catch (err) {
        console.warn('Leave call failed (may already be disconnected):', err)
      }
    }

    // 3. Stop compositor
    compositorRef.current?.stop()
    onOutputStream?.(null)
    setIsLive(false)

    if (canvasContainerRef.current) {
      canvasContainerRef.current.innerHTML = ''
    }

    outputStreamRef.current = null
    setRelayState('idle')
    toast.success('DJ Mode stopped')
  }

  return (
    <div className="space-y-3">
      <GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            DJ Mode Compositor
          </span>
          <Badge
            variant="outline"
            className={`font-mono text-[10px] ${isLive ? 'border-green-500/60 text-green-400' : 'border-muted text-muted-foreground'}`}
          >
            {isLive ? 'LIVE' : 'STANDBY'}
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
              onClick={() => setVideoSource('camera')}
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
              variant={videoSource === 'none' ? 'default' : 'outline'}
              size="sm"
              className="h-8 font-mono text-[10px]"
              onClick={() => { setVideoSource('none'); compositorRef.current?.setSource({ type: 'none' }) }}
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
            <p className="text-[10px] text-muted-foreground font-mono truncate">{videoFileName}</p>
          )}
        </div>

        {/* Camera Picker */}
        {videoSource === 'camera' && cameras.length > 0 && (
          <div className="space-y-2 mb-4">
            <Label className="text-xs font-mono uppercase text-muted-foreground">Camera Device</Label>
            <Select value={selectedCamera} onValueChange={(v) => { setSelectedCamera(v); void startCamera(v) }}>
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

        {/* Sticker Overlay */}
        <div className="space-y-2 mb-4">
          <Label className="text-xs font-mono uppercase text-muted-foreground">Sticker Overlay</Label>
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

        {/* Telegram VC Chat ID */}
        <div className="space-y-2 mb-4">
          <Label className="text-xs font-mono uppercase text-muted-foreground">
            Telegram Chat ID (optional)
          </Label>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="-1001234567890"
              disabled={isLive}
              className="flex-1 h-8 rounded-md border border-border bg-black/40 px-3 font-mono text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <p className="text-[9px] text-muted-foreground">
            Leave empty to run locally without Telegram VC
          </p>
        </div>

        {/* Go Live / Stop */}
        <div className="flex gap-2 mb-3">
          {!isLive ? (
            <Button
              size="sm"
              className="h-9 font-mono text-[11px] bg-green-600 hover:bg-green-500"
              onClick={() => void goLive()}
              disabled={videoSource === 'none'}
            >
              GO LIVE
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              className="h-9 font-mono text-[11px]"
              onClick={stopLive}
            >
              STOP
            </Button>
          )}
        </div>

        {/* Relay status */}
        {chatId.trim() && relayState !== 'idle' && (
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className={`w-2 h-2 rounded-full ${
              relayState === 'streaming' ? 'bg-green-400 animate-pulse' :
              relayState === 'starting' ? 'bg-yellow-400 animate-pulse' :
              relayState === 'error' ? 'bg-red-400' :
              'bg-muted-foreground'
            }`} />
            <span className="text-muted-foreground uppercase">
              Relay: {relayState}
            </span>
            {relayState === 'streaming' && (
              <span className="text-green-400/60 ml-auto">
                {relayChunksSent} chunks sent
              </span>
            )}
          </div>
        )}
      </GlassCard>

      {/* Live Preview */}
      {isLive && (
        <GlassCard className="p-3">
          <span className="block mb-2 font-mono text-[10px] uppercase text-muted-foreground">Live Output Preview</span>
          <div ref={canvasContainerRef} className="rounded-lg overflow-hidden bg-black aspect-video" />
        </GlassCard>
      )}
    </div>
  )
}
