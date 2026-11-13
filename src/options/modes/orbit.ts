import type { Disc, ModeContent } from '../discs'

export interface NowPlaying {
  title: string
  subtitle: string
  imageUrl: string
}

const FALLBACK: Disc[] = [
  { id: 'stix-1', title: 'STIX Library 01', subtitle: 'House set', imageUrl: '/options/fallback/stix-1.jpg', accent: '#8FC1FF' },
  { id: 'stix-2', title: 'STIX Library 02', subtitle: 'House set', imageUrl: '/options/fallback/stix-2.jpg', accent: '#8FC1FF' },
  { id: 'stix-3', title: 'STIX Library 03', subtitle: 'House set', imageUrl: '/options/fallback/stix-3.jpg', accent: '#8FC1FF' },
  { id: 'stix-4', title: 'STIX Library 04', subtitle: 'House set', imageUrl: '/options/fallback/stix-4.jpg', accent: '#8FC1FF' },
  { id: 'stix-5', title: 'STIX Library 05', subtitle: 'House set', imageUrl: '/options/fallback/stix-5.jpg', accent: '#8FC1FF' },
]

export function orbitContent(nowPlaying: NowPlaying | null): ModeContent {
  const discs = [...FALLBACK]
  if (nowPlaying) {
    discs[0] = { id: 'now-playing', title: nowPlaying.title, subtitle: nowPlaying.subtitle, imageUrl: nowPlaying.imageUrl, accent: '#8FC1FF' }
  }
  return {
    mode: 'orbit',
    discs,
    palette: { sky: '#05070D', ribbon: '#8FC1FF', particle: '143, 193, 255' },
    headline: 'Orbit Room',
    subcopy: nowPlaying ? 'Live from your Spotify.' : 'Connect Spotify for live art — showing the house set.',
  }
}
