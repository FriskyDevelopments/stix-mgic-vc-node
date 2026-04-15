import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { 
  Eye, 
  EyeSlash, 
  MonitorPlay,
  Broadcast,
  Warning
} from "@phosphor-icons/react"

type PreviewState = 'idle' | 'active' | 'degraded' | 'no-signal'
type InputProtocol = 'virtual-camera' | 'rtmp' | 'local' | 'relay' | 'clipsflow'

interface PreviewPanelProps {
  sessionStatus: 'standby' | 'active' | 'connecting' | 'error'
  inputProtocol: InputProtocol
  signalQuality: number
  frameRate: number
  bitrate: number
  audioSync: 'stable' | 'drift' | 'muted'
  resolution: string
}

export function PreviewPanel({
  sessionStatus,
  inputProtocol,
  signalQuality,
  frameRate,
  bitrate,
  audioSync,
  resolution
}: PreviewPanelProps) {
  const [previewEnabled, setPreviewEnabled] = useState(true)
  const [overlayEnabled, setOverlayEnabled] = useState(true)
  const [safeModeEnabled, setSafeModeEnabled] = useState(false)
  const [previewState, setPreviewState] = useState<PreviewState>('idle')

  useEffect(() => {
    if (sessionStatus === 'standby') {
      setPreviewState('idle')
    } else if (sessionStatus === 'active') {
      if (signalQuality < 30) {
        setPreviewState('no-signal')
      } else if (signalQuality < 60) {
        setPreviewState('degraded')
      } else {
        setPreviewState('active')
      }
    } else if (sessionStatus === 'connecting') {
      setPreviewState('active')
    }
  }, [sessionStatus, signalQuality])

  const getPreviewLabel = () => {
    if (inputProtocol === 'clipsflow') return 'ClipsFlow Render'
    if (inputProtocol === 'virtual-camera') return 'OBS Feed'
    if (inputProtocol === 'rtmp') return 'RTMP Input'
    if (inputProtocol === 'local') return 'Local Source'
    if (inputProtocol === 'relay') return 'Relay Input'
    return 'Active Source'
  }

  const getStateLabel = () => {
    switch (previewState) {
      case 'idle':
        return 'No active feed'
      case 'active':
        return 'Preview Active'
      case 'degraded':
        return 'Preview Degraded — maintaining presence'
      case 'no-signal':
        return 'Signal Lost — attempting recovery'
    }
  }

  const getSessionMode = () => {
    if (inputProtocol === 'virtual-camera') return 'CALL'
    if (inputProtocol === 'rtmp') return 'BROADCAST'
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">LIVE PREVIEW</h3>
          <p className="text-sm text-muted-foreground">{getPreviewLabel()}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="preview-toggle"
              checked={previewEnabled}
              onCheckedChange={setPreviewEnabled}
            />
            <Label htmlFor="preview-toggle" className="text-xs cursor-pointer">
              Preview {previewEnabled ? 'On' : 'Off'}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="overlay-toggle"
              checked={overlayEnabled}
              onCheckedChange={setOverlayEnabled}
              disabled={!previewEnabled}
            />
            <Label htmlFor="overlay-toggle" className="text-xs cursor-pointer">
              Overlay HUD
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="safemode-toggle"
              checked={safeModeEnabled}
              onCheckedChange={setSafeModeEnabled}
              disabled={!previewEnabled}
            />
            <Label htmlFor="safemode-toggle" className="text-xs cursor-pointer">
              Safe Preview
            </Label>
          </div>
        </div>
      </div>

      <div 
        className={cn(
          "relative aspect-video w-full rounded-lg overflow-hidden transition-all duration-500",
          "bg-black border-2",
          previewState === 'active' && "border-accent/50 shadow-accent/20 shadow-lg",
          previewState === 'degraded' && "border-warning/50 shadow-warning/20 shadow-lg",
          previewState === 'no-signal' && "border-destructive/50 shadow-destructive/20 shadow-lg",
          previewState === 'idle' && "border-border/30"
        )}
      >
        {!previewEnabled ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90">
            <EyeSlash size={48} className="text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Preview Disabled</p>
          </div>
        ) : (
          <>
            {previewState === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
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
                <MonitorPlay size={64} className="text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground/70 font-mono">No active feed</p>
              </div>
            )}

            {previewState === 'active' && (
              <div className="absolute inset-0">
                <div 
                  className={cn(
                    "absolute inset-0 bg-gradient-to-br from-accent/10 via-primary/5 to-background/20",
                    safeModeEnabled && "blur-sm brightness-75"
                  )}
                  style={{
                    backgroundImage: `
                      repeating-linear-gradient(
                        45deg,
                        transparent,
                        transparent 50px,
                        oklch(0.55 0.18 250 / 0.05) 50px,
                        oklch(0.55 0.18 250 / 0.05) 100px
                      ),
                      radial-gradient(circle at 30% 40%, oklch(0.55 0.18 250 / 0.15) 0%, transparent 50%),
                      radial-gradient(circle at 70% 60%, oklch(0.75 0.14 195 / 0.1) 0%, transparent 50%)
                    `
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Broadcast size={96} className="text-accent/20" weight="duotone" />
                </div>
                <div 
                  className="absolute inset-0 opacity-5 mix-blend-overlay animate-pulse"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                  }}
                />
              </div>
            )}

            {previewState === 'degraded' && (
              <div className="absolute inset-0">
                <div 
                  className="absolute inset-0 bg-gradient-to-br from-warning/10 via-primary/5 to-background/20 blur-[2px] brightness-75"
                  style={{
                    backgroundImage: `
                      repeating-linear-gradient(
                        45deg,
                        transparent,
                        transparent 50px,
                        oklch(0.55 0.18 250 / 0.05) 50px,
                        oklch(0.55 0.18 250 / 0.05) 100px
                      ),
                      radial-gradient(circle at 30% 40%, oklch(0.55 0.18 250 / 0.15) 0%, transparent 50%),
                      radial-gradient(circle at 70% 60%, oklch(0.75 0.14 195 / 0.1) 0%, transparent 50%)
                    `
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Warning size={96} className="text-warning/30" weight="duotone" />
                </div>
                <div 
                  className="absolute inset-0 opacity-30 mix-blend-overlay"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='2.5' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                  }}
                />
              </div>
            )}

            {previewState === 'no-signal' && (
              <div className="absolute inset-0 bg-black">
                <div 
                  className="absolute inset-0 opacity-20"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='5' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                    animation: 'pulse 0.5s ease-in-out infinite'
                  }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <Warning size={64} className="text-destructive animate-pulse" weight="fill" />
                  <p className="text-sm text-destructive font-mono">NO SIGNAL</p>
                </div>
              </div>
            )}

            {overlayEnabled && previewEnabled && previewState !== 'idle' && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/80 via-black/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                
                <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                  <Badge 
                    variant="secondary" 
                    className="font-mono text-[10px] bg-black/70 border-accent/30 text-accent backdrop-blur-sm"
                  >
                    {resolution}
                  </Badge>
                  
                  {inputProtocol === 'virtual-camera' && frameRate > 0 && (
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "font-mono text-[10px] bg-black/70 backdrop-blur-sm",
                        frameRate >= 28 ? "border-success/30 text-success" : 
                        frameRate >= 24 ? "border-warning/30 text-warning" : 
                        "border-destructive/30 text-destructive"
                      )}
                    >
                      {Math.round(frameRate)} {frameRate < 28 ? '↓' : ''} FPS
                    </Badge>
                  )}

                  {inputProtocol === 'rtmp' && bitrate > 0 && (
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "font-mono text-[10px] bg-black/70 backdrop-blur-sm",
                        bitrate >= 2000 ? "border-success/30 text-success" : 
                        bitrate >= 1500 ? "border-warning/30 text-warning" : 
                        "border-destructive/30 text-destructive"
                      )}
                    >
                      {Math.round(bitrate)} kbps
                    </Badge>
                  )}

                  <Badge 
                    variant="secondary" 
                    className={cn(
                      "font-mono text-[10px] bg-black/70 backdrop-blur-sm",
                      audioSync === 'stable' ? "border-success/30 text-success" : 
                      audioSync === 'drift' ? "border-warning/30 text-warning" : 
                      "border-muted/30 text-muted-foreground"
                    )}
                  >
                    Audio: {audioSync === 'stable' ? 'Live' : audioSync === 'drift' ? 'Drift' : 'Muted'}
                  </Badge>
                </div>

                <div className="absolute top-3 right-3">
                  {getSessionMode() && (
                    <Badge 
                      variant="secondary" 
                      className="font-mono text-[10px] bg-black/70 border-accent/30 text-accent backdrop-blur-sm"
                    >
                      {getSessionMode()}
                    </Badge>
                  )}
                </div>

                <div className="absolute bottom-3 left-3">
                  <Badge 
                    variant="secondary" 
                    className={cn(
                      "font-mono text-[10px] bg-black/70 backdrop-blur-sm",
                      previewState === 'active' && "border-accent/30 text-accent",
                      previewState === 'degraded' && "border-warning/30 text-warning",
                      previewState === 'no-signal' && "border-destructive/30 text-destructive"
                    )}
                  >
                    {getStateLabel()}
                  </Badge>
                </div>

                <div className="absolute inset-0 border border-white/5 pointer-events-none rounded-lg" />
              </div>
            )}

            <div className="absolute inset-0 pointer-events-none">
              <div 
                className={cn(
                  "absolute inset-0 opacity-0 transition-opacity duration-1000",
                  previewState === 'active' && "opacity-10"
                )}
                style={{
                  background: `repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 2px,
                    oklch(0.75 0.14 195 / 0.1) 2px,
                    oklch(0.75 0.14 195 / 0.1) 4px
                  )`
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
