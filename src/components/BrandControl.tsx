import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { 
  Sticker,
  CheckCircle,
  Prohibit,
  Sparkle
} from "@phosphor-icons/react"

type SessionMark = 'stix-default' | 'client-sticker' | 'off'

interface BrandControlProps {
  sessionMark: SessionMark
  onSessionMarkChange: (mark: SessionMark) => void
  disabled?: boolean
  sessionActive?: boolean
}

interface MarkOption {
  id: SessionMark
  label: string
  description: string
  icon: typeof Sticker
  badge?: string
}

export function BrandControl({ 
  sessionMark, 
  onSessionMarkChange, 
  disabled = false,
  sessionActive = false
}: BrandControlProps) {
  const markOptions: MarkOption[] = [
    {
      id: 'stix-default',
      label: 'STIX MΛGIC Default',
      description: 'Operator session mark via STIX MΛGIC',
      icon: Sparkle,
      badge: 'DEFAULT'
    },
    {
      id: 'client-sticker',
      label: 'Client Sticker Mark',
      description: 'Premium branded session sticker prepared upstream',
      icon: Sticker,
      badge: 'PREMIUM'
    },
    {
      id: 'off',
      label: 'Off',
      description: 'No session branding overlay',
      icon: Prohibit
    }
  ]

  const currentMark = markOptions.find(m => m.id === sessionMark)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Session Mark</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Sticker-based overlay package for branded session presence
          </p>
        </div>
        {sessionActive && currentMark?.badge && (
          <Badge 
            variant="outline" 
            className={cn(
              "gap-1.5 font-mono text-[10px]",
              sessionMark === 'client-sticker' && "border-accent text-accent"
            )}
          >
            <CheckCircle size={10} weight="fill" />
            {currentMark.badge} ACTIVE
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {markOptions.map((option) => {
          const Icon = option.icon
          const isActive = sessionMark === option.id
          const isDisabled = disabled

          return (
            <button
              key={option.id}
              onClick={() => !isDisabled && onSessionMarkChange(option.id)}
              disabled={isDisabled}
              className={cn(
                "p-4 rounded-lg border-2 transition-all duration-200 text-left",
                isActive 
                  ? option.id === 'client-sticker'
                    ? 'border-accent bg-accent/10'
                    : 'border-primary bg-primary/10'
                  : 'border-border hover:border-accent/50',
                isDisabled && 'opacity-40 cursor-not-allowed',
                !isDisabled && !isActive && 'cursor-pointer'
              )}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Icon 
                    size={20} 
                    className={cn(
                      isActive 
                        ? option.id === 'client-sticker'
                          ? 'text-accent'
                          : option.id === 'off'
                          ? 'text-muted-foreground'
                          : 'text-primary'
                        : 'text-muted-foreground'
                    )} 
                    weight={isActive ? 'fill' : 'regular'} 
                  />
                  {option.badge && (
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[9px] px-1.5 py-0",
                        option.id === 'client-sticker' && "border-accent/50 text-accent"
                      )}
                    >
                      {option.badge}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="font-medium text-sm">{option.label}</div>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {option.description}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {sessionMark === 'stix-default' && (
        <div className="glass-panel p-3 rounded-lg space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-accent">
            <Sparkle size={12} weight="fill" />
            <span>STIX MΛGIC Mark Loaded</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Default operator session mark • subtle corner treatment • low-noise branding
          </p>
        </div>
      )}

      {sessionMark === 'client-sticker' && (
        <div className="glass-panel p-3 rounded-lg space-y-2 bg-accent/5 border-accent/20">
          <div className="flex items-center gap-2 text-xs font-medium text-accent">
            <CheckCircle size={12} weight="fill" />
            <span>Premium Session Sticker Active</span>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
              Client-branded sticker mark via <span className="text-accent font-medium">STIX MΛGIC</span>
            </p>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <Badge variant="outline" className="border-accent/30 text-accent/90">
                Branded Sticker Asset Prepared
              </Badge>
              <Badge variant="outline" className="border-accent/30 text-accent/90">
                Sticker Overlay Ready
              </Badge>
            </div>
          </div>
        </div>
      )}

      {sessionMark === 'off' && (
        <div className="glass-panel p-3 rounded-lg">
          <p className="text-[11px] text-muted-foreground">
            Session branding disabled • raw feed output
          </p>
        </div>
      )}
    </div>
  )
}
