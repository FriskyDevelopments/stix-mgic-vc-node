import { overlaps } from './slots.ts'

export interface Booking {
  id: string
  tenantId: string
  serviceSlug: string
  serviceName: string
  start: string
  end: string
  guestName: string
  status: 'booked' | 'cancelled'
  confirmedService: boolean
  createdAt: string
  updatedAt: string
}

export interface CalendarStore {
  list(tenantId: string): Promise<Booking[]>
  get(tenantId: string, id: string): Promise<Booking | null>
  /** Conflict check and insert must stay one step. A durable adapter has to do both in one transaction. */
  reserve(booking: Booking, maxRecords: number): Promise<'ok' | 'conflict' | 'limit' | 'exists'>
  cancel(tenantId: string, id: string, updatedAt: string, maxRecords: number): Promise<Booking | null>
}

function recordKey(tenantId: string, id: string): string {
  return `${tenantId}\n${id}`
}

export class MemoryCalendarStore implements CalendarStore {
  private readonly bookings = new Map<string, Booking>()
  private readonly cancelledOrder = new Map<string, number>()
  private cancelTick = 0

  list(tenantId: string): Promise<Booking[]> {
    return Promise.resolve([...this.bookings.values()].filter((item) => item.tenantId === tenantId))
  }

  get(tenantId: string, id: string): Promise<Booking | null> {
    return Promise.resolve(this.bookings.get(recordKey(tenantId, id)) ?? null)
  }

  reserve(booking: Booking, maxRecords: number): Promise<'ok' | 'conflict' | 'limit' | 'exists'> {
    if (this.bookings.has(recordKey(booking.tenantId, booking.id))) return Promise.resolve('exists')
    this.pruneCancelled(booking.tenantId, maxRecords)
    const active = [...this.bookings.values()].filter((item) => item.tenantId === booking.tenantId && item.status === 'booked')
    if (active.some((item) => overlaps(item.start, item.end, booking.start, booking.end))) return Promise.resolve('conflict')
    if (active.length >= maxRecords) return Promise.resolve('limit')
    this.bookings.set(recordKey(booking.tenantId, booking.id), booking)
    return Promise.resolve('ok')
  }

  cancel(tenantId: string, id: string, updatedAt: string, maxRecords: number): Promise<Booking | null> {
    const key = recordKey(tenantId, id)
    const booking = this.bookings.get(key)
    if (!booking) return Promise.resolve(null)
    if (booking.status === 'cancelled') return Promise.resolve(booking)
    this.cancelTick += 1
    this.cancelledOrder.set(key, this.cancelTick)
    const next: Booking = { ...booking, status: 'cancelled', updatedAt }
    this.bookings.set(key, next)
    this.pruneCancelled(tenantId, maxRecords)
    return Promise.resolve(this.bookings.get(key) ?? null)
  }

  private pruneCancelled(tenantId: string, maxRecords: number) {
    const cancelled = [...this.bookings.values()]
      .filter((item) => item.tenantId === tenantId && item.status === 'cancelled')
      .sort((a, b) => (this.cancelledOrder.get(recordKey(a.tenantId, a.id)) ?? 0) - (this.cancelledOrder.get(recordKey(b.tenantId, b.id)) ?? 0))
    while (cancelled.length > maxRecords) {
      const oldest = cancelled.shift()
      if (!oldest) break
      const key = recordKey(oldest.tenantId, oldest.id)
      this.bookings.delete(key)
      this.cancelledOrder.delete(key)
    }
  }
}

export function memoryCalendarStore(): CalendarStore {
  return new MemoryCalendarStore()
}
