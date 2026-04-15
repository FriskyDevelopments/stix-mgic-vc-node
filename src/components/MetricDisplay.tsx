import { ReactNode } from "react"

interface MetricDisplayProps {
  icon: ReactNode
  label: string
  value: string
  status?: 'good' | 'warning' | 'error' | 'neutral'
}

export function MetricDisplay({ icon, label, value, status = 'neutral' }: MetricDisplayProps) {
  const statusColors = {
    good: 'text-success',
    warning: 'text-warning',
    error: 'text-destructive',
    neutral: 'text-foreground'
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-muted-foreground">
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className={`font-mono text-sm font-medium ${statusColors[status]}`}>
          {value}
        </span>
      </div>
    </div>
  )
}