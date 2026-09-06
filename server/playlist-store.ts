import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { telegramVcAdapter } from './telegram-vc-adapter'

export type PlaylistItem = {
  id: string
  url: string
  title: string
  duration?: number
  addedAt: number
}

export type Playlist = {
  id: string
  name: string
  tenantId: string
  items: PlaylistItem[]
  currentIndex: number
  playing: boolean
  createdAt: number
  updatedAt: number
}

const memoryStore = new Map<string, Map<string, Playlist>>()

function getStoragePath(tenantId: string): string {
  const baseDir = process.env.PLAYLIST_DIR || '/data/playlists'
  try {
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true })
    }
    return resolve(baseDir, `${tenantId}.json`)
  } catch {
    const fallbackDir = resolve(process.cwd(), 'data/playlists')
    if (!existsSync(fallbackDir)) {
      mkdirSync(fallbackDir, { recursive: true })
    }
    return resolve(fallbackDir, `${tenantId}.json`)
  }
}

function loadTenantPlaylists(tenantId: string): Map<string, Playlist> {
  if (memoryStore.has(tenantId)) {
    return memoryStore.get(tenantId)!
  }
  const map = new Map<string, Playlist>()
  try {
    const path = getStoragePath(tenantId)
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf8')) as Playlist[]
      for (const p of data) {
        map.set(p.id, p)
      }
    }
  } catch (error) {
    console.warn('[playlist-store] Error loading playlists for tenant:', tenantId, error)
  }
  memoryStore.set(tenantId, map)
  return map
}

function saveTenantPlaylists(tenantId: string): void {
  const map = memoryStore.get(tenantId)
  if (!map) return
  const list = [...map.values()]
  try {
    const path = getStoragePath(tenantId)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(list, null, 2), { mode: 0o600 })
  } catch (error) {
    console.warn('[playlist-store] Error saving playlists for tenant:', tenantId, error)
  }
}

export function resetPlaylistStore(): void {
  memoryStore.clear()
}

export function listPlaylists(tenantId: string): Playlist[] {
  const map = loadTenantPlaylists(tenantId)
  return [...map.values()]
}

export function getPlaylist(tenantId: string, id: string): Playlist | null {
  const map = loadTenantPlaylists(tenantId)
  return map.get(id) || null
}

export function createPlaylist(tenantId: string, name: string): Playlist {
  const map = loadTenantPlaylists(tenantId)
  const now = Date.now()
  const playlist: Playlist = {
    id: randomUUID(),
    name: name.trim() || 'Untitled Playlist',
    tenantId,
    items: [],
    currentIndex: 0,
    playing: false,
    createdAt: now,
    updatedAt: now,
  }
  map.set(playlist.id, playlist)
  saveTenantPlaylists(tenantId)
  return playlist
}

export function addPlaylistItem(
  tenantId: string,
  playlistId: string,
  item: { url: string; title?: string; duration?: number }
): Playlist | null {
  const map = loadTenantPlaylists(tenantId)
  const playlist = map.get(playlistId)
  if (!playlist) return null

  const newItem: PlaylistItem = {
    id: randomUUID(),
    url: item.url.trim(),
    title: item.title?.trim() || item.url.split('/').pop() || 'Untitled Media',
    duration: item.duration,
    addedAt: Date.now(),
  }
  playlist.items.push(newItem)
  playlist.updatedAt = Date.now()
  saveTenantPlaylists(tenantId)
  return playlist
}

export async function playPlaylist(
  tenantId: string,
  playlistId: string,
  startIndex: number = 0
): Promise<Playlist | null> {
  const map = loadTenantPlaylists(tenantId)
  const playlist = map.get(playlistId)
  if (!playlist || playlist.items.length === 0) return null

  playlist.currentIndex = Math.max(0, Math.min(startIndex, playlist.items.length - 1))
  playlist.playing = true
  playlist.updatedAt = Date.now()

  const currentItem = playlist.items[playlist.currentIndex]
  if (currentItem) {
    try {
      await telegramVcAdapter.source(currentItem.url)
    } catch (err) {
      console.warn('[playlist-store] Adapter source switch failed:', err)
    }
  }

  saveTenantPlaylists(tenantId)
  return playlist
}

export async function nextPlaylistItem(tenantId: string, playlistId: string): Promise<Playlist | null> {
  const map = loadTenantPlaylists(tenantId)
  const playlist = map.get(playlistId)
  if (!playlist || playlist.items.length === 0) return null

  if (playlist.currentIndex + 1 < playlist.items.length) {
    playlist.currentIndex += 1
  } else {
    // Loop back to start
    playlist.currentIndex = 0
  }
  playlist.playing = true
  playlist.updatedAt = Date.now()

  const nextItem = playlist.items[playlist.currentIndex]
  if (nextItem) {
    try {
      await telegramVcAdapter.source(nextItem.url)
    } catch (err) {
      console.warn('[playlist-store] Adapter source switch failed:', err)
    }
  }

  saveTenantPlaylists(tenantId)
  return playlist
}

export async function prevPlaylistItem(tenantId: string, playlistId: string): Promise<Playlist | null> {
  const map = loadTenantPlaylists(tenantId)
  const playlist = map.get(playlistId)
  if (!playlist || playlist.items.length === 0) return null

  if (playlist.currentIndex - 1 >= 0) {
    playlist.currentIndex -= 1
  } else {
    playlist.currentIndex = playlist.items.length - 1
  }
  playlist.playing = true
  playlist.updatedAt = Date.now()

  const prevItem = playlist.items[playlist.currentIndex]
  if (prevItem) {
    try {
      await telegramVcAdapter.source(prevItem.url)
    } catch (err) {
      console.warn('[playlist-store] Adapter source switch failed:', err)
    }
  }

  saveTenantPlaylists(tenantId)
  return playlist
}

export function pausePlaylist(tenantId: string, playlistId: string): Playlist | null {
  const map = loadTenantPlaylists(tenantId)
  const playlist = map.get(playlistId)
  if (!playlist) return null
  playlist.playing = false
  playlist.updatedAt = Date.now()
  try {
    void telegramVcAdapter.pause()
  } catch {
    // ignore
  }
  saveTenantPlaylists(tenantId)
  return playlist
}

export function resumePlaylist(tenantId: string, playlistId: string): Playlist | null {
  const map = loadTenantPlaylists(tenantId)
  const playlist = map.get(playlistId)
  if (!playlist) return null
  playlist.playing = true
  playlist.updatedAt = Date.now()
  try {
    void telegramVcAdapter.resume()
  } catch {
    // ignore
  }
  saveTenantPlaylists(tenantId)
  return playlist
}
