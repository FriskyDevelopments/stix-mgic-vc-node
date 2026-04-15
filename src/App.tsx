import { useState, useEffect } from "react"
import { useKV } from "@github/spark/hooks"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { GlassCard } from "@/components/GlassCard"
import { StatusIndicator } from "@/components/StatusIndicator"
import { MetricDisplay } from "@/components/MetricDisplay"
import { LogEntry } from "@/components/LogEntry"
import { PreviewPanel } from "@/components/PreviewPanel"
import { BrandControl } from "@/components/BrandControl"
import { 
  Broadcast, 
  Lightning, 
  PlayCircle, 
  Stop,
  ArrowsClockwise,
  Warning,
  WaveformSlash,
  Database,
  TreeStructure,
  Terminal,
  Pulse,
  WifiHigh,
  Timer,
  CheckCircle,
  VideoCamera,
  Webcam,
  Microphone,
  SpeakerHigh,
  Copy,
  ArrowsDownUp,
  FileVideo,
  GitBranch,
  Eye,
  Key,
  CloudArrowUp,
  Package,
  DiscoBall,
  MusicNote
} from "@phosphor-icons/react"
import { toast } from "sonner"

type SessionStatus = 'standby' | 'active' | 'connecting' | 'error' | 'dj-mode'
type InputProtocol = 'virtual-camera' | 'rtmp' | 'local' | 'relay' | 'clipsflow' | 'dj-mode'
type SessionMode = 'call' | 'broadcast' | 'dj' | null
type SessionMark = 'stix-default' | 'client-sticker' | 'off'
type OperatorTier = 'free' | 'premium'

interface LogEntryData {
  id: string
  timestamp: string
  severity: 'info' | 'success' | 'warning' | 'error'
  type: string
  message: string
}

interface ProtocolConfig {
  id: InputProtocol
  label: string
  description: string
  icon: typeof Database
  mode: SessionMode
}

