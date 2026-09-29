import { existsSync } from 'node:fs'
import { artworkFilePath } from './artwork-cache'

export type MusicArtworkResult = {
  id: string
  title: string
  artist: string
  album: string
  artworkUrl: string
  source: 'itunes' | 'placeholder'
  /** Apple Music page for the track (or the collection when the lookup is one). */
  listenUrl: string | null
  /** The Apple Music collection/album id backing this result, when known. */
  collectionId: string | null
  /**
   * Disk cache state for this source id. `cached` means the node volume already holds
   * the 600px artwork and the overlay/sticker pipeline can use it as a static image
   * source without another network fetch.
   */
  cached: boolean
}

export const FALLBACK_ARTWORK = '/assets/stickers/default.png'

/**
 * Resolve the node-served artwork URL for a cached source id. The cached file is a
 * valid `image` / `sticker` item for the video pipeline (VIDEO-PIPELINE.md §3): the
 * sticker overlay composites it onto the active video via the standard ffmpeg
 * filter_complex, no special-casing.
 */
export function cachedArtworkUrl(sourceId: string): string | null {
  const id = sourceId.trim()
  if (!id) return null
  try {
    if (!existsSync(artworkFilePath(id))) return null
  } catch {
    return null
  }
  return `/v1/music/artwork/file/${encodeURIComponent(id)}`
}

export async function lookupMusicArtwork(idOrQuery: string): Promise<MusicArtworkResult> {
  const query = idOrQuery.trim()
  if (!query) {
    return {
      id: 'default',
      title: 'STIX MΛGIC Track',
      artist: 'Folio Audio',
      album: 'Live Session',
      artworkUrl: FALLBACK_ARTWORK,
      source: 'placeholder',
      listenUrl: null,
      collectionId: null,
      cached: false,
    }
  }

  // If numeric, use lookup by ID; otherwise search by term
  const isNumeric = /^\d+$/.test(query)
  const url = isNumeric
    ? `https://itunes.apple.com/lookup?id=${encodeURIComponent(query)}`
    : `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)

    if (response.ok) {
      const data = (await response.json()) as {
        resultCount: number
        results: Array<{
          trackId?: number
          collectionId?: number
          trackName?: string
          collectionName?: string
          artistName?: string
          artworkUrl100?: string
          artworkUrl600?: string
          trackViewUrl?: string
          collectionViewUrl?: string
        }>
      }
      if (data.resultCount > 0 && data.results[0]) {
        const item = data.results[0]
        let artwork = item.artworkUrl600 || item.artworkUrl100 || FALLBACK_ARTWORK
        if (artwork.includes('100x100bb.jpg')) {
          artwork = artwork.replace('100x100bb.jpg', '600x600bb.jpg')
        }
        const id = String(item.trackId || item.collectionId || query)
        const listenUrl = item.trackViewUrl || item.collectionViewUrl || null
        const collectionId = item.collectionId ? String(item.collectionId) : null
        return {
          id,
          title: item.trackName || item.collectionName || 'Track',
          artist: item.artistName || 'Artist',
          album: item.collectionName || 'Album',
          artworkUrl: artwork,
          source: 'itunes',
          listenUrl,
          collectionId,
          cached: cachedArtworkUrl(id) !== null,
        }
      }
    }
  } catch (error) {
    console.warn('[music-artwork] iTunes lookup failed or timed out:', error)
  }

  // Fallback placeholder
  return {
    id: query,
    title: 'STIX MΛGIC Audio',
    artist: 'Folio Player',
    album: 'Live Stream',
    artworkUrl: FALLBACK_ARTWORK,
    source: 'placeholder',
    listenUrl: null,
    collectionId: null,
    cached: cachedArtworkUrl(query) !== null,
  }
}

/**
 * Fetch the 600px artwork for a resolved iTunes id and cache it on the node volume
 * (`/data/artwork`, see artwork-cache.ts). Returns the node-served URL when the bytes
 * were cached, or null when the fetch failed validation — the caller keeps serving
 * the remote `artworkUrl` (or the placeholder) rather than failing the lookup.
 *
 * The download is capped at ~5MB and 10s, accepts only `image/*` responses, and only
 * caches bytes from Apple's mzstatic CDN. Refresh is explicit (the DJ panel's refresh
 * action), never silent: artwork does not change under a cached id often enough to
 * justify revalidation traffic on every lookup.
 */
export async function cacheMusicArtwork(
  sourceId: string,
  artworkUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const id = sourceId.trim()
  if (!id || !artworkUrl.startsWith('https://')) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const response = await fetchImpl(artworkUrl, { signal: controller.signal })
    clearTimeout(timer)
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) return null
    const { putCachedArtwork } = await import('./artwork-cache')
    const record = putCachedArtwork(id, artworkUrl, buffer)
    return record ? cachedArtworkUrl(id) : null
  } catch {
    return null
  }
}
