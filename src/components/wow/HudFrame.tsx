import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ReactNode } from "react";

type HudVariant = "default" | "active" | "alert" | "idle";

const cornerStyles: Record<HudVariant, string> = {
  default: "border-cyan-400/60",
  active: "border-emerald-400/60",
  alert: "border-red-400/60",
  idle: "border-white/20",
};

const scanlineStyle: Record<HudVariant, string> = {
  default: "from-cyan-500/5 to-transparent",
  active: "from-emerald-500/5 to-transparent",
  alert: "from-red-500/5 to-transparent",
  idle: "from-white/[0.02] to-transparent",
};

interface HudFrameProps {
  children: ReactNode;
  variant?: HudVariant;
  label?: string;
  className?: string;
  accentColor?: string;
  animate?: boolean;
}

export function HudFrame({
  children,
  variant = "default",
  label,
  className,
  accentColor,
  animate = true,
}: HudFrameProps) {
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 8 } : undefined}
      animate={animate ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "relative rounded-lg border border-white/[0.06] bg-black/40 backdrop-blur-xl",
        "overflow-hidden",
        className
      )}
    >
      {/* Scanline effect */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-b pointer-events-none z-0",
          scanlineStyle[variant]
        )}
      />

      {/* Corner ornaments */}
      <div
        className={cn(
          "absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 rounded-tl",
          cornerStyles[variant]
        )}
        style={accentColor ? { borderColor: accentColor + "99" } : undefined}
      />
      <div
        className={cn(
          "absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 rounded-tr",
          cornerStyles[variant]
        )}
        style={accentColor ? { borderColor: accentColor + "99" } : undefined}
      />
      <div
        className={cn(
          "absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 rounded-bl",
          cornerStyles[variant]
        )}
        style={accentColor ? { borderColor: accentColor + "99" } : undefined}
      />
      <div
        className={cn(
          "absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 rounded-br",
          cornerStyles[variant]
        )}
        style={accentColor ? { borderColor: accentColor + "99" } : undefined}
      />

      {/* Label */}
      {label && (
        <div className="absolute top-0 left-6 -translate-y-1/2 px-2 py-0.5 bg-black/80 border border-white/[0.06] rounded text-[9px] font-mono uppercase tracking-[0.2em] text-white/50 z-10">
          {label}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 p-4">{children}</div>
    </motion.div>
  );
}
