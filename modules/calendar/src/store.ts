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
  reserve(booking: Booking, maxRecords: number): Promise<'ok' | 'conflict' | 'limit'>
  cancel(tenantId: string, id: string, updatedAt: string): Promise<Booking | null>
}

export class MemoryCalendarStore implements CalendarStore {
  private readonly bookings = new Map<string, Booking>()

  list(tenantId: string): Promise<Booking[]> {
    return Promise.resolve([...this.bookings.values()].filter((item) => item.tenantId === tenantId))
  }

  get(tenantId: string, id: string): Promise<Booking | null> {
    const booking = this.bookings.get(id)
    if (!booking || booking.tenantId !== tenantId) return Promise.resolve(null)
    return Promise.resolve(booking)
  }

  reserve(booking: Booking, maxRecords: number): Promise<'ok' | 'conflict' | 'limit'> {
    const mine = [...this.bookings.values()].filter((item) => item.tenantId === booking.tenantId)
    if (mine.length >= maxRecords) return Promise.resolve('limit')
    const clash = mine.some((item) => item.status === 'booked' && overlaps(item.start, item.end, booking.start, booking.end))
    if (clash) return Promise.resolve('conflict')
    this.bookings.set(booking.id, booking)
    return Promise.resolve('ok')
  }

  cancel(tenantId: string, id: string, updatedAt: string): Promise<Booking | null> {
    const booking = this.bookings.get(id)
    if (!booking || booking.tenantId !== tenantId) return Promise.resolve(null)
    if (booking.status === 'cancelled') return Promise.resolve(booking)
    const next: Booking = { ...booking, status: 'cancelled', updatedAt }
    this.bookings.set(id, next)
    return Promise.resolve(next)
  }
}

export function memoryCalendarStore(): CalendarStore {
  return new MemoryCalendarStore()
}
