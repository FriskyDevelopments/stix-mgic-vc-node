import { describe, expect, it, vi } from 'vitest'
import {
  createBlankPack, createOverlayPainter, createStarterPack, drawOverlayScreen, exportSVG,
  OVERLAY_LIMITS, type OverlayLayer, type OverlayPack, type OverlayValues,
} from './index'

function canvas() {
  const drawing: unknown[] = []
  const saved: Record<string, unknown>[] = []
  const properties = ['globalAlpha', 'globalCompositeOperation', 'fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign', 'textBaseline', 'filter', 'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'lineCap', 'lineJoin']
  const context = {
    globalAlpha: 0.4, font: 'original font', fillStyle: '#abcdef', strokeStyle: '#abcdef', lineWidth: 1, textAlign: 'left',
    save: vi.fn(() => saved.push(Object.fromEntries(properties.map((key) => [key, context[key]])))),
    restore: vi.fn(() => Object.assign(context, saved.pop())),
    setTransform: vi.fn(), translate: vi.fn(), scale: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(),
    rect: vi.fn(), roundRect: vi.fn(), clip: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), setLineDash: vi.fn(),
    fill: vi.fn(() => drawing.push(['fill', context.fillStyle, context.globalAlpha])),
    stroke: vi.fn(() => drawing.push(['stroke', context.strokeStyle, context.lineWidth, context.globalAlpha])),
    fillText: vi.fn((...args: unknown[]) => drawing.push(['text', ...args, context.fillStyle, context.font, context.textAlign])),
  }
  return { ctx: context as unknown as CanvasRenderingContext2D, context, drawing }
}

function packWith(layers: OverlayLayer[]): OverlayPack {
  const pack = createBlankPack()
  pack.screens[0].layers = layers
  return pack
}

function textLayer(text = 'Hello'): Extract<OverlayLayer, { type: 'text' }> {
  return { id: 'label', type: 'text', bounds: { unit: 'normalized', x: 0.25, y: 0.1, width: 0.5, height: 0.2 }, color: 'paper', fontFamily: 'serif', fontSize: 30, text }
}

const parseSVG = (source: string) => new DOMParser().parseFromString(source, 'image/svg+xml')

