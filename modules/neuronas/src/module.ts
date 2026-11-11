import type { ModuleRoute } from '../../../packages/core/src/index.ts'
import { NEURONAS_PREFIX, handleNeuronas } from './routes.ts'
import { memoryNeuronasStore, type NeuronasStore } from './store.ts'

export { catalogNote } from './notes.ts'
export { memoryNeuronasStore } from './store.ts'
export type { NeuronasStore, Note } from './store.ts'

export function createNeuronasModule(store: NeuronasStore = memoryNeuronasStore(), maxNotes = 500): ModuleRoute {
  return {
    id: 'neuronas',
    prefix: NEURONAS_PREFIX,
    handle: (request, ctx) => handleNeuronas(request, ctx, store, maxNotes),
  }
}
