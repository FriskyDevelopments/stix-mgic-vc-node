import { json, readJson, routeTail, type RequestContext } from '../../../packages/core/src/index.ts'
import { hasControlChars } from '../../../packages/core/src/text.ts'
import type { CatalogService } from '../../../packages/core/src/schema.ts'
import { buildSlots, civilDate, daysBetween, offsetFor, overlaps, weekdayOfDate } from './slots.ts'
import type { Booking, CalendarStore } from './store.ts'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const STORE = { 'x-store': 'memory' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function guestName(value: unknown): string | null {
  if (typeof value !== 'string' || hasControlChars(value)) return null
  const name = value.trim()
  if (name.length < 1 || name.length > 80) return null
  return name
}

function serviceBySlug(services: readonly CatalogService[], slug: string): CatalogService | undefined {
  return services.find((service) => service.slug === slug)
}

export async function handleCalendar(
  request: Request,
  ctx: RequestContext,
  store: CalendarStore,
  maxBookings: number,
): Promise<Response> {
  const calendar = ctx.tenant.calendar
  if (!calendar) return json({ error: 'not_found' }, 404)
  const tail = routeTail(new URL(request.url).pathname, '/calendar')
  if (tail === null) return json({ error: 'not_found' }, 404)
  if (tail === '/') {
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { allow: 'GET' })
    return json({
      module: 'calendar',
      timeZone: ctx.tenant.timeZone,
      hoursConfirmed: calendar.hoursConfirmed,
      store: 'memory',
    }, 200, STORE)
  }
  if (tail === '/services') return listServices(request, calendar.services)
  if (tail === '/availability') return availability(request, ctx, store)
  if (tail === '/bookings') return createBooking(request, ctx, store, maxBookings)
  const cancel = /^\/bookings\/([^/]+)\/cancel$/.exec(tail)
  if (cancel) return cancelBooking(request, ctx, store, cancel[1] ?? '')
  const one = /^\/bookings\/([^/]+)$/.exec(tail)
  if (one) return oneBooking(request, ctx, store, one[1] ?? '')
  return json({ error: 'not_found' }, 404)
}

function listServices(request: Request, services: readonly CatalogService[]): Response {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { allow: 'GET' })
  const includeInactive = new URL(request.url).searchParams.get('includeInactive') === '1'
  const visible = includeInactive ? services : services.filter((service) => service.active)
  return json({
    services: visible.map((service) => ({
      slug: service.slug,
      name: service.name,
      durationMinutes: service.durationMinutes,
      priceMinor: service.priceMinor,
      active: service.active,
      confirmed: service.confirmed,
    })),
    store: 'memory',
  }, 200, STORE)
}

async function availability(request: Request, ctx: RequestContext, store: CalendarStore): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { allow: 'GET' })
  const calendar = ctx.tenant.calendar
  if (!calendar) return json({ error: 'not_found' }, 404)
  const url = new URL(request.url)
  const slug = url.searchParams.get('service') ?? ''
  const date = url.searchParams.get('date') ?? ''
  if (!SLUG.test(slug) || weekdayOfDate(date) === null) return json({ error: 'invalid_query' }, 400)
  const service = serviceBySlug(calendar.services, slug)
  if (!service) return json({ error: 'service_not_found' }, 404)
  if (!service.active) return json({ error: 'service_inactive' }, 409)
  const offset = offsetFor(ctx.tenant.timeZone)
  if (!offset) return json({ error: 'timezone_not_supported' }, 422)
  const viewedAt = ctx.clock()
  const today = civilDate(viewedAt, offset)
  const ahead = today ? daysBetween(date, today) : null
  if (ahead === null || ahead > calendar.horizonDays) return json({ error: 'horizon_exceeded' }, 422, STORE)
  const weekday = weekdayOfDate(date)
  const hours = calendar.hours.find((entry) => entry.weekday === weekday)
  if (!hours) {
    return json({
      date,
      service: slug,
      timeZone: ctx.tenant.timeZone,
      offset,
      hoursConfirmed: calendar.hoursConfirmed,
      closed: true,
      slots: [],
      store: 'memory',
    }, 200, STORE)
  }
  const slots = buildSlots(date, hours.open, hours.close, service.durationMinutes, offset)
  // null is a bad duration or hours pair. An empty list means the day is open and the service does not fit.
  if (!slots) return json({ error: 'invalid_hours' }, 500)
  const bookings = await activeBookings(store, ctx.tenant.id)
  const open = slots.filter((slot) => {
    if (Date.parse(slot.start) < viewedAt.getTime()) return false
    return !bookings.some((booking) => overlaps(slot.start, slot.end, booking.start, booking.end))
  })
  return json({
    date,
    service: slug,
    timeZone: ctx.tenant.timeZone,
    offset,
    hoursConfirmed: calendar.hoursConfirmed,
    closed: false,
    slots: open,
    store: 'memory',
  }, 200, STORE)
}