describe('overlay renderers', () => {
  it('compiles an isolated painter once so later edits do not change its live scene', () => {
    const pack = packWith([textLayer('Original')])
    const painter = createOverlayPainter(pack, 'empty-master')
    pack.screens[0].layers[0].bounds.x = 0
    pack.tokens.paper = '#000000'
    pack.screens[0].layers = []
    const { ctx, context, drawing } = canvas()
    painter(ctx)
    painter(ctx, { width: 960, height: 540 })
    expect(context.fillText).toHaveBeenCalledTimes(2)
    expect(context.fillText).toHaveBeenLastCalledWith('Original', 480, 138)
    expect(drawing).toEqual(Array(2).fill(['text', 'Original', 480, 138, '#f5f2ec', '400 30px Georgia, serif', 'left']))
    expect(context.scale).toHaveBeenLastCalledWith(0.5, 0.5)
  })

  it('renders no marks for the master and every empty starter scene, with no exported guides', () => {
    for (const pack of [createBlankPack(), createStarterPack()]) {
      for (const screen of pack.screens) {
        const { ctx, context, drawing } = canvas()
        drawOverlayScreen(ctx, pack, screen.id)
        expect(drawing).toEqual([])
        expect(context.clearRect).not.toHaveBeenCalled()
        expect(context.save).not.toHaveBeenCalled()
        const svg = parseSVG(exportSVG(pack, screen.id))
        expect(svg.querySelector('parsererror')).toBeNull()
        expect(svg.documentElement.childElementCount).toBe(0)
        expect(svg.documentElement.getAttribute('viewBox')).toBe('0 0 1920 1080')
      }
    }
  })

  it('clears only on request and preserves the caller context state', () => {
    const { ctx, context, drawing } = canvas()
    drawOverlayScreen(ctx, createBlankPack(), 'empty-master', { clear: true, width: 960, height: 540 })
    expect(context.clearRect).toHaveBeenCalledExactlyOnceWith(0, 0, 960, 540)
    expect(drawing).toEqual([])
    expect(ctx.globalAlpha).toBe(0.4)
    expect(ctx.font).toBe('original font')
    expect(context.save).toHaveBeenCalledTimes(context.restore.mock.calls.length)
  })

  it('fits and centers custom aspect ratios identically in Canvas and SVG without stretching', () => {
    const pack = packWith([textLayer()])
    const { ctx, context } = canvas()
    createOverlayPainter(pack, 'empty-master')(ctx, { width: 800, height: 800, clear: true })
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 800, 800)
    expect(context.translate).toHaveBeenCalledWith(0, 175)
    expect(context.scale).toHaveBeenCalledWith(800 / 1920, 800 / 1920)
    expect(context.fillText).toHaveBeenCalledWith('Hello', 480, 138)
    const svg = parseSVG(exportSVG(pack, 'empty-master', { width: 800, height: 800 }))
    expect(svg.documentElement.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
    expect(svg.documentElement.getAttribute('viewBox')).toBe('0 0 1920 1080')
    expect(svg.documentElement.getAttribute('width')).toBe('800')
    expect(svg.documentElement.getAttribute('height')).toBe('800')
  })

  it('uses matching normalized geometry, text baselines, multiline placement and clipping without compressing glyphs', () => {
    const pack = packWith([{ ...textLayer('One\nTwo'), align: 'center' }])
    const { ctx, context, drawing } = canvas()
    drawOverlayScreen(ctx, pack, 'empty-master', { width: 960, height: 540 })
    expect(context.scale).toHaveBeenCalledWith(0.5, 0.5)
    expect(context.rect).toHaveBeenCalledWith(480, 108, 960, 216)
    expect(context.clip).toHaveBeenCalledTimes(2)
    expect(context.fillText).toHaveBeenNthCalledWith(1, 'One', 960, 138)
    expect(context.fillText).toHaveBeenNthCalledWith(2, 'Two', 960, 174)
    expect(context.fillText.mock.calls.every((args) => args.length === 3)).toBe(true)
    expect(drawing[0]).toEqual(['text', 'One', 960, 138, '#f5f2ec', '400 30px Georgia, serif', 'center'])
    const svg = parseSVG(exportSVG(pack, 'empty-master', { width: 960, height: 540 }))
    expect(svg.documentElement.getAttribute('width')).toBe('960')
    const clip = svg.querySelector('svg > svg')!
    expect(['x', 'y', 'width', 'height', 'overflow'].map((attribute) => clip.getAttribute(attribute))).toEqual(['480', '108', '960', '216', 'hidden'])
    expect(svg.querySelector('text')?.getAttribute('text-anchor')).toBe('middle')
    expect([...svg.querySelectorAll('tspan')].map((line) => [line.textContent, line.getAttribute('x'), line.getAttribute('y')])).toEqual([['One', '480', '30'], ['Two', '480', '66']])
    expect(svg.querySelector('[id]')).toBeNull()
  })

  it('keeps painter order, token colors, opacity, corner limits and line endpoints consistent', () => {
    const pack = packWith([
      { id: 'panel', type: 'rect', bounds: { unit: 'px', x: 4, y: 4, width: 100, height: 20 }, radius: 100, fill: 'ink', stroke: 'mint', strokeWidth: 2, opacity: 0.5 },
      textLayer(),
      { id: 'rule', type: 'line', bounds: { unit: 'px', x: 10, y: 50, width: 90, height: 0 }, color: 'line', strokeWidth: 3 },
    ])
    const { ctx, context, drawing } = canvas()
    drawOverlayScreen(ctx, pack, 'empty-master')
    expect(context.roundRect).toHaveBeenCalledWith(4, 4, 100, 20, 10)
    expect(context.moveTo).toHaveBeenCalledWith(10, 50)
    expect(context.lineTo).toHaveBeenCalledWith(100, 50)
    expect(drawing).toEqual([
      ['fill', '#111a1c', 0.5], ['stroke', '#70c8ac', 2, 0.5],
      ['text', 'Hello', 480, 138, '#f5f2ec', '400 30px Georgia, serif', 'left'],
      ['stroke', '#334144', 3, 1],
    ])
    const svg = parseSVG(exportSVG(pack, 'empty-master'))
    expect([...svg.documentElement.children].map((node) => node.localName)).toEqual(['rect', 'svg', 'line'])
    expect(svg.querySelector('rect')?.getAttribute('rx')).toBe('10')
    expect(svg.querySelector('rect')?.getAttribute('opacity')).toBe('0.5')
    expect(svg.querySelector('line')?.getAttribute('x2')).toBe('100')
    expect(svg.querySelector('line')?.getAttribute('stroke-linecap')).toBe('butt')
  })

  it('escapes hostile literal and bound text as text, never HTML, scripts or SVG elements', () => {
    const payload = '<script onload="alert(1)">A & B\'s 🐾</script>'
    const pack = packWith([textLayer(payload), { ...textLayer('Fallback'), id: 'bound', binding: 'host.name' }])
    const values = { 'host.name': '</tspan><image href="https://example.test/tracker" />' }
    const source = exportSVG(pack, 'empty-master', { values })
    expect(source).toContain('&lt;script')
    expect(source).toContain('&amp;')
    expect(source).toContain('&quot;')
    expect(source).toContain('&apos;')
    const svg = parseSVG(source)
    expect(svg.querySelector('parsererror')).toBeNull()
    expect(svg.querySelector('script, image, foreignObject')).toBeNull()
    expect([...svg.querySelectorAll('text')].map((node) => node.textContent)).toEqual([payload, values['host.name']])
    const { ctx, context } = canvas()
    drawOverlayScreen(ctx, pack, 'empty-master', { values })
    expect(context.fillText).toHaveBeenCalledWith(payload, 480, 138)
    expect(context.fillText).toHaveBeenCalledWith(values['host.name'], 480, 138)
  })

  it('falls back for inherited/accessor/invalid/overlong values without reading accessors', () => {
    const pack = packWith([{ ...textLayer('Fallback'), binding: 'host.name' }])
    const getter = vi.fn(() => 'Do not read')
    const accessor = Object.defineProperty({}, 'host.name', { get: getter })
    const badValues: OverlayValues[] = [Object.create({ 'host.name': 'Inherited' }), accessor, { 'host.name': 'bad\u0000' }, { 'host.name': 'x'.repeat(OVERLAY_LIMITS.textLength + 1) }]
    for (const values of badValues) expect(parseSVG(exportSVG(pack, 'empty-master', { values })).querySelector('text')?.textContent).toBe('Fallback')
    expect(getter).not.toHaveBeenCalled()
    expect(parseSVG(exportSVG(pack, 'empty-master', { values: { 'host.name': '' } })).querySelector('text')?.textContent).toBe('')
  })

  it('omits hidden and fully transparent layers from both renderers', () => {
    const pack = packWith([{ ...textLayer(), visible: false }, { ...textLayer(), id: 'hidden-alpha', opacity: 0 }])
    const { ctx, drawing } = canvas()
    drawOverlayScreen(ctx, pack, 'empty-master')
    expect(drawing).toEqual([])
    expect(parseSVG(exportSVG(pack, 'empty-master')).documentElement.childElementCount).toBe(0)
  })

  it('rejects invalid input and unknown screens before drawing, and restores after a draw failure', () => {
    const pack = packWith([textLayer()])
    const { ctx, context } = canvas()
    expect(() => drawOverlayScreen(ctx, pack, 'missing')).toThrow('was not found')
    expect(() => exportSVG(pack, 'empty-master', { width: NaN })).toThrow('Output dimensions')
    expect(() => drawOverlayScreen(ctx, pack, 'empty-master', { height: Infinity })).toThrow('Output dimensions')
    expect(context.save).not.toHaveBeenCalled()
    context.fillText.mockImplementationOnce(() => { throw new Error('Canvas failure') })
    expect(() => drawOverlayScreen(ctx, pack, 'empty-master')).toThrow('Canvas failure')
    expect(context.save).toHaveBeenCalledTimes(context.restore.mock.calls.length)
    expect(ctx.globalAlpha).toBe(0.4)
    expect(ctx.font).toBe('original font')
  })
})
