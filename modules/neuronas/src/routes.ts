import { json, readJson, routeTail, type RequestContext } from '../../../packages/core/src/index.ts'
import { hasControlChars, normalizeNewlines } from '../../../packages/core/src/text.ts'
import { normalizeTags, noteIdOk } from './notes.ts'
import type { NeuronasStore, Note } from './store.ts'

export const NEURONAS_PREFIX = '/neuronas'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const STORE = { 'x-store': 'memory' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function handleNeuronas(
  request: Request,
  ctx: RequestContext,
  store: NeuronasStore,
  maxNotes: number,
): Promise<Response> {
  const config = ctx.tenant.neuronas
  if (!config) return json({ error: 'not_found' }, 404, STORE)
  const tail = routeTail(new URL(request.url).pathname, NEURONAS_PREFIX)
  if (tail === null) return json({ error: 'not_found' }, 404, STORE)
  if (tail === '/') {
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { allow: 'GET' })
    return json({
      module: 'neuronas',
      collections: config.collections,
      allowDelete: config.allowDelete,
      store: 'memory',
    }, 200, STORE)
  }
  if (tail === '/notes') {
    if (request.method === 'GET') return listNotes(request, ctx, store)
    if (request.method === 'POST') return createNote(request, ctx, store, maxNotes)
    return json({ error: 'method_not_allowed' }, 405, { allow: 'GET, POST' })
  }
  if (tail.startsWith('/notes/')) {
    if (request.method !== 'GET' && request.method !== 'PATCH' && request.method !== 'DELETE') {
      return json({ error: 'method_not_allowed' }, 405, { allow: 'GET, PATCH, DELETE' })
    }
    const id = noteSegment(tail.slice('/notes/'.length))
    if (!id) return json({ error: 'not_found' }, 404, STORE)
    if (request.method === 'GET') return getNote(ctx, store, id)
    if (request.method === 'PATCH') return patchNote(request, ctx, store, id)
    return deleteNote(ctx, store, id)
  }
  return json({ error: 'not_found' }, 404, STORE)
}

