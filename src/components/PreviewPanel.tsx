import { useEffect, useState, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { AudioVisualizer } from "@/components/AudioVisualizer"
import { extractColorsFromImage, type ExtractedColors } from "@/lib/color-extraction"
import { 
  EyeSlash, 
  MonitorPlay,
  Broadcast,
  Warning,
  CheckCircle,
  ArrowsClockwise,
  VideoCamera,
  Package,
  Lightning,
  ArrowsDownUp
} from "@phosphor-icons/react"

import type { SpotifyTrack } from "@/lib/spotify"
import { formatTrackDisplay, formatDuration } from "@/lib/spotify"

type VisionCondition = 
  | 'no-signal' 
  | 'stable' 
  | 'degraded' 
  | 'prepared' 
  | 'injected' 
  | 'uplink' 
  | 'recovery'
  | 'dj-ambient'
  
type InputProtocol = 'virtual-camera' | 'rtmp' | 'local' | 'relay' | 'clipsflow' | 'dj-mode'
type SessionMark = 'stix-default' | 'client-sticker' | 'off'
type DJAudioSource = 'stix-library' | 'clipsflow-pack' | 'session-pack' | 'spotify'
type SpotifyConnectionStatus = 'disconnected' | 'connecting' | 'connected'

interface PreviewPanelProps {
  sessionStatus: 'standby' | 'active' | 'connecting' | 'error' | 'dj-mode'
  inputProtocol: InputProtocol
  signalQuality: number
  frameRate: number
  bitrate: number
  audioSync: 'stable' | 'drift' | 'muted'
  resolution: string
  sessionMark: SessionMark
  djAudioSource?: DJAudioSource
  spotifyStatus?: SpotifyConnectionStatus
  spotifyTrack?: SpotifyTrack | null
  trackPlaybackTime?: number
  cameraStream?: MediaStream | null
  onVideoDeviceChange?: (deviceId: string) => void
  onAudioDeviceChange?: (deviceId: string) => void
}

interface ConditionConfig {
  label: string
  sublabel: string
  borderClass: string
  glowClass: string
  accentColor: string
  badge: string
  icon: typeof Broadcast
}

export function PreviewPanel({
  sessionStatus,
  inputProtocol,
  signalQuality,
  frameRate,
  bitrate,
  audioSync,
  resolution,
  sessionMark,
  djAudioSource,
  spotifyStatus,
  spotifyTrack,
  trackPlaybackTime = 0,
  cameraStream,
  onVideoDeviceChange,
  onAudioDeviceChange
}: PreviewPanelProps) {
  const [previewEnabled, setPreviewEnabled] = useState(true)
  const [overlayEnabled, setOverlayEnabled] = useState(true)
  const [safeModeEnabled, setSafeModeEnabled] = useState(false)
  const [visionCondition, setVisionCondition] = useState<VisionCondition>('no-signal')
  const [extractedColors, setExtractedColors] = useState<ExtractedColors | null>(null)
  const [isExtractingColors, setIsExtractingColors] = useState(false)
  const [previousTrackId, setPreviousTrackId] = useState<string | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (sessionStatus === 'standby') {
      setVisionCondition('no-signal')
    } else if (sessionStatus === 'dj-mode') {
      setVisionCondition('dj-ambient')
    } else if (sessionStatus === 'connecting') {
      setVisionCondition('recovery')
    } else if (sessionStatus === 'active') {
      if (inputProtocol === 'clipsflow') {
        setVisionCondition('prepared')
      } else if (inputProtocol === 'virtual-camera') {
        setVisionCondition('injected')
      } else if (inputProtocol === 'rtmp') {
        setVisionCondition('uplink')
      } else if (signalQuality < 30) {
        setVisionCondition('recovery')
      } else if (signalQuality < 60) {
        setVisionCondition('degraded')
      } else {
        setVisionCondition('stable')
      }
    }
  }, [sessionStatus, inputProtocol, signalQuality])

  useEffect(() => {
    const extractColors = async () => {
      if (
        sessionStatus === 'dj-mode' && 
        djAudioSource === 'spotify' && 
        spotifyTrack?.album?.images?.[0]?.url &&
        spotifyStatus === 'connected' &&
        !isExtractingColors
      ) {
        const currentTrackId = spotifyTrack.id
        
        if (currentTrackId !== previousTrackId && previousTrackId !== null) {
          setIsTransitioning(true)
        }
        
        try {
          setIsExtractingColors(true)
          const colors = await extractColorsFromImage(spotifyTrack.album.images[0].url)
          setExtractedColors(colors)
          setPreviousTrackId(currentTrackId)
          
          setTimeout(() => {
            setIsTransitioning(false)
          }, 2000)
        } catch (error) {
          console.error('Failed to extract colors from album art:', error)
          setExtractedColors(null)
          setIsTransitioning(false)
        } finally {
          setIsExtractingColors(false)
        }
      } else if (sessionStatus !== 'dj-mode' || djAudioSource !== 'spotify') {
        setExtractedColors(null)
        setPreviousTrackId(null)
        setIsTransitioning(false)
      }
    }

    extractColors()
  }, [sessionStatus, djAudioSource, spotifyTrack, spotifyStatus])

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream
      videoRef.current.play().catch(() => {})
    }
  }, [cameraStream])

  const getConditionConfig = (): ConditionConfig => {
    switch (visionCondition) {
      case 'stable':
        return {
          label: 'Signal Locked',
          sublabel: 'Operator Ready',
          borderClass: 'border-accent',
          glowClass: 'shadow-accent/30',
          accentColor: 'oklch(0.75 0.14 195)',
          badge: 'STABLE',
          icon: CheckCircle
        }
      case 'degraded':
        return {
          label: 'Presence Preserved',
          sublabel: 'Continuity Priority',
          borderClass: 'border-warning',
          glowClass: 'shadow-warning/30',
          accentColor: 'oklch(0.70 0.15 70)',
          badge: 'DEGRADED',
          icon: Warning
        }
      case 'prepared':
        return {
          label: 'Optimized',
          sublabel: 'Ready for Injection',
          borderClass: 'border-accent',
          glowClass: 'shadow-accent/30',
          accentColor: 'oklch(0.75 0.14 195)',
          badge: 'PREPARED',
          icon: Package
        }
      case 'injected':
        return {
          label: 'Camera Bound',
          sublabel: 'Call Active',
          borderClass: 'border-accent',
          glowClass: 'shadow-accent/30',
          accentColor: 'oklch(0.75 0.14 195)',
          badge: 'INJECTED',
          icon: VideoCamera
        }
      case 'uplink':
        return {
          label: 'Broadcast Bound',
          sublabel: 'Transport Stable',
          borderClass: 'border-accent',
          glowClass: 'shadow-accent/30',
          accentColor: 'oklch(0.75 0.14 195)',
          badge: 'UPLINK LIVE',
          icon: Lightning
        }
      case 'recovery':
        return {
          label: 'Reacquiring',
          sublabel: 'Signal Rebuild',
          borderClass: 'border-warning/50',
          glowClass: 'shadow-warning/20',
          accentColor: 'oklch(0.70 0.15 70)',
          badge: 'RECOVERY',
          icon: ArrowsClockwise
        }
      case 'dj-ambient':
        return {
          label: 'Autonomous Session',
          sublabel: 'Loop + Audio',
          borderClass: 'border-primary',
          glowClass: 'shadow-primary/20',
          accentColor: 'oklch(0.55 0.18 250)',
          badge: 'DJ MODE',
          icon: Broadcast
        }
      case 'no-signal':
      default:
        return {
          label: 'Feed Lost',
          sublabel: 'Awaiting Source',
          borderClass: 'border-border/30',
          glowClass: '',
          accentColor: 'oklch(0.30 0.02 260)',
          badge: 'NO SIGNAL',
          icon: MonitorPlay
        }
    }
  }

  const config = getConditionConfig()
  const ConditionIcon = config.icon

  const getSourceLabel = () => {
    if (inputProtocol === 'clipsflow') return 'ClipsFlow Pipeline'
    if (inputProtocol === 'virtual-camera') return 'OBS Virtual Camera'
    if (inputProtocol === 'rtmp') return 'RTMP Broadcast'
    if (inputProtocol === 'local') return 'Local Media Source'
    if (inputProtocol === 'relay') return 'External Relay'
    return 'Source Input'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-lg font-semibold font-mono tracking-tight">OPERATOR VISION</h3>
          <p className="text-sm text-muted-foreground">{getSourceLabel()}</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              id="preview-toggle"
              checked={previewEnabled}
              onCheckedChange={setPreviewEnabled}
            />
            <Label htmlFor="preview-toggle" className="text-xs cursor-pointer font-mono">
              Vision {previewEnabled ? 'On' : 'Off'}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="overlay-toggle"
              checked={overlayEnabled}
              onCheckedChange={setOverlayEnabled}
              disabled={!previewEnabled}
            />
            <Label htmlFor="overlay-toggle" className="text-xs cursor-pointer font-mono">
              Condition Layer
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="safemode-toggle"
              checked={safeModeEnabled}
              onCheckedChange={setSafeModeEnabled}
              disabled={!previewEnabled}
            />
            <Label htmlFor="safemode-toggle" className="text-xs cursor-pointer font-mono">
              Safe Mode
            </Label>
          </div>
        </div>
      </div>

      <div 
        className={cn(
          "relative aspect-video w-full rounded-lg overflow-hidden transition-all duration-500",
          "bg-black border-2",
          visionCondition !== 'no-signal' && config.borderClass,
          visionCondition !== 'no-signal' && `shadow-lg ${config.glowClass}`,
          visionCondition === 'no-signal' && config.borderClass
        )}
      >
        {!previewEnabled ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90">
            <EyeSlash size={48} className="text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground font-mono">Vision Disabled</p>
          </div>
        ) : (
          <>
            {visionCondition === 'no-signal' && (
              <div className="absolute inset-0 bg-black">
                <div 
                  className="absolute inset-0 opacity-5"
                  style={{
                    backgroundImage: `repeating-linear-gradient(
                      0deg,
                      transparent,
                      transparent 10px,
                      oklch(0.5 0 0 / 0.3) 10px,
                      oklch(0.5 0 0 / 0.3) 11px
                    ),
                    repeating-linear-gradient(
                      90deg,
                      transparent,
                      transparent 10px,
                      oklch(0.5 0 0 / 0.3) 10px,
                      oklch(0.5 0 0 / 0.3) 11px
                    )`
                  }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <MonitorPlay size={64} className="text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground/70 font-mono">{config.label}</p>
                </div>
              </div>
            )}

            {visionCondition === 'stable' && (
              <div className="absolute inset-0">
                <div 
                  className={cn(
                    "absolute inset-0",
                    safeModeEnabled && "blur-sm brightness-75"
                  )}
                  style={{
                    background: `
                      repeating-linear-gradient(
                        0deg,
                        transparent,
                        transparent 40px,
                        ${config.accentColor}15 40px,
                        ${config.accentColor}15 41px
                      ),
                      radial-gradient(circle at 30% 40%, ${config.accentColor}20 0%, transparent 50%),
                      radial-gradient(circle at 70% 60%, ${config.accentColor}15 0%, transparent 50%)
                    `
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Broadcast size={96} className="text-accent/15" weight="duotone" />
                </div>
                <div 
                  className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
                  style={{
                    backgroundImage: `repeating-linear-gradient(
                      0deg,
                      transparent,
                      transparent 2px,
                      ${config.accentColor} 2px,
                      ${config.accentColor} 3px
                    )`
                  }}
                />
              </div>
            )}

            {visionCondition === 'degraded' && (
              <div className="absolute inset-0">
                <div 
                  className="absolute inset-0 blur-[2px] brightness-75"
                  style={{
                    background: `
                      repeating-linear-gradient(
                        45deg,
                        transparent,
                        transparent 40px,
                        ${config.accentColor}10 40px,
                        ${config.accentColor}10 41px
                      ),
                      radial-gradient(circle at 30% 40%, ${config.accentColor}15 0%, transparent 50%),
                      radial-gradient(circle at 70% 60%, ${config.accentColor}10 0%, transparent 50%)
                    `
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Warning size={96} className="opacity-20" weight="duotone" style={{ color: config.accentColor }} />
                </div>
                <div 
                  className="absolute inset-0 opacity-20 mix-blend-overlay"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='2.5' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                  }}
                />
              </div>
            )}

            {visionCondition === 'prepared' && (
              <div className="absolute inset-0">
                <div 
                  className={cn(
                    "absolute inset-0",
                    safeModeEnabled && "blur-sm brightness-75"
                  )}
                  style={{
                    background: `
                      repeating-conic-gradient(
                        from 0deg at 50% 50%,
                        transparent 0deg,
                        ${config.accentColor}08 20deg,
                        transparent 40deg
                      ),
                      radial-gradient(circle at center, ${config.accentColor}15 0%, transparent 60%)
                    `
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Package size={96} className="text-accent/15" weight="duotone" />
                </div>
                <div 
                  className="absolute inset-4"
                  style={{
                    border: `1px solid ${config.accentColor}20`,
                    borderRadius: '0.5rem'
                  }}
                />
              </div>
            )}

            {visionCondition === 'injected' && (
              <div className="absolute inset-0">
                {cameraStream && (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
                <div 
                  className={cn(
                    "absolute inset-0",
                    safeModeEnabled && "blur-sm brightness-75"
                  )}
                  style={{
                    background: cameraStream ? 'transparent' : `
                      repeating-linear-gradient(
                        0deg,
                        transparent,
                        transparent 40px,
                        ${config.accentColor}12 40px,
                        ${config.accentColor}12 41px
                      ),
                      repeating-linear-gradient(
                        90deg,
                        transparent,
                        transparent 40px,
                        ${config.accentColor}08 40px,
                        ${config.accentColor}08 41px
                      ),
                      radial-gradient(circle at center, ${config.accentColor}15 0%, transparent 50%)
                    `
                  }}
                >
                  {!cameraStream && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <VideoCamera size={96} className="text-accent/15" weight="duotone" />
                    </div>
                  )}
                </div>
                <div className="absolute top-4 left-4 bottom-4 right-4 border-2 border-accent/10 rounded-md" />
              </div>
            )}

            {visionCondition === 'uplink' && (
              <div className="absolute inset-0">
                <div 
                  className={cn(
                    "absolute inset-0",
                    safeModeEnabled && "blur-sm brightness-75"
                  )}
                  style={{
                    background: `
                      repeating-linear-gradient(
                        135deg,
                        transparent,
                        transparent 30px,
                        ${config.accentColor}15 30px,
                        ${config.accentColor}15 31px
                      ),
                      radial-gradient(circle at 20% 30%, ${config.accentColor}20 0%, transparent 40%),
                      radial-gradient(circle at 80% 70%, ${config.accentColor}15 0%, transparent 40%)
                    `
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Lightning size={96} className="text-accent/15" weight="duotone" />
                </div>
                <div 
                  className="absolute inset-0 opacity-10"
                  style={{
                    background: `repeating-linear-gradient(
                      0deg,
                      transparent 0px,
                      ${config.accentColor} 1px,
                      transparent 2px,
                      transparent 4px
                    )`
                  }}
                />
              </div>
            )}

            {visionCondition === 'recovery' && (
              <div className="absolute inset-0">
                <div 
                  className="absolute inset-0"
                  style={{
                    background: `
                      repeating-linear-gradient(
                        45deg,
                        transparent,
                        transparent 40px,
                        ${config.accentColor}08 40px,
                        ${config.accentColor}08 41px
                      ),
                      radial-gradient(circle at 50% 50%, ${config.accentColor}10 0%, transparent 60%)
                    `
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <ArrowsClockwise size={96} className="animate-spin opacity-20" style={{ color: config.accentColor, animationDuration: '4s' }} weight="duotone" />
                </div>
                <div 
                  className="absolute inset-0 opacity-10 animate-pulse"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                  }}
                />
              </div>
            )}

            {visionCondition === 'dj-ambient' && (
              <div className="absolute inset-0">
                <div 
                  className={cn(
                    "absolute inset-0 transition-all duration-[2000ms] ease-out",
                    safeModeEnabled && "blur-sm brightness-75"
                  )}
                  style={{
                    background: extractedColors ? `
                      radial-gradient(ellipse at 15% 25%, ${extractedColors.warm}25 0%, transparent 40%),
                      radial-gradient(ellipse at 85% 20%, ${extractedColors.cool}20 0%, transparent 45%),
                      radial-gradient(ellipse at 60% 80%, ${extractedColors.light}15 0%, transparent 50%),
                      radial-gradient(ellipse at 30% 60%, ${extractedColors.vibrant}18 0%, transparent 45%),
                      radial-gradient(circle at 75% 70%, ${extractedColors.muted}12 0%, transparent 55%),
                      radial-gradient(ellipse at 40% 30%, ${extractedColors.primary}20 0%, transparent 50%),
                      radial-gradient(circle at 20% 85%, ${extractedColors.dark}15 0%, transparent 40%),
                      linear-gradient(135deg, ${extractedColors.primary}08 0%, ${extractedColors.secondary}12 30%, ${extractedColors.vibrant}10 60%, ${extractedColors.accent}08 100%)
                    ` : `
                      repeating-conic-gradient(
                        from 45deg at 50% 50%,
                        transparent 0deg,
                        ${config.accentColor}10 30deg,
                        transparent 60deg,
                        ${config.accentColor}08 90deg,
                        transparent 120deg
                      ),
                      radial-gradient(circle at 30% 30%, ${config.accentColor}12 0%, transparent 50%),
                      radial-gradient(circle at 70% 70%, ${config.accentColor}10 0%, transparent 50%)
                    `
                  }}
                />
                
                {djAudioSource === 'spotify' && spotifyTrack && spotifyStatus === 'connected' && spotifyTrack.album.images[0] ? (
                  <div className="absolute inset-0 flex items-center justify-center p-8">
                    <div className="flex items-center gap-8 max-w-4xl w-full">
                      <div className="relative flex-shrink-0 group cursor-pointer">
                        <div className="w-48 h-48 rounded-lg overflow-hidden border-2 border-accent/30 shadow-2xl transition-all duration-500 ease-out group-hover:scale-105 group-hover:border-accent/60 group-hover:shadow-[0_0_60px_rgba(var(--accent),0.4)]">
                          <img 
                            src={spotifyTrack.album.images[0].url} 
                            alt={spotifyTrack.album.name}
                            className="w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-110 group-hover:brightness-110"
                          />
                        </div>
                        <div 
                          className="absolute inset-0 rounded-lg pointer-events-none transition-all duration-[2000ms] opacity-100 group-hover:opacity-0"
                          style={{
                            boxShadow: extractedColors 
                              ? `0 0 40px ${extractedColors.warm}60, 0 0 60px ${extractedColors.primary}40, 0 0 80px ${extractedColors.vibrant}30, 0 0 100px ${extractedColors.cool}20, 0 0 120px ${extractedColors.light}15`
                              : `0 0 40px ${config.accentColor}40, 0 0 80px ${config.accentColor}20`
                          }}
                        />
                        <div 
                          className="absolute inset-0 rounded-lg pointer-events-none transition-all duration-[2000ms] opacity-0 group-hover:opacity-100"
                          style={{
                            boxShadow: extractedColors
                              ? `0 0 60px ${extractedColors.vibrant}90, 0 0 90px ${extractedColors.warm}70, 0 0 120px ${extractedColors.primary}50, 0 0 160px ${extractedColors.light}40, 0 0 200px ${extractedColors.cool}30, 0 0 240px ${extractedColors.muted}20`
                              : `0 0 60px ${config.accentColor}80, 0 0 120px ${config.accentColor}40, 0 0 160px ${config.accentColor}20`
                          }}
                        />
                        <div 
                          className="absolute inset-0 rounded-lg bg-gradient-to-tr opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                          style={{
                            background: extractedColors
                              ? `linear-gradient(135deg, ${extractedColors.dark}00 0%, ${extractedColors.warm}00 25%, ${extractedColors.vibrant}00 50%, ${extractedColors.light}15 75%, ${extractedColors.cool}20 100%)`
                              : 'linear-gradient(135deg, transparent 0%, transparent 50%, var(--accent) / 0.2 100%)'
                          }}
                        />
                        <div 
                          className="absolute -inset-1 rounded-lg opacity-0 group-hover:opacity-30 blur-xl transition-all duration-700 pointer-events-none"
                          style={{
                            background: extractedColors
                              ? `linear-gradient(135deg, ${extractedColors.vibrant}50 0%, ${extractedColors.warm}40 25%, ${extractedColors.primary}30 50%, ${extractedColors.cool}25 75%, ${extractedColors.light}20 100%)`
                              : 'linear-gradient(135deg, var(--accent) / 0.2 0%, transparent 50%, var(--primary) / 0.2 100%)'
                          }}
                        />
                      </div>
                      
                      <div className="flex-1 space-y-4 min-w-0">
                        <AudioVisualizer 
                          isActive={true} 
                          trackName={null}
                          variant="full"
                          audioSource={djAudioSource}
                          extractedColors={extractedColors}
                          isTransitioning={isTransitioning}
                        />
                        
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-foreground truncate">
                              {spotifyTrack.name}
                            </h3>
                            <p className="text-sm text-muted-foreground truncate">
                              {spotifyTrack.artists.map(a => a.name).join(', ')}
                            </p>
                            <p className="text-xs text-muted-foreground/70 truncate">
                              {spotifyTrack.album.name}
                            </p>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="h-1.5 bg-black/40 rounded-full overflow-hidden backdrop-blur-sm">
                              <div 
                                className="h-full bg-accent transition-all duration-1000 ease-linear"
                                style={{ width: `${(trackPlaybackTime / (spotifyTrack.duration_ms / 1000)) * 100}%` }}
                              />
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-mono text-accent/80">
                                {formatDuration(trackPlaybackTime * 1000)}
                              </span>
                              <span className="text-[10px] font-mono text-muted-foreground/60">
                                {formatDuration(spotifyTrack.duration_ms)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Broadcast size={96} className="text-primary/20 animate-pulse-glow" weight="duotone" />
                    </div>
                    
                    <div className="absolute inset-0 flex items-center justify-center p-8">
                      <div className="w-full max-w-2xl space-y-4">
                        <AudioVisualizer 
                          isActive={true} 
                          trackName={djAudioSource === 'spotify' && spotifyStatus === 'connected' && spotifyTrack ? formatTrackDisplay(spotifyTrack) : null}
                          variant="full"
                          audioSource={djAudioSource}
                        />
                      </div>
                    </div>
                  </>
                )}
                
                <div 
                  className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
                  style={{
                    backgroundImage: `repeating-linear-gradient(
                      0deg,
                      transparent,
                      transparent 3px,
                      ${config.accentColor} 3px,
                      ${config.accentColor} 4px
                    )`
                  }}
                />
                <div 
                  className="absolute inset-0 opacity-5"
                  style={{
                    background: `repeating-radial-gradient(
                      circle at 50% 50%,
                      transparent 0px,
                      transparent 40px,
                      ${config.accentColor}15 40px,
                      ${config.accentColor}15 41px
                    )`
                  }}
                />
              </div>
            )}

            {overlayEnabled && previewEnabled && visionCondition !== 'no-signal' && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/80 via-black/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                
                <div 
                  className="absolute top-2 left-2 w-3 h-3 rounded-sm"
                  style={{ 
                    border: `2px solid ${config.accentColor}`,
                    borderRight: 'none',
                    borderBottom: 'none'
                  }}
                />
                <div 
                  className="absolute top-2 right-2 w-3 h-3 rounded-sm"
                  style={{ 
                    border: `2px solid ${config.accentColor}`,
                    borderLeft: 'none',
                    borderBottom: 'none'
                  }}
                />
                <div 
                  className="absolute bottom-2 left-2 w-3 h-3 rounded-sm"
                  style={{ 
                    border: `2px solid ${config.accentColor}`,
                    borderRight: 'none',
                    borderTop: 'none'
                  }}
                />
                <div 
                  className="absolute bottom-2 right-2 w-3 h-3 rounded-sm"
                  style={{ 
                    border: `2px solid ${config.accentColor}`,
                    borderLeft: 'none',
                    borderTop: 'none'
                  }}
                />

                <div className="absolute top-4 left-4 flex flex-col gap-1.5">
                  <Badge 
                    variant="secondary" 
                    className="font-mono text-[10px] bg-black/80 backdrop-blur-sm px-2 py-0.5 gap-1.5"
                    style={{ 
                      borderColor: `${config.accentColor}80`,
                      color: config.accentColor
                    }}
                  >
                    <ConditionIcon size={10} weight="fill" />
                    {config.badge}
                  </Badge>
                  
                  <Badge 
                    variant="secondary" 
                    className="font-mono text-[9px] bg-black/70 border-accent/20 text-accent/80 backdrop-blur-sm px-2 py-0.5"
                  >
                    {resolution}
                  </Badge>

                  {inputProtocol === 'virtual-camera' && frameRate > 0 && (
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "font-mono text-[9px] bg-black/70 backdrop-blur-sm px-2 py-0.5",
                        frameRate >= 28 ? "border-success/30 text-success" : 
                        frameRate >= 24 ? "border-warning/30 text-warning" : 
                        "border-destructive/30 text-destructive"
                      )}
                    >
                      {Math.round(frameRate)} FPS {frameRate < 28 ? '↓' : ''}
                    </Badge>
                  )}

                  {inputProtocol === 'rtmp' && bitrate > 0 && (
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "font-mono text-[9px] bg-black/70 backdrop-blur-sm px-2 py-0.5",
                        bitrate >= 2000 ? "border-success/30 text-success" : 
                        bitrate >= 1500 ? "border-warning/30 text-warning" : 
                        "border-destructive/30 text-destructive"
                      )}
                    >
                      {Math.round(bitrate)} kbps
                    </Badge>
                  )}
                </div>

                <div className="absolute top-4 right-4 flex flex-col gap-1.5 items-end">
                  {inputProtocol === 'virtual-camera' && (
                    <Badge 
                      variant="secondary" 
                      className="font-mono text-[9px] bg-black/70 border-accent/30 text-accent backdrop-blur-sm px-2 py-0.5"
                    >
                      CALL
                    </Badge>
                  )}
                  {inputProtocol === 'rtmp' && (
                    <Badge 
                      variant="secondary" 
                      className="font-mono text-[9px] bg-black/70 border-accent/30 text-accent backdrop-blur-sm px-2 py-0.5"
                    >
                      BROADCAST
                    </Badge>
                  )}
                  
                  {audioSync !== 'muted' && (
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "font-mono text-[9px] bg-black/70 backdrop-blur-sm px-2 py-0.5",
                        audioSync === 'stable' ? "border-success/30 text-success" : 
                        "border-warning/30 text-warning"
                      )}
                    >
                      Audio {audioSync === 'stable' ? '●' : '◐'}
                    </Badge>
                  )}
                </div>

                <div className="absolute bottom-4 left-4 right-4">
                  <div className="flex items-center justify-between">
                    <Badge 
                      variant="secondary" 
                      className="font-mono text-[9px] bg-black/80 backdrop-blur-sm px-2 py-0.5"
                      style={{ 
                        borderColor: `${config.accentColor}60`,
                        color: `${config.accentColor}E0`
                      }}
                    >
                      {config.label}
                    </Badge>
                    
                    {sessionMark !== 'off' && (
                      <div 
                        className={cn(
                          "font-mono text-[9px] backdrop-blur-sm px-2 py-1 rounded-md flex items-center gap-1.5",
                          sessionMark === 'stix-default' 
                            ? "bg-primary/80 text-primary-foreground border border-primary/50"
                            : "bg-accent/80 text-accent-foreground border border-accent/50"
                        )}
                      >
                        {sessionMark === 'stix-default' ? (
                          <>
                            <span className="text-[8px]">✦</span>
                            <span>STIX MΛGIC</span>
                          </>
                        ) : (
                          <>
                            <span className="text-[8px]">●</span>
                            <span>CLIENT SESSION</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div 
                  className="absolute inset-0 pointer-events-none rounded-lg"
                  style={{
                    border: `1px solid ${config.accentColor}15`
                  }}
                />
              </div>
            )}

            <div 
              className="absolute inset-0 pointer-events-none opacity-5"
              style={{
                background: `repeating-linear-gradient(
                  0deg,
                  transparent,
                  transparent 2px,
                  ${config.accentColor} 2px,
                  ${config.accentColor} 3px
                )`
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}
