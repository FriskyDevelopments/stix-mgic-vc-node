import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import checklist from './rangel-interview/checklist.json'

// Nebu interviewer for Rangel's Notion panel (4 Elementos). Disabled unless
// RANGEL_INTERVIEW_ENABLED=true; writes use RANGEL_NOTION_TOKEN from the environment.

export type AnswerType = 'number' | 'text' | 'yes_no' | 'date' | 'multi_select' | 'choice' | 'none'

export interface ChecklistTarget {
  kind: 'update_property' | 'create_row' | 'append_note' | 'manual'
  page_id?: string
  data_source_id?: string
  property?: string
  title_property?: string
  label?: string
  [key: string]: unknown
}

export interface ChecklistItem {
  id: string
  owner: 'rangel' | 'us'
  section: string
  question: string | null
  answer_type: AnswerType
  options?: string[]
  repeatable?: boolean
  skip_if?: { item: string; equals: unknown }
  fix?: string
  target: ChecklistTarget
}

export const NOTION_VERSION = '2026-03-11'
const MAX_SESSIONS = 50
export const CHECKLIST_ITEMS = (checklist as { items: ChecklistItem[] }).items
export const INTERVIEW_ITEMS = CHECKLIST_ITEMS.filter((i) => i.owner === 'rangel' && i.question)

export type Parsed = { kind: 'value'; value: unknown } | { kind: 'skip' } | { kind: 'invalid'; hint: string }

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const SKIP = new Set(['saltar', 'despues', 'luego', 'no se', 'no lo se', 'skip', 'paso'])
const YES = new Set(['si', 'sí', 'claro', 'ya', 'yes', 'ok', 'si las uso', 'sip'])
const NO = new Set(['no', 'nop', 'todavia no', 'aun no', 'nel', 'ya no', 'claro que no', 'ok no'])
const YES_WORDS = new Set(['si', 'claro', 'yes', 'ok', 'sip', 'ya'])
const NO_WORDS = new Set(['no', 'nop', 'nel'])
// Words too generic to identify one Notion option on their own.
const GENERIC_OPTION_WORDS = new Set(['masaje', 'masajes'])

export function parseAnswer(item: ChecklistItem, raw: string): Parsed {
  const text = raw.trim()
  const n = norm(text).replace(/[.!¡¿?]+$/g, '')
  if (!text || SKIP.has(n)) return { kind: 'skip' }
  switch (item.answer_type) {
    case 'number': {
      const m = n.replace(/(\d)[.,](\d{3})\b/g, '$1$2').replace(/(\d)[.,](\d{3})\b/g, '$1$2').match(/\d+(?:[.,]\d+)?/)
      if (!m) return { kind: 'invalid', hint: 'Dime solo el número, por ejemplo 650.' }
      return { kind: 'value', value: Number(m[0].replace(',', '.')) }
    }
    case 'yes_no': {
      if (NO.has(n)) return { kind: 'value', value: false }
      if (YES.has(n)) return { kind: 'value', value: true }
      const words = n.split(/[\s,]+/)
      const hasNo = words.some((w) => NO_WORDS.has(w))
      const hasYes = words.some((w) => YES_WORDS.has(w))
      if (hasNo && !hasYes) return { kind: 'value', value: false }
      if (hasYes && !hasNo) return { kind: 'value', value: true }
      return { kind: 'invalid', hint: 'Contéstame «sí» o «no».' }
    }
    case 'date': {
      let m = n.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
      if (m) {
        const d = isoDate(+m[1], +m[2], +m[3])
        if (d) return { kind: 'value', value: d }
      }
      m = n.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
      if (m) {
        const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]
        const d = y >= 2020 && y <= 2040 ? isoDate(y, +m[2], +m[1]) : null
        if (d) return { kind: 'value', value: d }
      }
      return { kind: 'invalid', hint: 'Dime la fecha como 30/11/2026, o «saltar».' }
    }
    case 'multi_select': {
      const picked = (item.options ?? []).filter((o) => optionMentioned(n, o))
      if (!picked.length) return { kind: 'invalid', hint: `Elige de: ${(item.options ?? []).join(', ')}.` }
      return { kind: 'value', value: picked }
    }
    case 'choice': {
      const hit = (item.options ?? []).find((o) => {
        const opt = norm(o).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return new RegExp(`^(?:opcion |la )?${opt}(?:[).:]|$)`).test(n)
      })
      if (!hit) return { kind: 'invalid', hint: `Contéstame ${(item.options ?? []).join(' o ')}.` }
      return { kind: 'value', value: hit }
    }
    case 'text':
      if (NO.has(n)) return { kind: 'skip' }
      return { kind: 'value', value: text.slice(0, 2000) }
    default:
      return { kind: 'skip' }
  }
}

function optionMentioned(answer: string, option: string): boolean {
  const opt = norm(option)
  if (answer.includes(opt)) return true
  return opt
    .split(/\s+/)
    .map((w) => w.replace(/s$/, ''))
    .filter((w) => w.length >= 6 && !GENERIC_OPTION_WORDS.has(w) && !GENERIC_OPTION_WORDS.has(w + 's'))
    .some((w) => answer.includes(w))
}

function isoDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

const richText = (s: string) => [{ type: 'text', text: { content: s } }]

