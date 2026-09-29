import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * artwork-cache.ts — the Folio-pattern artwork store for music source ids.
 *
 * The Folio move (APPLE-MUSIC-WIDGET.md): the operator stores a music source id ONCE,
 * and launch + overlay rendering resolve artwork and metadata from that id at runtime.
 * Swapping providers later is a config change, not a UI rewrite. v1 resolves through
 * the free iTunes lookup endpoint (no OAuth, no secrets); the MusicKit upgrade keeps
 * the same ids as migration keys.
 *
 * Files land at `<ARTWORK_DIR>/<sha1-of-source-id>.jpg` (`/data/artwork` on the node
 * volume, same discipline as playlists/stickers/media: `*_DIR` env override, cwd
 * fallback for dev/test, mode 0600). The filename is a hash, never the raw id, so a
 * hostile id cannot escape the directory. Only `image/jpeg` bytes fetched from an
 * `https:` mzstatic host are cached — anything else keeps the in-memory metadata and
 * the placeholder artwork, never a foreign file on the volume.
 */

export type CachedArtwork = {
  /** The operator-facing source id (Folio-stored Apple Music id). */
  sourceId: string
  /** Local filename on the node volume. */
  file: string
  /** Bytes on disk. */
  size: number
  /** When the bytes were cached. */
  cachedAt: number
  /** The remote URL the bytes came from (iTunes 600px artwork). */
  remoteUrl: string
}

export function getArtworkDir(): string {
  const baseDir = process.env.ARTWORK_DIR || '/data/artwork'
  try {
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true })
    }
    return baseDir
  } catch {
    const fallbackDir = resolve(process.cwd(), 'data/artwork')
    if (!existsSync(fallbackDir)) {
      mkdirSync(fallbackDir, { recursive: true })
    }
    return fallbackDir
  }
}

/** Directory-safe filename for a source id. A hash, so hostile ids cannot traverse. */
export function artworkFileName(sourceId: string): string {
  return `${createHash('sha1').update(sourceId).digest('hex')}.jpg`
}

export function artworkFilePath(sourceId: string): string {
  return resolve(getArtworkDir(), artworkFileName(sourceId))
}

export function getCachedArtwork(sourceId: string): CachedArtwork | null {
  const id = sourceId.trim()
  if (!id) return null
  const filePath = artworkFilePath(id)
  if (!existsSync(filePath)) return null
  try {
    const stats = statSync(filePath)
    if (!stats.isFile() || stats.size === 0) return null
    return {
      sourceId: id,
      file: artworkFileName(id),
      size: stats.size,
      cachedAt: stats.mtimeMs,
      remoteUrl: '',
    }
  } catch {
    return null
  }
}

export function readCachedArtworkBytes(sourceId: string): Buffer | null {
  const id = sourceId.trim()
  if (!id) return null
  try {
    const filePath = artworkFilePath(id)
    if (!existsSync(filePath)) return null
    return readFileSync(filePath)
  } catch {
    return null
  }
}

/**
 * Cache one artwork file. Returns the record, or null when the bytes are refused:
 * non-https URL, non-mzstatic host, wrong content type, empty body, or unwritable
 * volume. Refusal is silent-by-design — callers fall back to the placeholder.
 */
export function putCachedArtwork(sourceId: string, remoteUrl: string, bytes: Buffer): CachedArtwork | null {
  const id = sourceId.trim()
  if (!id || bytes.length === 0) return null
  let host = ''
  try {
    const url = new URL(remoteUrl)
    if (url.protocol !== 'https:') return null
    host = url.hostname
  } catch {
    return null
  }
  if (!host.endsWith('.mzstatic.com') && host !== 'mzstatic.com') return null
  try {
    const dir = getArtworkDir()
    const filePath = resolve(dir, artworkFileName(id))
    mkdirSync(dir, { recursive: true })
    writeFileSync(filePath, bytes, { mode: 0o600 })
    const stats = statSync(filePath)
    return {
      sourceId: id,
      file: artworkFileName(id),
      size: stats.size,
      cachedAt: stats.mtimeMs,
      remoteUrl,
    }
  } catch {
    return null
  }
}
