import type { OptionsMode } from './mode'

export type { OptionsMode }

export interface Disc {
  id: string
  title: string
  subtitle: string
  imageUrl: string
  accent: string
}

export interface ModePalette {
  sky: string
  ribbon: string
  particle: string
}

export interface ModeContent {
  mode: OptionsMode
  discs: Disc[]
  palette: ModePalette
  headline: string
  subcopy: string
}
