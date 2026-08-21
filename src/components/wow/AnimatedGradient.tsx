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

    // A canvas with no CSS size takes its box from its own width/height attributes, so
    // writing the attributes from getBoundingClientRect() feeds the ResizeObserver its own
    // output and the element doubles on every tick until it saturates. The CSS size below
    // (w-full/h-full) pins the box; this guard is the second lock, and setTransform
    // replaces the scale() that used to compound once per resize.
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      // Before the first layout the box is 0x0. Writing that would pin the backing store at
      // a stub size, and because the CSS size no longer follows the attributes nothing would
      // ever fire the observer again to correct it.
      if (rect.width === 0 || rect.height === 0) return;
      const nextWidth = Math.round(rect.width * dpr);
      const nextHeight = Math.round(rect.height * dpr);
      if (canvas.width === nextWidth && canvas.height === nextHeight) return;
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const obs = new ResizeObserver(() => resize());
    obs.observe(canvas);
    resize();

    const animate = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
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
      className={cn("absolute inset-0 h-full w-full pointer-events-none", className)}
      style={{
        filter: `blur(${blur})`,
        opacity,
      }}
    />
  );
}
