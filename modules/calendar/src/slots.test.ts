import { describe, expect, it } from 'vitest'
import { buildSlots, offsetFor, overlaps, weekdayOfDate } from './slots.ts'

describe('calendar slots', () => {
  it('knows Mexico City and rejects other zones', () => {
    expect(offsetFor('America/Mexico_City')).toBe('-06:00')
    expect(offsetFor('Europe/Madrid')).toBeNull()
  })

  it('uses the civil date weekday and rejects impossible dates', () => {
    expect(weekdayOfDate('2026-11-11')).toBe(3)
    expect(weekdayOfDate('2026-11-15')).toBe(0)
    expect(weekdayOfDate('2026-02-31')).toBeNull()
  })

  it('builds hour slots that stop at closing', () => {
    const slots = buildSlots('2026-11-16', '10:00', '19:00', 60, '-06:00')
    expect(slots).toHaveLength(9)
    expect(slots?.[0]).toEqual({ start: '2026-11-16T10:00:00-06:00', end: '2026-11-16T11:00:00-06:00' })
    expect(slots?.[8]).toEqual({ start: '2026-11-16T18:00:00-06:00', end: '2026-11-16T19:00:00-06:00' })
    expect(buildSlots('2026-11-16', '10:00', '19:00', 0, '-06:00')).toBeNull()
  })

  it('treats back-to-back slots as free and overlapping slots as taken', () => {
    expect(overlaps(
      '2026-11-16T10:00:00-06:00',
      '2026-11-16T11:00:00-06:00',
      '2026-11-16T11:00:00-06:00',
      '2026-11-16T12:00:00-06:00',
    )).toBe(false)
    expect(overlaps(
      '2026-11-16T10:00:00-06:00',
      '2026-11-16T11:00:00-06:00',
      '2026-11-16T10:30:00-06:00',
      '2026-11-16T11:30:00-06:00',
    )).toBe(true)
    expect(overlaps('not-a-time', 'also-not', '2026-11-16T10:00:00-06:00', '2026-11-16T11:00:00-06:00')).toBe(true)
  })
})
