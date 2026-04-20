import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { ExtractedColors } from "@/lib/color-extraction"

type AudioSource = 'stix-library' | 'clipsflow-pack' | 'session-pack' | 'spotify'

interface AudioVisualizerProps {
  isActive: boolean
  trackName: string | null
  variant?: 'compact' | 'full'
  audioSource?: AudioSource
  extractedColors?: ExtractedColors | null
}

interface VisualizerStyle {
  barCount: number
  updateInterval: number
  smoothing: number
  colorScheme: {
    hueStart: number
    hueRange: number
    saturation: number
    brightness: number
  }
  shape: 'bars' | 'circles' | 'waveform' | 'radial'
  intensity: {
    bass: { min: number; max: number }
    mid: { min: number; max: number }
    high: { min: number; max: number }
  }
}

const visualizerStyles: Record<AudioSource, VisualizerStyle> = {
  'stix-library': {
    barCount: 32,
    updateInterval: 80,
    smoothing: 0.7,
    colorScheme: {
      hueStart: 195,
      hueRange: 40,
      saturation: 0.12,
      brightness: 0.5
    },
    shape: 'bars',
    intensity: {
      bass: { min: 0.4, max: 0.6 },
      mid: { min: 0.3, max: 0.5 },
      high: { min: 0.2, max: 0.4 }
    }
  },
  'clipsflow-pack': {
    barCount: 24,
    updateInterval: 100,
    smoothing: 0.75,
    colorScheme: {
      hueStart: 170,
      hueRange: 30,
      saturation: 0.10,
      brightness: 0.55
    },
    shape: 'waveform',
    intensity: {
      bass: { min: 0.35, max: 0.55 },
      mid: { min: 0.3, max: 0.5 },
      high: { min: 0.25, max: 0.45 }
    }
  },
  'session-pack': {
    barCount: 40,
    updateInterval: 70,
    smoothing: 0.65,
    colorScheme: {
      hueStart: 250,
      hueRange: 50,
      saturation: 0.18,
      brightness: 0.45
    },
    shape: 'radial',
    intensity: {
      bass: { min: 0.5, max: 0.7 },
      mid: { min: 0.35, max: 0.55 },
      high: { min: 0.25, max: 0.45 }
    }
  },
  'spotify': {
    barCount: 48,
    updateInterval: 60,
    smoothing: 0.6,
    colorScheme: {
      hueStart: 140,
      hueRange: 80,
      saturation: 0.15,
      brightness: 0.55
    },
    shape: 'circles',
    intensity: {
      bass: { min: 0.45, max: 0.75 },
      mid: { min: 0.35, max: 0.65 },
      high: { min: 0.2, max: 0.5 }
    }
  }
}

