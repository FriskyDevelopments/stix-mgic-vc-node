/**
 * listen-link.ts — the universal listen link for a resolved track.
 *
 * One resolved track, one link that opens in the listener's own service. The node
 * serves it at `GET /l/:trackId` (path chosen by the DJ MVP spec:
 * `docs/superpowers/specs/2026-09-28-nebu-dj-mvp-design.md` §2.4 — the landing
 * bundle takes no redirects, so the link lives on the node next to the bot).
 *
 * The Apple Music track page (from the iTunes `trackViewUrl`) has a full web player,
 * so it is the target on every platform. Only when iTunes has no page for the id
 * does the link degrade to a public Spotify search for "<artist> - <title>" (no
 * Spotify auth, no API — Spotify appears only as a listening destination, never as
 * control).
 *
 * Copy is honest: "opens in your service", never "now playing". When iTunes has no
 * result for the id, the link page says so instead of sending the listener to a
 * wrong track.
 */

export type ListenTarget = {
  kind: 'apple' | 'spotify-search'
  url: string
}

export function spotifySearchUrl(artist: string, title: string): string {
  const query = [artist.trim(), title.trim()].filter(Boolean).join(' - ').trim()
  return `https://open.spotify.com/search/${encodeURIComponent(query || 'music')}`
}

/**
 * Compose the listen target. `listenUrl` is the iTunes `trackViewUrl` (preferred) or
 * `collectionViewUrl`. The Apple Music page has a full web player, so the exact track
 * page is the target on every platform; only when iTunes has no page for the id does
 * the link degrade to a Spotify search built from the resolved artist/title.
 */
export function composeListenTarget(input: {
  listenUrl: string | null
  artist: string
  title: string
  userAgent?: string
}): ListenTarget {
  if (input.listenUrl) {
    return { kind: 'apple', url: input.listenUrl }
  }
  return { kind: 'spotify-search', url: spotifySearchUrl(input.artist, input.title) }
}

/** The node-served path DJs and bot replies share for a resolved track id. */
export function listenLinkPath(trackId: string): string {
  return `/l/${encodeURIComponent(trackId.trim())}`
}
