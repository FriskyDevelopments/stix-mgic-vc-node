import {
  assertOverlayPack, isValidOverlayText, OVERLAY_FONTS, OVERLAY_LIMITS,
  type OverlayBounds, type OverlayColor, type OverlayLayer, type OverlayPack,
  type OverlayScreen, type OverlayValues,
} from './schema'

export type OverlayRenderOptions = {
  /** Output dimensions. The design is uniformly scaled to fit, centered, without cropping. */
  width?: number
  height?: number
  values?: OverlayValues
}
export type OverlayCanvasOptions = OverlayRenderOptions & {
  /** False by default so existing camera/video pixels remain untouched. */
  clear?: boolean
}
export type OverlayPainter = (ctx: CanvasRenderingContext2D, options?: OverlayCanvasOptions) => void

export function resolveOverlayBounds(bounds: OverlayBounds, canvas: OverlayPack['canvas']) {
  const scaleX = bounds.unit === 'normalized' ? canvas.width : 1
  const scaleY = bounds.unit === 'normalized' ? canvas.height : 1
  return { x: bounds.x * scaleX, y: bounds.y * scaleY, width: bounds.width * scaleX, height: bounds.height * scaleY }
}

export function resolveOverlayColor(color: OverlayColor, tokens: OverlayPack['tokens']): string {
  return color === 'ink' || color === 'paper' || color === 'mint' || color === 'line' ? tokens[color] : color
}

/** Bound values remain plain text; absent or invalid values retain editable fallback text. */
export function resolveOverlayText(layer: Extract<OverlayLayer, { type: 'text' }>, values?: OverlayValues): string {
  if (!layer.binding || !values) return layer.text
  const field = Object.getOwnPropertyDescriptor(values, layer.binding)
  const value: unknown = field && 'value' in field ? field.value : undefined
  return typeof value === 'string' && value.length <= OVERLAY_LIMITS.textLength && isValidOverlayText(value) ? value : layer.text
}

function outputDimensions(pack: OverlayPack, options: OverlayRenderOptions) {
  const width = options.width ?? pack.canvas.width
  const height = options.height ?? pack.canvas.height
  if (![width, height].every((value) => Number.isFinite(value) && value > 0 && value <= OVERLAY_LIMITS.canvasSize)) {
    throw new Error(`Output dimensions must be greater than zero and at most ${OVERLAY_LIMITS.canvasSize}.`)
  }
  return { width, height }
}

function prepare(pack: OverlayPack, screenId: string, options: OverlayRenderOptions) {
  const safePack = assertOverlayPack(pack)
  const screen = safePack.screens.find((item) => item.id === screenId)
  if (!screen) throw new Error(`Overlay screen '${screenId}' was not found.`)
  return { pack: safePack, screen, ...outputDimensions(safePack, options) }
}

/**
 * Painter order is layers-array order. Line bounds run from their top-left to their
 * bottom-right; zero width/height produces a vertical/horizontal line. Font size,
 * radius and stroke widths always use design pixels, even with normalized bounds.
 * Text uses explicit line breaks, 1.2 line height and clipping, never font compression.
 */
