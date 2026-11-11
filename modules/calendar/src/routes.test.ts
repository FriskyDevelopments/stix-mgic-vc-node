// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { exampleTenant } from '../../../packages/core/src/example.ts'
import { createTenantHandler, loadTenantConfig, type WorkerContext } from '../../../packages/core/src/index.ts'
import { createCalendarModule, memoryCalendarStore } from './module.ts'
import calendarWorker from './worker.ts'

const ctx: WorkerContext = { waitUntil() {} }
const now = new Date('2026-11-11T21:00:00.000Z')

function app(maxBookings = 1000, tenant = exampleTenant()) {
  return createTenantHandler({
    tenant,
    now: () => now,
    modules: [createCalendarModule(memoryCalendarStore(), maxBookings)],
  })
}

interface Handler {
  fetch(request: Request, env: { LOG_LEVEL?: string; TENANT_CONFIG_JSON?: string; TENANT_ID?: string }, context: WorkerContext): Promise<Response>
}

function call(handler: Handler, path: string, init?: RequestInit) {
  return handler.fetch(new Request(`https://tenant.test${path}`, init), { LOG_LEVEL: 'silent' }, ctx)
}

function post(handler: Handler, path: string, body: unknown) {
  return call(handler, path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('calendar module', () => {
  it('lists active services and can include inactive ones', async () => {
    const handler = app()
    const listed = await call(handler, '/calendar/services')
    const body = await listed.json() as { services: { slug: string }[] }
    expect(body.services.map((service) => service.slug)).toEqual(['sample'])
    expect(listed.headers.get('x-store')).toBe('memory')
    const all = await call(handler, '/calendar/services?includeInactive=1')
    const full = await all.json() as { services: { slug: string }[] }
    expect(full.services.map((service) => service.slug)).toEqual(['sample', 'paused'])
  })

  it('hides past and closed time and books only an open slot once', async () => {
    const handler = app()
    const pastDay = await call(handler, '/calendar/availability?service=sample&date=2026-11-10')
    expect(pastDay.status).toBe(422)
    expect(await pastDay.json()).toEqual({ error: 'date_in_past' })
    const pastBook = await post(handler, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-11-10T10:00:00-06:00',
      guestName: 'Ana',
    })
    expect(pastBook.status).toBe(422)
    expect(await pastBook.json()).toEqual({ error: 'date_in_past' })

    const closedBook = await post(handler, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-11-15T10:00:00-06:00',
      guestName: 'Ana',
    })
    expect(closedBook.status).toBe(422)
    expect(await closedBook.json()).toEqual({ error: 'closed' })

    const closed = await call(handler, '/calendar/availability?service=sample&date=2026-11-15')
    expect(await closed.json()).toMatchObject({ closed: true, slots: [] })

    const day = await call(handler, '/calendar/availability?service=sample&date=2026-11-11')
    const open = await day.json() as { slots: { start: string }[] }
    expect(open.slots.some((slot) => slot.start.startsWith('2026-11-11T14:00'))).toBe(false)
    expect(open.slots.some((slot) => slot.start.startsWith('2026-11-11T15:00'))).toBe(true)

    const distant = await post(handler, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2027-11-16T10:00:00-06:00',
      guestName: 'Ana',
    })
    expect(distant.status).toBe(422)
    expect(await distant.json()).toEqual({ error: 'horizon_exceeded' })
    const farDay = await call(handler, '/calendar/availability?service=sample&date=2027-11-16')
    expect(farDay.status).toBe(422)

    const impossible = await post(handler, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-02-31T10:00:00-06:00',
      guestName: 'Ana',
    })
    expect(impossible.status).toBe(400)
    expect(await impossible.json()).toEqual({ error: 'invalid_body' })

    const past = await post(handler, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-11-11T14:00:00-06:00',
      guestName: 'Ana',
    })
    expect(past.status).toBe(409)

    const paused = await post(handler, '/calendar/bookings', {
      serviceSlug: 'paused',
      start: '2026-11-16T10:00:00-06:00',
      guestName: 'Ana',
    })
    expect(paused.status).toBe(409)

    const hidden = await post(handler, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-11-16T10:00:00-06:00',
      guestName: 'Ana\u202e',
    })
    expect(hidden.status).toBe(400)

    const newline = await post(handler, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-11-16T10:00:00-06:00',
      guestName: 'Ana\n',
    })
    expect(newline.status).toBe(400)

    const booked = await post(handler, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-11-16T10:00:00-06:00',
      guestName: 'Ana',
    })
    expect(booked.status).toBe(201)
    const created = await booked.json() as { booking: { id: string; guestName: string } }
    expect(created.booking.guestName).toBe('Ana')

    const again = await post(handler, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-11-16T10:00:00-06:00',
      guestName: 'Bo',
    })
    expect(again.status).toBe(409)

    const after = await call(handler, '/calendar/availability?service=sample&date=2026-11-16')
    const slots = await after.json() as { slots: { start: string }[] }
    expect(slots.slots.some((slot) => slot.start === '2026-11-16T10:00:00-06:00')).toBe(false)

    const cancelled = await call(handler, `/calendar/bookings/${created.booking.id}/cancel`, { method: 'POST' })
    expect(cancelled.status).toBe(200)
    const rebooked = await post(handler, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-11-16T10:00:00-06:00',
      guestName: 'Bo',
    })
    expect(rebooked.status).toBe(201)
  })

  it('keeps one room across services and caps stored bookings', async () => {
    const base = exampleTenant()
    const tenant = loadTenantConfig({
      ...structuredClone(base),
      calendar: {
        ...base.calendar,
        services: [
          ...(base.calendar?.services ?? []),
          { slug: 'other', name: 'Other', durationMinutes: 60, priceMinor: null, active: true, confirmed: false },
        ],
      },
    })
    const handler = app(1000, tenant)
    const first = await post(handler, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-11-16T12:00:00-06:00',
      guestName: 'Ana',
    })
    expect(first.status).toBe(201)
    const cross = await post(handler, '/calendar/bookings', {
      serviceSlug: 'other',
      start: '2026-11-16T12:00:00-06:00',
      guestName: 'Bo',
    })
    expect(cross.status).toBe(409)

    const capped = app(1)
    const one = await post(capped, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-11-16T10:00:00-06:00',
      guestName: 'Ana',
    })
    expect(one.status).toBe(201)
    const taken = await post(capped, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-11-16T10:00:00-06:00',
      guestName: 'Bo',
    })
    expect(taken.status).toBe(409)
    const two = await post(capped, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-11-16T11:00:00-06:00',
      guestName: 'Bo',
    })
    expect(two.status).toBe(413)

    const freed = app(1)
    const held = await post(freed, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-11-16T10:00:00-06:00',
      guestName: 'Ana',
    })
    const heldId = (await held.json() as { booking: { id: string } }).booking.id
    expect((await call(freed, `/calendar/bookings/${heldId}/cancel`, { method: 'POST' })).status).toBe(200)
    const afterCancel = await post(freed, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-11-16T11:00:00-06:00',
      guestName: 'Bo',
    })
    expect(afterCancel.status).toBe(201)
    expect((await call(freed, `/calendar/bookings/${heldId}`)).status).toBe(200)
    const secondId = (await afterCancel.json() as { booking: { id: string } }).booking.id
    expect((await call(freed, `/calendar/bookings/${secondId}/cancel`, { method: 'POST' })).status).toBe(200)
    const third = await post(freed, '/calendar/bookings', {
      serviceSlug: 'sample',
      start: '2026-11-16T12:00:00-06:00',
      guestName: 'Cora',
    })
    expect(third.status).toBe(201)
    expect((await call(freed, `/calendar/bookings/${heldId}`)).status).toBe(404)
    expect((await call(freed, `/calendar/bookings/${secondId}`)).status).toBe(200)
  })

  it('answers 405 for a bad booking id when the method is not allowed', async () => {
    const res = await call(app(), '/calendar/bookings/not-a-uuid', { method: 'POST' })
    expect(res.status).toBe(405)
  })

  it('rejects an unsupported time zone when the config is loaded', () => {
    expect(() => loadTenantConfig({ ...structuredClone(exampleTenant()), timeZone: 'Europe/Madrid' })).toThrow(/timeZone/)
  })

  it('answers health when the tenant left calendar disabled', async () => {
    const tenant = loadTenantConfig({
      ...structuredClone(exampleTenant()),
      modules: ['neuronas'],
      calendar: null,
    })
    const env = { LOG_LEVEL: 'silent', TENANT_CONFIG_JSON: JSON.stringify(tenant) }
    const health = await calendarWorker.fetch(new Request('https://tenant.test/healthz'), env, ctx)
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ ok: true, tenant: 'example', module: 'calendar', enabled: false })
    const posted = await calendarWorker.fetch(new Request('https://tenant.test/healthz', { method: 'POST' }), env, ctx)
    expect(posted.status).toBe(405)
    expect(posted.headers.get('allow')).toBe('GET')
    expect((await calendarWorker.fetch(new Request('https://tenant.test/healthz'), { ...env, TENANT_ID: 'other' }, ctx)).status).toBe(503)
    const services = await calendarWorker.fetch(new Request('https://tenant.test/calendar/services'), env, ctx)
    expect(services.status).toBe(404)
  })

  it('boots from TENANT_CONFIG_JSON and fails closed without it', async () => {
    const missing = await calendarWorker.fetch(new Request('https://tenant.test/calendar/services'), { LOG_LEVEL: 'silent' }, ctx)
    expect(missing.status).toBe(503)
    expect(missing.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/i)
    expect(missing.headers.get('x-tenant')).toBeNull()
    const invalid = await calendarWorker.fetch(new Request('https://tenant.test/calendar/services'), {
      LOG_LEVEL: 'silent',
      TENANT_CONFIG_JSON: '{',
    }, ctx)
    expect(invalid.status).toBe(500)
    const ready = await calendarWorker.fetch(new Request('https://tenant.test/calendar/services'), {
      LOG_LEVEL: 'silent',
      TENANT_CONFIG_JSON: JSON.stringify(exampleTenant()),
    }, ctx)
    expect(ready.status).toBe(200)
    const body = await ready.json() as { services: { slug: string }[] }
    expect(body.services.map((service) => service.slug)).toEqual(['sample'])
  })
})
