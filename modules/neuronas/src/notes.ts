import type { TenantConfig } from '../../../packages/core/src/schema.ts'
import { hasControlChars, normalizeNewlines } from '../../../packages/core/src/text.ts'
import type { Note } from './store.ts'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const NOTE_ID = /^[a-z0-9][a-z0-9:-]{0,79}$/

export function noteIdOk(id: string): boolean {
  return NOTE_ID.test(id)
}

export function normalizeTags(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 8) return null
  const tags: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !SLUG.test(item) || item.length > 32) return null
    if (!tags.includes(item)) tags.push(item)
  }
  return tags
}

export function catalogNote(
  tenant: TenantConfig,
  draft: {
    id: string
    collection: string
    title: string
    body: string
    tags: string[]
    createdAt: string
  },
): Note {
  if (!tenant.neuronas?.collections.includes(draft.collection)) {
    throw new Error(`invalid_catalog_note:${draft.collection}`)
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(draft.createdAt) || Number.isNaN(Date.parse(draft.createdAt))) {
    throw new Error('invalid_catalog_note')
  }
  const bodyRaw = normalizeNewlines(draft.body)
  if (hasControlChars(draft.title) || hasControlChars(bodyRaw, true)) throw new Error('invalid_catalog_note')
  const title = draft.title.trim()
  const body = bodyRaw.trim()
  if (!noteIdOk(draft.id) || title.length < 1 || title.length > 120 || body.length < 1 || body.length > 4000) {
    throw new Error('invalid_catalog_note')
  }
  const tags = normalizeTags(draft.tags)
  if (!tags) throw new Error('invalid_catalog_note')
  return {
    id: draft.id,
    tenantId: tenant.id,
    collection: draft.collection,
    title,
    body,
    tags,
    source: 'catalog',
    createdAt: draft.createdAt,
    updatedAt: draft.createdAt,
  }
}