function paintScreen(ctx: CanvasRenderingContext2D, pack: OverlayPack, screen: OverlayScreen, options: OverlayCanvasOptions): void {
  const { width, height } = outputDimensions(pack, options)
  if (!options.clear && !screen.layers.some((layer) => layer.visible !== false && layer.opacity !== 0)) return
  ctx.save()
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (options.clear) ctx.clearRect(0, 0, width, height)
    const scale = Math.min(width / pack.canvas.width, height / pack.canvas.height)
    ctx.translate((width - pack.canvas.width * scale) / 2, (height - pack.canvas.height * scale) / 2)
    ctx.scale(scale, scale)
    ctx.beginPath()
    ctx.rect(0, 0, pack.canvas.width, pack.canvas.height)
    ctx.clip()
    ctx.globalCompositeOperation = 'source-over'
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.filter = 'none'
    ctx.setLineDash([])
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
    for (const layer of screen.layers) {
      if (layer.visible === false || layer.opacity === 0) continue
      const bounds = resolveOverlayBounds(layer.bounds, pack.canvas)
      ctx.save()
      try {
        ctx.globalAlpha = layer.opacity ?? 1
        if (layer.type === 'rect') {
          ctx.beginPath()
          const radius = Math.min(layer.radius ?? 0, bounds.width / 2, bounds.height / 2)
          if (radius) ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius)
          else ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height)
          ctx.fillStyle = resolveOverlayColor(layer.fill, pack.tokens)
          ctx.fill()
          if (layer.stroke) {
            ctx.strokeStyle = resolveOverlayColor(layer.stroke, pack.tokens)
            ctx.lineWidth = layer.strokeWidth ?? 1
            ctx.stroke()
          }
        } else if (layer.type === 'line') {
          ctx.beginPath()
          ctx.moveTo(bounds.x, bounds.y)
          ctx.lineTo(bounds.x + bounds.width, bounds.y + bounds.height)
          ctx.strokeStyle = resolveOverlayColor(layer.color, pack.tokens)
          ctx.lineWidth = layer.strokeWidth
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height)
          ctx.clip()
          const align = layer.align ?? 'left'
          const x = bounds.x + (align === 'center' ? bounds.width / 2 : align === 'right' ? bounds.width : 0)
          ctx.font = `${layer.fontWeight ?? 400} ${layer.fontSize}px ${OVERLAY_FONTS[layer.fontFamily]}`
          ctx.textBaseline = 'alphabetic'
          ctx.textAlign = align
          ctx.fillStyle = resolveOverlayColor(layer.color, pack.tokens)
          resolveOverlayText(layer, options.values).split('\n').forEach((line, index) => {
            ctx.fillText(line, x, bounds.y + layer.fontSize + index * layer.fontSize * 1.2)
          })
        }
      } finally { ctx.restore() }
    }
  } finally { ctx.restore() }
}

/** Validate/copy once when selecting a scene, then reuse for each video frame. */
export function createOverlayPainter(input: OverlayPack, screenId: string): OverlayPainter {
  const { pack, screen } = prepare(input, screenId, {})
  return (ctx, options = {}) => paintScreen(ctx, pack, screen, options)
}

/** Convenient for editor redraws. Video loops should retain createOverlayPainter(). */
export function drawOverlayScreen(ctx: CanvasRenderingContext2D, input: OverlayPack, screenId: string, options: OverlayCanvasOptions = {}): void {
  createOverlayPainter(input, screenId)(ctx, options)
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
}

function svgLayers(pack: OverlayPack, screen: OverlayScreen, values?: OverlayValues): string[] {
  return screen.layers.flatMap((layer) => {
    if (layer.visible === false || layer.opacity === 0) return []
    const { x, y, width, height } = resolveOverlayBounds(layer.bounds, pack.canvas)
    const opacity = layer.opacity ?? 1
    if (layer.type === 'rect') {
      const radius = Math.min(layer.radius ?? 0, width / 2, height / 2)
      const stroke = layer.stroke ? ` stroke="${resolveOverlayColor(layer.stroke, pack.tokens)}" stroke-width="${layer.strokeWidth ?? 1}"` : ''
      return [`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${resolveOverlayColor(layer.fill, pack.tokens)}" opacity="${opacity}"${stroke}/>`]
    }
    if (layer.type === 'line') {
      return [`<line x1="${x}" y1="${y}" x2="${x + width}" y2="${y + height}" stroke="${resolveOverlayColor(layer.color, pack.tokens)}" stroke-width="${layer.strokeWidth}" stroke-linecap="butt" opacity="${opacity}"/>`]
    }
    const align = layer.align ?? 'left'
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
    const textX = align === 'center' ? width / 2 : align === 'right' ? width : 0
    const lines = resolveOverlayText(layer, values).split('\n').map((line, index) => `<tspan x="${textX}" y="${layer.fontSize + index * layer.fontSize * 1.2}">${escapeXml(line)}</tspan>`).join('')
    // Nested viewports clip each text box without document-global clipPath IDs.
    return [`<svg x="${x}" y="${y}" width="${width}" height="${height}" overflow="hidden"><text fill="${resolveOverlayColor(layer.color, pack.tokens)}" font-family="${OVERLAY_FONTS[layer.fontFamily]}" font-size="${layer.fontSize}" font-weight="${layer.fontWeight ?? 400}" text-anchor="${anchor}" opacity="${opacity}" xml:space="preserve">${lines}</text></svg>`]
  })
}

/** Standalone SVG, transparent by construction. No guides, assets, HTML or scripts. */
export function exportSVG(input: OverlayPack, screenId: string, options: OverlayRenderOptions = {}): string {
  const { pack, screen, width, height } = prepare(input, screenId, options)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${pack.canvas.width} ${pack.canvas.height}" preserveAspectRatio="xMidYMid meet" overflow="hidden">${svgLayers(pack, screen, options.values).join('')}</svg>\n`
}
