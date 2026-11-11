import { DEMO_SERVICES } from '../payments/catalog.ts'
import { durableObjectStore, type OrderNamespace } from './orders-do.ts'
import { memoryStore, type DemoStore } from './state.ts'
import { handlePayments, type PaymentsEnv } from '../payments/routes.ts'
import { handleMarina, type MarinaEnv } from '../marina/routes.ts'
import { classifyStripeSecretKey } from '../payments/stripe.ts'
import { isUnset } from '../shared/placeholders.ts'
import { wahaReady } from '../marina/client.ts'

/**
 * Cloudflare preview for 4 Elementos. Not production and not the client domain.
 * Depends on the parallel white-label branch only as a future mount:
 * packages/core, modules/calendar, modules/neuronas, tenants/4elementos.
 * This file does not edit those paths.
 */
export interface DemoEnv extends PaymentsEnv, MarinaEnv {
  DEMO_MODE?: string
  ORDERS?: OrderNamespace
  ASSETS?: { fetch(request: Request): Promise<Response> }
}

const FORBIDDEN_HOSTS = new Set([
  'vc.friskydev.com',
  'nebu.quest',
  'www.nebu.quest',
  'casabarravieja.com',
  'www.casabarravieja.com',
  'waha.friskydev.com',
])

const previewStore = memoryStore()

export async function handleDemoRequest(
  request: Request,
  env: DemoEnv,
  store?: DemoStore,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const activeStore = store ?? (env.ORDERS ? durableObjectStore(env.ORDERS) : previewStore)
  const url = new URL(request.url)
  if (FORBIDDEN_HOSTS.has(url.hostname)) {
    return json({ error: 'host_not_allowed', demo: true }, 421)
  }
  if (url.pathname === '/api/4elementos/health' && request.method === 'GET') {
    return json(health(env))
  }
  if (url.pathname === '/api/4elementos/demo' && request.method === 'GET') {
    return json(seed())
  }
  const payments = await handlePayments(request, env, activeStore, fetchImpl)
  if (payments) return payments
  const marina = await handleMarina(request, env, activeStore, fetchImpl)
  if (marina) return marina
  if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404)
  if (env.ASSETS && (request.method === 'GET' || request.method === 'HEAD')) {
    return env.ASSETS.fetch(request)
  }
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/4elementos' || url.pathname === '/4elementos/')) {
    return new Response(FALLBACK_HTML, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    })
  }
  return json({ error: 'not_found' }, 404)
}

export function health(env: DemoEnv) {
  const stripe = classifyStripeSecretKey(env.STRIPE_SECRET_KEY)
  return {
    tenant: '4elementos',
    demo: true,
    production: false,
    stripe: stripe === 'live' ? 'blocked' : stripe === 'test' ? 'test' : 'unconfigured',
    marinaChat: !isUnset(env.MARINA_CHAT_URL),
    waha: wahaReady(env),
    marinaVoice: !isUnset(env.MARINA_VOICE_URL),
    twilioDirect: env.TWILIO_DIRECT_CALLS === 'true',
  }
}

export function seed() {
  return {
    tenant: '4elementos',
    demo: true,
    note: 'Datos de muestra. No son los precios ni las personas reales de Rangel.',
    services: DEMO_SERVICES,
    therapists: [
      {
        id: 'ana-muestra',
        name: 'Ana Solís',
        demo: true,
        specialties: ['Masaje relajante', 'Aromaterapia'],
        bio: 'Tarjeta de muestra. La bio real la escribe Rangel.',
      },
      {
        id: 'leo-muestra',
        name: 'Leo Martín',
        demo: true,
        specialties: ['Descontracturante', 'Piedras calientes'],
        bio: 'Tarjeta de muestra. Sin foto de una persona real.',
      },
    ],
    appointments: [
      {
        id: 'cita-muestra-1',
        label: 'Relajante con Ana, viernes 14:00',
        status: 'muestra',
        demo: true,
      },
    ],
    movements: [
      {
        id: 'mov-muestra-1',
        concept: 'Compra de aceites (muestra)',
        kind: 'gasto',
        demo: true,
      },
    ],
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      'x-demo-tenant': '4elementos',
    },
  })
}

const FALLBACK_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>4 Elementos · muestra</title>
  <style>
    body { margin: 0; background: #f4efe6; color: #1c1612; font: 18px/1.5 Georgia, serif; }
    main { max-width: 36rem; margin: 0 auto; padding: 3rem 1.25rem; }
  </style>
</head>
<body>
  <main>
    <p>Muestra. No es producción y no usa el dominio del cliente.</p>
    <h1>4 Elementos</h1>
    <p>Esta página es el respaldo del worker. La experiencia completa se arma con <code>./golive/4elementos/demo/preview.sh</code>.</p>
  </main>
</body>
</html>`

export default {
  async fetch(request: Request, env: DemoEnv): Promise<Response> {
    return handleDemoRequest(request, env)
  },
}

export { ElementosDemoOrders } from './orders-do.ts'
