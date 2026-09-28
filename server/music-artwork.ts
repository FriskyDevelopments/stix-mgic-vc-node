export type MusicArtworkResult = {
  id: string
  title: string
  artist: string
  album: string
  artworkUrl: string
  source: 'itunes' | 'placeholder'
}

export const FALLBACK_ARTWORK = '/assets/stickers/default.png'

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
        }>
      }
      if (data.resultCount > 0 && data.results[0]) {
        const item = data.results[0]
        let artwork = item.artworkUrl600 || item.artworkUrl100 || FALLBACK_ARTWORK
        if (artwork.includes('100x100bb.jpg')) {
          artwork = artwork.replace('100x100bb.jpg', '600x600bb.jpg')
        }
        return {
          id: String(item.trackId || item.collectionId || query),
          title: item.trackName || item.collectionName || 'Track',
          artist: item.artistName || 'Artist',
          album: item.collectionName || 'Album',
          artworkUrl: artwork,
          source: 'itunes',
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
  }
}
