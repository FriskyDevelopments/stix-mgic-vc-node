import { describe, expect, it } from 'vitest'
import { buildFfmpegFilterComplex, listStickers, saveSticker } from './stickers'

describe('stickers', () => {
  it('lists default sticker', () => {
    const stickers = listStickers('test-tenant')
    expect(stickers.length).toBeGreaterThan(0)
    const def = stickers.find((s) => s.id === 'default')
    expect(def).toBeDefined()
    expect(def?.name).toContain('Default')
  })

  it('saves custom sticker and lists it for the tenant', () => {
    const fakeBuffer = Buffer.from('fake-png-data')
    const saved = saveSticker('test-tenant', 'my-sticker.png', fakeBuffer)
    expect(saved.id).toBeDefined()
    expect(saved.name).toBe('my-sticker.png')
    expect(saved.size).toBe(fakeBuffer.length)

    const list = listStickers('test-tenant')
    const found = list.find((s) => s.id === saved.id)
    expect(found).toBeDefined()
  })

  it('builds ffmpeg filter_complex with configurable position, scale, and opacity', () => {
    const filterDefault = buildFfmpegFilterComplex(0, 1)
    expect(filterDefault).toContain('overlay=W-w-10:H-h-10')
    expect(filterDefault).toContain('scale=iw*0.25')
    expect(filterDefault).toContain('aa=0.85')

    const filterCustom = buildFfmpegFilterComplex(0, 1, {
      position: 'top-left',
      scale: 0.5,
      opacity: 0.9,
    })
    expect(filterCustom).toContain('overlay=10:10')
    expect(filterCustom).toContain('scale=iw*0.50')
    expect(filterCustom).toContain('aa=0.90')

    const filterExactCoords = buildFfmpegFilterComplex(0, 1, {
      x: 100,
      y: 200,
    })
    expect(filterExactCoords).toContain('overlay=100:200')
  })
})
