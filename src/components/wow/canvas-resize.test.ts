/**
 * Regression guard for the runaway background canvases.
 *
 * `ParticleField` and `AnimatedGradient` sized their backing store from
 * `getBoundingClientRect()`. A canvas with no CSS size takes its box from its own
 * width/height attributes, so each write grew the box, the ResizeObserver re-fired on that
 * growth, and the element doubled until it saturated at 33 554 432 px — which is what
 * washed the remounted control plane out to a blank page in production.
 *
 * These tests read the source rather than the DOM: jsdom has no layout, so it cannot
 * reproduce the feedback loop. What it can prove is that the two locks that break it are
 * still in place — a pinned CSS size, and a guard before touching the attributes.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const COMPONENTS = ['ParticleField.tsx', 'AnimatedGradient.tsx'] as const

function source(file: string): string {
  return readFileSync(join(__dirname, file), 'utf8')
}

describe.each(COMPONENTS)('%s canvas sizing', (file) => {
  it('pins the canvas box in CSS so its rect cannot come from its own attributes', () => {
    expect(source(file)).toMatch(/h-full w-full/)
  })

  it('skips the attribute write when the backing store already matches the box', () => {
    expect(source(file)).toMatch(
      /if \(canvas\.width === nextWidth && canvas\.height === nextHeight\) return/
    )
  })

  it('leaves the backing store alone until the element actually has a box', () => {
    expect(source(file)).toMatch(/if \(rect\.width === 0 \|\| rect\.height === 0\) return/)
  })

  it('replaces the transform instead of compounding scale() on every resize', () => {
    const code = source(file)
    expect(code).toMatch(/ctx\.setTransform\(dpr, 0, 0, dpr, 0, 0\)/)
    expect(code).not.toMatch(/ctx\.scale\(/)
  })
})
