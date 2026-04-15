interface LogEntryProps {
  timestamp: string
  severity: 'info' | 'success' | 'warning' | 'error'
  type: string
  message: string
}

export function LogEntry({ timestamp, severity, type, message }: LogEntryProps) {
  const severityColors = {
    info: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-destructive'
  }

  return (
    <div className="flex items-start gap-4 py-2 font-mono text-xs border-b border-border/30 last:border-0">
      <span className="text-muted-foreground tabular-nums shrink-0">{timestamp}</span>
      <span className={`${severityColors[severity]} uppercase tracking-wider shrink-0 w-16`}>
        {severity}
      </span>
      <span className="text-accent shrink-0 w-24">{type}</span>
      <span className="text-foreground/80">{message}</span>
    </div>
  )
}