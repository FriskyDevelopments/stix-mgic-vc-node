import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface AnimatedGradientProps {
  className?: string;
  colors?: string[];
  speed?: number;
  blur?: string;
  opacity?: number;
}

export function AnimatedGradient({
  className,
  colors = ["#06b6d4", "#3b82f6", "#8b5cf6", "#06b6d4"],
  speed = 0.002,
  blur = "120px",
  opacity = 0.12,
}: AnimatedGradientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const offsetRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    const obs = new ResizeObserver(() => resize());
    obs.observe(canvas);
    resize();

    const animate = () => {
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;
      ctx.clearRect(0, 0, w, h);

      offsetRef.current += speed;

      // Multiple large radial gradients that slowly drift
      for (let i = 0; i < colors.length; i++) {
        const angle = offsetRef.current + (i * Math.PI * 2) / colors.length;
        const cx = w * 0.5 + Math.cos(angle) * w * 0.35;
        const cy = h * 0.5 + Math.sin(angle + offsetRef.current * 0.5) * h * 0.3;
        const radius = Math.max(w, h) * 0.55;

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, colors[i] + "40");
        gradient.addColorStop(0.4, colors[i] + "18");
        gradient.addColorStop(1, "transparent");

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
      }

      animRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      obs.disconnect();
    };
  }, [colors, speed]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("absolute inset-0 pointer-events-none", className)}
      style={{
        filter: `blur(${blur})`,
        opacity,
      }}
    />
  );
}