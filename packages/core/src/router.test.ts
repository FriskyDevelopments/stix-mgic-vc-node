import { afterEach, describe, expect, it, vi } from 'vitest'
import { exampleTenant } from './example.ts'
import { json } from './http.ts'
import { createTenantHandler, type ModuleRoute, type WorkerContext } from './router.ts'
import { loadTenantConfig } from './schema.ts'

const ctx: WorkerContext = { waitUntil() {} }

function handler(modules: ModuleRoute[], tenant = exampleTenant(), envClock?: () => Date) {
  return createTenantHandler({ tenant, modules, now: envClock })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tenant router', () => {
  it('serves health and the public manifest', async () => {
    const app = handler([])
    const health = await app.fetch(new Request('https://tenant.test/healthz'), { LOG_LEVEL: 'silent' }, ctx)
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ ok: true, tenant: 'example' })
    expect(health.headers.get('x-tenant')).toBe('example')

    const home = await app.fetch(new Request('https://tenant.test/'), { LOG_LEVEL: 'silent' }, ctx)
    const body = await home.json() as { theme: { cssVariables: Record<string, string> }; tenant: { id: string } }
    expect(body.tenant.id).toBe('example')
    expect(body.theme.cssVariables['--wl-color-accent']).toBe('#335555')
  })

  it('rejects the wrong method and an unknown path', async () => {
    const app = handler([])
    const posted = await app.fetch(new Request('https://tenant.test/healthz', { method: 'POST' }), { LOG_LEVEL: 'silent' }, ctx)
    expect(posted.status).toBe(405)
    const missing = await app.fetch(new Request('https://tenant.test/nope'), { LOG_LEVEL: 'silent' }, ctx)
    expect(missing.status).toBe(404)
  })

  it('does not call a module the tenant left disabled', async () => {
    const tenant = loadTenantConfig({
      ...structuredClone(exampleTenant()),
      modules: ['neuronas'],
      calendar: null,
    })
    const app = handler([{
      id: 'calendar',
      prefix: '/calendar',
      handle: async () => json({ leaked: true }),
    }], tenant)
    const res = await app.fetch(new Request('https://tenant.test/calendar/'), { LOG_LEVEL: 'silent' }, ctx)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('mounts a module and hides thrown errors and query strings', async () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
      lines.push(String(message))
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const app = handler([{
      id: 'calendar',
      prefix: '/calendar',
      handle: async (request) => {
        if (new URL(request.url).pathname.endsWith('/boom')) throw new Error('boom')
        return json({ ok: true })
      },
    }])
    const ok = await app.fetch(new Request('https://tenant.test/calendar/services?guest=Ana'), {}, ctx)
    expect(ok.status).toBe(200)
    expect(lines.join('\n')).toContain('/calendar/services')
    expect(lines.join('\n')).not.toContain('Ana')
    const bookingId = '11111111-1111-4111-8111-111111111111'
    await app.fetch(new Request(`https://tenant.test/calendar/bookings/${bookingId}/cancel`), {}, ctx)
    expect(lines.join('\n')).toContain('/calendar/bookings/:id/cancel')
    expect(lines.join('\n')).not.toContain(bookingId)
    await app.fetch(new Request('https://tenant.test/neuronas/notes/someone-secret/extra'), {}, ctx)
    expect(lines.join('\n')).toContain('/neuronas/notes/:id/:id')
    expect(lines.join('\n')).not.toContain('someone-secret')

    const boom = await app.fetch(new Request('https://tenant.test/calendar/boom'), { LOG_LEVEL: 'silent' }, ctx)
    expect(boom.status).toBe(500)
    expect(await boom.json()).toEqual({ error: 'internal' })
  })

  it('fails closed when TENANT_ID does not match the compiled tenant', async () => {
    const app = handler([])
    const res = await app.fetch(new Request('https://tenant.test/healthz'), { TENANT_ID: 'other', LOG_LEVEL: 'silent' }, ctx)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'tenant_mismatch' })
  })
})
