/**
 * media-compositor.ts — Canvas-based video compositor.
 *
 * Draws video frames (from camera or <video> element) onto a canvas,
 * composites the Frisky Developments overlay on top, and outputs a
 * capturable MediaStream via canvas.captureStream().
 *
 * This is the video half of DJ Mode's "mini-OBS" — the audio half is in audio-mixer.ts.
 */

import { createOverlayPainter, validateOverlayPack, type OverlayPack, type OverlayValues, type OverlayPainter } from '../overlays'

export type VideoSource = 
  | { type: 'camera'; stream: MediaStream }
  | { type: 'file'; element: HTMLVideoElement }
  | { type: 'image'; image: HTMLImageElement }
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
  private overlayScene: { paint: OverlayPainter; values?: OverlayValues } | null = null
  private animFrameId: number | null = null
  private outputStream: MediaStream | null = null
  private width: number
  private height: number
  private fps: number
  private running = false
  private cancelCameraPreparation: (() => void) | null = null

  constructor(options: CompositorOptions = {}) {
    this.width = options.width ?? 640
    this.height = options.height ?? 360
    this.fps = options.fps ?? 24
    this.overlay = { ...DEFAULT_OVERLAY, ...options.overlay }

    this.canvas = document.createElement('canvas')
    this.canvas.width = this.width
    this.canvas.height = this.height
    const context = this.canvas.getContext('2d')
    if (!context) throw new Error('Canvas preview is unavailable in this browser.')
    this.ctx = context
  }

  /** Set the visual source. Images must be loaded with CORS before use. */
  setSource(source: VideoSource): void {
    this.releaseCameraVideo()
    this.source = source
  }

  /** Prepare actual camera frames before reporting a capturable preview. */
  async prepareSource(): Promise<void> {
    const source = this.source
    if (source.type !== 'camera') return
    const video = this.getCameraVideo()!
    await new Promise<void>((resolve, reject) => {
      let settled = false
      let playing = false
      const cleanup = () => {
        clearTimeout(timeout)
        video.removeEventListener('loadeddata', ready)
        video.removeEventListener('error', failed)
        this.cancelCameraPreparation = null
      }
      const finish = (error?: unknown) => {
        if (settled) return
        settled = true
        cleanup()
        if (error) reject(error)
        else resolve()
      }
      const ready = () => {
        if (this.source !== source || video.srcObject !== source.stream) {
          finish(new Error('Camera preview was cancelled.'))
        } else if (playing && video.readyState >= 2) finish()
      }
      const failed = () => finish(new Error('The camera did not produce a video frame.'))
      const timeout = setTimeout(failed, 10_000)
      this.cancelCameraPreparation = () => finish(new Error('Camera preview was cancelled.'))
      video.addEventListener('loadeddata', ready)
      video.addEventListener('error', failed)
      try {
        Promise.resolve(video.play()).then(() => { playing = true; ready() }, finish)
      } catch (cause) { finish(cause) }
    })
  }

  /** Update overlay config on the fly. */
  setOverlay(config: Partial<OverlayConfig>): void {
    this.overlay = { ...this.overlay, ...config }
  }

  /** Explicit pack selection replaces the default mark, including a truly empty scene. */
  setOverlayScene(pack: OverlayPack | null, screenId?: string, values?: OverlayValues): void {
    if (!pack) { this.overlayScene = null; return }
    const result = validateOverlayPack(pack)
    if (!result.ok || !result.pack.screens.some(screen => screen.id === screenId)) {
      throw new Error('Choose a valid overlay pack and scene.')
    }
    this.overlayScene = { paint: createOverlayPainter(result.pack, screenId!), values: values ? { ...values } : undefined }
  }

  /** Start rendering and return the composited MediaStream. */
  start(): MediaStream {
    if (this.running) return this.outputStream!

    if (typeof this.canvas.captureStream !== 'function') throw new Error('Video output capture is unavailable in this browser.')
    if (this.source.type === 'none') throw new Error('Choose a video source first.')
    if (this.source.type === 'file' && this.source.element.readyState < 2) throw new Error('The video is still loading.')
    if (this.source.type === 'camera' && this.getCameraVideo()!.readyState < 2) throw new Error('The camera is still loading.')
    // Paint first so capture starts with the selected content rather than a blank frame.
    this.drawFrame()
    this.outputStream = this.canvas.captureStream(this.fps)
    this.running = true
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
    this.releaseCameraVideo()
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
    } else if (this.source.type === 'image') {
      const image = this.source.image
      const sourceWidth = image.naturalWidth
      const sourceHeight = image.naturalHeight
      if (sourceWidth > 0 && sourceHeight > 0) {
        const scale = Math.min(width / sourceWidth, height / sourceHeight)
        const imageWidth = sourceWidth * scale
        const imageHeight = sourceHeight * scale
        ctx.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight)
      }
    }

    // Draw overlay
    if (this.overlayScene) {
      const { paint, values } = this.overlayScene
      paint(ctx, { width, height, values })
    } else if (this.overlay.enabled) {
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
      // Native Frisky Developments lockup; flat Folios colors, no raster sticker.
      const titleSize = Math.max(12, Math.round(width * 0.024))
      const brandSize = Math.max(8, Math.round(width * 0.014))
      const title = 'VC NODE'
      const brand = 'FRISKY DEVELOPMENTS'
      ctx.font = `600 ${titleSize}px ui-sans-serif, system-ui, sans-serif`
      const titleWidth = ctx.measureText(title).width
      ctx.font = `500 ${brandSize}px ui-sans-serif, system-ui, sans-serif`
      const boxWidth = Math.max(titleWidth, ctx.measureText(brand).width) + 32
      const boxHeight = titleSize + brandSize + 25
      const { x, y } = this.getOverlayPosition(boxWidth, boxHeight)
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.fillStyle = '#111a1c'
      ctx.beginPath()
      ctx.roundRect(x, y, boxWidth, boxHeight, 6)
      ctx.fill()
      ctx.fillStyle = '#3ea384'
      ctx.fillRect(x + 10, y + 11, 3, boxHeight - 22)
      ctx.fillStyle = '#f5f2ec'
      ctx.font = `600 ${titleSize}px ui-sans-serif, system-ui, sans-serif`
      ctx.fillText(title, x + 21, y + 10 + titleSize)
      ctx.font = `500 ${brandSize}px ui-sans-serif, system-ui, sans-serif`
      ctx.fillText(brand, x + 21, y + titleSize + brandSize + 15)
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
  private releaseCameraVideo(): void {
    this.cancelCameraPreparation?.()
    if (this.cameraVideo) {
      this.cameraVideo.pause()
      this.cameraVideo.srcObject = null
    }
  }

  private getCameraVideo(): HTMLVideoElement | null {
    if (this.source.type !== 'camera') return null
    
    if (!this.cameraVideo) {
      this.cameraVideo = document.createElement('video')
      this.cameraVideo.autoplay = false
      this.cameraVideo.playsInline = true
      this.cameraVideo.muted = true
    }

    if (this.cameraVideo.srcObject !== this.source.stream) {
      this.cameraVideo.srcObject = this.source.stream
    }

    return this.cameraVideo
  }
}
