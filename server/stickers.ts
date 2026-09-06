import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type Sticker = {
  id: string
  tenantId: string
  name: string
  path: string
  url: string
  size: number
  createdAt: number
}

export type OverlayPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

export type OverlayConfig = {
  position?: OverlayPosition
  x?: number
  y?: number
  scale?: number // 0.1 to 1.0, default 0.25
  opacity?: number // 0.0 to 1.0, default 0.85
}

function getStickersDir(tenantId: string): string {
  const baseDir = process.env.STICKERS_DIR || '/data/stickers'
  try {
    const dir = resolve(baseDir, tenantId)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    return dir
  } catch {
    const fallbackDir = resolve(process.cwd(), 'data/stickers', tenantId)
    if (!existsSync(fallbackDir)) {
      mkdirSync(fallbackDir, { recursive: true })
    }
    return fallbackDir
  }
}

export function listStickers(tenantId: string): Sticker[] {
  const dir = getStickersDir(tenantId)
  const stickers: Sticker[] = []

  // Add default sticker first
  const defaultPath = resolve(process.cwd(), 'public/assets/stickers/default.png')
  if (existsSync(defaultPath)) {
    const stats = statSync(defaultPath)
    stickers.push({
      id: 'default',
      tenantId: 'system',
      name: 'STIX MΛGIC Mark (Default)',
      path: defaultPath,
      url: '/assets/stickers/default.png',
      size: stats.size,
      createdAt: stats.ctimeMs,
    })
  }

  if (existsSync(dir)) {
    const files = readdirSync(dir)
    for (const file of files) {
      if (!file.endsWith('.png') && !file.endsWith('.webp') && !file.endsWith('.gif')) continue
      const filePath = resolve(dir, file)
      const stats = statSync(filePath)
      const id = file.replace(/\.[^/.]+$/, '')
      stickers.push({
        id,
        tenantId,
        name: file,
        path: filePath,
        url: `/v1/stickers/file/${tenantId}/${file}`,
        size: stats.size,
        createdAt: stats.ctimeMs,
      })
    }
  }

  return stickers
}

export function saveSticker(
  tenantId: string,
  fileName: string,
  buffer: Buffer
): Sticker {
  const dir = getStickersDir(tenantId)
  const id = randomUUID()
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '.png'
  const safeName = `${id}${ext}`
  const filePath = resolve(dir, safeName)

  writeFileSync(filePath, buffer, { mode: 0o600 })

  return {
    id,
    tenantId,
    name: fileName,
    path: filePath,
    url: `/v1/stickers/file/${tenantId}/${safeName}`,
    size: buffer.length,
    createdAt: Date.now(),
  }
}

export function buildFfmpegFilterComplex(
  videoInputIndex: number,
  stickerInputIndex: number,
  config: OverlayConfig = {}
): string {
  const scale = typeof config.scale === 'number' ? Math.max(0.05, Math.min(config.scale, 1.0)) : 0.25
  const opacity = typeof config.opacity === 'number' ? Math.max(0.0, Math.min(config.opacity, 1.0)) : 0.85
  const position = config.position || 'bottom-right'

  let posStr: string
  switch (position) {
    case 'top-left':
      posStr = '10:10'
      break
    case 'top-right':
      posStr = 'W-w-10:10'
      break
    case 'bottom-left':
      posStr = '10:H-h-10'
      break
    case 'center':
      posStr = '(W-w)/2:(H-h)/2'
      break
    case 'bottom-right':
    default:
      posStr = 'W-w-10:H-h-10'
      break
  }

  if (typeof config.x === 'number' && typeof config.y === 'number') {
    posStr = `${config.x}:${config.y}`
  }

  // filter_complex pipeline:
  // [1:v]format=rgba,colorchannelmixer=aa=0.85,scale=iw*0.25:-1[stk];[0:v][stk]overlay=W-w-10:H-h-10[outv]
  return `[${stickerInputIndex}:v]format=rgba,colorchannelmixer=aa=${opacity.toFixed(2)},scale=iw*${scale.toFixed(2)}:-1[stk];[${videoInputIndex}:v][stk]overlay=${posStr}[outv]`
}
