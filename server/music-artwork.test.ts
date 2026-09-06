import { describe, expect, it, vi } from 'vitest'
import { lookupMusicArtwork, FALLBACK_ARTWORK } from './music-artwork'

describe('music-artwork', () => {
  it('returns fallback placeholder when query is empty', async () => {
    const res = await lookupMusicArtwork('')
    expect(res.source).toBe('placeholder')
    expect(res.artworkUrl).toBe(FALLBACK_ARTWORK)
  })

  it('fetches track artwork from itunes lookup API on valid response', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        resultCount: 1,
        results: [
          {
            trackId: 1440857781,
            trackName: 'Test Song',
            artistName: 'Test Artist',
            collectionName: 'Test Album',
            artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg',
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fakeFetch)

    const res = await lookupMusicArtwork('1440857781')
    expect(res.source).toBe('itunes')
    expect(res.title).toBe('Test Song')
    expect(res.artist).toBe('Test Artist')
    expect(res.artworkUrl).toContain('600x600bb.jpg')

    vi.unstubAllGlobals()
  })

  it('falls back gracefully to placeholder on network failure', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('Network offline'))
    vi.stubGlobal('fetch', fakeFetch)

    const res = await lookupMusicArtwork('999999')
    expect(res.source).toBe('placeholder')
    expect(res.artworkUrl).toBe(FALLBACK_ARTWORK)

    vi.unstubAllGlobals()
  })
})
