import { describe, expect, it, vi } from 'vitest'
import {
  createBlankPack, createStarterPack, DEFAULT_OVERLAY_TOKENS, exportOverlayPack,
  importOverlayPack, OVERLAY_LIMITS, OverlayValidationError, STARTER_SCREEN_TITLES,
  validateOverlayPack, type OverlayLayer,
} from './index'

const rect = (): OverlayLayer => ({ id: 'panel', type: 'rect', bounds: { unit: 'px', x: 0, y: 0, width: 120, height: 60 }, fill: 'paper' })
const text = (): OverlayLayer => ({ id: 'name', type: 'text', bounds: { unit: 'normalized', x: 0.1, y: 0.1, width: 0.8, height: 0.2 }, text: 'A plain name', fontFamily: 'serif', fontSize: 32, color: 'ink' })

describe('overlay pack format', () => {
  it('creates a truly empty transparent master with draft metadata and existing tokens', () => {
    const pack = createBlankPack()
    expect(pack).toMatchObject({ schemaVersion: 1, title: 'VC Node', author: '', status: 'draft', commercialStatus: 'unreviewed', canvas: { width: 1920, height: 1080, background: 'transparent' }, tokens: DEFAULT_OVERLAY_TOKENS })
    expect(pack.screens).toEqual([{ id: 'empty-master', title: 'Empty master', layers: [] }])
    expect(validateOverlayPack(pack).ok).toBe(true)
    expect(exportOverlayPack(pack)).not.toContain('license')
  })

  it('creates 20 named broadcast slots without sharing mutable layers or tokens', () => {
    const pack = createStarterPack()
    expect(pack.screens.map((screen) => screen.id)).toEqual(Array.from({ length: 20 }, (_, index) => `screen-${String(index + 1).padStart(2, '0')}`))
    expect(pack.screens.map((screen) => screen.title)).toEqual(STARTER_SCREEN_TITLES)
    expect(pack.screens.every((screen) => screen.layers.length === 0)).toBe(true)
    pack.screens[0].layers.push(rect())
    pack.tokens.ink = '#000000'
    expect(pack.screens[1].layers).toEqual([])
    expect(createStarterPack().screens[0].layers).toEqual([])
    expect(createBlankPack().tokens.ink).toBe('#111a1c')
  })

  it('round-trips a validated pack as fresh JSON data', () => {
    const pack = createBlankPack()
    pack.screens[0].layers.push(rect(), text())
    const result = importOverlayPack(exportOverlayPack(pack))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected valid pack')
    expect(result.pack).toEqual(pack)
    expect(exportOverlayPack(result.pack)).toBe(exportOverlayPack(pack))
    result.pack.screens[0].layers[0].bounds.x = 40
    expect(pack.screens[0].layers[0].bounds.x).toBe(0)
  })

  it.each([
    ['schema version', { schemaVersion: 2 }],
    ['script field', { script: 'alert(1)' }],
    ['license invention field', { license: 'all rights granted' }],
    ['invalid metadata', { title: 'Bad\u0000title' }],
    ['unsupported background', { canvas: { width: 1920, height: 1080, background: '#ffffff' } }],
  ])('rejects %s with useful paths', (_, changes) => {
    const result = validateOverlayPack({ ...createBlankPack(), ...changes })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toEqual({ path: expect.any(String), message: expect.any(String) })
  })

  it.each([
    { ...rect(), type: 'html', html: '<script>alert(1)</script>' },
    { ...rect(), fill: 'url(https://example.test/tracker.svg)' },
    { ...rect(), image: 'https://example.test/image.png' },
    { ...text(), fontFamily: 'Arial; background:url(https://example.test)' },
    { ...text(), binding: '__proto__' },
    { ...text(), text: 'bad\ud800' },
    { ...text(), text: 'bad\uffff' },
  ])('rejects unsupported layer data %#', (layer) => {
    const pack = createBlankPack()
    const result = validateOverlayPack({ ...pack, screens: [{ ...pack.screens[0], layers: [layer] }] })
    expect(result.ok).toBe(false)
  })

  it('accepts safe hex colors, valid Unicode and known bindings without interpreting markup', () => {
    const pack = createBlankPack()
    pack.screens[0].layers = [{ ...text(), type: 'text', fontFamily: 'mono', fontSize: 24, color: '#70c8ac80', text: '<script> & 🐾\nPlain text', binding: 'host.name' }]
    expect(validateOverlayPack(pack).ok).toBe(true)
  })

  it.each([
    { unit: 'normalized', x: 0.8, y: 0, width: 0.3, height: 0.1 },
    { unit: 'px', x: 1910, y: 0, width: 20, height: 10 },
    { unit: 'px', x: -1, y: 0, width: 20, height: 10 },
    { unit: 'px', x: NaN, y: 0, width: 20, height: 10 },
    { unit: 'px', x: 0, y: 0, width: Infinity, height: 10 },
    { unit: 'px', x: 0, y: 0, width: 0, height: 10 },
  ])('rejects invalid or outside-canvas bounds %#', (bounds) => {
    const pack = createBlankPack()
    const result = validateOverlayPack({ ...pack, screens: [{ ...pack.screens[0], layers: [{ ...rect(), bounds }] }] })
    expect(result.ok).toBe(false)
  })

  it('allows horizontal/vertical lines but rejects zero-length lines and duplicate IDs', () => {
    const pack = createBlankPack()
    const line: OverlayLayer = { id: 'rule', type: 'line', bounds: { unit: 'px', x: 0, y: 0, width: 100, height: 0 }, color: 'line', strokeWidth: 1 }
    pack.screens[0].layers = [line]
    expect(validateOverlayPack(pack).ok).toBe(true)
    line.bounds.width = 0
    expect(validateOverlayPack(pack).ok).toBe(false)
    line.bounds.height = 100
    expect(validateOverlayPack(pack).ok).toBe(true)
    pack.screens[0].layers.push({ ...line })
    expect(validateOverlayPack(pack).ok).toBe(false)
    pack.screens[0].layers.pop()
    pack.screens.push({ ...pack.screens[0], layers: [] })
    expect(validateOverlayPack(pack).ok).toBe(false)
  })

  it('enforces screen/layer/text/import limits before export or rendering', () => {
    const pack = createBlankPack()
    pack.screens = Array.from({ length: OVERLAY_LIMITS.screens + 1 }, (_, index) => ({ id: `s-${index}`, title: 'Screen', layers: [] }))
    expect(validateOverlayPack(pack).ok).toBe(false)
    pack.screens = createBlankPack().screens
    pack.screens[0].layers = Array.from({ length: OVERLAY_LIMITS.layersPerScreen + 1 }, (_, index) => ({ ...rect(), id: `l-${index}` }))
    expect(validateOverlayPack(pack).ok).toBe(false)
    pack.screens[0].layers = [{ ...text(), type: 'text', fontFamily: 'sans', fontSize: 10, color: 'ink', text: 'x'.repeat(OVERLAY_LIMITS.textLength + 1) }]
    expect(() => exportOverlayPack(pack)).toThrow(OverlayValidationError)
    expect(importOverlayPack(' '.repeat(OVERLAY_LIMITS.jsonLength + 1)).ok).toBe(false)
    expect(importOverlayPack('{broken json').ok).toBe(false)
  })

  it('exports compact JSON when formatting would exceed the import limit, keeping large packs round-trippable', () => {
    const pack = createBlankPack()
    pack.screens = Array.from({ length: 41 }, (_, screenIndex) => ({
      id: `s-${screenIndex}`, title: 'Screen',
      layers: Array.from({ length: 200 }, (_, layerIndex) => ({ ...rect(), id: `l-${layerIndex}` })),
    }))
    expect(JSON.stringify(pack, null, 2).length).toBeGreaterThan(OVERLAY_LIMITS.jsonLength)
    expect(JSON.stringify(pack).length).toBeLessThan(OVERLAY_LIMITS.jsonLength)
    const exported = exportOverlayPack(pack)
    expect(exported.length).toBeLessThanOrEqual(OVERLAY_LIMITS.jsonLength)
    expect(exported.split('\n')).toHaveLength(2)
    expect(JSON.parse(exported)).toEqual(pack)
    expect(importOverlayPack(exported).ok).toBe(true)

    pack.screens.forEach((screen) => {
      screen.layers = screen.layers.map((layer) => ({ ...text(), id: layer.id, type: 'text', text: 'x'.repeat(500), color: 'ink', fontFamily: 'sans', fontSize: 20 }))
    })
    expect(validateOverlayPack(pack)).toEqual({ ok: false, errors: [{ path: '$', message: `Pack JSON exceeds ${OVERLAY_LIMITS.jsonLength} characters.` }] })
  })

  it('rejects prototype keys, inherited data and accessors without invoking them', () => {
    const pack = createBlankPack()
    expect(validateOverlayPack(Object.create(pack)).ok).toBe(false)
    const title = vi.fn(() => 'Unexpected getter')
    Object.defineProperty(pack, 'title', { enumerable: true, get: title })
    expect(validateOverlayPack(pack).ok).toBe(false)
    expect(title).not.toHaveBeenCalled()
    expect(importOverlayPack(exportOverlayPack(createBlankPack()).replace('"tokens": {', '"tokens": {"__proto__":{"polluted":true},')).ok).toBe(false)
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
  })
})
