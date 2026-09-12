import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('NebuLanding brand surface', () => {
  const source = readFileSync(resolve(__dirname, 'NebuLanding.tsx'), 'utf8')
  const motion = readFileSync(resolve(__dirname, '../styles/nebu-motion.css'), 'utf8')

  it('uses NEBU board colors and Set the scene copy', () => {
    expect(source).toContain('#0d081a')
    expect(source).toContain('#f5e000')
    expect(source).toContain('Set the')
    expect(source).toContain('scene')
    expect(source).toContain('Open your studio')
  })

  it('leads with a plain product-category value prop, poetic line second', () => {
    expect(source).toContain('A browser studio to prepare, preview, and share.')
    expect(source).toContain('Your scene. Your sound. Your people.')
    const valuePropAt = source.indexOf('A browser studio to prepare, preview, and share.')
    const poeticAt = source.indexOf('Your scene. Your sound. Your people.')
    expect(valuePropAt).toBeGreaterThan(-1)
    expect(poeticAt).toBeGreaterThan(valuePropAt)
  })

  it('keeps a single yellow Open your studio CTA above the fold', () => {
    const hero = source.slice(source.indexOf('{/* Hero */}'), source.indexOf('</section>'))
    expect(hero).toContain('Open your studio')
    expect(hero).toContain('href={STUDIO_URL}')
    expect(hero).toContain('Take a look around')
    expect(hero).toContain('href="#studio"')
    const header = source.slice(source.indexOf('<header'), source.indexOf('</header>'))
    expect(header).not.toContain('Open studio')
    expect(header).not.toContain('nebu-cta')
    expect(header).not.toContain('#f5e000')
  })

  it('uses near-white body copy beside All the parts on dark ground', () => {
    expect(source).toContain('All the parts.')
    expect(source).toContain('nebu-body-copy')
    expect(source).toContain('text-white/90')
    expect(source).toContain('One place to play.')
  })

  it('makes Studio/Sound/Rooms/Record full-card links with hover/focus', () => {
    const cards = source.slice(source.indexOf('{PARTS.map'), source.indexOf('</section>', source.indexOf('{PARTS.map')))
    expect(cards).toContain('href={STUDIO_URL}')
    expect(cards).toContain('aria-label={`Open studio — ${title}: ${blurb}`}')
    expect(cards).toContain('className="nebu-card block rounded-3xl')
    expect(cards).toContain('focus-visible:outline')
    expect(cards).not.toContain('tab-arrow')
    expect(source).toContain("const STUDIO_URL = '/login'")
  })

  it('keeps hero art inside a padded safe area', () => {
    expect(source).toContain('nebu-hero-art')
    expect(source).toContain('nebu-hero-badge')
    expect(motion).toContain('.nebu-hero-art')
    expect(motion).toContain('padding: 2.75rem 2.25rem 3.5rem')
    expect(motion).toContain('overflow: visible')
  })

  it('ships purposeful motion with reduced-motion fallback', () => {
    expect(source).toContain('nebu-float')
    expect(source).toContain('nebu-live-pulse')
    expect(source).toContain('nebu-card')
    const reducedMotion = motion.slice(motion.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reducedMotion).toContain('prefers-reduced-motion')
    expect(motion).toContain('nebu-panel-in')
    const tickerRule = reducedMotion.slice(
      reducedMotion.indexOf('.nebu-ticker-track'),
      reducedMotion.indexOf('}', reducedMotion.indexOf('.nebu-ticker-track')),
    )
    expect(tickerRule).toContain('animation: none !important')
  })

  it('pauses the ticker for reduced motion and keeps the copy readable', () => {
    expect(source).toContain('nebu-ticker')
    expect(source).toContain('Your camera')
    expect(motion).toContain('nebu-ticker-scroll')
    const reducedMotion = motion.slice(motion.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reducedMotion).toContain(".nebu-ticker-group[aria-hidden='true']")
    const tickerGroupRule = reducedMotion.slice(
      reducedMotion.indexOf('.nebu-ticker-group {'),
      reducedMotion.indexOf('}', reducedMotion.indexOf('.nebu-ticker-group {')),
    )
    expect(tickerGroupRule).toContain('white-space: normal')
  })

  it('does not put an Open studio link in the footer', () => {
    const footer = source.slice(source.indexOf('<footer'), source.indexOf('</footer>'))
    expect(footer).not.toContain('Open your studio')
    expect(footer).not.toContain('href="/login"')
    expect(footer).not.toContain('href={STUDIO_URL}')
    expect(footer).not.toContain('href={LOGIN_URL}')
  })

  it('routes studio CTA to NEBU /login (not vc.friskydev.com)', () => {
    expect(source).toContain("const STUDIO_URL = '/login'")
    expect(source).not.toContain('https://vc.friskydev.com')
  })

  it('includes donate promo copy and donation link', () => {
    expect(source).toContain('Keep the scene running.')
    expect(source).toContain('https://ko-fi.com/friskypup')
    expect(source).toContain('https://nowpayments.io/donation/Frisky')
    expect(source).toContain('id="support"')
  })

  it('links Ashy’s mega-easy walkthrough', () => {
    expect(source).toContain('/units/ashy')
    expect(source).toContain('Like Ashy’s room')
  })
})
