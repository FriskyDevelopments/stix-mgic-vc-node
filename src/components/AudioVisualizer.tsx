import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface AudioVisualizerProps {
  isActive: boolean
  trackName: string | null
  variant?: 'compact' | 'full'
}

export function AudioVisualizer({ isActive, trackName, variant = 'full' }: AudioVisualizerProps) {
  const [bars, setBars] = useState<number[]>([])
  const barCount = variant === 'compact' ? 16 : 32

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
            intensity = Math.random() * 0.6 + 0.4
          } else if (midRange) {
            intensity = Math.random() * 0.5 + 0.3
          } else if (highRange) {
            intensity = Math.random() * 0.4 + 0.2
          }

          const smoothing = 0.7
          const currentHeight = prevBars[index] || 0
          return currentHeight * smoothing + intensity * (1 - smoothing)
        })
      )
    }, 80)

    return () => clearInterval(interval)
  }, [isActive, barCount])

  return (
    <div className={cn(
      "relative w-full overflow-hidden rounded-lg",
      variant === 'compact' ? "h-12" : "h-24"
    )}>
      <div 
        className="absolute inset-0 bg-gradient-to-b from-primary/5 via-accent/5 to-primary/5"
      />
      
      <div className="absolute inset-0 flex items-end justify-around gap-[2px] px-2 py-2">
        {bars.map((height, index) => {
          const normalizedHeight = Math.max(0.05, Math.min(1, height))
          const hue = 195 + (index / barCount) * 40
          
          return (
            <div
              key={index}
              className="flex-1 rounded-t-sm transition-all duration-75 ease-out relative"
              style={{
                height: `${normalizedHeight * 100}%`,
                backgroundColor: `oklch(${0.5 + normalizedHeight * 0.3} ${0.12 + normalizedHeight * 0.06} ${hue})`,
                boxShadow: isActive 
                  ? `0 0 ${normalizedHeight * 8}px oklch(${0.5 + normalizedHeight * 0.3} ${0.14} ${hue})`
                  : 'none',
                minHeight: '4px'
              }}
            >
              <div 
                className="absolute inset-0 bg-gradient-to-t from-transparent to-white/20 rounded-t-sm"
              />
            </div>
          )
        })}
      </div>

      {trackName && isActive && (
        <div className="absolute top-2 left-3 right-3 flex items-center justify-between pointer-events-none">
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
        <div className="absolute bottom-2 left-3 right-3 pointer-events-none">
          <div className="text-[10px] font-medium text-foreground/80 bg-black/60 backdrop-blur-sm px-2 py-1 rounded inline-block max-w-full truncate">
            {trackName}
          </div>
        </div>
      )}

      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[9px] font-mono text-muted-foreground/50">
            AUDIO INACTIVE
          </span>
        </div>
      )}
    </div>
  )
}
