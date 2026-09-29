import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPlaylist,
  listPlaylists,
  addPlaylistItem,
  ensureDjPlaylist,
  playPlaylist,
  nextPlaylistItem,
  prevPlaylistItem,
  pausePlaylist,
  resumePlaylist,
  resetPlaylistStore,
} from './playlist-store'
import { telegramVcAdapter } from './telegram-vc-adapter'

vi.mock('./telegram-vc-adapter', () => ({
  telegramVcAdapter: {
    source: vi.fn().mockResolvedValue({ paired: true, active: true }),
    pause: vi.fn().mockResolvedValue({ paired: true, active: true, paused: true }),
    resume: vi.fn().mockResolvedValue({ paired: true, active: true, paused: false }),
  },
}))

describe('playlist-store', () => {
  const tenant = 'tenant-123'

  beforeEach(() => {
    resetPlaylistStore()
    vi.clearAllMocks()
  })

  it('creates and lists playlists per tenant', () => {
    const p1 = createPlaylist(tenant, 'Lo-Fi Chill')
    expect(p1.id).toBeDefined()
    expect(p1.name).toBe('Lo-Fi Chill')
    expect(p1.items).toHaveLength(0)

    const list = listPlaylists(tenant)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(p1.id)

    // Other tenant has no playlists
    expect(listPlaylists('other-tenant')).toHaveLength(0)
  })

  it('adds items to a playlist', () => {
    const p = createPlaylist(tenant, 'Video Pack')
    const updated = addPlaylistItem(tenant, p.id, {
      url: 'https://cdn.example.com/video1.mp4',
      title: 'Intro Video',
      duration: 120,
    })
    expect(updated).not.toBeNull()
    expect(updated?.items).toHaveLength(1)
    expect(updated?.items[0].url).toBe('https://cdn.example.com/video1.mp4')
    expect(updated?.items[0].title).toBe('Intro Video')
    expect(updated?.items[0].duration).toBe(120)
  })

  it('plays playlist and switches adapter source', async () => {
    const p = createPlaylist(tenant, 'Show')
    addPlaylistItem(tenant, p.id, { url: '/data/media/item1.mp4', title: 'Item 1' })
    addPlaylistItem(tenant, p.id, { url: '/data/media/item2.mp4', title: 'Item 2' })

    const played = await playPlaylist(tenant, p.id)
    expect(played?.playing).toBe(true)
    expect(played?.currentIndex).toBe(0)
    expect(telegramVcAdapter.source).toHaveBeenCalledWith('/data/media/item1.mp4')
  })

  it('advances pointer with next and loops when finished', async () => {
    const p = createPlaylist(tenant, 'Show')
    addPlaylistItem(tenant, p.id, { url: '/data/media/item1.mp4', title: 'Item 1' })
    addPlaylistItem(tenant, p.id, { url: '/data/media/item2.mp4', title: 'Item 2' })

    await playPlaylist(tenant, p.id)
    const next = await nextPlaylistItem(tenant, p.id)
    expect(next?.currentIndex).toBe(1)
    expect(telegramVcAdapter.source).toHaveBeenCalledWith('/data/media/item2.mp4')

    // Next again loops to 0
    const looped = await nextPlaylistItem(tenant, p.id)
    expect(looped?.currentIndex).toBe(0)
    expect(telegramVcAdapter.source).toHaveBeenCalledWith('/data/media/item1.mp4')
  })

  it('moves pointer with prev', async () => {
    const p = createPlaylist(tenant, 'Show')
    addPlaylistItem(tenant, p.id, { url: '/data/media/item1.mp4', title: 'Item 1' })
    addPlaylistItem(tenant, p.id, { url: '/data/media/item2.mp4', title: 'Item 2' })

    await playPlaylist(tenant, p.id, 1)
    const prev = await prevPlaylistItem(tenant, p.id)
    expect(prev?.currentIndex).toBe(0)
  })

  it('pauses and resumes playlist', () => {
    const p = createPlaylist(tenant, 'Show')
    const paused = pausePlaylist(tenant, p.id)
    expect(paused?.playing).toBe(false)
    expect(telegramVcAdapter.pause).toHaveBeenCalled()

    const resumed = resumePlaylist(tenant, p.id)
    expect(resumed?.playing).toBe(true)
    expect(telegramVcAdapter.resume).toHaveBeenCalled()
  })

  it('resolves the NEBU DJ playlist by name: creates once, reuses after', () => {
    const first = ensureDjPlaylist(tenant)
    expect(first.name).toBe('NEBU DJ')
    const second = ensureDjPlaylist(tenant)
    expect(second.id).toBe(first.id)
    expect(listPlaylists(tenant)).toHaveLength(1)
  })

  it('keeps the NEBU DJ playlist tenant-isolated', () => {
    const mine = ensureDjPlaylist(tenant)
    const theirs = ensureDjPlaylist('other-tenant')
    expect(theirs.id).not.toBe(mine.id)
  })

  it('does not mistake a same-cased lookalike for the DJ playlist seed', () => {
    // `ensureDjPlaylist` matches case-insensitively by design (a "nebu dj" left by an
    // older build is the same queue), but a DIFFERENT name never matches.
    createPlaylist(tenant, 'NEBU DJ set friday')
    const resolved = ensureDjPlaylist(tenant)
    expect(resolved.name).toBe('NEBU DJ')
    expect(listPlaylists(tenant)).toHaveLength(2)
  })
})
