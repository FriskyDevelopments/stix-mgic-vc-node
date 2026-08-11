/**
 * media-compositor.ts — Canvas-based video compositor.
 *
 * Draws video frames (from camera or <video> element) onto a canvas,
 * composites the STIX MAGIC sticker overlay on top, and outputs a
 * capturable MediaStream via canvas.captureStream().
 *
 * This is the video half of DJ Mode's "mini-OBS" — the audio half is in audio-mixer.ts.
 */

export type VideoSource = 
  | { type: 'camera'; stream: MediaStream }
  | { type: 'file'; element: HTMLVideoElement }
  | { type: 'none' }

export type OverlayConfig = {
  enabled: boolean
  /** The sticker image (pre-loaded). Null = use default text mark. */
  image: HTMLImageElement | null
  /** Position: bottom-right by default. */
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  /** Opacity 0-1. */
  opacity: number
  /** Scale relative to canvas width (0.1 = 10% of width). */
  scale: number
}

export type CompositorOptions = {
  width?: number
  height?: number
  fps?: number
  overlay?: Partial<OverlayConfig>
}

const DEFAULT_OVERLAY: OverlayConfig = {
  enabled: true,
  image: null,
  position: 'bottom-right',
  opacity: 0.7,
  scale: 0.15,
}

export class MediaCompositor {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private source: VideoSource = { type: 'none' }
  private overlay: OverlayConfig
  private animFrameId: number | null = null
  private outputStream: MediaStream | null = null
  private width: number
  private height: number
  private fps: number
  private running = false

  constructor(options: CompositorOptions = {}) {
    this.width = options.width ?? 640
    this.height = options.height ?? 360
    this.fps = options.fps ?? 24
    this.overlay = { ...DEFAULT_OVERLAY, ...options.overlay }

    this.canvas = document.createElement('canvas')
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.ctx = this.canvas.getContext('2d')!
  }

  /** Set the video source. Call this to switch between camera and file. */
  setSource(source: VideoSource): void {
    this.source = source
  }

  /** Update overlay config on the fly. */
  setOverlay(config: Partial<OverlayConfig>): void {
    this.overlay = { ...this.overlay, ...config }
  }

  /** Start rendering and return the composited MediaStream. */
  start(): MediaStream {
    if (this.running) return this.outputStream!

    this.running = true
    this.outputStream = this.canvas.captureStream(this.fps)
    this.render()
    return this.outputStream
  }

  /** Stop rendering. */
  stop(): void {
    this.running = false
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
    if (this.outputStream) {
      this.outputStream.getTracks().forEach(t => t.stop())
      this.outputStream = null
    }
  }

  /** Get the canvas element (for preview rendering in the UI). */
  getCanvas(): HTMLCanvasElement {
    return this.canvas
  }

  /** Get the output stream (null if not started). */
  getOutputStream(): MediaStream | null {
    return this.outputStream
  }

  get isRunning(): boolean {
    return this.running
  }

  private render = (): void => {
    if (!this.running) return

    this.drawFrame()
    this.animFrameId = requestAnimationFrame(this.render)
  }

  private drawFrame(): void {
    const { ctx, width, height } = this

    // Clear
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)

    // Draw video source
    if (this.source.type === 'camera') {
      const video = this.getCameraVideo()
      if (video && video.readyState >= 2) {
        this.drawCover(video)
      }
    } else if (this.source.type === 'file') {
      const el = this.source.element
      if (el.readyState >= 2) {
        this.drawCover(el)
      }
    }

    // Draw overlay
    if (this.overlay.enabled) {
      this.drawOverlay()
    }
  }

  /** Draw video covering the canvas (object-fit: cover behavior). */
  private drawCover(source: CanvasImageSource): void {
    const { ctx, width, height } = this
    const srcWidth = (source as any).videoWidth || (source as any).width || width
    const srcHeight = (source as any).videoHeight || (source as any).height || height

    const srcRatio = srcWidth / srcHeight
    const dstRatio = width / height

    let sx = 0, sy = 0, sw = srcWidth, sh = srcHeight
    if (srcRatio > dstRatio) {
      sw = srcHeight * dstRatio
      sx = (srcWidth - sw) / 2
    } else {
      sh = srcWidth / dstRatio
      sy = (srcHeight - sh) / 2
    }

    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height)
  }

  private drawOverlay(): void {
    const { ctx, width, height: _height, overlay } = this
    ctx.save()
    ctx.globalAlpha = overlay.opacity

    if (overlay.image) {
      // Draw sticker image
      const imgW = width * overlay.scale
      const imgH = imgW * (overlay.image.height / overlay.image.width)
      const { x, y } = this.getOverlayPosition(imgW, imgH)
      ctx.drawImage(overlay.image, x, y, imgW, imgH)
    } else {
      // Default: text watermark "STIX MΛGIC"
      const fontSize = Math.round(width * 0.035)
      ctx.font = `bold ${fontSize}px monospace`
      ctx.fillStyle = '#fff'
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = 4

      const text = '✦ STIX MΛGIC'
      const metrics = ctx.measureText(text)
      const textW = metrics.width
      const textH = fontSize
      const { x, y } = this.getOverlayPosition(textW + 16, textH + 12)
      
      // Background pill
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.beginPath()
      ctx.roundRect(x, y, textW + 16, textH + 12, 6)
      ctx.fill()
      
      // Text
      ctx.fillStyle = '#FFD100'
      ctx.shadowBlur = 0
      ctx.fillText(text, x + 8, y + textH + 2)
    }

    ctx.restore()
  }

  private getOverlayPosition(w: number, h: number): { x: number; y: number } {
    const pad = 12
    switch (this.overlay.position) {
      case 'top-left': return { x: pad, y: pad }
      case 'top-right': return { x: this.width - w - pad, y: pad }
      case 'bottom-left': return { x: pad, y: this.height - h - pad }
      case 'bottom-right': return { x: this.width - w - pad, y: this.height - h - pad }
      case 'center': return { x: (this.width - w) / 2, y: (this.height - h) / 2 }
    }
  }

  // For camera sources, we need a <video> element to draw from
  private cameraVideo: HTMLVideoElement | null = null
  private getCameraVideo(): HTMLVideoElement | null {
    if (this.source.type !== 'camera') return null
    
    if (!this.cameraVideo) {
      this.cameraVideo = document.createElement('video')
      this.cameraVideo.autoplay = true
      this.cameraVideo.playsInline = true
      this.cameraVideo.muted = true
    }

    if (this.cameraVideo.srcObject !== this.source.stream) {
      this.cameraVideo.srcObject = this.source.stream
      this.cameraVideo.play().catch(() => {})
    }

    return this.cameraVideo
  }
}
