import type { Disc, ModeContent } from '../discs'

const SHOWCASE_DISCS: Disc[] = [
  { id: 'show-1', title: 'Signal Bloom', subtitle: 'Showcase cut 01', imageUrl: '/options/showcase/show-1.jpg', accent: '#8FC1FF' },
  { id: 'show-2', title: 'Night Relay', subtitle: 'Showcase cut 02', imageUrl: '/options/showcase/show-2.jpg', accent: '#A78BFA' },
  { id: 'show-3', title: 'Static Bloom', subtitle: 'Showcase cut 03', imageUrl: '/options/showcase/show-3.jpg', accent: '#77F2D0' },
  { id: 'show-4', title: 'Low Orbit', subtitle: 'Showcase cut 04', imageUrl: '/options/showcase/show-4.jpg', accent: '#FB923C' },
  { id: 'show-5', title: 'Glass Static', subtitle: 'Showcase cut 05', imageUrl: '/options/showcase/show-5.jpg', accent: '#F472B6' },
  { id: 'show-6', title: 'Afterglow', subtitle: 'Showcase cut 06', imageUrl: '/options/showcase/show-6.jpg', accent: '#49D6FF' },
  { id: 'show-7', title: 'Last Light', subtitle: 'Showcase cut 07', imageUrl: '/options/showcase/show-7.jpg', accent: '#FACC15' },
]

export function showcaseContent(): ModeContent {
  return {
    mode: 'showcase',
    discs: SHOWCASE_DISCS,
    palette: { sky: '#07070F', ribbon: '#A78BFA', particle: '167, 139, 250' },
    headline: 'Showcase',
    subcopy: 'A curated set. Pick a disc to dock it.',
  }
}
