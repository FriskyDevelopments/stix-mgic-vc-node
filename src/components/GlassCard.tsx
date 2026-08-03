import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface GlassCardProps {
  title?: string
  description?: string
  children: ReactNode
  className?: string
  glowColor?: string
  glow?: boolean
}

export function GlassCard({ title, description, children, className, glowColor, glow }: GlassCardProps) {
  return (
    <div className={cn(
      "relative rounded-xl overflow-hidden",
      "bg-black/40 backdrop-blur-xl",
      "border border-white/[0.06]",
      "transition-all duration-500",
      glow && "hover:border-cyan-500/20",
      className
    )}>
      {/* Glow orb behind the card */}
      {glow && (
        <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/5 via-blue-500/5 to-purple-500/5 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      )}
      {/* Scanline accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
      {/* Content */}
      <div className="relative p-5">
        {(title || description) && (
          <div className="mb-4">
            {title && (
              <h3 className="text-lg font-semibold tracking-tight text-white/90">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs text-white/40 mt-1 font-mono tracking-wide uppercase">
                {description}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
