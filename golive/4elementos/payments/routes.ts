import { findOrder, findOrderBySession, type DemoStore, type Order } from '../demo/state.ts'
import { isBlockedHost, isLoopbackOrDemoHost } from '../shared/hosts.ts'
import { escapeHtml, safeToken } from '../shared/html.ts'
import { isUnset, timingSafeEqual } from '../shared/placeholders.ts'
import { findService, priceCentavos } from './catalog.ts'
import {
  assertStripeTestKey,
  assertWebhookSecret,
  createStripeCheckoutSession,
  parseStripeEvent,
  verifyStripeSignature,
} from './stripe.ts'

export interface PaymentsEnv {
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  PUBLIC_BASE_URL?: string
  DEMO_ACCESS_TOKEN?: string
}

const EMAIL = /^[^\s@{}]+@[^\s@{}]+\.[^\s@{}]+$/

export function bearerAllowed(request: Request, token: string | undefined): boolean {
  if (isUnset(token)) return true
  const header = request.headers.get('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  return timingSafeEqual(presented, token!.trim())
}

/**
 * Stripe return URLs are built only from PUBLIC_BASE_URL, or from the request
 * when that host is loopback or this demo's workers.dev name. A client-supplied
 * Host is not an allowlist entry.
 */
export function publicBase(request: Request, configured: string | undefined): string | null {
  const explicit = Boolean(configured && !isUnset(configured))
  let url: URL
  try {
    url = new URL(explicit ? configured!.trim() : request.url)
  } catch {
    return null
  }
  if (url.username || url.password) return null
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (isBlockedHost(url.hostname)) return null
  if (explicit) return url.origin
  if (isLoopbackOrDemoHost(url.hostname)) return url.origin
  return null
}

export async function handlePayments(
  request: Request,
  env: PaymentsEnv,
  store: DemoStore,
  fetchImpl: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<Response | null> {
  const url = new URL(request.url)
  const path = url.pathname
  if (!path.startsWith('/api/4elementos/checkout') && path !== '/api/4elementos/stripe/webhook') return null

  if (path === '/api/4elementos/checkout' && request.method === 'POST') {
    return createCheckout(request, env, store, fetchImpl, nowMs)
  }
  if (path === '/api/4elementos/checkout/success' && request.method === 'GET') {
    return successPage(url, store)
  }
  if (path === '/api/4elementos/checkout/cancel' && request.method === 'GET') {
    return cancelPage(url, store, nowMs)
  }
  if (path === '/api/4elementos/stripe/webhook' && request.method === 'POST') {
    return webhook(request, env, store, nowMs)
  }
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }
  return json({ error: 'not_found' }, 404)
}

async function createCheckout(
  request: Request,
  env: PaymentsEnv,
  store: DemoStore,
  fetchImpl: typeof fetch,
  nowMs: number,
): Promise<Response> {
  if (!bearerAllowed(request, env.DEMO_ACCESS_TOKEN)) return json({ error: 'unauthorized' }, 401)
  const key = assertStripeTestKey(env.STRIPE_SECRET_KEY)
  if (!key.ok) return json({ error: key.code, mode: 'test' }, key.code === 'stripe_live_blocked' ? 403 : 503)

  let body: { serviceId?: unknown; customerEmail?: unknown }
  try {
    body = (await request.json()) as { serviceId?: unknown; customerEmail?: unknown }
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const service = typeof body.serviceId === 'string' ? findService(body.serviceId) : null
  if (!service) return json({ error: 'unknown_service' }, 400)
  let email: string | undefined
  if (typeof body.customerEmail === 'string' && body.customerEmail.trim()) {
    email = body.customerEmail.trim()
    if (!EMAIL.test(email) || email.length > 120) return json({ error: 'invalid_email' }, 400)
  }

  const origin = publicBase(request, env.PUBLIC_BASE_URL)
  if (!origin) return json({ error: 'public_base_untrusted' }, 400)

  const now = new Date(nowMs).toISOString()
  const order: Order = {
    id: `ord_${crypto.randomUUID()}`,
    tenant: '4elementos',
    serviceId: service.id,
    serviceName: service.name,
    amountMxn: service.priceMxn,
    currency: 'mxn',
    email,
    status: 'pending',
    demo: true,
    createdAt: now,
    updatedAt: now,
  }
  await store.mutate({ type: 'create_order', order })
  const successUrl = `${origin}/api/4elementos/checkout/success?session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${origin}/api/4elementos/checkout/cancel?order_id=${order.id}`
  const session = await createStripeCheckoutSession(
    key.key,
    {
      orderId: order.id,
      serviceId: service.id,
      serviceName: `${service.name} (muestra)`,
      description: 'Precio de muestra de 4 Elementos. No es una tarifa confirmada. Modo prueba.',
      unitAmount: priceCentavos(service),
      customerEmail: email,
      successUrl,
      cancelUrl,
    },
    fetchImpl,
  )
  if (!session.ok) {
    await store.mutate({ type: 'set_status', orderId: order.id, status: 'failed', at: now })
    return json({ error: session.code, orderId: order.id }, 502)
  }
  await store.mutate({
    type: 'set_status',
    orderId: order.id,
    status: 'pending',
    sessionId: session.id,
    at: now,
  })
  return json({ orderId: order.id, url: session.url, mode: 'test', demo: true })
}

async function successPage(url: URL, store: DemoStore): Promise<Response> {
  const sessionId = safeToken(url.searchParams.get('session_id'))
  const state = await store.snapshot()
  const order = sessionId ? findOrderBySession(state, sessionId) : null
  if (!order) {
    return html(
      page({
        title: 'No encontramos esa sesión',
        body: 'El enlace no corresponde a un cobro de esta muestra. Recargar esta página no marca nada como pagado.',
      }),
      404,
    )
  }
  if (order.status === 'paid') {
    return html(
      page({
        title: 'Pago de prueba registrado',
        body: `${order.serviceName} quedó anotado como pagado en modo prueba. Esto no es un cargo de producción.`,
      }),
    )
  }
  return html(
    page({
      title: 'Estamos confirmando el pago de prueba',
      body: 'Stripe todavía no avisó a esta muestra. Recargar no marca el pago como hecho. Si cerraste la ventana de Stripe antes de pagar, no hay cargo.',
    }),
  )
}

async function cancelPage(url: URL, store: DemoStore, nowMs: number): Promise<Response> {
  const orderId = safeToken(url.searchParams.get('order_id'))
  const state = await store.snapshot()
  const order = orderId ? findOrder(state, orderId) : null
  if (!order) {
    return html(page({ title: 'No hay un cobro que cancelar', body: 'Ese pedido no está en esta muestra.' }), 404)
  }
  if (order.status === 'paid') {
    return html(
      page({
        title: 'Este pedido ya estaba pagado en modo prueba',
        body: 'No lo cancelamos. El aviso de Stripe ya lo había marcado como pagado.',
      }),
    )
  }
  if (order.status === 'pending') {
    await store.mutate({
      type: 'set_status',
      orderId: order.id,
      status: 'canceled',
      at: new Date(nowMs).toISOString(),
    })
  }
  return html(
    page({
      title: 'El pago de prueba se canceló',
        body: `${order.serviceName} no se cobró. Puedes volver al estudio cuando quieras.`,
    }),
  )
}

async function webhook(request: Request, env: PaymentsEnv, store: DemoStore, nowMs: number): Promise<Response> {
  const secret = assertWebhookSecret(env.STRIPE_WEBHOOK_SECRET)
  if (!secret.ok) return json({ error: 'webhook_not_configured' }, 503)
  const payload = await request.text()
  const verified = await verifyStripeSignature(payload, request.headers.get('stripe-signature'), secret.secret, nowMs)
  if (!verified) return json({ error: 'invalid_signature' }, 400)
  const event = parseStripeEvent(payload)
  if (!event) return json({ error: 'invalid_event' }, 400)
  const result = await store.mutate({ type: 'stripe_event', event, at: new Date(nowMs).toISOString() })
  return json({ received: true, duplicate: result.duplicate, status: result.order?.status ?? null })
}

function page(input: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(input.title)} · 4 Elementos</title>
  <style>
    body { margin: 0; background: #f4efe6; color: #1c1612; font: 18px/1.5 "Iowan Old Style", Palatino, Georgia, serif; }
    main { max-width: 36rem; margin: 0 auto; padding: 3rem 1.25rem; }
    a { color: #1f5c64; }
    p.note { font-family: "Segoe UI", sans-serif; font-size: 0.95rem; }
  </style>
</head>
<body>
  <main>
    <p class="note">Muestra. No es producción.</p>
    <h1>${escapeHtml(input.title)}</h1>
    <p>${escapeHtml(input.body)}</p>
    <p><a href="/">Volver al estudio</a></p>
  </main>
</body>
</html>`
}

function html(markup: string, status = 200): Response {
  return new Response(markup, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      'referrer-policy': 'no-referrer',
    },
  })
}

export function json(body: unknown, status = 200): Response {
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
