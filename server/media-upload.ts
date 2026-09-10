import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type MediaFile = {
  id: string
  tenantId: string
  name: string
  path: string
  url: string
  size: number
  createdAt: number
}

function getMediaDir(tenantId: string): string {
  const baseDir = process.env.MEDIA_DIR || '/data/media'
  try {
    const dir = resolve(baseDir, tenantId)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    return dir
  } catch {
    const fallbackDir = resolve(process.cwd(), 'data/media', tenantId)
    if (!existsSync(fallbackDir)) {
      mkdirSync(fallbackDir, { recursive: true })
    }
    return fallbackDir
  }
}

export function listMediaFiles(tenantId: string): MediaFile[] {
  const dir = getMediaDir(tenantId)
  const files: MediaFile[] = []

  if (existsSync(dir)) {
    const entries = readdirSync(dir)
    for (const file of entries) {
      const filePath = resolve(dir, file)
      const stats = statSync(filePath)
      const id = file.replace(/\.[^/.]+$/, '')
      files.push({
        id,
        tenantId,
        name: file,
        path: filePath,
        url: `/v1/media/file/${tenantId}/${file}`,
        size: stats.size,
        createdAt: stats.ctimeMs,
      })
    }
  }

  return files
}

export function saveMediaFile(
  tenantId: string,
  fileName: string,
  buffer: Buffer
): MediaFile {
  const dir = getMediaDir(tenantId)
  const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const ext = cleanName.includes('.') ? cleanName.slice(cleanName.lastIndexOf('.')) : '.mp4'
  const baseName = cleanName.includes('.') ? cleanName.slice(0, cleanName.lastIndexOf('.')) : cleanName
  const id = `${baseName}-${randomUUID().slice(0, 8)}`
  const finalName = `${id}${ext}`
  const filePath = resolve(dir, finalName)

  writeFileSync(filePath, buffer, { mode: 0o600 })

  return {
    id,
    tenantId,
    name: cleanName,
    path: filePath,
    url: `/v1/media/file/${tenantId}/${finalName}`,
    size: buffer.length,
    createdAt: Date.now(),
  }
}