export function AudioVisualizer({ 
  isActive, 
  trackName, 
  variant = 'full',
  audioSource = 'stix-library',
  extractedColors = null
}: AudioVisualizerProps) {
  const style = visualizerStyles[audioSource]
  const barCount = variant === 'compact' ? Math.floor(style.barCount / 2) : style.barCount
  const [bars, setBars] = useState<number[]>([])

  useEffect(() => {
    setBars(Array(barCount).fill(0).map(() => Math.random() * 0.3 + 0.1))
  }, [barCount])

  useEffect(() => {
    if (!isActive) {
      setBars(Array(barCount).fill(0.05))
      return
    }

    const interval = setInterval(() => {
      setBars(prevBars => 
        prevBars.map((_, index) => {
          const bassRange = index < barCount * 0.2
          const midRange = index >= barCount * 0.2 && index < barCount * 0.6
          const highRange = index >= barCount * 0.6

          let intensity = Math.random()
          
          if (bassRange) {
            intensity = Math.random() * (style.intensity.bass.max - style.intensity.bass.min) + style.intensity.bass.min
          } else if (midRange) {
            intensity = Math.random() * (style.intensity.mid.max - style.intensity.mid.min) + style.intensity.mid.min
          } else if (highRange) {
            intensity = Math.random() * (style.intensity.high.max - style.intensity.high.min) + style.intensity.high.min
          }

          const currentHeight = prevBars[index] || 0
          return currentHeight * style.smoothing + intensity * (1 - style.smoothing)
        })
      )
    }, style.updateInterval)

    return () => clearInterval(interval)
  }, [isActive, barCount, style])

  const getColorForIndex = (index: number, normalizedHeight: number) => {
    if (extractedColors && audioSource === 'spotify') {
      const bassRange = index < barCount * 0.2
      const midRange = index >= barCount * 0.2 && index < barCount * 0.6
      const highRange = index >= barCount * 0.6
      
      let colorArray: string[]
      
      if (bassRange) {
        colorArray = [extractedColors.dark, extractedColors.warm, extractedColors.secondary]
      } else if (midRange) {
        colorArray = [extractedColors.primary, extractedColors.vibrant, extractedColors.accent]
      } else if (highRange) {
        colorArray = [extractedColors.light, extractedColors.cool, extractedColors.accent]
      } else {
        colorArray = extractedColors.palette
      }
      
      const position = bassRange 
        ? (index / (barCount * 0.2))
        : midRange 
          ? ((index - barCount * 0.2) / (barCount * 0.4))
          : ((index - barCount * 0.6) / (barCount * 0.4))
      
      const colorIndex = Math.floor(position * colorArray.length)
      const baseColor = colorArray[colorIndex] || extractedColors.primary
      
      const match = baseColor.match(/oklch\(([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\)/)
      if (match) {
        const l = parseFloat(match[1]) + normalizedHeight * 0.25
        const c = parseFloat(match[2]) + normalizedHeight * 0.08
        const h = parseFloat(match[3])
        return { color: `oklch(${l} ${c} ${h})`, shadowColor: `oklch(${l + 0.1} ${c + 0.02} ${h})` }
      }
    }
    
    const hue = style.colorScheme.hueStart + (index / barCount) * style.colorScheme.hueRange
    const color = `oklch(${style.colorScheme.brightness + normalizedHeight * 0.3} ${style.colorScheme.saturation + normalizedHeight * 0.06} ${hue})`
    const shadowColor = `oklch(${style.colorScheme.brightness + normalizedHeight * 0.3} ${style.colorScheme.saturation + 0.02} ${hue})`
    return { color, shadowColor }
  }

  const renderBars = () => {
    return bars.map((height, index) => {
      const normalizedHeight = Math.max(0.05, Math.min(1, height))
      const { color, shadowColor } = getColorForIndex(index, normalizedHeight)
      
      return (
        <div
          key={index}
          className="flex-1 rounded-t-sm transition-all duration-75 ease-out relative"
          style={{
            height: `${normalizedHeight * 100}%`,
            backgroundColor: color,
            boxShadow: isActive 
              ? `0 0 ${normalizedHeight * 8}px ${shadowColor}`
              : 'none',
            minHeight: '4px'
          }}
        >
          <div 
            className="absolute inset-0 bg-gradient-to-t from-transparent to-white/20 rounded-t-sm"
          />
        </div>
      )
    })
  }

  const renderCircles = () => {
    return bars.map((height, index) => {
      const normalizedHeight = Math.max(0.1, Math.min(1, height))
      const { color, shadowColor } = getColorForIndex(index, normalizedHeight)
      const angle = (index / barCount) * 360
      const radius = 30 + normalizedHeight * 15
      const centerX = 50
      const centerY = 50
      const x = centerX + Math.cos((angle * Math.PI) / 180) * radius
      const y = centerY + Math.sin((angle * Math.PI) / 180) * radius
      const size = 3 + normalizedHeight * 5
      
      return (
        <div
          key={index}
          className="absolute rounded-full transition-all duration-75 ease-out"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${size}px`,
            height: `${size}px`,
            transform: 'translate(-50%, -50%)',
            backgroundColor: color,
            boxShadow: isActive 
              ? `0 0 ${normalizedHeight * 12}px ${shadowColor}`
              : 'none'
          }}
        />
      )
    })
  }

  const renderWaveform = () => {
    return bars.map((height, index) => {
      const normalizedHeight = Math.max(0.05, Math.min(1, height))
      const { color, shadowColor } = getColorForIndex(index, normalizedHeight)
      const x = (index / (barCount - 1)) * 100
      const offset = normalizedHeight * 40
      
      return (
        <div
          key={index}
          className="absolute transition-all duration-100 ease-out rounded-full"
          style={{
            left: `${x}%`,
            top: `${50 - offset}%`,
            width: '3px',
            height: `${offset * 2}%`,
            backgroundColor: color,
            boxShadow: isActive 
              ? `0 0 ${normalizedHeight * 10}px ${shadowColor}`
              : 'none',
            transform: 'translateX(-50%)'
          }}
        />
      )
    })
  }

  const renderRadial = () => {
    const layers = 3
    return Array.from({ length: layers }).map((_, layerIndex) => {
      const layerBars = Math.floor(barCount / layers)
      const startIndex = layerIndex * layerBars
      const endIndex = startIndex + layerBars
      const layerBarsData = bars.slice(startIndex, endIndex)
      
      return layerBarsData.map((height, index) => {
        const normalizedHeight = Math.max(0.1, Math.min(1, height))
        const globalIndex = startIndex + index
        const { color, shadowColor } = getColorForIndex(globalIndex, normalizedHeight)
        const angle = (index / layerBarsData.length) * 360
        const baseRadius = 15 + layerIndex * 18
        const radius = baseRadius + normalizedHeight * 8
        const centerX = 50
        const centerY = 50
        const x = centerX + Math.cos((angle * Math.PI) / 180) * radius
        const y = centerY + Math.sin((angle * Math.PI) / 180) * radius
        
        return (
          <div
            key={`${layerIndex}-${index}`}
            className="absolute rounded-full transition-all duration-75 ease-out"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: '4px',
              height: `${normalizedHeight * 16}px`,
              transform: `translate(-50%, -50%) rotate(${angle}deg)`,
              backgroundColor: color,
              boxShadow: isActive 
                ? `0 0 ${normalizedHeight * 10}px ${shadowColor}`
                : 'none'
            }}
          />
        )
      })
    })
  }

  return (
    <div className={cn(
      "relative w-full overflow-hidden rounded-lg",
      variant === 'compact' ? "h-12" : "h-24"
    )}>
      <div 
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at center, oklch(${style.colorScheme.brightness - 0.1} ${style.colorScheme.saturation * 0.3} ${style.colorScheme.hueStart}) 0%, transparent 70%)`
        }}
      />
      
      {style.shape === 'bars' && (
        <div className="absolute inset-0 flex items-end justify-around gap-[2px] px-2 py-2">
          {renderBars()}
        </div>
      )}

      {style.shape === 'circles' && (
        <div className="absolute inset-0">
          {renderCircles()}
        </div>
      )}

      {style.shape === 'waveform' && (
        <div className="absolute inset-0">
          {renderWaveform()}
        </div>
      )}

      {style.shape === 'radial' && (
        <div className="absolute inset-0">
          {renderRadial()}
        </div>
      )}

      {trackName && isActive && (
        <div className="absolute top-2 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
              <div className="w-1 h-1 rounded-full bg-accent animate-pulse" />
              <div className="w-1 h-1 rounded-full bg-accent animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-1 h-1 rounded-full bg-accent animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
            <span className="text-[9px] font-mono text-accent/90 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded">
              NOW PLAYING
            </span>
          </div>
        </div>
      )}

      {trackName && isActive && variant === 'full' && (
        <div className="absolute bottom-2 left-3 right-3 pointer-events-none z-10">
          <div className="text-[10px] font-medium text-foreground/80 bg-black/60 backdrop-blur-sm px-2 py-1 rounded inline-block max-w-full truncate">
            {trackName}
          </div>
        </div>
      )}

      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <span className="text-[9px] font-mono text-muted-foreground/50">
            AUDIO INACTIVE
          </span>
        </div>
      )}
    </div>
  )
}
