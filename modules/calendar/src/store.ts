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
  reserve(booking: Booking, maxRecords: number): Promise<'ok' | 'conflict' | 'limit'>
  cancel(tenantId: string, id: string, updatedAt: string): Promise<Booking | null>
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

  reserve(booking: Booking, maxRecords: number): Promise<'ok' | 'conflict' | 'limit'> {
    const mine = [...this.bookings.values()].filter((item) => item.tenantId === booking.tenantId)
    // Cancelled rows do not consume the active cap. At most maxRecords of them are kept.
    const active = mine.filter((item) => item.status === 'booked')
    const clash = active.some((item) => overlaps(item.start, item.end, booking.start, booking.end))
    if (clash) return Promise.resolve('conflict')
    if (active.length >= maxRecords) return Promise.resolve('limit')
    const cancelled = mine
      .filter((item) => item.status === 'cancelled')
      .sort((a, b) => (this.cancelledOrder.get(recordKey(a.tenantId, a.id)) ?? 0) - (this.cancelledOrder.get(recordKey(b.tenantId, b.id)) ?? 0))
    while (cancelled.length > maxRecords) {
      const oldest = cancelled.shift()
      if (!oldest) break
      const key = recordKey(oldest.tenantId, oldest.id)
      this.bookings.delete(key)
      this.cancelledOrder.delete(key)
    }
    this.bookings.set(recordKey(booking.tenantId, booking.id), booking)
    return Promise.resolve('ok')
  }

  cancel(tenantId: string, id: string, updatedAt: string): Promise<Booking | null> {
    const key = recordKey(tenantId, id)
    const booking = this.bookings.get(key)
    if (!booking) return Promise.resolve(null)
    if (booking.status === 'cancelled') return Promise.resolve(booking)
    this.cancelTick += 1
    this.cancelledOrder.set(key, this.cancelTick)
    const next: Booking = { ...booking, status: 'cancelled', updatedAt }
    this.bookings.set(key, next)
    return Promise.resolve(next)
  }
}

export function memoryCalendarStore(): CalendarStore {
  return new MemoryCalendarStore()
}
