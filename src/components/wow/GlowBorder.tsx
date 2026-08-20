import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type GlowVariant = "accent" | "danger" | "success" | "warning" | "idle";

const variantStyles: Record<GlowVariant, string> = {
  accent:
    "after:from-cyan-500/40 after:via-blue-500/20 after:to-purple-500/40",
  danger:
    "after:from-red-500/40 after:via-orange-500/20 after:to-red-500/40",
  success:
    "after:from-emerald-500/40 after:via-green-500/20 after:to-emerald-500/40",
  warning:
    "after:from-amber-500/40 after:via-yellow-500/20 after:to-amber-500/40",
  idle: "after:from-white/10 after:via-white/5 after:to-white/10",
};

interface GlowBorderProps {
  children: ReactNode;
  variant?: GlowVariant;
  className?: string;
  pulse?: boolean;
}

export function GlowBorder({
  children,
  variant = "accent",
  className,
  pulse = false,
}: GlowBorderProps) {
  return (
    <div className={cn("relative group", className)}>
      {/* Animated border glow */}
      <div
        className={cn(
          "absolute -inset-[1px] rounded-lg z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700",
          pulse && "opacity-60 animate-pulse",
          "after:absolute after:inset-0 after:rounded-lg after:bg-gradient-to-r after:blur-xl",
          variantStyles[variant]
        )}
      />
      {/* Subtle border line */}
      <div
        className={cn(
          "absolute -inset-[1px] rounded-lg z-0 pointer-events-none",
          "bg-gradient-to-r",
          variant === "accent" &&
            "from-cyan-500/30 via-blue-500/10 to-purple-500/30",
          variant === "danger" &&
            "from-red-500/30 via-orange-500/10 to-red-500/30",
          variant === "success" &&
            "from-emerald-500/30 via-green-500/10 to-emerald-500/30",
          variant === "warning" &&
            "from-amber-500/30 via-yellow-500/10 to-amber-500/30",
          variant === "idle" && "from-white/[0.06] via-white/[0.03] to-white/[0.06]"
        )}
      />
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
