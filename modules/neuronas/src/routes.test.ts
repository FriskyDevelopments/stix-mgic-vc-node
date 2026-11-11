import { describe, expect, it } from 'vitest'
import { exampleTenant } from '../../../packages/core/src/example.ts'
import { createTenantHandler, loadTenantConfig, type WorkerContext } from '../../../packages/core/src/index.ts'
import { catalogNote } from './notes.ts'
import { createNeuronasModule, memoryNeuronasStore } from './module.ts'
import neuronasWorker from './worker.ts'

const ctx: WorkerContext = { waitUntil() {} }
const now = new Date('2026-11-11T21:00:00.000Z')

interface Handler {
  fetch(request: Request, env: { LOG_LEVEL?: string; TENANT_CONFIG_JSON?: string; TENANT_ID?: string }, context: WorkerContext): Promise<Response>
}

function call(handler: Handler, path: string, init?: RequestInit) {
  return handler.fetch(new Request(`https://tenant.test${path}`, init), { LOG_LEVEL: 'silent' }, ctx)
}

describe('neuronas module', () => {
  it('creates, filters, and refuses deletes when the tenant disables them', async () => {
    const handler = createTenantHandler({
      tenant: exampleTenant(),
      now: () => now,
      modules: [createNeuronasModule(memoryNeuronasStore(), 2)],
    })
    const created = await call(handler, '/neuronas/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection: 'notes',
        title: 'Aceites',
        body: 'Comprar aceite de lavanda.\nSin precio todavía.',
        tags: ['inventario'],
      }),
    })
    expect(created.status).toBe(201)
    const note = (await created.json() as { note: { id: string; source: string } }).note
    expect(note.source).toBe('manual')

    const found = await call(handler, '/neuronas/notes?q=lavanda&tag=inventario&collection=notes')
    const list = await found.json() as { notes: { id: string }[] }
    expect(list.notes.map((item) => item.id)).toEqual([note.id])

    const removed = await call(handler, `/neuronas/notes/${note.id}`, { method: 'DELETE' })
    expect(removed.status).toBe(405)
    expect(await removed.json()).toEqual({ error: 'delete_disabled' })

    const patched = await call(handler, `/neuronas/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Aceites esenciales' }),
    })
    expect(patched.status).toBe(200)

    const unknown = await call(handler, '/neuronas/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ collection: 'secretos', title: 'No', body: 'No', tags: [] }),
    })
    expect(unknown.status).toBe(400)

    const second = await call(handler, '/neuronas/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ collection: 'marca', title: 'Logo', body: 'Pendiente.', tags: [] }),
    })
    expect(second.status).toBe(201)
    const third = await call(handler, '/neuronas/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ collection: 'marca', title: 'Otro', body: 'No cabe.', tags: [] }),
    })
    expect(third.status).toBe(413)
  })

  it('deletes only when the tenant allows it, and keeps tenants apart', async () => {
    const open = loadTenantConfig({
      ...structuredClone(exampleTenant()),
      neuronas: { allowDelete: true, collections: ['notes', 'marca'] },
    })
    const store = memoryNeuronasStore()
    const handler = createTenantHandler({
      tenant: open,
      now: () => now,
      modules: [createNeuronasModule(store)],
    })
    const created = await call(handler, '/neuronas/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ collection: 'notes', title: 'Nota', body: 'Texto', tags: [] }),
    })
    const id = (await created.json() as { note: { id: string } }).note.id
    const otherTenant = loadTenantConfig({ ...structuredClone(exampleTenant()), id: 'other' })
    const other = createTenantHandler({
      tenant: otherTenant,
      now: () => now,
      modules: [createNeuronasModule(store)],
    })
    const hidden = await call(other, `/neuronas/notes/${id}`)
    expect(hidden.status).toBe(404)
    const deleted = await call(handler, `/neuronas/notes/${id}`, { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    expect((await call(handler, `/neuronas/notes/${id}`)).status).toBe(404)
  })

  it('boots from TENANT_CONFIG_JSON', async () => {
    const missing = await neuronasWorker.fetch(new Request('https://tenant.test/neuronas'), { LOG_LEVEL: 'silent' }, ctx)
    expect(missing.status).toBe(503)
    const ready = await neuronasWorker.fetch(new Request('https://tenant.test/neuronas'), {
      LOG_LEVEL: 'silent',
      TENANT_CONFIG_JSON: JSON.stringify(exampleTenant()),
    }, ctx)
    expect(ready.status).toBe(200)
    expect(await ready.json()).toMatchObject({ module: 'neuronas', allowDelete: false })
  })

  it('builds catalog notes only inside the tenant collections', () => {
    const tenant = exampleTenant()
    const note = catalogNote(tenant, {
      id: 'catalog:marca',
      collection: 'marca',
      title: 'Marca',
      body: 'Borrador',
      tags: ['marca'],
      createdAt: '2026-11-11T00:00:00.000Z',
    })
    expect(note.source).toBe('catalog')
    expect(() => catalogNote(tenant, { ...note, collection: 'secretos', id: 'catalog:x' })).toThrow(/secretos/)
  })
})
