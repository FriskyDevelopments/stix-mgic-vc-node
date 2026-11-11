import type { ModuleRoute } from '../../../packages/core/src/index.ts'
import { handleCalendar } from './routes.ts'
import { memoryCalendarStore, type CalendarStore } from './store.ts'

export { memoryCalendarStore } from './store.ts'
export type { Booking, CalendarStore } from './store.ts'

export function createCalendarModule(store: CalendarStore = memoryCalendarStore(), maxBookings = 1000): ModuleRoute {
  return {
    id: 'calendar',
    prefix: '/calendar',
    handle: (request, ctx) => handleCalendar(request, ctx, store, maxBookings),
  }
}
