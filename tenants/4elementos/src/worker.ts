import { createTenantHandler, type TenantWorker } from '../../../packages/core/src/index.ts'
import { createCalendarModule, memoryCalendarStore } from '../../../modules/calendar/src/module.ts'
import { createNeuronasModule } from '../../../modules/neuronas/src/module.ts'
import { MemoryNeuronasStore } from '../../../modules/neuronas/src/store.ts'
import { fourElementos, fourElementosNotes } from './tenant.ts'

export function createFourElementosHandler(now: () => Date = () => new Date()): TenantWorker {
  const notes = new MemoryNeuronasStore()
  const seeded = Promise.all(fourElementosNotes.map((note) => notes.put(note)))
  const inner = createTenantHandler({
    tenant: fourElementos,
    now,
    modules: [
      createCalendarModule(memoryCalendarStore()),
      createNeuronasModule(notes),
    ],
  })
  return {
    async fetch(request, env, ctx) {
      await seeded
      return inner.fetch(request, env, ctx)
    },
  }
}

export default createFourElementosHandler()
