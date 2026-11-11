export interface Note {
  id: string
  tenantId: string
  collection: string
  title: string
  body: string
  tags: string[]
  source: 'manual' | 'catalog'
  createdAt: string
  updatedAt: string
}

export interface NeuronasStore {
  list(tenantId: string): Promise<Note[]>
  get(tenantId: string, id: string): Promise<Note | null>
  insert(note: Note, maxNotes: number): Promise<'ok' | 'limit' | 'exists'>
  save(note: Note): Promise<void>
  remove(tenantId: string, id: string): Promise<boolean>
}

export class MemoryNeuronasStore implements NeuronasStore {
  private readonly notes = new Map<string, Note>()

  list(tenantId: string): Promise<Note[]> {
    return Promise.resolve([...this.notes.values()].filter((note) => note.tenantId === tenantId))
  }

  get(tenantId: string, id: string): Promise<Note | null> {
    const note = this.notes.get(key(tenantId, id))
    return Promise.resolve(note ?? null)
  }

  put(note: Note): void {
    this.notes.set(key(note.tenantId, note.id), note)
  }

  insert(note: Note, maxNotes: number): Promise<'ok' | 'limit' | 'exists'> {
    const id = key(note.tenantId, note.id)
    if (this.notes.has(id)) return Promise.resolve('exists')
    const count = [...this.notes.values()].filter((item) => item.tenantId === note.tenantId).length
    if (count >= maxNotes) return Promise.resolve('limit')
    this.notes.set(id, note)
    return Promise.resolve('ok')
  }

  save(note: Note): Promise<void> {
    this.notes.set(key(note.tenantId, note.id), note)
    return Promise.resolve()
  }

  remove(tenantId: string, id: string): Promise<boolean> {
    return Promise.resolve(this.notes.delete(key(tenantId, id)))
  }
}

function key(tenantId: string, id: string): string {
  return `${tenantId}\n${id}`
}

export function memoryNeuronasStore(): NeuronasStore {
  return new MemoryNeuronasStore()
}
