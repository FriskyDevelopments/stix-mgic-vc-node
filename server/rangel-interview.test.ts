import { describe, expect, it, vi } from 'vitest'
import {
  CHECKLIST_ITEMS,
  INTERVIEW_ITEMS,
  answerCurrent,
  buildNotionWrite,
  createRangelInterviewRoutes,
  nextItem,
  parseAnswer,
  type ChecklistItem,
  type InterviewState,
} from './rangel-interview'

const byId = (id: string) => CHECKLIST_ITEMS.find((i) => i.id === id) as ChecklistItem

describe('rangel interview checklist', () => {
  it('has unique ids and every Rangel question has a target', () => {
    const ids = CHECKLIST_ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const it of INTERVIEW_ITEMS) expect(it.target.kind).toBeTruthy()
    expect(CHECKLIST_ITEMS.filter((i) => i.owner === 'us').length).toBeGreaterThan(0)
  })
})

describe('parseAnswer', () => {
  it('parses prices and durations', () => {
    const precio = byId('servicios.masaje-relajante.precio')
    expect(parseAnswer(precio, '$1,200 pesos')).toEqual({ kind: 'value', value: 1200 })
    expect(parseAnswer(precio, '650')).toEqual({ kind: 'value', value: 650 })
    expect(parseAnswer(precio, 'no sé cuánto')).toMatchObject({ kind: 'invalid' })
    expect(parseAnswer(precio, 'saltar')).toEqual({ kind: 'skip' })
  })
  it('parses yes/no, dates, multi-select and choices', () => {
    expect(parseAnswer(byId('servicios.aromaterapia.activo'), 'Sí, claro')).toEqual({ kind: 'value', value: true })
    expect(parseAnswer(byId('servicios.aromaterapia.activo'), 'no')).toEqual({ kind: 'value', value: false })
    expect(parseAnswer(byId('pendientes.precios.fecha'), '30/11/2026')).toEqual({ kind: 'value', value: '2026-11-30' })
    expect(parseAnswer(byId('pendientes.precios.fecha'), '31/02/2026')).toMatchObject({ kind: 'invalid' })
    expect(parseAnswer(byId('terapeutas.1.especialidad'), 'reflexologia y piedras calientes')).toEqual({
      kind: 'value',
      value: ['Piedras calientes', 'Reflexología'],
    })
    expect(parseAnswer(byId('marca.tipografia'), 'b')).toEqual({ kind: 'value', value: 'B' })
  })
  it('handles review edge cases', () => {
    const activo = byId('servicios.aromaterapia.activo')
    for (const neg of ['claro que no', 'ya no', 'ok no']) expect(parseAnswer(activo, neg)).toEqual({ kind: 'value', value: false })
    for (const unclear of ['sí, pero no todavía', 'a veces sí a veces no', 'quizás'])
      expect(parseAnswer(activo, unclear)).toMatchObject({ kind: 'invalid' })
    expect(parseAnswer(activo, 'no lo sé')).toEqual({ kind: 'skip' })
    expect(parseAnswer(byId('workspace.paginas-inicio'), 'sí las uso')).toEqual({ kind: 'value', value: true })
    expect(parseAnswer(byId('terapeutas.1.especialidad'), 'piedras y masajes relajantes')).toEqual({
      kind: 'value',
      value: ['Masaje relajante', 'Piedras calientes'],
    })
    expect(parseAnswer(byId('terapeutas.1.especialidad'), 'masajes')).toMatchObject({ kind: 'invalid' })
    expect(parseAnswer(byId('marca.tipografia'), 'a ver dime más')).toMatchObject({ kind: 'invalid' })
    expect(parseAnswer(byId('marca.tipografia'), 'la A')).toEqual({ kind: 'value', value: 'A' })
    expect(parseAnswer(byId('marca.tipografia'), 'B)')).toEqual({ kind: 'value', value: 'B' })
    expect(parseAnswer(byId('pendientes.precios.fecha'), '30/11/99')).toMatchObject({ kind: 'invalid' })
    expect(parseAnswer(byId('pendientes.precios.fecha'), '30/11/26')).toEqual({ kind: 'value', value: '2026-11-30' })
    expect(parseAnswer(byId('pendientes.precios.fecha'), '2026-02-31')).toMatchObject({ kind: 'invalid' })
    expect(parseAnswer(byId('terapeutas.1.nombre'), 'no')).toEqual({ kind: 'skip' })
    expect(parseAnswer(byId('servicios.reflexologia.precio'), '1.200')).toEqual({ kind: 'value', value: 1200 })
    expect(parseAnswer(byId('servicios.reflexologia.precio'), '1.200.000')).toEqual({ kind: 'value', value: 1200000 })
    expect(parseAnswer(byId('servicios.reflexologia.precio'), '650.50')).toEqual({ kind: 'value', value: 650.5 })
  })
})

