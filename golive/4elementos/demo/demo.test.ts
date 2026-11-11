// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ElementosDemoOrders, durableObjectStore } from './orders-do.ts'
import { demoConfigErrors, parseJsonc } from './config-check.ts'
import { handleDemoRequest } from './worker.ts'
import { memoryStore } from './state.ts'

describe('demo worker', () => {
  it('serves sample data and hides secrets on health', async () => {
    const store = memoryStore()
    const key = 'sk_test_51notasecret'
    const health = await handleDemoRequest(
      new Request('http://127.0.0.1:8788/api/4elementos/health'),
      { STRIPE_SECRET_KEY: key, DEMO_MODE: 'true' },
      store,
    )
    const body = await health.json()
    expect(body.stripe).toBe('test')
    expect(body.production).toBe(false)
    expect(JSON.stringify(body)).not.toContain(key)

    const demo = await handleDemoRequest(new Request('http://127.0.0.1:8788/api/4elementos/demo'), { DEMO_MODE: 'true' }, store)
    const seed = await demo.json()
    expect(seed.services.every((service: { demo: boolean }) => service.demo)).toBe(true)
    expect(seed.therapists[0].name).toBe('Ana Solís')
  })

  it('refuses known production hosts and their subdomains', async () => {
    const apex = await handleDemoRequest(new Request('https://nebu.quest/api/4elementos/health'), {}, memoryStore())
    const nested = await handleDemoRequest(new Request('https://api.nebu.quest/api/4elementos/health'), {}, memoryStore())
    const other = await handleDemoRequest(new Request('https://x.casabarravieja.com/api/4elementos/health'), {}, memoryStore())
    expect(apex.status).toBe(421)
    expect(nested.status).toBe(421)
    expect(other.status).toBe(421)
  })

  it('does not treat a failed durable object write as an empty book', async () => {
    const store = durableObjectStore({
      idFromName: () => 'id',
      get: () => ({ fetch: async () => new Response('no', { status: 500 }) }),
    })
    await expect(store.snapshot()).rejects.toThrow('demo_store_500')
  })

  it('keeps orders in the demo durable object', async () => {
    const map = new Map<string, unknown>()
    const orders = new ElementosDemoOrders(
      {
        storage: {
          async get(key) { return map.get(key) as never },
          async put(key, value) { map.set(key, value) },
        },
      },
      {},
    )
    const created = await orders.fetch(new Request('https://elementos-demo.internal/mutate', {
      method: 'POST',
      body: JSON.stringify({
        type: 'create_order',
        order: {
          id: 'ord_1',
          tenant: '4elementos',
          serviceId: 'masaje-relajante',
          serviceName: 'Masaje relajante',
          amountMxn: 900,
          currency: 'mxn',
          status: 'pending',
          demo: true,
          createdAt: '2026-11-11T00:00:00.000Z',
          updatedAt: '2026-11-11T00:00:00.000Z',
        },
      }),
    }))
    expect(created.status).toBe(200)
    const snapshot = await orders.fetch(new Request('https://elementos-demo.internal/snapshot'))
    const book = await snapshot.json()
    expect(book.orders[0].id).toBe('ord_1')
  })
})

describe('demo config', () => {
  it('stays a workers.dev preview with placeholder secrets and no custom domain', () => {
    const text = readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8')
    expect(demoConfigErrors(parseJsonc(text))).toEqual([])
    expect(text).not.toContain('"routes"')
  })

  it('refuses to deploy', () => {
    let status = 0
    let stderr = ''
    try {
      execFileSync('bash', ['golive/4elementos/demo/preview.sh', '--deploy'], { encoding: 'utf8' })
    } catch (error) {
      const failed = error as { status?: number; stderr?: string }
      status = failed.status ?? 0
      stderr = failed.stderr ?? ''
    }
    expect(status).toBe(2)
    expect(stderr).toContain('refusing to deploy')
    expect(stderr).toContain('npx wrangler deploy --config golive/4elementos/demo/wrangler.jsonc')
  })
})