async function listNotes(request: Request, ctx: RequestContext, store: NeuronasStore): Promise<Response> {
  // The memory store lists every note. A durable adapter must filter and page in the store.
  const config = ctx.tenant.neuronas
  if (!config) return json({ error: 'not_found' }, 404, STORE)
  const url = new URL(request.url)
  const collection = url.searchParams.get('collection')
  const tag = url.searchParams.get('tag')
  const q = url.searchParams.get('q')
  const offsetRaw = url.searchParams.get('offset')
  const limitRaw = url.searchParams.get('limit')
  if (collection !== null && !config.collections.includes(collection)) return json({ error: 'unknown_collection' }, 400, STORE)
  if (tag !== null && !SLUG.test(tag)) return json({ error: 'invalid_query' }, 400, STORE)
  if (q !== null && (q.length < 1 || q.length > 80)) return json({ error: 'invalid_query' }, 400, STORE)
  let offset = 0
  if (offsetRaw !== null) {
    if (!/^\d+$/.test(offsetRaw)) return json({ error: 'invalid_query' }, 400, STORE)
    offset = Number(offsetRaw)
    if (offset > 10_000) return json({ error: 'invalid_query' }, 400, STORE)
  }
  let limit = 50
  if (limitRaw !== null) {
    if (!/^\d+$/.test(limitRaw)) return json({ error: 'invalid_query' }, 400, STORE)
    limit = Number(limitRaw)
    if (limit < 1 || limit > 100) return json({ error: 'invalid_query' }, 400, STORE)
  }
  const needle = q?.toLocaleLowerCase(ctx.tenant.locale) ?? null
  const notes = (await store.list(ctx.tenant.id))
    .filter((note) => (collection ? note.collection === collection : true))
    .filter((note) => (tag ? note.tags.includes(tag) : true))
    .filter((note) => {
      if (!needle) return true
      const hay = `${note.title}\n${note.body}`.toLocaleLowerCase(ctx.tenant.locale)
      return hay.includes(needle)
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
    .slice(offset, offset + limit)
  return json({ notes, store: 'memory' }, 200, STORE)
}

async function createNote(
  request: Request,
  ctx: RequestContext,
  store: NeuronasStore,
  maxNotes: number,
): Promise<Response> {
  const config = ctx.tenant.neuronas
  if (!config) return json({ error: 'not_found' }, 404, STORE)
  const body = await readJson(request, 32_000)
  if (!body.ok) return json({ error: body.error }, body.status, STORE)
  const parsed = parseDraft(body.value, config.collections)
  if ('error' in parsed) return json({ error: parsed.error }, 400, STORE)
  const notedAt = ctx.clock()
  const note: Note = {
    id: crypto.randomUUID(),
    tenantId: ctx.tenant.id,
    collection: parsed.collection,
    title: parsed.title,
    body: parsed.body,
    tags: parsed.tags,
    source: 'manual',
    createdAt: notedAt.toISOString(),
    updatedAt: notedAt.toISOString(),
  }
  const result = await store.insert(note, maxNotes)
  if (result === 'limit') return json({ error: 'note_limit' }, 413, STORE)
  if (result === 'exists') return json({ error: 'internal' }, 500, STORE)
  return json({ note, store: 'memory' }, 201, STORE)
}

async function getNote(ctx: RequestContext, store: NeuronasStore, id: string): Promise<Response> {
  const note = await store.get(ctx.tenant.id, id)
  if (!note) return json({ error: 'not_found' }, 404, STORE)
  return json({ note, store: 'memory' }, 200, STORE)
}

async function patchNote(request: Request, ctx: RequestContext, store: NeuronasStore, id: string): Promise<Response> {
  const existing = await store.get(ctx.tenant.id, id)
  if (!existing) return json({ error: 'not_found' }, 404, STORE)
  const body = await readJson(request, 32_000)
  if (!body.ok) return json({ error: body.error }, body.status, STORE)
  if (!isRecord(body.value)) return json({ error: 'invalid_body' }, 400, STORE)
  for (const key of Object.keys(body.value)) {
    if (key !== 'title' && key !== 'body' && key !== 'tags') return json({ error: 'invalid_body' }, 400, STORE)
  }
  if (body.value.title === undefined && body.value.body === undefined && body.value.tags === undefined) {
    return json({ error: 'invalid_body' }, 400, STORE)
  }
  const title = body.value.title === undefined ? existing.title : textField(body.value.title, 120, false)
  const nextBody = body.value.body === undefined ? existing.body : textField(body.value.body, 4000, true)
  const tags = body.value.tags === undefined ? existing.tags : normalizeTags(body.value.tags)
  if (!title || !nextBody || !tags) return json({ error: 'invalid_body' }, 400, STORE)
  const note: Note = { ...existing, title, body: nextBody, tags, updatedAt: ctx.clock().toISOString() }
  if (!(await store.save(ctx.tenant.id, note))) return json({ error: 'not_found' }, 404, STORE)
  return json({ note, store: 'memory' }, 200, STORE)
}

async function deleteNote(ctx: RequestContext, store: NeuronasStore, id: string): Promise<Response> {
  const config = ctx.tenant.neuronas
  if (!config) return json({ error: 'not_found' }, 404, STORE)
  if (!config.allowDelete) return json({ error: 'delete_disabled' }, 403, STORE)
  const existing = await store.get(ctx.tenant.id, id)
  if (!existing) return json({ error: 'not_found' }, 404, STORE)
  if (!(await store.remove(ctx.tenant.id, id))) return json({ error: 'not_found' }, 404, STORE)
  return json({ deleted: id, store: 'memory' }, 200, STORE)
}

function noteSegment(segment: string): string | null {
  let decoded = segment
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    return null
  }
  if (!noteIdOk(decoded) || decoded.includes('/')) return null
  return decoded
}

function textField(value: unknown, max: number, multiline: boolean): string | null {
  if (typeof value !== 'string') return null
  const normalized = multiline ? normalizeNewlines(value) : value
  if (hasControlChars(normalized, multiline)) return null
  const text = normalized.trim()
  if (text.length < 1 || text.length > max) return null
  return text
}

function parseDraft(
  value: unknown,
  collections: readonly string[],
): { collection: string; title: string; body: string; tags: string[] } | { error: 'invalid_body' | 'unknown_collection' } {
  if (!isRecord(value)) return { error: 'invalid_body' }
  for (const key of Object.keys(value)) {
    if (key !== 'collection' && key !== 'title' && key !== 'body' && key !== 'tags') return { error: 'invalid_body' }
  }
  if (typeof value.collection !== 'string' || !SLUG.test(value.collection)) return { error: 'invalid_body' }
  if (!collections.includes(value.collection)) return { error: 'unknown_collection' }
  const title = textField(value.title, 120, false)
  const body = textField(value.body, 4000, true)
  const tags = value.tags === undefined ? [] : normalizeTags(value.tags)
  if (!title || !body || !tags) return { error: 'invalid_body' }
  return { collection: value.collection, title, body, tags }
}
