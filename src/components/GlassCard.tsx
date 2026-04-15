import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface GlassCardProps {
  title?: string
  description?: string
  children: ReactNode
  className?: string
  glowColor?: string
}

export function GlassCard({ title, description, children, className, glowColor }: GlassCardProps) {
  return (
    <Card className={cn("glass-panel border-2 transition-all duration-300", className, glowColor)}>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle className="text-lg font-semibold">{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent className={!title && !description ? "p-6" : ""}>
        {children}
      </CardContent>
    </Card>
  )
}