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

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    const observer = new ResizeObserver(() => resize());
    observer.observe(canvas);
    resize();

    // Initialize particles
    const initParticles = () => {
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;
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
    initParticles();

    const animate = () => {
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;

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
      className={cn("absolute inset-0 pointer-events-none z-0", className)}
    />
  );
}