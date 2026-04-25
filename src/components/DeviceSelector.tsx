import { useState, useEffect } from "react"
import { useKV } from "@github/spark/hooks"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Camera, Microphone } from "@phosphor-icons/react"
import { Badge } from "@/components/ui/badge"

interface DeviceInfo {
  deviceId: string
  label: string
  kind: MediaDeviceKind
}

interface DeviceSelectorProps {
  onVideoDeviceChange?: (deviceId: string) => void
  onAudioDeviceChange?: (deviceId: string) => void
  disabled?: boolean
}

export function DeviceSelector({ 
  onVideoDeviceChange, 
  onAudioDeviceChange,
  disabled = false 
}: DeviceSelectorProps) {
  const [videoDevices, setVideoDevices] = useState<DeviceInfo[]>([])
  const [audioDevices, setAudioDevices] = useState<DeviceInfo[]>([])
  const [selectedVideo, setSelectedVideo] = useKV<string | undefined>("selected-video-device", undefined)
  const [selectedAudio, setSelectedAudio] = useKV<string | undefined>("selected-audio-device", undefined)
  const [hasPermission, setHasPermission] = useState(false)

  const enumerateDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      
      const videos: DeviceInfo[] = []
      const audios: DeviceInfo[] = []

      devices.forEach((device) => {
        if (device.kind === "videoinput") {
          videos.push({
            deviceId: device.deviceId,
            label: device.label || `Camera ${videos.length + 1}`,
            kind: device.kind
          })
        } else if (device.kind === "audioinput") {
          audios.push({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${audios.length + 1}`,
            kind: device.kind
          })
        }
      })

      setVideoDevices(videos)
      setAudioDevices(audios)
      
      if (videos.length > 0 && videos[0].label !== `Camera 1`) {
        setHasPermission(true)
      }
    } catch (error) {
      console.error("Failed to enumerate devices:", error)
    }
  }

  useEffect(() => {
    enumerateDevices()

    const handleDeviceChange = () => {
      enumerateDevices()
    }

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange)

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange)
    }
  }, [])

  const handleVideoChange = (deviceId: string) => {
    setSelectedVideo(deviceId)
    onVideoDeviceChange?.(deviceId)
  }

  const handleAudioChange = (deviceId: string) => {
    setSelectedAudio(deviceId)
    onAudioDeviceChange?.(deviceId)
  }

  const hasOBSCamera = videoDevices.some(device => 
    device.label.toLowerCase().includes('obs') || 
    device.label.toLowerCase().includes('virtual')
  )

  return (
    <div className="space-y-4">
      {!hasPermission && videoDevices.length > 0 && (
        <div className="glass-panel p-3 rounded-lg bg-warning/5 border border-warning/20">
          <p className="text-xs text-warning">
            Device names will appear after granting camera permission
          </p>
        </div>
      )}

      {hasOBSCamera && (
        <Badge 
          variant="outline" 
          className="gap-2 border-accent text-accent font-mono text-xs"
        >
          <Camera size={14} weight="fill" />
          OBS Virtual Camera Detected
        </Badge>
      )}

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="video-device" className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Camera size={14} />
            Video Device
          </Label>
          <Select
            value={selectedVideo || undefined}
            onValueChange={handleVideoChange}
            disabled={disabled || videoDevices.length === 0}
          >
            <SelectTrigger 
              id="video-device"
              className="w-full font-mono text-xs"
            >
              <SelectValue placeholder={videoDevices.length === 0 ? "No cameras available" : "Select camera"} />
            </SelectTrigger>
            <SelectContent>
              {videoDevices.map((device) => (
                <SelectItem 
                  key={device.deviceId} 
                  value={device.deviceId}
                  className="font-mono text-xs"
                >
                  {device.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="audio-device" className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Microphone size={14} />
            Audio Device
          </Label>
          <Select
            value={selectedAudio || undefined}
            onValueChange={handleAudioChange}
            disabled={disabled || audioDevices.length === 0}
          >
            <SelectTrigger 
              id="audio-device"
              className="w-full font-mono text-xs"
            >
              <SelectValue placeholder={audioDevices.length === 0 ? "No microphones available" : "Select microphone"} />
            </SelectTrigger>
            <SelectContent>
              {audioDevices.map((device) => (
                <SelectItem 
                  key={device.deviceId} 
                  value={device.deviceId}
                  className="font-mono text-xs"
                >
                  {device.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        <p>
          Live device switching • No page reload required
        </p>
      </div>
    </div>
  )
}
