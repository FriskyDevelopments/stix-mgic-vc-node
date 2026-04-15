import { useState, useEffect } from "react"
import { useKV } from "@github/spark/hooks"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { GlassCard } from "@/components/GlassCard"
import { StatusIndicator } from "@/components/StatusIndicator"
import { MetricDisplay } from "@/components/MetricDisplay"
import { LogEntry } from "@/components/LogEntry"
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
  CheckCircle
} from "@phosphor-icons/react"
import { toast } from "sonner"

type SessionStatus = 'standby' | 'active' | 'connecting' | 'error'
type SourceType = 'local' | 'relay' | 'live' | 'bridge'

interface LogEntryData {
  id: string
  timestamp: string
  severity: 'info' | 'success' | 'warning' | 'error'
  type: string
  message: string
}

interface SourceConfig {
  id: SourceType
  label: string
  description: string
  icon: typeof Database
  available: boolean
}

function App() {
  const [sessionStatus, setSessionStatus] = useKV<SessionStatus>("session-status", "standby")
  const [activeSource, setActiveSource] = useKV<SourceType>("active-source", "local")
  const [logs, setLogs] = useKV<LogEntryData[]>("diagnostic-logs", [])
  
  const [signalQuality, setSignalQuality] = useState(0)
  const [latency, setLatency] = useState(0)

  const sources: SourceConfig[] = [
    { id: 'local', label: 'Local Media', description: 'File-based audio source', icon: Database, available: true },
    { id: 'relay', label: 'Stream Relay', description: 'External stream input', icon: Lightning, available: true },
    { id: 'live', label: 'Live Input', description: 'Real-time audio capture', icon: Pulse, available: false },
    { id: 'bridge', label: 'Bridge Input', description: 'Cross-platform relay', icon: TreeStructure, available: false }
  ]

  const addLog = (severity: LogEntryData['severity'], type: string, message: string) => {
    const newLog: LogEntryData = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      severity,
      type,
      message
    }
    setLogs((currentLogs) => [newLog, ...(currentLogs || [])].slice(0, 50))
  }

  const handleJoinVC = () => {
    setSessionStatus('connecting')
    addLog('info', 'SESSION', 'Initializing VC uplink...')
    
    setTimeout(() => {
      setSessionStatus('active')
      setSignalQuality(92)
      setLatency(45)
      addLog('success', 'SESSION', 'Connected to voice chat')
      addLog('info', 'SOURCE', `Activated ${activeSource} media source`)
      toast.success('VC session established')
    }, 1500)
  }

  const handleDisconnect = () => {
    setSessionStatus('standby')
    setSignalQuality(0)
    setLatency(0)
    addLog('info', 'SESSION', 'Disconnected from voice chat')
    toast('Session terminated')
  }

  const handleSwitchSource = (source: SourceType) => {
    if (!sources.find(s => s.id === source)?.available) {
      toast.error('Source unavailable')
      return
    }
    
    setActiveSource(source)
    addLog('info', 'SOURCE', `Switched to ${source} input`)
    toast.success(`Source: ${source}`)
  }

  const handleStabilize = () => {
    addLog('info', 'SIGNAL', 'Initiating signal stabilization...')
    setTimeout(() => {
      setSignalQuality(98)
      setLatency(32)
      addLog('success', 'SIGNAL', 'Signal optimized')
      toast.success('Signal stabilized')
    }, 800)
  }

  const handleEmergencyStop = () => {
    setSessionStatus('standby')
    setSignalQuality(0)
    setLatency(0)
    addLog('warning', 'EMERGENCY', 'Emergency stop activated')
    toast.error('Emergency stop executed')
  }

  useEffect(() => {
    if (sessionStatus === 'active') {
      const interval = setInterval(() => {
        setSignalQuality((prev) => Math.min(100, Math.max(75, prev + (Math.random() - 0.5) * 3)))
        setLatency((prev) => Math.max(25, prev + (Math.random() - 0.5) * 5))
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [sessionStatus])

  const getStatusIndicator = (): { status: 'active' | 'standby' | 'warning' | 'error' | 'connecting', label: string, pulse: boolean } => {
    switch (sessionStatus) {
      case 'active':
        return { status: 'active', label: 'ACTIVE', pulse: true }
      case 'connecting':
        return { status: 'connecting', label: 'CONNECTING', pulse: true }
      case 'error':
        return { status: 'error', label: 'ERROR', pulse: true }
      default:
        return { status: 'standby', label: 'STANDBY', pulse: false }
    }
  }

  const statusIndicator = getStatusIndicator()

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 space-y-16">
        
        <header className="text-center space-y-4">
          <h1 className="font-mono font-bold text-5xl md:text-6xl tracking-tight">
            STIX M<span className="text-accent">Λ</span>GIC
          </h1>
          <div className="h-px w-32 mx-auto bg-gradient-to-r from-transparent via-accent to-transparent" />
          <p className="text-xl text-muted-foreground">
            Operator control for live Telegram voice infrastructure
          </p>
        </header>

        <GlassCard 
          title="Session Status" 
          className={sessionStatus === 'active' ? 'border-accent/50' : ''}
          glowColor={sessionStatus === 'active' ? 'shadow-accent/20 shadow-lg' : ''}
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <StatusIndicator {...statusIndicator} />
              <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
                <Broadcast size={16} />
                <span>VC NODE</span>
              </div>
            </div>

            <Separator />

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
                value={(activeSource || 'local').toUpperCase()}
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
          </div>
        </GlassCard>

        <GlassCard title="Control Surface">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {sessionStatus === 'standby' && (
              <Button 
                onClick={handleJoinVC} 
                className="gap-2"
                size="lg"
              >
                <PlayCircle size={20} weight="fill" />
                Join VC
              </Button>
            )}
            
            {sessionStatus !== 'standby' && (
              <>
                <Button 
                  onClick={handleDisconnect} 
                  variant="secondary"
                  className="gap-2"
                  size="lg"
                >
                  <Stop size={20} weight="fill" />
                  Disconnect
                </Button>

                <Button 
                  onClick={handleStabilize} 
                  variant="outline"
                  className="gap-2"
                  size="lg"
                >
                  <ArrowsClockwise size={20} />
                  Stabilize
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
              </>
            )}
          </div>
        </GlassCard>

        <GlassCard title="Source Layer" description="Media input routing">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sources.map((source) => {
              const Icon = source.icon
              const isActive = activeSource === source.id
              const isAvailable = source.available
              
              return (
                <button
                  key={source.id}
                  onClick={() => handleSwitchSource(source.id)}
                  disabled={!isAvailable}
                  className={`
                    p-4 rounded-lg border-2 transition-all duration-200 text-left
                    ${isActive ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'}
                    ${!isAvailable ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  <div className="flex items-start gap-3">
                    <Icon size={24} className={isActive ? 'text-accent' : 'text-muted-foreground'} />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{source.label}</span>
                        {isActive && <CheckCircle size={16} weight="fill" className="text-accent" />}
                        {!isAvailable && <Warning size={16} className="text-warning" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{source.description}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </GlassCard>

        <GlassCard title="System Architecture">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 py-8">
            {['Operator UI', 'Control Bot', 'VC Engine', 'Source Adapters', 'Bridge Layer'].map((layer, index, arr) => (
              <div key={layer} className="flex items-center gap-4">
                <div className="glass-panel px-6 py-4 rounded-lg text-center min-w-[140px]">
                  <div className="font-mono text-sm text-accent">{layer}</div>
                </div>
                {index < arr.length - 1 && (
                  <div className="hidden md:block w-8 h-px bg-accent/50" />
                )}
                {index < arr.length - 1 && (
                  <div className="md:hidden h-8 w-px bg-accent/50" />
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
          <p>Premium operator-grade voice infrastructure control</p>
        </footer>
      </div>
    </div>
  )
}

export default App