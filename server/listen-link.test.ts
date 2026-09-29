import { describe, expect, it } from 'vitest'
import { composeListenTarget, listenLinkPath, spotifySearchUrl } from './listen-link'

describe('listen-link — one track, one honest link', () => {
  it('points at the Apple Music page whenever iTunes resolved one', () => {
    const apple = 'https://music.apple.com/us/album/banana-pancakes/1440857781?i=1440857795&uo=4'
    for (const userAgent of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
      undefined,
    ]) {
      const target = composeListenTarget({
        listenUrl: apple,
        artist: 'Jack Johnson',
        title: 'Banana Pancakes',
        userAgent,
      })
      expect(target).toEqual({ kind: 'apple', url: apple })
    }
  })

  it('degrades to a Spotify search only when iTunes has no page', () => {
    const target = composeListenTarget({ listenUrl: null, artist: 'Jack Johnson', title: 'Banana Pancakes' })
    expect(target.kind).toBe('spotify-search')
    expect(target.url).toBe('https://open.spotify.com/search/Jack%20Johnson%20-%20Banana%20Pancakes')
  })

  it('builds a Spotify search from whatever artist/title survived', () => {
    expect(spotifySearchUrl('  ', '  ')).toBe('https://open.spotify.com/search/music')
    expect(spotifySearchUrl('', 'Banana Pancakes')).toContain('Banana%20Pancakes')
  })

  it('serves node listen links from /l/<trackId>', () => {
    expect(listenLinkPath('1440857795')).toBe('/l/1440857795')
    expect(listenLinkPath(' 1440857795 ')).toBe('/l/1440857795')
  })
})
