import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedArtworkUrl, cacheMusicArtwork, lookupMusicArtwork, FALLBACK_ARTWORK } from './music-artwork'

let artworkDir: string

beforeEach(() => {
  // Isolate the on-disk artwork cache per test: the default ARTWORK_DIR is shared
  // process state, and an earlier cache test would otherwise leak `cached: true`
  // into lookup assertions.
  artworkDir = mkdtempSync(join(tmpdir(), 'vc-music-artwork-'))
  vi.stubEnv('ARTWORK_DIR', artworkDir)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  rmSync(artworkDir, { recursive: true, force: true })
})

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
    expect(res.listenUrl).toBeNull()

    vi.unstubAllGlobals()
  })

  it('carries the Apple Music listen URL and collection id on a track result', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        resultCount: 1,
        results: [
          {
            trackId: 1440857795,
            collectionId: 1440857781,
            trackName: 'Banana Pancakes',
            artistName: 'Jack Johnson',
            collectionName: 'In Between Dreams (Bonus Track Version)',
            artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg',
            trackViewUrl: 'https://music.apple.com/us/album/banana-pancakes/1440857781?i=1440857795&uo=4',
            collectionViewUrl: 'https://music.apple.com/us/album/banana-pancakes/1440857781?i=1440857795&uo=4',
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fakeFetch)

    const res = await lookupMusicArtwork('Banana Pancakes Jack Johnson')
    expect(res.source).toBe('itunes')
    expect(res.id).toBe('1440857795')
    expect(res.listenUrl).toContain('music.apple.com')
    expect(res.listenUrl).toContain('i=1440857795')
    expect(res.collectionId).toBe('1440857781')
    expect(res.cached).toBe(false)

    vi.unstubAllGlobals()
  })

  it('reports a cached source id so the overlay pipeline can use the node file', async () => {
    const jpegFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: async () => Buffer.from('fake-jpeg-bytes'),
    })
    vi.stubGlobal('fetch', jpegFetch)
    const cachedUrl = await cacheMusicArtwork('cached-track-1', 'https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg', jpegFetch as unknown as typeof fetch)
    expect(cachedUrl).toBe('/v1/music/artwork/file/cached-track-1')
    expect(cachedArtworkUrl('cached-track-1')).toBe('/v1/music/artwork/file/cached-track-1')
    expect(cachedArtworkUrl('never-cached-id')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('caches fetched artwork bytes and refuses non-image responses', async () => {
    const jpeg = Buffer.from('fake-jpeg-bytes')
    const imageFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: async () => jpeg,
    })
    const url = await cacheMusicArtwork('1440857795', 'https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg', imageFetch as unknown as typeof fetch)
    expect(url).toBe('/v1/music/artwork/file/1440857795')
    expect(cachedArtworkUrl('1440857795')).toBe('/v1/music/artwork/file/1440857795')

    const htmlFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      arrayBuffer: async () => Buffer.from('<html>'),
    })
    expect(await cacheMusicArtwork('other-id', 'https://is1-ssl.mzstatic.com/x.jpg', htmlFetch as unknown as typeof fetch)).toBeNull()
    expect(cachedArtworkUrl('other-id')).toBeNull()
  })
})
