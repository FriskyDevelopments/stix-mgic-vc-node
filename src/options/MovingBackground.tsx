import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { ModePalette } from './discs'

interface BgParticle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  alpha: number
}

export function MovingBackground({ palette, speed = 1 }: { palette: ModePalette; speed?: number }): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    // Poster fallback: a static palette gradient behind the canvas so a
    // missing 2D context still shows the mode's sky, never a hole.
    if (!ctx) return

    let raf = 0
    let last = 0
    let phase = 0
    const observer = new ResizeObserver(() => { resize() })
    observer.observe(canvas)

    const seed = (w: number, h: number): BgParticle[] =>
      Array.from({ length: 90 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3 * speed,
        vy: (Math.random() - 0.5) * 0.3 * speed - 0.12,
        size: Math.random() * 1.8 + 0.4,
        alpha: Math.random() * 0.5 + 0.1,
      }))
    let particles: BgParticle[] = []

    function resize() {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas!.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const nextWidth = Math.round(rect.width * dpr)
      const nextHeight = Math.round(rect.height * dpr)
      if (canvas!.width === nextWidth && canvas!.height === nextHeight) return
      canvas!.width = nextWidth
      canvas!.height = nextHeight
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (particles.length === 0) particles = seed(rect.width, rect.height)
    }

    function ribbon(offset: number, amp: number, alpha: number, w: number, h: number) {
      ctx!.beginPath()
      for (let x = 0; x <= w; x += 8) {
        const y = h * 0.5 + Math.sin(x / (w * 0.28) + phase + offset) * amp + Math.sin(x / 97 + offset * 2) * amp * 0.3
        if (x === 0) ctx!.moveTo(x, y)
        else ctx!.lineTo(x, y)
      }
      ctx!.strokeStyle = palette.ribbon
      ctx!.globalAlpha = alpha
      ctx!.lineWidth = 2
      ctx!.stroke()
      ctx!.globalAlpha = 1
    }

    function draw() {
      const dpr = window.devicePixelRatio || 1
      const w = canvas!.width / dpr
      const h = canvas!.height / dpr
      if (w === 0 || h === 0) return
      ctx!.fillStyle = palette.sky
      ctx!.fillRect(0, 0, w, h)
      ribbon(0, h * 0.12, 0.14, w, h)
      ribbon(2.1, h * 0.09, 0.11, w, h)
      ribbon(4.2, h * 0.15, 0.08, w, h)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(${palette.particle}, ${p.alpha})`
        ctx!.fill()
      }
    }

    resize()

    const reduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    draw()
    if (!reduced) {
      let visible = true
      const visibility = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1]
        visible = entry ? entry.isIntersecting : true
      })
      visibility.observe(canvas)
      const tick = (now: number) => {
        if (visible && now - last >= 33) {
          last = now
          phase += 0.02 * speed
          draw()
        }
        raf = window.requestAnimationFrame(tick)
      }
      raf = window.requestAnimationFrame(tick)
      return () => {
        window.cancelAnimationFrame(raf)
        observer.disconnect()
        visibility.disconnect()
      }
    }

    return () => {
      window.cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [palette, speed])

  return (
    <canvas
      ref={canvasRef}
      data-testid="options-bg"
      aria-hidden="true"
      className={cn('absolute inset-0 h-full w-full pointer-events-none')}
      style={{ background: `linear-gradient(180deg, ${palette.sky}, #000)` }}
    />
  )
}
