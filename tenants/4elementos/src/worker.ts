import { createTenantHandler, type TenantWorker } from '../../../packages/core/src/index.ts'
import { createCalendarModule, memoryCalendarStore } from '../../../modules/calendar/src/module.ts'
import { createNeuronasModule } from '../../../modules/neuronas/src/module.ts'
import { MemoryNeuronasStore } from '../../../modules/neuronas/src/store.ts'
import { fourElementos, fourElementosNotes } from './tenant.ts'

export function createFourElementosHandler(now: () => Date = () => new Date()): TenantWorker {
  const notes = new MemoryNeuronasStore()
  for (const note of fourElementosNotes) notes.put(note)
  return createTenantHandler({
    tenant: fourElementos,
    now,
    modules: [
      createCalendarModule(memoryCalendarStore()),
      createNeuronasModule(notes),
    ],
  })
}

export default createFourElementosHandler()
