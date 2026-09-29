import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  artworkFileName,
  getArtworkDir,
  getCachedArtwork,
  putCachedArtwork,
  readCachedArtworkBytes,
} from './artwork-cache'

let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vc-artwork-'))
  vi.stubEnv('ARTWORK_DIR', directory)
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

describe('artwork-cache — the Folio-pattern artwork store', () => {
  it('uses the configured artwork directory', () => {
    expect(getArtworkDir()).toBe(directory)
  })

  it('names files by hash so a hostile source id cannot traverse the volume', () => {
    const hostile = artworkFileName('../../etc/passwd')
    expect(hostile).toMatch(/^[a-f0-9]{40}\.jpg$/)
    expect(artworkFileName('a')).not.toBe(artworkFileName('b'))
    expect(artworkFileName('1440857781')).toMatch(/^[a-f0-9]{40}\.jpg$/)
  })

  it('caches mzstatic bytes and reads them back', () => {
    const bytes = Buffer.from('fake-jpeg-bytes')
    const record = putCachedArtwork('1440857781', 'https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg', bytes)
    expect(record).not.toBeNull()
    expect(record?.sourceId).toBe('1440857781')
    expect(record?.size).toBe(bytes.length)

    const cached = getCachedArtwork('1440857781')
    expect(cached?.size).toBe(bytes.length)
    expect(readCachedArtworkBytes('1440857781')?.equals(bytes)).toBe(true)
  })

  it('misses cleanly before anything is cached', () => {
    expect(getCachedArtwork('unknown-id')).toBeNull()
    expect(readCachedArtworkBytes('unknown-id')).toBeNull()
    expect(getCachedArtwork('  ')).toBeNull()
  })

  it('refuses non-https artwork URLs', () => {
    expect(putCachedArtwork('x', 'http://is1-ssl.mzstatic.com/x.jpg', Buffer.from('x'))).toBeNull()
  })

  it('refuses bytes from hosts other than the Apple artwork CDN', () => {
    expect(putCachedArtwork('x', 'https://evil.example/x.jpg', Buffer.from('x'))).toBeNull()
    expect(getCachedArtwork('x')).toBeNull()
  })

  it('refuses empty bodies', () => {
    expect(putCachedArtwork('x', 'https://is1-ssl.mzstatic.com/x.jpg', Buffer.alloc(0))).toBeNull()
  })
})