describe('buildNotionWrite', () => {
  it('maps a price to the Servicios row property', () => {
    const w = buildNotionWrite(byId('servicios.reflexologia.precio'), 650)
    expect(w).toEqual({
      method: 'PATCH',
      path: '/pages/41544c9f-0eac-8119-b097-d297df08e34b',
      body: { properties: { 'Precio MXN': { number: 650 } } },
    })
  })
  it('creates a new therapist row and skips manual items', () => {
    const w = buildNotionWrite(byId('terapeutas.otra'), 'Nombre real')
    expect(w?.method).toBe('POST')
    expect(w?.body).toMatchObject({ parent: { data_source_id: '4ef98c24-2fa6-456c-afe0-cea1448aaaaf' } })
    expect(buildNotionWrite(byId('terapeutas.1.foto'), true)).toBeNull()
  })
  it('writes the therapist name as a title', () => {
    expect(buildNotionWrite(byId('terapeutas.1.nombre'), 'X')?.body).toEqual({
      properties: { Nombre: { title: [{ type: 'text', text: { content: 'X' } }] } },
    })
  })
})

describe('interview flow', () => {
  it('asks one question at a time and writes the answer', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const state: InterviewState = { index: 0, answers: {} }
    const first = nextItem(state)!
    expect(first.id).toBe('servicios.masaje-relajante.precio')
    const r = await answerCurrent(state, '700', { token: 't', fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(r).toMatchObject({ wrote: true, next: { id: 'servicios.masaje-relajante.duracion' } })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('re-asks on invalid input without writing', async () => {
    const fetchImpl = vi.fn()
    const state: InterviewState = { index: 0, answers: {} }
    const r = await answerCurrent(state, 'mucho', { token: 't', fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(r).toMatchObject({ retry: expect.any(String) })
    expect(state.index).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('skips the due date when a pendiente is already done', () => {
    const idx = INTERVIEW_ITEMS.findIndex((i) => i.id === 'pendientes.precios.fecha')
    const state: InterviewState = { index: idx, answers: { 'pendientes.precios.hecho': true } }
    expect(nextItem(state)?.id).toBe('pendientes.fichas.hecho')
  })
  it('stays on a repeatable question until she says no', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const idx = INTERVIEW_ITEMS.findIndex((i) => i.id === 'terapeutas.otra')
    const state: InterviewState = { index: idx, answers: {} }
    const deps = { token: 't', fetchImpl: fetchImpl as unknown as typeof fetch }
    expect(await answerCurrent(state, 'Nombre real', deps)).toMatchObject({ next: { id: 'terapeutas.otra' } })
    expect(await answerCurrent(state, 'no', deps)).toMatchObject({ next: { id: 'citas.primera' } })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('routes', () => {
  it('is hidden unless enabled and requires the key', async () => {
    const off = createRangelInterviewRoutes({})
    expect((await off.request('/next')).status).toBe(404)
    const on = createRangelInterviewRoutes({ RANGEL_INTERVIEW_ENABLED: 'true', RANGEL_INTERVIEW_KEY: 'k'.repeat(24) })
    expect((await on.request('/next')).status).toBe(401)
    const ok = await on.request('/next', { headers: { 'x-rangel-interview-key': 'k'.repeat(24) } })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ id: 'servicios.masaje-relajante.precio' })
  })
  it('rejects every request when the key is unset or empty', async () => {
    for (const key of [undefined, '']) {
      const on = createRangelInterviewRoutes({ RANGEL_INTERVIEW_ENABLED: 'true', RANGEL_INTERVIEW_KEY: key })
      expect((await on.request('/next')).status).toBe(401)
      expect((await on.request('/next', { headers: { 'x-rangel-interview-key': '' } })).status).toBe(401)
    }
  })
  it('does not record an answer when the Notion write fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 }))
    const idx = INTERVIEW_ITEMS.findIndex((i) => i.id === 'pendientes.precios.hecho')
    const state: InterviewState = { index: idx, answers: {} }
    await expect(answerCurrent(state, 'sí', { token: 't', fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow()
    expect(state.answers).toEqual({})
    expect(state.index).toBe(idx)
  })
  it('fails closed without a Notion token', async () => {
    const on = createRangelInterviewRoutes({ RANGEL_INTERVIEW_ENABLED: 'true', RANGEL_INTERVIEW_KEY: 'k'.repeat(24) })
    const res = await on.request('/answer', {
      method: 'POST',
      headers: { 'x-rangel-interview-key': 'k'.repeat(24), 'content-type': 'application/json' },
      body: JSON.stringify({ text: '700' }),
    })
    expect(res.status).toBe(502)
  })
})
