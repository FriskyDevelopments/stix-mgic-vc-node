// @vitest-environment node
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
        body: 'Comprar aceite de lavanda.\r\nSin precio todavía.',
        tags: ['inventario'],
      }),
    })
    expect(created.status).toBe(201)
    const note = (await created.json() as { note: { id: string; source: string; body: string } }).note
    expect(note.body).toBe('Comprar aceite de lavanda.\nSin precio todavía.')
    expect(note.source).toBe('manual')

    const noisy = await call(handler, '/neuronas/notes?q=' + encodeURIComponent('lavanda\u202e'))
    expect(noisy.status).toBe(400)
    const found = await call(handler, '/neuronas/notes?q=lavanda&tag=inventario&collection=notes')
    const list = await found.json() as { notes: { id: string }[] }
    expect(list.notes.map((item) => item.id)).toEqual([note.id])

    const removed = await call(handler, `/neuronas/notes/${note.id}`, { method: 'DELETE' })
    expect(removed.status).toBe(403)
    expect(await removed.json()).toEqual({ error: 'delete_disabled' })
    const wrongMethod = await call(handler, '/neuronas/notes/bad!id', { method: 'POST' })
    expect(wrongMethod.status).toBe(405)
    const missing = await call(handler, '/neuronas/notes/missing-note', { method: 'DELETE' })
    expect(missing.status).toBe(403)

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

  it('answers health when the tenant left neuronas disabled', async () => {
    const tenant = loadTenantConfig({
      ...structuredClone(exampleTenant()),
      modules: ['calendar'],
      neuronas: null,
    })
    const env = { LOG_LEVEL: 'silent', TENANT_CONFIG_JSON: JSON.stringify(tenant) }
    const health = await neuronasWorker.fetch(new Request('https://tenant.test/healthz'), env, ctx)
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ ok: true, tenant: 'example', module: 'neuronas', enabled: false })
    expect((await neuronasWorker.fetch(new Request('https://tenant.test/healthz', { method: 'POST' }), env, ctx)).status).toBe(405)
    const notes = await neuronasWorker.fetch(new Request('https://tenant.test/neuronas/notes'), env, ctx)
    expect(notes.status).toBe(404)
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

  it('pages notes and does not let catalog rows consume the manual cap', async () => {
    const store = memoryNeuronasStore()
    const tenant = exampleTenant()
    const handler = createTenantHandler({
      tenant,
      now: () => now,
      modules: [createNeuronasModule(store, 1)],
    })
    await store.put({
      id: 'catalog:marca',
      tenantId: tenant.id,
      collection: 'marca',
      title: 'Marca',
      body: 'Borrador',
      tags: ['marca'],
      source: 'catalog',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    const first = await call(handler, '/neuronas/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ collection: 'notes', title: 'Uno', body: 'A', tags: [] }),
    })
    const second = await call(handler, '/neuronas/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ collection: 'notes', title: 'Dos', body: 'B', tags: [] }),
    })
    expect(first.status).toBe(201)
    expect(second.status).toBe(413)
    const page = await call(handler, '/neuronas/notes?limit=1&offset=1')
    const body = await page.json() as { notes: { title: string }[] }
    expect(body.notes).toHaveLength(1)
  })

  it('does not recreate a note removed before save', async () => {
    const store = memoryNeuronasStore()
    const note = {
      id: 'catalog:marca',
      tenantId: 'example',
      collection: 'marca',
      title: 'Marca',
      body: 'Borrador',
      tags: ['marca'],
      source: 'catalog' as const,
      createdAt: '2026-11-11T00:00:00.000Z',
      updatedAt: '2026-11-11T00:00:00.000Z',
    }
    expect(await store.insert(note, 10)).toBe('ok')
    expect(await store.remove('example', note.id)).toBe(true)
    expect(await store.save('example', { ...note, body: 'otra' })).toBe(false)
    expect(await store.get('example', note.id)).toBeNull()
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
    expect(() => catalogNote(tenant, { ...note, id: 'catalog:y', createdAt: 'yesterday' })).toThrow(/invalid_catalog_note/)
  })
})
