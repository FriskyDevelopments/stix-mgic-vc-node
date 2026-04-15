import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface StatusIndicatorProps {
  status: 'active' | 'standby' | 'warning' | 'error' | 'connecting'
  label: string
  pulse?: boolean
}

export function StatusIndicator({ status, label, pulse = false }: StatusIndicatorProps) {
  const statusConfig = {
    active: {
      color: 'bg-accent',
      borderColor: 'border-accent',
      textColor: 'text-accent',
      glowColor: 'text-accent'
    },
    standby: {
      color: 'bg-muted-foreground',
      borderColor: 'border-muted-foreground',
      textColor: 'text-muted-foreground',
      glowColor: 'text-muted-foreground'
    },
    warning: {
      color: 'bg-warning',
      borderColor: 'border-warning',
      textColor: 'text-warning',
      glowColor: 'text-warning'
    },
    error: {
      color: 'bg-destructive',
      borderColor: 'border-destructive',
      textColor: 'text-destructive',
      glowColor: 'text-destructive'
    },
    connecting: {
      color: 'bg-primary',
      borderColor: 'border-primary',
      textColor: 'text-primary',
      glowColor: 'text-primary'
    }
  }

  const config = statusConfig[status]

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "gap-2 border font-mono text-xs tracking-wide",
        config.borderColor,
        config.textColor
      )}
    >
      <span 
        className={cn(
          "h-2 w-2 rounded-full",
          config.color,
          pulse && "animate-pulse-glow",
          config.glowColor,
          "status-glow"
        )}
      />
      {label}
    </Badge>
  )
}