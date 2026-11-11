import { describe, expect, it } from 'vitest'
import { MemoryCalendarStore, type Booking } from './store.ts'

function booking(id: string, startHour: number): Booking {
  const hour = String(startHour).padStart(2, '0')
  return {
    id,
    tenantId: 'example',
    serviceSlug: 'sample',
    serviceName: 'Sample',
    start: `2026-11-16T${hour}:00:00-06:00`,
    end: `2026-11-16T${String(startHour + 1).padStart(2, '0')}:00:00-06:00`,
    guestName: id,
    status: 'booked',
    confirmedService: true,
    createdAt: '2026-11-11T21:00:00.000Z',
    updatedAt: '2026-11-11T21:00:00.000Z',
  }
}

describe('MemoryCalendarStore', () => {
  it('drops the earliest cancellation, even when that booking was created later', async () => {
    const store = new MemoryCalendarStore()
    expect(await store.reserve(booking('a', 10), 2)).toBe('ok')
    expect(await store.reserve(booking('b', 12), 2)).toBe('ok')
    await store.cancel('example', 'b', '2026-11-11T21:00:00.000Z')
    await store.cancel('example', 'a', '2026-11-11T21:00:00.000Z')
    expect(await store.reserve(booking('c', 14), 2)).toBe('ok')
    await store.cancel('example', 'c', '2026-11-11T21:00:00.000Z')
    expect(await store.reserve(booking('d', 16), 2)).toBe('ok')
    expect(await store.get('example', 'b')).toBeNull()
    expect((await store.get('example', 'a'))?.status).toBe('cancelled')
    expect((await store.get('example', 'c'))?.status).toBe('cancelled')
  })
})
