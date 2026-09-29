import { apiHeaders, apiUrl } from '@/lib/api-client'

export type AppleMusicArtwork = {
  id: string
  title: string
  artist: string
  album: string
  artworkUrl: string
  source: 'itunes' | 'placeholder'
  listenUrl: string | null
  collectionId: string | null
  cached: boolean
  cachedArtworkUrl: string | null
  listenLink: string | null
}

export class AppleMusicError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'AppleMusicError'
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = apiHeaders(init.headers as HeadersInit | undefined)
  const response = await fetch(apiUrl(path), { ...init, headers })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new AppleMusicError(response.status, body.error || `Apple Music request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

/**
 * Resolve a Folio-stored Apple Music source id (or a free-text query) through the
 * node's iTunes lookup. No OAuth, no secrets — the id is enough for public artwork.
 */
export function lookupAppleMusic(idOrQuery: string): Promise<AppleMusicArtwork> {
  return request<AppleMusicArtwork>(`/v1/music/artwork?id=${encodeURIComponent(idOrQuery)}`)
}

/**
 * Cache the resolved 600px artwork onto the node volume. The returned URL is a
 * static image source for the overlay/sticker pipeline (VIDEO-PIPELINE.md §3).
 */
export function cacheAppleMusicArtwork(id: string): Promise<{ id: string; cachedArtworkUrl: string; listenLink: string }> {
  return request(`/v1/music/artwork/cache`, { method: 'POST', body: JSON.stringify({ id }) })
}

/** The node-served universal listen link for a resolved track id (`GET /l/:trackId`). */
export function listenLinkUrl(trackId: string): string {
  return apiUrl(`/l/${encodeURIComponent(trackId.trim())}`)
}
