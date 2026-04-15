import { useState, useEffect } from "react"
import { useKV } from "@github/spark/hooks"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { CollapsibleSection } from "@/components/CollapsibleSection"
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
  MusicNote,
  FunnelSimple
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
  const [operatorTimeElapsed, setOperatorTimeElapsed] = useState(0)
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
    
    setOperatorTimeElapsed(0)
    
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
        addLog('info', 'TIME', 'Session started')
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
    const additionalTime = 30 * 60
    setOperatorTimeRemaining((prev) => prev + additionalTime)
    addLog('success', 'TIME', `Session extended (+30 min)`)
    toast.success('Session extended by 30 minutes')
  }

  const handleOperatorTimeExpired = () => {
    if (sessionStatus === 'active' && operatorTimeRemaining === 0 && !isTransitioning) {
      setIsTransitioning(true)
      setSessionStatus('connecting')
      addLog('info', 'TIME', 'Operator window completed')
      addLog('info', 'TIME', 'Preparing transition')
      addLog('info', 'FALLBACK', 'Initiating seamless transition to DJ Mode')
      addLog('info', 'SESSION', 'Session continuity preserved')
      
      toast('Operator window ended — Switching to DJ Mode', {
        duration: 3000,
      })
      
      setTimeout(() => {
        setInputProtocol('dj-mode')
        addLog('info', 'ROUTING', 'Input switched to autonomous loop')
        addLog('success', 'TIME', 'DJ Mode fallback engaged')
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
          
          if (newTime === 600) {
            addLog('info', 'TIME', '10 minutes remaining')
          } else if (newTime === 120) {
            addLog('info', 'TIME', 'Approaching session boundary')
            toast('Session running smoothly — 2 minutes remaining', {
              duration: 4000,
            })
          } else if (newTime === 30) {
            addLog('warning', 'TIME', 'Approaching limit')
            toast('Approaching session boundary — 30 seconds remaining', {
              duration: 4000,
            })
          } else if (newTime === 10) {
            addLog('warning', 'TIME', 'Preparing transition')
            toast('Preparing transition — 10 seconds remaining', {
              duration: 3000,
            })
          } else if (newTime === 0) {
            handleOperatorTimeExpired()
          }
          
          return newTime
        })
        
        setOperatorTimeElapsed((prev) => prev + 1)
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
    if (sessionMode === 'dj') return 'DJ'
    return sessionMode === 'call' ? 'CALL' : 'BROADCAST'
  }

  const getPreflightLabel = () => {
    if (inputProtocol === 'dj-mode') return 'DJ MODE'
    if (inputProtocol === 'virtual-camera') return 'CALL'
    if (inputProtocol === 'rtmp') return 'BROADCAST'
    if (inputProtocol === 'clipsflow') return 'PREPARED'
    return 'TEST'
  }

  const [diagnosticFilter, setDiagnosticFilter] = useState('all')
  
  const filteredLogs = logs ? logs.filter(log => {
    if (diagnosticFilter === 'all') return true
    return log.type.toLowerCase() === diagnosticFilter.toLowerCase()
  }) : []

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        
        <header className="text-center space-y-3">
          <h1 className="font-mono font-bold text-4xl md:text-5xl tracking-tight">
            STIX M<span className="text-accent">Λ</span>GIC
          </h1>
          <div className="h-px w-24 mx-auto bg-gradient-to-r from-transparent via-accent to-transparent" />
          <p className="text-sm text-muted-foreground">
            VC Node • Operator Control
          </p>
        </header>

        <div className="space-y-6">
          <div className="glass-panel rounded-xl p-6 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">Live Preview</h2>
                  {sessionMode && (
                    <Badge variant="outline" className="gap-1.5 border-accent text-accent font-mono text-[10px]">
                      <VideoCamera size={12} weight="fill" />
                      {getModeLabel()}
                    </Badge>
                  )}
                </div>
                <StatusIndicator {...statusIndicator} />
              </div>
              
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
              
              {sessionStatus === 'active' && operatorTier === 'premium' && operatorTimeRemaining > 0 && (
                <div className="space-y-3 mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Pulse size={14} className="text-accent" />
                      <span className="font-medium">Operator Session Active</span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {Math.floor(operatorTimeElapsed / 60).toString().padStart(2, '0')}:{(operatorTimeElapsed % 60).toString().padStart(2, '0')} elapsed
                    </div>
                  </div>
                  
                  <div className="relative">
                    <Progress 
                      value={(operatorTimeElapsed / 120) * 100} 
                      className={`h-2 ${
                        operatorTimeRemaining <= 24 ? 'bg-warning/20' : 
                        operatorTimeRemaining <= 12 ? 'bg-warning/30' :
                        'bg-accent/20'
                      }`}
                    />
                    <div 
                      className={`absolute inset-0 rounded-full pointer-events-none transition-opacity duration-300 ${
                        operatorTimeRemaining <= 24 ? 'opacity-50 shadow-[0_0_12px_rgba(var(--warning),0.4)]' :
                        operatorTimeRemaining <= 12 ? 'opacity-70 shadow-[0_0_16px_rgba(var(--warning),0.5)] animate-pulse-glow' :
                        'opacity-30 shadow-[0_0_8px_rgba(var(--accent),0.3)]'
                      }`}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {operatorTimeRemaining > 60 
                        ? `${Math.floor(operatorTimeRemaining / 60)} min remaining`
                        : operatorTimeRemaining > 30
                        ? 'Approaching session boundary'
                        : operatorTimeRemaining > 12
                        ? 'Preparing transition'
                        : 'Transition imminent'}
                    </span>
                    <span className={`font-mono font-semibold ${
                      operatorTimeRemaining <= 30 ? 'text-warning' : 'text-accent'
                    }`}>
                      {Math.floor(operatorTimeRemaining / 60)}:{(operatorTimeRemaining % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
              )}
              
              {(sessionStatus === 'active' || sessionStatus === 'dj-mode') && (
                <div className="text-xs text-muted-foreground text-center mt-3">
                  {sessionStatus === 'dj-mode' ? 'Autonomous loop + audio active' : `${inputProtocol} • ${resolution} • ${Math.round(signalQuality)}% quality`}
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-xl p-6">
            <div className="space-y-4">
              {sessionStatus === 'standby' && (
                <Button 
                  onClick={handleRunPreflight} 
                  className="w-full gap-3 h-12"
                  size="lg"
                >
                  <PlayCircle size={20} weight="fill" />
                  <div className="flex flex-col items-start">
                    <span className="text-base font-semibold">{inputProtocol === 'dj-mode' ? 'Start DJ Mode' : 'Run Preflight'}</span>
                    <span className="text-[10px] opacity-75 font-normal">
                      {inputProtocol === 'dj-mode' ? 'No-cost autonomous session' : `${getPreflightLabel()} mode`}
                    </span>
                  </div>
                </Button>
              )}
              
              {sessionStatus === 'dj-mode' && operatorTimeElapsed > 0 && (
                <div className="glass-panel p-4 rounded-lg bg-accent/5 border border-accent/20 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-accent/10">
                      <CloudArrowUp size={20} className="text-accent" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <h3 className="text-sm font-semibold">Resume Live Control</h3>
                      <p className="text-xs text-muted-foreground">
                        Re-enter live operator control at any time
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      onClick={() => {
                        setOperatorTimeRemaining(30 * 60)
                        setInputProtocol('clipsflow')
                        addLog('success', 'TIME', 'Session extended (+30 min)')
                        toast.success('30 minutes added to session')
                      }}
                      variant="outline"
                      size="sm"
                      className="gap-2 border-accent text-accent hover:bg-accent/10"
                    >
                      <Timer size={16} weight="fill" />
                      +30 min
                    </Button>
                    <Button 
                      onClick={() => {
                        setSessionStatus('standby')
                        setOperatorTimeRemaining(120)
                        setInputProtocol('clipsflow')
                        addLog('info', 'SESSION', 'Resuming operator mode')
                        toast.success('Ready to resume operator session')
                      }}
                      variant="default"
                      size="sm"
                      className="gap-2"
                    >
                      <Lightning size={16} weight="fill" />
                      Resume
                    </Button>
                  </div>
                </div>
              )}
              
              {sessionStatus === 'dj-mode' && (
                <div className="flex gap-3">
                  <Button 
                    onClick={handleStopDJMode} 
                    variant="secondary"
                    className="flex-1 gap-2"
                  >
                    <Stop size={18} weight="fill" />
                    Stop DJ Mode
                  </Button>
                </div>
              )}
              
              {sessionStatus !== 'standby' && sessionStatus !== 'dj-mode' && (
                <>
                  <div className="flex items-center justify-between">
                    {operatorTier === 'premium' && operatorTimeRemaining > 0 && (
                      <Badge 
                        variant="outline" 
                        className={`gap-2 font-mono text-xs ${
                          operatorTimeRemaining <= 30 
                            ? 'border-warning text-warning animate-pulse-glow' 
                            : 'border-primary text-primary'
                        }`}
                      >
                        <Timer size={14} weight="fill" />
                        {Math.floor(operatorTimeRemaining / 60)}:{String(operatorTimeRemaining % 60).padStart(2, '0')}
                      </Badge>
                    )}
                    {sessionStatus === 'active' && (
                      <Badge variant="outline" className="gap-2 border-success text-success font-mono text-xs ml-auto">
                        <CheckCircle size={14} weight="fill" />
                        PREFLIGHT ACTIVE
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      onClick={handleStopPreflight} 
                      variant="secondary"
                      className="gap-2"
                    >
                      <Stop size={18} weight="fill" />
                      Stop
                    </Button>

                    <Button 
                      onClick={handleGoLive} 
                      variant="default"
                      className="gap-2 bg-success hover:bg-success/90"
                    >
                      <Broadcast size={18} weight="fill" />
                      Go Live
                    </Button>

                    {operatorTier === 'premium' && operatorTimeRemaining > 0 && operatorTimeRemaining < 300 && (
                      <Button 
                        onClick={handleExtendTime} 
                        variant="outline"
                        className="gap-2 border-accent text-accent hover:bg-accent/10 col-span-2"
                        size="sm"
                      >
                        <Timer size={16} weight="fill" />
                        Extend +30 min
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <CollapsibleSection
            title="Input Protocol"
            description="Select media routing source"
            defaultOpen={sessionStatus === 'standby'}
          >
            <div className="space-y-4">
              <Tabs value={inputProtocol} onValueChange={(value) => handleSwitchProtocol(value as InputProtocol)}>
                <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full">
                  <TabsTrigger value="dj-mode" disabled={sessionStatus === 'active'}>DJ</TabsTrigger>
                  <TabsTrigger value="clipsflow" disabled={sessionStatus === 'active'}>Prepared</TabsTrigger>
                  <TabsTrigger value="virtual-camera" disabled={sessionStatus === 'active'}>Call</TabsTrigger>
                  <TabsTrigger value="rtmp" disabled={sessionStatus === 'active'}>Broadcast</TabsTrigger>
                  <TabsTrigger value="local" disabled={sessionStatus === 'active'}>Local</TabsTrigger>
                  <TabsTrigger value="relay" disabled={sessionStatus === 'active'}>Relay</TabsTrigger>
                </TabsList>
              </Tabs>
              
              <div className="text-xs text-muted-foreground">
                {inputProtocol === 'dj-mode' && 'Autonomous session with looping visual + ambient audio'}
                {inputProtocol === 'clipsflow' && 'Prepared media intake via ClipsFlow pipeline - protects infrastructure from heavy file processing'}
                {inputProtocol === 'virtual-camera' && 'OBS Virtual Camera injection for call mode'}
                {inputProtocol === 'rtmp' && 'RTMP broadcast uplink to Telegram ingest'}
                {inputProtocol === 'local' && 'File-based audio/video source'}
                {inputProtocol === 'relay' && 'External stream relay input'}
              </div>
            </div>
          </CollapsibleSection>
          
          {sessionStatus === 'dj-mode' && operatorTimeElapsed === 0 && (
            <div className="glass-panel rounded-xl p-6 bg-muted/5 border border-muted/20">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Lightning size={24} className="text-primary" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold">Upgrade to Premium Session</h3>
                    <p className="text-sm text-muted-foreground">
                      Get live operator control with full source routing
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button 
                      onClick={() => {
                        setSessionStatus('standby')
                        setOperatorTimeRemaining(120)
                        setInputProtocol('clipsflow')
                        addLog('info', 'SESSION', 'Upgrading to premium operator session')
                        toast.success('Ready for premium operator session')
                      }}
                      variant="default"
                      className="gap-2"
                    >
                      <CloudArrowUp size={18} weight="fill" />
                      Upgrade Session
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {sessionStatus !== 'standby' && (
            <CollapsibleSection
              title="Source Details"
              description="Protocol-specific metrics and status"
            >
              {inputProtocol === 'virtual-camera' && (
                <div className="grid grid-cols-2 gap-3">
                  <MetricDisplay
                    icon={<Webcam size={18} />}
                    label="Camera Feed"
                    value={sessionStatus === 'active' ? 'ACTIVE' : 'OFFLINE'}
                    status={sessionStatus === 'active' ? 'good' : 'neutral'}
                  />
                  <MetricDisplay
                    icon={<Pulse size={18} />}
                    label="Frame Rate"
                    value={sessionStatus === 'active' ? `${Math.round(frameRate)} fps` : '--'}
                    status={frameRate >= 28 ? 'good' : frameRate >= 24 ? 'warning' : 'error'}
                  />
                  <MetricDisplay
                    icon={<SpeakerHigh size={18} />}
                    label="Audio Sync"
                    value={sessionStatus === 'active' ? audioSync.toUpperCase() : '--'}
                    status={audioSync === 'stable' ? 'good' : audioSync === 'drift' ? 'warning' : 'neutral'}
                  />
                  <MetricDisplay
                    icon={<Timer size={18} />}
                    label="Latency"
                    value={sessionStatus === 'active' ? `${Math.round(latency)}ms` : '--'}
                    status={latency < 50 ? 'good' : latency < 100 ? 'warning' : 'error'}
                  />
                </div>
              )}

              {inputProtocol === 'rtmp' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <MetricDisplay
                      icon={<Lightning size={18} />}
                      label="Uplink State"
                      value={sessionStatus === 'active' ? 'CONNECTED' : sessionStatus === 'connecting' ? 'HANDSHAKE' : 'OFFLINE'}
                      status={sessionStatus === 'active' ? 'good' : sessionStatus === 'connecting' ? 'warning' : 'neutral'}
                    />
                    <MetricDisplay
                      icon={<ArrowsDownUp size={18} />}
                      label="Bitrate"
                      value={sessionStatus === 'active' ? `${(bitrate / 1000).toFixed(1)} Mbps` : '--'}
                      status={bitrate >= 2000 ? 'good' : bitrate >= 1500 ? 'warning' : 'error'}
                    />
                    <MetricDisplay
                      icon={<Warning size={18} />}
                      label="Packet Loss"
                      value={sessionStatus === 'active' ? `${packetLoss.toFixed(2)}%` : '--'}
                      status={packetLoss < 1 ? 'good' : packetLoss < 3 ? 'warning' : 'error'}
                    />
                    <MetricDisplay
                      icon={<Timer size={18} />}
                      label="Latency"
                      value={sessionStatus === 'active' ? `${Math.round(latency)}ms` : '--'}
                      status={latency < 50 ? 'good' : latency < 100 ? 'warning' : 'error'}
                    />
                  </div>

                  <Separator className="my-4" />

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Key size={16} />
                      <span>Stream Key</span>
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
                  </div>
                </>
              )}

              {inputProtocol === 'clipsflow' && (
                <>
                  <div className="glass-panel p-4 rounded-lg space-y-3 bg-accent/5 border border-accent/20">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Package size={16} className="text-accent" />
                      <span>Prepared Media Status</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-muted-foreground">Source</div>
                        <div className="font-mono text-foreground">ClipsFlow Intake</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">State</div>
                        <div className="font-mono text-success">Optimized</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Profile</div>
                        <div className="font-mono text-foreground">Adaptive</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Status</div>
                        <div className="font-mono text-accent">Ready</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <MetricDisplay
                      icon={<Package size={18} />}
                      label="Intake"
                      value={sessionStatus === 'active' ? 'PREPARED' : 'OFFLINE'}
                      status={sessionStatus === 'active' ? 'good' : 'neutral'}
                    />
                    <MetricDisplay
                      icon={<CheckCircle size={18} />}
                      label="Routing"
                      value={sessionStatus === 'active' ? 'LINKED' : '--'}
                      status={sessionStatus === 'active' ? 'good' : 'neutral'}
                    />
                  </div>
                </>
              )}

              {inputProtocol !== 'virtual-camera' && inputProtocol !== 'rtmp' && inputProtocol !== 'clipsflow' && (
                <div className="grid grid-cols-2 gap-3">
                  <MetricDisplay
                    icon={<WifiHigh size={18} />}
                    label="Signal Quality"
                    value={sessionStatus === 'active' || sessionStatus === 'dj-mode' ? `${Math.round(signalQuality)}%` : '--'}
                    status={signalQuality > 85 ? 'good' : signalQuality > 65 ? 'warning' : 'error'}
                  />
                  <MetricDisplay
                    icon={<Timer size={18} />}
                    label="Latency"
                    value={sessionStatus === 'active' || sessionStatus === 'dj-mode' ? `${Math.round(latency)}ms` : '--'}
                    status={latency < 50 ? 'good' : latency < 100 ? 'warning' : 'error'}
                  />
                </div>
              )}
            </CollapsibleSection>
          )}

          <CollapsibleSection
            title="Session Branding"
            description="Branded overlay via STIX MΛGIC sticker assets"
          >
            <BrandControl
              sessionMark={sessionMark || "stix-default"}
              onSessionMarkChange={handleSessionMarkChange}
              sessionActive={sessionStatus === 'active'}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Advanced Control"
            description="System stabilization and emergency controls"
          >
            <div className="grid grid-cols-2 gap-3">
              {sessionStatus === 'active' && (
                <Button 
                  onClick={handleStabilize} 
                  variant="outline"
                  className="gap-2"
                >
                  <ArrowsClockwise size={18} />
                  Stabilize Signal
                </Button>
              )}
              
              {(sessionStatus === 'active' || sessionStatus === 'dj-mode') && (
                <Button 
                  onClick={handleEmergencyStop} 
                  variant="destructive"
                  className="gap-2 col-span-2"
                >
                  <WaveformSlash size={18} />
                  Emergency Stop
                </Button>
              )}
              
              {inputProtocol === 'rtmp' && sessionStatus === 'standby' && (
                <Button 
                  onClick={handleResetKey} 
                  variant="ghost"
                  size="sm"
                  className="col-span-2"
                >
                  Reset Stream Key
                </Button>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Diagnostics"
            description="Live telemetry stream with filtering"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <FunnelSimple size={16} className="text-muted-foreground" />
                <div className="flex gap-2 flex-wrap">
                  {['all', 'source', 'session', 'audio', 'uplink', 'brand', 'dj', 'time'].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setDiagnosticFilter(filter)}
                      className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                        diagnosticFilter === filter
                          ? 'bg-accent text-accent-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-accent/20'
                      }`}
                    >
                      {filter.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              
              <ScrollArea className="h-[240px] w-full rounded-md border border-border/50 bg-muted/20 p-3">
                {filteredLogs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    <div className="flex items-center gap-2">
                      <Terminal size={18} />
                      <span>No {diagnosticFilter !== 'all' ? diagnosticFilter : ''} events</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredLogs.map((log) => (
                      <LogEntry key={log.id} {...log} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="System Architecture"
            description="Infrastructure routing visualization"
          >
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 py-4">
              {(inputProtocol === 'clipsflow' 
                ? ['ClipsFlow', 'VC NODE', 'Telegram VC']
                : inputProtocol === 'virtual-camera' || inputProtocol === 'rtmp'
                ? ['OBS', 'VC NODE', inputProtocol === 'rtmp' ? 'Telegram RTMP' : 'Telegram VC']
                : ['Source', 'VC NODE', 'Telegram VC']
              ).map((layer, index, arr) => (
                <div key={layer} className="flex items-center gap-4">
                  <div className={`glass-panel px-5 py-3 rounded-lg text-center min-w-[120px] transition-all duration-300 ${
                    index === 0 && (sessionStatus === 'active' || sessionStatus === 'dj-mode') && (inputProtocol === 'virtual-camera' || inputProtocol === 'rtmp' || inputProtocol === 'clipsflow' || inputProtocol === 'dj-mode') 
                      ? 'border-2 border-accent/50 shadow-accent/20 shadow-lg' 
                      : ''
                  }`}>
                    <div className="flex items-center justify-center gap-2">
                      {index === 0 && inputProtocol === 'clipsflow' && <Package size={14} className="text-accent" />}
                      {index === 0 && (inputProtocol === 'virtual-camera' || inputProtocol === 'rtmp') && <Eye size={14} className="text-accent" />}
                      {index === 0 && inputProtocol !== 'clipsflow' && inputProtocol !== 'virtual-camera' && inputProtocol !== 'rtmp' && <Database size={14} className="text-accent" />}
                      {index === 1 && <TreeStructure size={14} className="text-primary" />}
                      {index === 2 && <Broadcast size={14} className="text-foreground" />}
                      <div className="font-mono text-xs">{layer}</div>
                    </div>
                  </div>
                  {index < arr.length - 1 && (
                    <>
                      <div className="hidden md:block w-6 h-px bg-gradient-to-r from-accent/50 to-accent/20 relative">
                        {(sessionStatus === 'active' || sessionStatus === 'dj-mode') && (
                          <div className="absolute inset-0 bg-gradient-to-r from-accent to-transparent animate-pulse-glow" />
                        )}
                      </div>
                      <div className="md:hidden h-6 w-px bg-gradient-to-b from-accent/50 to-accent/20" />
                    </>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>

        <footer className="text-center text-xs text-muted-foreground space-y-2 py-6">
          <div className="flex items-center justify-center gap-2">
            <Broadcast size={12} />
            <span className="font-mono">FRISKY DEVELOPMENTS</span>
          </div>
          <p>OBS ↔ Telegram VC operator control infrastructure</p>
        </footer>
      </div>
    </div>
  )
}

export default App
