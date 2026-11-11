// @vitest-environment node
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
  it('does not overwrite an existing booking id', async () => {
    const store = new MemoryCalendarStore()
    const first = booking('same', 10)
    expect(await store.reserve(first, 2)).toBe('ok')
    await store.cancel('example', 'same', '2026-11-11T21:00:00.000Z', 2)
    expect(await store.reserve({ ...first, status: 'booked', start: '2026-11-16T12:00:00-06:00', end: '2026-11-16T13:00:00-06:00' }, 2)).toBe('exists')
    expect((await store.get('example', 'same'))?.status).toBe('cancelled')
  })

  it('keeps the same booking id for two tenants', async () => {
    const store = new MemoryCalendarStore()
    const first = booking('same', 10)
    const second = { ...booking('same', 12), tenantId: 'other' }
    expect(await store.reserve(first, 2)).toBe('ok')
    expect(await store.reserve(second, 2)).toBe('ok')
    expect((await store.get('example', 'same'))?.start).toBe(first.start)
    expect((await store.get('other', 'same'))?.start).toBe(second.start)
  })

  it('drops the earliest cancellation, even when that booking was created later', async () => {
    const store = new MemoryCalendarStore()
    expect(await store.reserve(booking('a', 10), 2)).toBe('ok')
    expect(await store.reserve(booking('b', 12), 2)).toBe('ok')
    await store.cancel('example', 'b', '2026-11-11T21:00:00.000Z', 2)
    await store.cancel('example', 'a', '2026-11-11T21:00:00.000Z', 2)
    expect(await store.reserve(booking('c', 14), 2)).toBe('ok')
    await store.cancel('example', 'c', '2026-11-11T21:00:00.000Z', 2)
    expect(await store.reserve(booking('d', 16), 2)).toBe('ok')
    expect(await store.get('example', 'b')).toBeNull()
    expect((await store.get('example', 'a'))?.status).toBe('cancelled')
    expect((await store.get('example', 'c'))?.status).toBe('cancelled')
  })
})
