export { TIME_ZONE_OFFSETS, offsetFor } from '../../../packages/core/src/time.ts'

export interface Slot {
  start: string
  end: string
}

export function weekdayOfDate(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null
  return utc.getUTCDay()
}

function minutes(hm: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hm)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function fromMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function buildSlots(date: string, open: string, close: string, durationMinutes: number, offset: string): Slot[] | null {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) return null
  const startMin = minutes(open)
  const endMin = minutes(close)
  if (startMin === null || endMin === null || endMin <= startMin) return null
  const slots: Slot[] = []
  for (let cursor = startMin; cursor + durationMinutes <= endMin; cursor += durationMinutes) {
    slots.push({
      start: `${date}T${fromMinutes(cursor)}:00${offset}`,
      end: `${date}T${fromMinutes(cursor + durationMinutes)}:00${offset}`,
    })
  }
  return slots
}

export function overlaps(start: string, end: string, otherStart: string, otherEnd: string): boolean {
  const left = Date.parse(start)
  const leftEnd = Date.parse(end)
  const right = Date.parse(otherStart)
  const rightEnd = Date.parse(otherEnd)
  if ([left, leftEnd, right, rightEnd].some((value) => Number.isNaN(value))) return true
  return left < rightEnd && leftEnd > right
}