function App() {
  const [sessionStatus, setSessionStatus] = useKV<SessionStatus>("session-status", "standby")
  const [inputProtocol, setInputProtocol] = useKV<InputProtocol>("input-protocol", "dj-mode")
  const [sessionMark, setSessionMark] = useKV<SessionMark>("session-mark", "stix-default")
  const [logs, setLogs] = useKV<LogEntryData[]>("diagnostic-logs", [])
  const [operatorTier] = useState<OperatorTier>('premium')
  const [operatorTimeRemaining, setOperatorTimeRemaining] = useState(120)
  const [streamKey] = useState("sk_live_" + Math.random().toString(36).substring(2, 15))
  const [isTransitioning, setIsTransitioning] = useState(false)
  
  const [signalQuality, setSignalQuality] = useState(0)
  const [latency, setLatency] = useState(0)
  const [frameRate, setFrameRate] = useState(0)
  const [bitrate, setBitrate] = useState(0)
  const [packetLoss, setPacketLoss] = useState(0)
  const [audioSync, setAudioSync] = useState<'stable' | 'drift' | 'muted'>('stable')
  const [resolution, setResolution] = useState('720p')

  const protocols: ProtocolConfig[] = [
    { 
      id: 'dj-mode', 
      label: 'DJ Mode', 
      description: 'Autonomous session - loop + audio (no-cost entry)', 
      icon: Broadcast, 
      mode: 'dj' 
    },
    { 
      id: 'clipsflow', 
      label: 'ClipsFlow File', 
      description: 'Prepared media intake via ClipsFlow pipeline', 
      icon: Package, 
      mode: null 
    },
    { 
      id: 'virtual-camera', 
      label: 'Virtual Camera', 
      description: 'OBS Virtual Camera (Call Mode)', 
      icon: Webcam, 
      mode: 'call' 
    },
    { 
      id: 'rtmp', 
      label: 'RTMP Stream', 
      description: 'RTMP Broadcast Protocol', 
      icon: Lightning, 
      mode: 'broadcast' 
    },
    { 
      id: 'local', 
      label: 'Local Media', 
      description: 'File-based audio source', 
      icon: Database, 
      mode: null 
    },
    { 
      id: 'relay', 
      label: 'Relay Input', 
      description: 'External stream relay', 
      icon: ArrowsDownUp, 
      mode: null 
    }
  ]

  const currentProtocol = protocols.find(p => p.id === inputProtocol)
  const sessionMode = currentProtocol?.mode

  const addLog = (severity: LogEntryData['severity'], type: string, message: string) => {
    const newLog: LogEntryData = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      severity,
      type,
      message
    }
    setLogs((currentLogs) => [newLog, ...(currentLogs || [])].slice(0, 100))
  }

  const handleRunPreflight = () => {
    if (inputProtocol === 'dj-mode') {
      handleStartDJMode()
      return
    }

    setSessionStatus('connecting')
    addLog('info', 'TEST', 'Preflight initiated')
    
    if (operatorTier === 'premium' && operatorTimeRemaining === 0) {
      setOperatorTimeRemaining(120)
    }
    
    let detectedMode = 'PREPARED'
    if (inputProtocol === 'virtual-camera') {
      detectedMode = 'CALL'
    } else if (inputProtocol === 'rtmp') {
      detectedMode = 'BROADCAST'
    }
    
    addLog('info', 'ROUTE', `Mode detected: ${detectedMode}`)
    addLog('info', 'SOURCE', 'Test input bound')
    
    if (sessionMark === 'stix-default') {
      addLog('info', 'BRAND', 'STIX MΛGIC default mark loaded')
    } else if (sessionMark === 'client-sticker') {
      addLog('info', 'BRAND', 'Client session sticker received')
      addLog('success', 'BRAND', 'Branded sticker asset prepared')
    }
    
    if (inputProtocol === 'clipsflow') {
      addLog('info', 'INTAKE', 'ClipsFlow asset received')
      addLog('info', 'PREP', 'Compression profile applied')
      addLog('info', 'SESSION', 'Linking prepared media to VC session...')
      setResolution('Adaptive')
    } else if (inputProtocol === 'virtual-camera') {
      addLog('info', 'SOURCE', 'OBS Virtual Camera detected')
      addLog('info', 'SESSION', 'Initializing camera injection...')
      setResolution('720p')
    } else if (inputProtocol === 'rtmp') {
      addLog('info', 'UPLINK', 'RTMP handshake initiated')
      addLog('info', 'SESSION', 'Binding to Telegram ingest...')
      setResolution('1080p')
    } else {
      addLog('info', 'SESSION', 'Initializing VC uplink...')
      setResolution('480p')
    }
    
    setTimeout(() => {
      setSessionStatus('active')
      setSignalQuality(92)
      setLatency(45)
      setAudioSync('stable')
      
      if (operatorTier === 'premium') {
        addLog('success', 'SESSION', `Operator session active — ${Math.floor(operatorTimeRemaining / 60)}:${String(operatorTimeRemaining % 60).padStart(2, '0')} available`)
      }
      
      addLog('success', 'PREVIEW', 'Preflight feed active')
      
      if (sessionMark !== 'off') {
        addLog('success', 'BRAND', 'Overlay applied')
        if (sessionMark === 'client-sticker') {
          addLog('success', 'SESSION', 'Premium branded mark active')
        }
      }
      
      if (inputProtocol === 'clipsflow') {
        addLog('success', 'ROUTING', 'Prepared media linked to VC session')
        addLog('success', 'LOAD', 'Direct ingest avoided')
        addLog('success', 'SESSION', 'Injection payload ready')
        addLog('info', 'PREVIEW', 'Optimized preview feed active')
        toast.success('Preflight active — ClipsFlow media routed')
      } else if (inputProtocol === 'virtual-camera') {
        setFrameRate(30)
        addLog('success', 'SESSION', 'Injecting feed into Telegram VC')
        addLog('success', 'PREVIEW', 'Frame sync stable')
        addLog('info', 'AUDIO', 'External audio routing active')
        addLog('success', 'SYNC', 'Frame alignment stable')
        toast.success('Preflight active — Camera feed ready')
      } else if (inputProtocol === 'rtmp') {
        setBitrate(2500)
        setPacketLoss(0.2)
        addLog('success', 'SESSION', 'Bound to Telegram ingest')
        addLog('success', 'PREVIEW', 'Frame sync stable')
        addLog('success', 'STREAM', 'Bitrate stabilized at 2.5 Mbps')
        addLog('success', 'HEALTH', 'Packet loss within threshold')
        toast.success('Preflight active — RTMP stream ready')
      } else {
        addLog('success', 'SESSION', 'Connected to voice chat')
        addLog('success', 'PREVIEW', 'Feed active')
        addLog('info', 'SOURCE', `Activated ${inputProtocol} media source`)
        toast.success('Preflight active — VC session ready')
      }
    }, 1500)
  }

  const handleStartDJMode = () => {
    setSessionStatus('connecting')
    addLog('info', 'DJ', 'DJ Mode initiating')
    addLog('info', 'SESSION', 'Autonomous session mode selected')
    
    if (sessionMark === 'stix-default') {
      addLog('info', 'BRAND', 'STIX MΛGIC default mark loaded')
    } else if (sessionMark === 'client-sticker') {
      addLog('info', 'BRAND', 'Client session sticker received')
    }
    
    setTimeout(() => {
      setSessionStatus('dj-mode')
      setSignalQuality(88)
      setLatency(35)
      setAudioSync('stable')
      setResolution('720p')
      
      addLog('success', 'DJ', 'DJ Mode active')
      addLog('success', 'LOOP', 'Visual cycle running')
      addLog('success', 'AUDIO', 'Ambient track active')
      addLog('info', 'SESSION', 'Autonomous mode live')
      
      if (sessionMark !== 'off') {
        addLog('success', 'BRAND', 'Session mark applied')
      }
      
      toast.success('DJ Mode active — autonomous session running')
    }, 1200)
  }

  const handleStopDJMode = () => {
    setSessionStatus('standby')
    setSignalQuality(0)
    setLatency(0)
    setAudioSync('muted')
    
    addLog('info', 'DJ', 'DJ Mode terminated')
    addLog('info', 'SESSION', 'Autonomous session ended')
    toast('DJ Mode stopped')
  }

  const handleUpgradeToOperator = () => {
    if (operatorTier === 'free') {
      toast('Upgrade to premium for live operator sessions')
      return
    }
    
    if (sessionStatus === 'dj-mode') {
      setSessionStatus('standby')
      addLog('info', 'SESSION', 'Switching from DJ Mode to operator session')
      setInputProtocol('clipsflow')
      toast.success('Ready for operator session')
    }
  }

  const handleExtendTime = () => {
    const additionalTime = 60
    setOperatorTimeRemaining((prev) => prev + additionalTime)
    addLog('success', 'SESSION', `Operator session extended — ${additionalTime}s added`)
    toast.success(`Session extended by ${additionalTime} seconds`)
  }

  const handleOperatorTimeExpired = () => {
    if (sessionStatus === 'active' && operatorTimeRemaining === 0 && !isTransitioning) {
      setIsTransitioning(true)
      setSessionStatus('connecting')
      addLog('info', 'SESSION', 'Operator window completed')
      addLog('info', 'FALLBACK', 'Initiating seamless transition to DJ Mode')
      addLog('info', 'SESSION', 'Session continuity preserved')
      
      toast('Transitioning to DJ Mode — session remains active', {
        duration: 3000,
      })
      
      setTimeout(() => {
        setInputProtocol('dj-mode')
        addLog('info', 'ROUTING', 'Input switched to autonomous loop')
        addLog('success', 'DJ', 'DJ Mode active (fallback)')
        addLog('success', 'LOOP', 'Visual cycle running')
        addLog('success', 'AUDIO', 'Ambient track active')
        addLog('success', 'SESSION', 'Autonomous mode maintaining presence')
        
        setTimeout(() => {
          setSessionStatus('dj-mode')
          setSignalQuality(88)
          setLatency(35)
          setAudioSync('stable')
          setResolution('720p')
          setFrameRate(0)
          setBitrate(0)
          setPacketLoss(0)
          setIsTransitioning(false)
          
          toast.success('DJ Mode active — session continuing autonomously')
        }, 800)
      }, 1200)
    }
  }

  const handleStopPreflight = () => {
    setSessionStatus('standby')
    setSignalQuality(0)
    setLatency(0)
    setFrameRate(0)
    setBitrate(0)
    setPacketLoss(0)
    setAudioSync('muted')
    
    addLog('info', 'TEST', 'Preflight stopped')
    
    if (inputProtocol === 'rtmp') {
      addLog('info', 'UPLINK', 'RTMP stream disconnected')
    } else {
      addLog('info', 'SESSION', 'Disconnected from voice chat')
    }
    toast('Preflight terminated')
  }

  const handleSwitchProtocol = (protocol: InputProtocol) => {
    if (sessionStatus === 'active') {
      toast.error('Cannot switch protocol while session is active')
      return
    }
    
    setInputProtocol(protocol)
    const protocolConfig = protocols.find(p => p.id === protocol)
    addLog('info', 'PROTOCOL', `Switched to ${protocolConfig?.label || protocol}`)
    toast.success(`Protocol: ${protocolConfig?.label || protocol}`)
  }

  const handleSessionMarkChange = (mark: SessionMark) => {
    setSessionMark(mark)
    
    if (mark === 'stix-default') {
      addLog('info', 'BRAND', 'STIX MΛGIC default mark selected')
    } else if (mark === 'client-sticker') {
      addLog('info', 'BRAND', 'Client session sticker selected')
      addLog('info', 'BRAND', 'Premium sticker mark ready')
    } else {
      addLog('info', 'BRAND', 'Session branding disabled')
    }
    
    const markLabels = {
      'stix-default': 'STIX MΛGIC Default',
      'client-sticker': 'Client Sticker Mark',
      'off': 'Branding Off'
    }
    toast.success(`Session Mark: ${markLabels[mark]}`)
  }

  const handleStabilize = () => {
    if (inputProtocol === 'rtmp') {
      addLog('info', 'UPLINK', 'Optimizing RTMP connection...')
    } else {
      addLog('info', 'SIGNAL', 'Initiating signal stabilization...')
    }
    
    setTimeout(() => {
      setSignalQuality(98)
      setLatency(32)
      setPacketLoss(0.1)
      
      if (inputProtocol === 'rtmp') {
        addLog('success', 'UPLINK', 'Stream parameters optimized')
      } else {
        addLog('success', 'SIGNAL', 'Signal optimized')
      }
      toast.success('Signal stabilized')
    }, 800)
  }

  const handleGoLive = () => {
    addLog('success', 'LIVE', 'Session transitioned to live')
    toast.success('Now live')
  }

  const handleEmergencyStop = () => {
    setSessionStatus('standby')
    setSignalQuality(0)
    setLatency(0)
    setFrameRate(0)
    setBitrate(0)
    setPacketLoss(0)
    setAudioSync('muted')
    addLog('warning', 'EMERGENCY', 'Emergency stop activated')
    toast.error('Emergency stop executed')
  }

  const handleCopyStreamKey = () => {
    navigator.clipboard.writeText(streamKey)
    toast.success('Stream key copied to clipboard')
  }

  const handleResetKey = () => {
    addLog('warning', 'SECURITY', 'Stream key reset requested')
    toast('Stream key would be regenerated (demo mode)')
  }

  useEffect(() => {
    if (sessionStatus === 'active' && operatorTier === 'premium' && operatorTimeRemaining > 0) {
      const countdownInterval = setInterval(() => {
        setOperatorTimeRemaining((prev) => {
          const newTime = Math.max(0, prev - 1)
          
          if (newTime === 60) {
            addLog('info', 'SESSION', 'Operator window: 1 minute remaining')
            toast('1 minute remaining in operator session', {
              duration: 4000,
            })
          } else if (newTime === 30) {
            addLog('warning', 'SESSION', 'Operator window: 30 seconds remaining')
            toast('30 seconds remaining — DJ Mode fallback standby', {
              duration: 4000,
            })
          } else if (newTime === 10) {
            addLog('warning', 'SESSION', 'Operator window: 10 seconds remaining')
            toast('10 seconds remaining', {
              duration: 3000,
            })
          } else if (newTime === 0) {
            handleOperatorTimeExpired()
          }
          
          return newTime
        })
      }, 1000)
      return () => clearInterval(countdownInterval)
    }
  }, [sessionStatus, operatorTier, operatorTimeRemaining])

  useEffect(() => {
    if (sessionStatus === 'active' || sessionStatus === 'dj-mode') {
      const interval = setInterval(() => {
        setSignalQuality((prev) => {
          const baseVariation = sessionStatus === 'dj-mode' ? 2 : 3
          const newQuality = Math.min(100, Math.max(75, prev + (Math.random() - 0.5) * baseVariation))
          
          if (newQuality < 60 && prev >= 60 && sessionStatus === 'active') {
            addLog('warning', 'PREVIEW', 'Degraded mode active')
          } else if (newQuality < 30 && prev >= 30 && sessionStatus === 'active') {
            addLog('error', 'PREVIEW', 'Signal loss detected')
          }
          
          return newQuality
        })
        setLatency((prev) => Math.max(25, prev + (Math.random() - 0.5) * 5))
        
        if (inputProtocol === 'virtual-camera') {
          setFrameRate((prev) => Math.min(30, Math.max(24, prev + (Math.random() - 0.5) * 2)))
        }
        
        if (inputProtocol === 'rtmp') {
          setBitrate((prev) => Math.min(3000, Math.max(2000, prev + (Math.random() - 0.5) * 100)))
          setPacketLoss((prev) => Math.min(2, Math.max(0, prev + (Math.random() - 0.5) * 0.3)))
        }
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [sessionStatus, inputProtocol])

  const getStatusIndicator = (): { status: 'active' | 'standby' | 'warning' | 'error' | 'connecting', label: string, pulse: boolean } => {
    switch (sessionStatus) {
      case 'active':
        return { status: 'active', label: 'ACTIVE', pulse: true }
      case 'dj-mode':
        return { status: 'active', label: 'DJ MODE ACTIVE', pulse: true }
      case 'connecting':
        return { status: 'connecting', label: 'CONNECTING', pulse: true }
      case 'error':
        return { status: 'error', label: 'ERROR', pulse: true }
      default:
        return { status: 'standby', label: 'STANDBY', pulse: false }
    }
  }

  const statusIndicator = getStatusIndicator()

  const getModeLabel = () => {
    if (!sessionMode) return null
    if (sessionMode === 'dj') return 'AUTONOMOUS SESSION'
    return sessionMode === 'call' ? 'CALL INJECTION' : 'BROADCAST UPLINK'
  }

  const getPreflightLabel = () => {
    if (inputProtocol === 'dj-mode') return 'DJ MODE'
    if (inputProtocol === 'virtual-camera') return 'CALL'
    if (inputProtocol === 'rtmp') return 'BROADCAST'
    if (inputProtocol === 'clipsflow') return 'PREPARED'
    return 'TEST'
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 space-y-16">
        
        <header className="text-center space-y-4">
          <h1 className="font-mono font-bold text-5xl md:text-6xl tracking-tight">
            STIX M<span className="text-accent">Λ</span>GIC
          </h1>
          <div className="h-px w-32 mx-auto bg-gradient-to-r from-transparent via-accent to-transparent" />
          <p className="text-xl text-muted-foreground">
            OBS ↔ Telegram VC integration control node
          </p>
        </header>

        <GlassCard title="Input Protocol" description="Media routing configuration">
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {protocols.map((protocol) => {
                const Icon = protocol.icon
                const isActive = inputProtocol === protocol.id
                const isDisabled = sessionStatus === 'active'
                
                return (
                  <button
                    key={protocol.id}
                    onClick={() => handleSwitchProtocol(protocol.id)}
                    disabled={isDisabled}
                    className={`
                      p-4 rounded-lg border-2 transition-all duration-200 text-left
                      ${isActive ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'}
                      ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Icon size={28} className={isActive ? 'text-accent' : 'text-muted-foreground'} weight={isActive ? 'fill' : 'regular'} />
                      <div className="space-y-1">
                        <div className="font-medium text-sm">{protocol.label}</div>
                        <p className="text-[10px] text-muted-foreground leading-tight">{protocol.description}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <PreviewPanel
            sessionStatus={sessionStatus || "standby"}
            inputProtocol={inputProtocol || "virtual-camera"}
            signalQuality={signalQuality}
            frameRate={frameRate}
            bitrate={bitrate}
            audioSync={audioSync}
            resolution={resolution}
            sessionMark={sessionMark || "stix-default"}
          />
        </GlassCard>

        <GlassCard title="Session Branding" description="Branded overlay via STIX MΛGIC sticker assets">
          <BrandControl
            sessionMark={sessionMark || "stix-default"}
            onSessionMarkChange={handleSessionMarkChange}
            sessionActive={sessionStatus === 'active'}
          />
        </GlassCard>

        <GlassCard 
          title="Session Status" 
          className={sessionStatus === 'active' ? 'border-accent/50' : ''}
          glowColor={sessionStatus === 'active' ? 'shadow-accent/20 shadow-lg' : ''}
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <StatusIndicator {...statusIndicator} />
                {sessionStatus === 'active' && (
                  <Badge variant="outline" className="gap-2 border-warning text-warning font-mono animate-pulse-glow">
                    <Lightning size={14} weight="fill" />
                    PREFLIGHT ACTIVE
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                {sessionStatus === 'active' && operatorTier === 'premium' && operatorTimeRemaining > 0 && (
                  <Badge 
                    variant="outline" 
                    className={`gap-2 font-mono ${
                      operatorTimeRemaining <= 30 
                        ? 'border-warning text-warning animate-pulse-glow' 
                        : 'border-primary text-primary'
                    }`}
                  >
                    <Timer size={14} weight="fill" />
                    {Math.floor(operatorTimeRemaining / 60)}:{String(operatorTimeRemaining % 60).padStart(2, '0')}
                  </Badge>
                )}
                {sessionMode && sessionStatus === 'active' && (
                  <Badge variant="outline" className="gap-2 border-accent text-accent font-mono">
                    <VideoCamera size={14} weight="fill" />
                    MODE: {getModeLabel()}
                  </Badge>
                )}
                <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
                  <Broadcast size={16} />
                  <span>VC NODE</span>
                </div>
              </div>
            </div>

            <Separator />

            {inputProtocol === 'virtual-camera' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <MetricDisplay
                    icon={<Webcam size={20} />}
                    label="Camera Feed"
                    value={sessionStatus === 'active' ? 'ACTIVE' : 'OFFLINE'}
                    status={sessionStatus === 'active' ? 'good' : 'neutral'}
                  />
                  <MetricDisplay
                    icon={<Pulse size={20} />}
                    label="Frame Rate"
                    value={sessionStatus === 'active' ? `${Math.round(frameRate)} fps` : '--'}
                    status={frameRate >= 28 ? 'good' : frameRate >= 24 ? 'warning' : 'error'}
                  />
                  <MetricDisplay
                    icon={<SpeakerHigh size={20} />}
                    label="Audio Sync"
                    value={sessionStatus === 'active' ? audioSync.toUpperCase() : '--'}
                    status={audioSync === 'stable' ? 'good' : audioSync === 'drift' ? 'warning' : 'neutral'}
                  />
                  <MetricDisplay
                    icon={<Timer size={20} />}
                    label="Latency"
                    value={sessionStatus === 'active' ? `${Math.round(latency)}ms` : '--'}
                    status={latency < 50 ? 'good' : latency < 100 ? 'warning' : 'error'}
                  />
                </div>

                {sessionStatus === 'active' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Signal Integrity</span>
                      <span>{signalQuality >= 90 ? 'HIGH' : signalQuality >= 70 ? 'MEDIUM' : 'LOW'}</span>
                    </div>
                    <Progress value={signalQuality} className="h-1" />
                  </div>
                )}
              </>
            )}

            {inputProtocol === 'rtmp' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <MetricDisplay
                    icon={<Lightning size={20} />}
                    label="Uplink State"
                    value={sessionStatus === 'active' ? 'CONNECTED' : sessionStatus === 'connecting' ? 'HANDSHAKE' : 'OFFLINE'}
                    status={sessionStatus === 'active' ? 'good' : sessionStatus === 'connecting' ? 'warning' : 'neutral'}
                  />
                  <MetricDisplay
                    icon={<ArrowsDownUp size={20} />}
                    label="Bitrate"
                    value={sessionStatus === 'active' ? `${(bitrate / 1000).toFixed(1)} Mbps` : '--'}
                    status={bitrate >= 2000 ? 'good' : bitrate >= 1500 ? 'warning' : 'error'}
                  />
                  <MetricDisplay
                    icon={<Warning size={20} />}
                    label="Packet Loss"
                    value={sessionStatus === 'active' ? `${packetLoss.toFixed(2)}%` : '--'}
                    status={packetLoss < 1 ? 'good' : packetLoss < 3 ? 'warning' : 'error'}
                  />
                  <MetricDisplay
                    icon={<Timer size={20} />}
                    label="Latency"
                    value={sessionStatus === 'active' ? `${Math.round(latency)}ms` : '--'}
                    status={latency < 50 ? 'good' : latency < 100 ? 'warning' : 'error'}
                  />
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Key size={16} />
                    <span className="font-medium">Stream Key</span>
                  </div>
                  <div className="flex gap-2">
                    <Input 
                      value={streamKey} 
                      readOnly 
                      className="font-mono text-xs"
                      type="password"
                    />
                    <Button 
                      onClick={handleCopyStreamKey} 
                      variant="outline" 
                      size="icon"
                    >
                      <Copy size={16} />
                    </Button>
                  </div>
                  <Button 
                    onClick={handleResetKey} 
                    variant="ghost" 
                    size="sm"
                    className="text-xs"
                  >
                    Reset Key
                  </Button>
                </div>

                {sessionStatus === 'active' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Stream Health</span>
                      <span>{signalQuality >= 90 ? 'EXCELLENT' : signalQuality >= 70 ? 'GOOD' : 'DEGRADED'}</span>
                    </div>
                    <Progress value={signalQuality} className="h-1" />
                  </div>
                )}
              </>
            )}

            {inputProtocol === 'clipsflow' && (
              <>
                <div className="space-y-4">
                  <div className="glass-panel p-4 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Package size={16} className="text-accent" />
                      <span>Source Metadata</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-muted-foreground">Source</div>
                        <div className="font-mono text-foreground">ClipsFlow Intake</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Asset Type</div>
                        <div className="font-mono text-foreground">Video / Mixed</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Preparation State</div>
                        <div className="font-mono text-success">Optimized</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Delivery Mode</div>
                        <div className="font-mono text-accent">Ready for Injection</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Compression Profile</div>
                        <div className="font-mono text-foreground">Adaptive</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Payload Status</div>
                        <div className="font-mono text-success">Server-Safe</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="glass-panel p-4 rounded-lg space-y-2 bg-accent/5 border-accent/20">
                    <div className="text-xs text-muted-foreground">Infrastructure Protection</div>
                    <div className="text-sm space-y-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle size={14} className="text-success" weight="fill" />
                        <span>Prepared upstream through ClipsFlow</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle size={14} className="text-success" weight="fill" />
                        <span>Optimized media handoff active</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle size={14} className="text-success" weight="fill" />
                        <span>Direct raw ingestion bypassed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle size={14} className="text-success" weight="fill" />
                        <span>Server load preserved through staged intake</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <MetricDisplay
                    icon={<Package size={20} />}
                    label="Intake Status"
                    value={sessionStatus === 'active' ? 'PREPARED' : 'OFFLINE'}
                    status={sessionStatus === 'active' ? 'good' : 'neutral'}
                  />
                  <MetricDisplay
                    icon={<CheckCircle size={20} />}
                    label="Routing State"
                    value={sessionStatus === 'active' ? 'LINKED' : '--'}
                    status={sessionStatus === 'active' ? 'good' : 'neutral'}
                  />
                  <MetricDisplay
                    icon={<WifiHigh size={20} />}
                    label="Signal Quality"
                    value={sessionStatus === 'active' ? `${Math.round(signalQuality)}%` : '--'}
                    status={signalQuality > 85 ? 'good' : signalQuality > 65 ? 'warning' : 'error'}
                  />
                  <MetricDisplay
                    icon={<Timer size={20} />}
                    label="Latency"
                    value={sessionStatus === 'active' ? `${Math.round(latency)}ms` : '--'}
                    status={latency < 50 ? 'good' : latency < 100 ? 'warning' : 'error'}
                  />
                </div>

                {sessionStatus === 'active' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Payload Quality</span>
                      <span>{signalQuality >= 90 ? 'OPTIMAL' : signalQuality >= 70 ? 'GOOD' : 'DEGRADED'}</span>
                    </div>
                    <Progress value={signalQuality} className="h-1" />
                  </div>
                )}
              </>
            )}

            {inputProtocol !== 'virtual-camera' && inputProtocol !== 'rtmp' && inputProtocol !== 'clipsflow' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <MetricDisplay
                    icon={<Lightning size={20} />}
                    label="Uplink State"
                    value={sessionStatus === 'active' ? 'OPERATIONAL' : 'OFFLINE'}
                    status={sessionStatus === 'active' ? 'good' : 'neutral'}
                  />
                  <MetricDisplay
                    icon={<Database size={20} />}
                    label="Active Source"
                    value={(inputProtocol || 'local').toUpperCase()}
                    status="neutral"
                  />
                  <MetricDisplay
                    icon={<WifiHigh size={20} />}
                    label="Signal Quality"
                    value={sessionStatus === 'active' ? `${Math.round(signalQuality)}%` : '--'}
                    status={signalQuality > 85 ? 'good' : signalQuality > 65 ? 'warning' : 'error'}
                  />
                  <MetricDisplay
                    icon={<Timer size={20} />}
                    label="Latency"
                    value={sessionStatus === 'active' ? `${Math.round(latency)}ms` : '--'}
                    status={latency < 50 ? 'good' : latency < 100 ? 'warning' : 'error'}
                  />
                </div>

                {sessionStatus === 'active' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Signal Strength</span>
                      <span>{Math.round(signalQuality)}%</span>
                    </div>
                    <Progress value={signalQuality} className="h-1" />
                  </div>
                )}
              </>
            )}
          </div>
        </GlassCard>

        <GlassCard title="Operator Control">
          <div className="space-y-4">
            {sessionStatus === 'standby' && (
              <div className="space-y-3">
                <Button 
                  onClick={handleRunPreflight} 
                  className="w-full gap-3 h-14"
                  size="lg"
                >
                  <PlayCircle size={24} weight="fill" />
                  <div className="flex flex-col items-start">
                    <span className="text-lg font-semibold">{inputProtocol === 'dj-mode' ? 'Start DJ Mode' : 'Run Preflight'}</span>
                    <span className="text-xs opacity-80 font-normal">
                      {inputProtocol === 'dj-mode' ? 'No-cost autonomous session' : `MODE: ${getPreflightLabel()}`}
                    </span>
                  </div>
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  {inputProtocol === 'dj-mode' 
                    ? 'Run a lightweight session with loop + audio • Preview STIX MΛGIC without operator control'
                    : 'Intelligent test preview — adapts to selected protocol and source'
                  }
                </p>
              </div>
            )}
            
            {sessionStatus === 'dj-mode' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    onClick={handleStopDJMode} 
                    variant="secondary"
                    className="gap-2"
                    size="lg"
                  >
                    <Stop size={20} weight="fill" />
                    Stop DJ Mode
                  </Button>

                  <Button 
                    onClick={handleUpgradeToOperator} 
                    variant="default"
                    className="gap-2 bg-primary hover:bg-primary/90"
                    size="lg"
                  >
                    <Lightning size={20} weight="fill" />
                    Upgrade Session
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Upgrade to premium for full operator control with live injection
                </p>
              </div>
            )}
            
            {sessionStatus !== 'standby' && sessionStatus !== 'dj-mode' && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Button 
                  onClick={handleStopPreflight} 
                  variant="secondary"
                  className="gap-2"
                  size="lg"
                >
                  <Stop size={20} weight="fill" />
                  Stop Preflight
                </Button>

                {operatorTier === 'premium' && operatorTimeRemaining > 0 && operatorTimeRemaining < 90 && (
                  <Button 
                    onClick={handleExtendTime} 
                    variant="outline"
                    className="gap-2 border-accent text-accent hover:bg-accent/10"
                    size="lg"
                  >
                    <Timer size={20} weight="fill" />
                    Extend Time
                  </Button>
                )}

                <Button 
                  onClick={handleGoLive} 
                  variant="default"
                  className="gap-2 bg-success hover:bg-success/90"
                  size="lg"
                >
                  <Broadcast size={20} weight="fill" />
                  Go Live
                </Button>

                <Button 
                  onClick={handleEmergencyStop} 
                  variant="destructive"
                  className="gap-2 col-span-2 md:col-span-1"
                  size="lg"
                >
                  <WaveformSlash size={20} />
                  Emergency Stop
                </Button>
              </div>
            )}
          </div>
        </GlassCard>

        <GlassCard title="System Architecture">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 py-8">
            {(inputProtocol === 'clipsflow' 
              ? ['ClipsFlow', 'VC NODE', 'Telegram VC']
              : inputProtocol === 'virtual-camera' || inputProtocol === 'rtmp'
              ? ['OBS', 'VC NODE', inputProtocol === 'rtmp' ? 'Telegram RTMP' : 'Telegram VC']
              : ['Source', 'VC NODE', 'Telegram VC']
            ).map((layer, index, arr) => (
              <div key={layer} className="flex items-center gap-4">
                <div className={`glass-panel px-6 py-4 rounded-lg text-center min-w-[140px] transition-all duration-300 ${
                  index === 0 && sessionStatus === 'active' && (inputProtocol === 'virtual-camera' || inputProtocol === 'rtmp' || inputProtocol === 'clipsflow') 
                    ? 'border-2 border-accent/50 shadow-accent/20 shadow-lg' 
                    : ''
                }`}>
                  <div className="flex items-center justify-center gap-2">
                    {index === 0 && inputProtocol === 'clipsflow' && <Package size={16} className="text-accent" />}
                    {index === 0 && (inputProtocol === 'virtual-camera' || inputProtocol === 'rtmp') && <Eye size={16} className="text-accent" />}
                    {index === 0 && inputProtocol !== 'clipsflow' && inputProtocol !== 'virtual-camera' && inputProtocol !== 'rtmp' && <Database size={16} className="text-accent" />}
                    {index === 1 && <TreeStructure size={16} className="text-primary" />}
                    {index === 2 && <Broadcast size={16} className="text-foreground" />}
                    <div className="font-mono text-sm">{layer}</div>
                  </div>
                </div>
                {index < arr.length - 1 && (
                  <>
                    <div className="hidden md:block w-8 h-px bg-gradient-to-r from-accent/50 to-accent/20 relative">
                      {sessionStatus === 'active' && (
                        <div className="absolute inset-0 bg-gradient-to-r from-accent to-transparent animate-pulse-glow" />
                      )}
                    </div>
                    <div className="md:hidden h-8 w-px bg-gradient-to-b from-accent/50 to-accent/20" />
                  </>
                )}
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard 
          title="Diagnostics" 
          description="Live telemetry stream"
        >
          <ScrollArea className="h-[300px] w-full rounded-md border border-border/50 bg-muted/20 p-4">
            {!logs || logs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                <div className="flex items-center gap-2">
                  <Terminal size={20} />
                  <span>No events logged</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {logs.map((log) => (
                  <LogEntry key={log.id} {...log} />
                ))}
              </div>
            )}
          </ScrollArea>
        </GlassCard>

        <footer className="text-center text-xs text-muted-foreground space-y-2 py-8">
          <div className="flex items-center justify-center gap-2">
            <Broadcast size={14} />
            <span className="font-mono">FRISKY DEVELOPMENTS</span>
          </div>
          <p>OBS ↔ Telegram VC operator-grade control infrastructure</p>
        </footer>
      </div>
    </div>
  )
}

export default App
