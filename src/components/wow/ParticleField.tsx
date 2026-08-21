import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

interface ParticleFieldProps {
  className?: string;
  particleCount?: number;
  color?: string;
  speed?: number;
  maxRadius?: number;
}

export function ParticleField({
  className,
  particleCount = 120,
  color = "147, 197, 253", // cyan-300
  speed = 0.3,
  maxRadius = 2,
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // The effect re-runs when the props below change, so drop the old field and let the
    // first sized resize() seed a new one against the current particleCount.
    particlesRef.current = [];

    // Initialize particles
    const initParticles = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      particlesRef.current = Array.from({ length: particleCount }, () => {
        const life = 150 + Math.random() * 350;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * speed,
          vy: (Math.random() - 0.5) * speed - 0.15,
          size: Math.random() * maxRadius + 0.5,
          alpha: Math.random() * 0.6 + 0.1,
          life: Math.random() * life,
          maxLife: life,
        };
      });
    };

    // Same trap as AnimatedGradient: without a CSS size the canvas box comes from its own
    // width/height attributes, so writing them from getBoundingClientRect() makes the
    // ResizeObserver re-fire on its own output and the element doubles every tick. The
    // w-full/h-full below pins the box, the guard stops the feedback, and setTransform
    // replaces a scale() that compounded on each call.
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
      // Seed against the real box. Seeding against the 300x150 canvas default would leave
      // every particle huddled in the top-left corner of a full-screen field.
      if (particlesRef.current.length === 0) initParticles();
    };

    const observer = new ResizeObserver(() => resize());
    observer.observe(canvas);
    resize();

    const animate = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      ctx.clearRect(0, 0, w, h);

      for (const p of particlesRef.current) {
        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Bounce
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        // Life cycle
        p.life--;
        const lifeRatio = p.life / p.maxLife;
        const currentAlpha = p.alpha * Math.min(lifeRatio * 2, 1);

        // Reset dead particles
        if (p.life <= 0) {
          p.x = Math.random() * w;
          p.y = h + 10;
          p.vx = (Math.random() - 0.5) * speed;
          p.vy = (Math.random() - 0.5) * speed - 0.3;
          p.life = p.maxLife;
        }

        // Draw
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color}, ${currentAlpha})`;
        ctx.fill();

        // Glow on larger particles
        if (p.size > 1.2) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${color}, ${currentAlpha * 0.1})`;
          ctx.fill();
        }
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      observer.disconnect();
    };
  }, [particleCount, color, speed, maxRadius]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("absolute inset-0 h-full w-full pointer-events-none z-0", className)}
    />
  );
}