async function activeBookings(store: CalendarStore, tenantId: string): Promise<Booking[]> {
  const listed = await store.list(tenantId)
  return listed.filter((booking) => booking.status === 'booked')
}

async function createBooking(
  request: Request,
  ctx: RequestContext,
  store: CalendarStore,
  maxBookings: number,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' })
  const calendar = ctx.tenant.calendar
  if (!calendar) return json({ error: 'not_found' }, 404)
  const body = await readJson(request)
  if (!body.ok) return json({ error: body.error }, body.status)
  if (!isRecord(body.value)) return json({ error: 'invalid_body' }, 400)
  for (const key of Object.keys(body.value)) {
    if (key !== 'serviceSlug' && key !== 'start' && key !== 'guestName') return json({ error: 'invalid_body' }, 400)
  }
  const slug = body.value.serviceSlug
  const start = body.value.start
  if (typeof slug !== 'string' || !SLUG.test(slug) || typeof start !== 'string' || start.length > 40) {
    return json({ error: 'invalid_body' }, 400)
  }
  const name = guestName(body.value.guestName)
  if (!name) return json({ error: 'guest_name_invalid' }, 400)
  const service = serviceBySlug(calendar.services, slug)
  if (!service) return json({ error: 'service_not_found' }, 404)
  if (!service.active) return json({ error: 'service_inactive' }, 409)
  const date = /^(\d{4}-\d{2}-\d{2})T/.exec(start)?.[1]
  if (!date || weekdayOfDate(date) === null) return json({ error: 'slot_not_aligned' }, 422)
  const offset = offsetFor(ctx.tenant.timeZone)
  if (!offset) return json({ error: 'timezone_not_supported' }, 422, STORE)
  const bookedAt = ctx.clock()
  const today = civilDate(bookedAt, offset)
  const ahead = today ? daysBetween(date, today) : null
  if (ahead === null || ahead > calendar.horizonDays) return json({ error: 'horizon_exceeded' }, 422, STORE)
  const hours = calendar.hours.find((entry) => entry.weekday === weekdayOfDate(date))
  const slots = hours ? buildSlots(date, hours.open, hours.close, service.durationMinutes, offset) : null
  const slot = slots?.find((item) => item.start === start)
  if (!slot) return json({ error: 'slot_not_aligned' }, 422)
  if (Date.parse(slot.start) < bookedAt.getTime()) return json({ error: 'slot_unavailable' }, 409)
  const booking: Booking = {
    id: crypto.randomUUID(),
    tenantId: ctx.tenant.id,
    serviceSlug: service.slug,
    serviceName: service.name,
    start: slot.start,
    end: slot.end,
    guestName: name,
    status: 'booked',
    confirmedService: service.confirmed,
    createdAt: bookedAt.toISOString(),
    updatedAt: bookedAt.toISOString(),
  }
  const decision = await store.reserve(booking, maxBookings)
  if (decision === 'limit') return json({ error: 'booking_limit' }, 413, STORE)
  if (decision === 'conflict') return json({ error: 'slot_unavailable' }, 409, STORE)
  return json({ booking, store: 'memory' }, 201, STORE)
}

async function oneBooking(request: Request, ctx: RequestContext, store: CalendarStore, id: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'DELETE') {
    return json({ error: 'method_not_allowed' }, 405, { allow: 'GET, DELETE' })
  }
  if (!UUID.test(id)) return json({ error: 'not_found' }, 404)
  if (request.method === 'DELETE') return cancelBooking(request, ctx, store, id)
  const booking = await store.get(ctx.tenant.id, id)
  if (!booking) return json({ error: 'not_found' }, 404)
  return json({ booking, store: 'memory' }, 200, STORE)
}

async function cancelBooking(request: Request, ctx: RequestContext, store: CalendarStore, id: string): Promise<Response> {
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return json({ error: 'method_not_allowed' }, 405, { allow: 'POST, DELETE' })
  }
  if (!UUID.test(id)) return json({ error: 'not_found' }, 404)
  const booking = await store.cancel(ctx.tenant.id, id, ctx.now.toISOString())
  if (!booking) return json({ error: 'not_found' }, 404)
  return json({ booking, store: 'memory' }, 200, STORE)
}
