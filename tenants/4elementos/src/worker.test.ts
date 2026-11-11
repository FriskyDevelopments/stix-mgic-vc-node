import { describe, expect, it } from 'vitest'
import type { WorkerContext } from '../../../packages/core/src/index.ts'
import { fourElementos, fourElementosNotes } from './tenant.ts'
import worker, { createFourElementosHandler } from './worker.ts'

const ctx: WorkerContext = { waitUntil() {} }
const now = () => new Date('2026-11-11T21:00:00.000Z')
const env = { TENANT_ID: '4elementos', LOG_LEVEL: 'silent' as const }

const handler = createFourElementosHandler(now)

function call(path: string, init?: RequestInit) {
  return handler.fetch(new Request(`https://4elementos.test${path}`, init), env, ctx)
}

describe('4 Elementos tenant', () => {
  it('publishes provisional brand tokens and unconfirmed services', async () => {
    expect(fourElementos.theme.typography.status).toBe('provisional')
    expect(fourElementos.calendar?.hoursConfirmed).toBe(false)
    expect(fourElementos.neuronas?.allowDelete).toBe(false)
    expect(fourElementos.calendar?.services).toHaveLength(5)
    for (const service of fourElementos.calendar?.services ?? []) {
      expect(service.priceMinor).toBeNull()
      expect(service.confirmed).toBe(false)
      expect(service.durationMinutes).toBe(60)
    }
    expect(fourElementosNotes).toHaveLength(8)

    const blob = JSON.stringify({ fourElementos, fourElementosNotes })
    expect(blob).not.toMatch(/ntn_|secret_|sk_live|api[_-]?key|BEGIN PRIVATE|Bearer /i)
    expect(blob).not.toContain('41544c9f')

    const home = await worker.fetch(new Request('https://4elementos.test/'), env, ctx)
    expect(home.status).toBe(200)
    const manifest = await home.json() as {
      tenant: { id: string; hoursConfirmed: boolean }
      theme: { typographyStatus: string; cssVariables: Record<string, string> }
      routes: { id: string }[]
    }
    expect(manifest.tenant).toMatchObject({ id: '4elementos', hoursConfirmed: false })
    expect(manifest.theme.typographyStatus).toBe('provisional')
    expect(manifest.theme.cssVariables['--wl-color-fuego']).toBe('#c4653a')
    expect(manifest.routes.map((route) => route.id)).toEqual(['calendar', 'neuronas'])

    const mismatch = await worker.fetch(new Request('https://4elementos.test/healthz'), { TENANT_ID: 'other', LOG_LEVEL: 'silent' }, ctx)
    expect(mismatch.status).toBe(503)
  })

  it('books one shared room and keeps neuronas notes', async () => {
    const services = await call('/calendar/services')
    const listed = await services.json() as { services: { slug: string; confirmed: boolean; priceMinor: null }[] }
    expect(listed.services.map((service) => service.slug)).toEqual([
      'masaje-relajante',
      'descontracturante',
      'piedras-calientes',
      'reflexologia',
      'aromaterapia',
    ])
    expect(listed.services.every((service) => service.confirmed === false && service.priceMinor === null)).toBe(true)

    const sunday = await call('/calendar/availability?service=reflexologia&date=2026-11-15')
    expect(await sunday.json()).toMatchObject({ closed: true, hoursConfirmed: false })

    const booked = await call('/calendar/bookings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        serviceSlug: 'masaje-relajante',
        start: '2026-11-16T10:00:00-06:00',
        guestName: 'María',
      }),
    })
    expect(booked.status).toBe(201)
    const booking = await booked.json() as { booking: { confirmedService: boolean; guestName: string } }
    expect(booking.booking.guestName).toBe('María')
    expect(booking.booking.confirmedService).toBe(false)

    const cross = await call('/calendar/bookings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        serviceSlug: 'descontracturante',
        start: '2026-11-16T10:00:00-06:00',
        guestName: 'Ana',
      }),
    })
    expect(cross.status).toBe(409)

    const notes = await call('/neuronas/notes?collection=servicios')
    const body = await notes.json() as { notes: { title: string }[] }
    expect(body.notes).toHaveLength(5)
    const marca = await call('/neuronas/notes/catalog:marca')
    expect(marca.status).toBe(200)
    const deleted = await call('/neuronas/notes/catalog:marca', { method: 'DELETE' })
    expect(deleted.status).toBe(405)
  })
})