function propertyValue(item: ChecklistItem, value: unknown): Record<string, unknown> {
  switch (item.answer_type) {
    case 'number': return { number: value as number }
    case 'yes_no': return { checkbox: value as boolean }
    case 'date': return { date: { start: value as string } }
    case 'multi_select': return { multi_select: (value as string[]).map((name) => ({ name })) }
    default:
      return item.target.property === 'Nombre' || item.target.property === item.target.title_property
        ? { title: richText(String(value)) }
        : { rich_text: richText(String(value)) }
  }
}

export interface NotionWrite { method: 'PATCH' | 'POST'; path: string; body: Record<string, unknown> }

export function buildNotionWrite(item: ChecklistItem, value: unknown, now = new Date()): NotionWrite | null {
  const t = item.target
  if (t.kind === 'update_property' && t.page_id && t.property) {
    return { method: 'PATCH', path: `/pages/${t.page_id}`, body: { properties: { [t.property]: propertyValue(item, value) } } }
  }
  if (t.kind === 'create_row' && t.data_source_id && t.title_property) {
    return {
      method: 'POST',
      path: '/pages',
      body: {
        parent: { type: 'data_source_id', data_source_id: t.data_source_id },
        properties: { [t.title_property]: { title: richText(String(value)) } },
      },
    }
  }
  if (t.kind === 'append_note' && t.page_id) {
    const shown = typeof value === 'boolean' ? (value ? 'sí' : 'no') : String(value)
    return {
      method: 'PATCH',
      path: `/blocks/${t.page_id}/children`,
      body: { children: [{ type: 'paragraph', paragraph: { rich_text: richText(`${t.label ?? item.id}: ${shown} (Rangel, ${now.toISOString().slice(0, 10)})`) } }] },
    }
  }
  return null
}

export async function sendNotionWrite(write: NotionWrite, token: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`https://api.notion.com/v1${write.path}`, {
    method: write.method,
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify(write.body),
  })
  if (!res.ok) throw new Error(`notion ${res.status}`)
  return res.json()
}

export interface InterviewState { index: number; answers: Record<string, unknown> }

export function nextItem(state: InterviewState): ChecklistItem | null {
  for (let i = state.index; i < INTERVIEW_ITEMS.length; i++) {
    const it = INTERVIEW_ITEMS[i]
    if (it.skip_if && state.answers[it.skip_if.item] === it.skip_if.equals) continue
    state.index = i
    return it
  }
  state.index = INTERVIEW_ITEMS.length
  return null
}

export interface InterviewDeps { token?: string; fetchImpl?: typeof fetch; now?: () => Date }

export async function answerCurrent(state: InterviewState, text: string, deps: InterviewDeps = {}) {
  const item = nextItem(state)
  if (!item) return { done: true as const }
  const parsed = parseAnswer(item, text)
  if (parsed.kind === 'invalid') return { done: false as const, item: item.id, retry: parsed.hint, question: item.question }
  let wrote = false
  if (parsed.kind === 'value') {
    const write = buildNotionWrite(item, parsed.value, deps.now?.() ?? new Date())
    if (write) {
      if (!deps.token) throw new Error('RANGEL_NOTION_TOKEN is not configured')
      await sendNotionWrite(write, deps.token, deps.fetchImpl)
      wrote = true
    }
    // Recorded only after a successful write so skip_if never relies on an unsaved answer.
    state.answers[item.id] = parsed.value
  }
  const stay = item.repeatable && parsed.kind === 'value'
  if (!stay) state.index += 1
  const next = nextItem(state)
  return { done: !next, item: item.id, wrote, next: next ? { id: next.id, question: next.question } : null }
}

function keyMatches(given: string | undefined, expected: string | undefined) {
  if (!given || !expected) return false
  const digest = (v: string) => createHash('sha256').update(v).digest()
  return timingSafeEqual(digest(given), digest(expected))
}

export function createRangelInterviewRoutes(env: NodeJS.ProcessEnv = process.env, deps: InterviewDeps = {}) {
  const app = new Hono()
  const sessions = new Map<string, InterviewState>()
  const state = (id: string) => {
    let s = sessions.get(id)
    if (!s) {
      if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value as string)
      sessions.set(id, (s = { index: 0, answers: {} }))
    }
    return s
  }
  app.use('*', async (c, next) => {
    if (env.RANGEL_INTERVIEW_ENABLED !== 'true') return c.json({ error: 'not found' }, 404)
    if (!keyMatches(c.req.header('x-rangel-interview-key'), env.RANGEL_INTERVIEW_KEY)) return c.json({ error: 'unauthorized' }, 401)
    await next()
  })
  app.get('/next', (c) => {
    const item = nextItem(state(c.req.query('session') || 'rangel'))
    return c.json(item ? { done: false, id: item.id, section: item.section, question: item.question } : { done: true })
  })
  app.post('/answer', async (c) => {
    const body = await c.req.json<{ session?: string; text?: string }>().catch(() => ({} as { session?: string; text?: string }))
    if (typeof body.text !== 'string') return c.json({ error: 'text required' }, 400)
    try {
      const result = await answerCurrent(state(body.session || 'rangel'), body.text, { token: env.RANGEL_NOTION_TOKEN, ...deps })
      return c.json(result)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502)
    }
  })
  return app
}
