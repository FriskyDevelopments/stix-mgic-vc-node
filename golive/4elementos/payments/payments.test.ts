import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { memoryStore } from '../demo/state.ts'
import { handlePayments } from './routes.ts'
import { assertStripeTestKey, verifyStripeSignature } from './stripe.ts'

const secretKey = 'sk_test_51elementosdemo'
const webhookSecret = 'whsec_test_secret_value'

function signed(payload: string, secret = webhookSecret, timestamp = 1_700_000_000) {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
  return { payload, header: `t=${timestamp},v1=${signature}`, timestamp }
}

describe('stripe test mode', () => {
  it('refuses a live key and a placeholder', () => {
    const live = assertStripeTestKey('sk_live_abc')
    const missing = assertStripeTestKey('sk_test_REPLACE_ME')
    const ok = assertStripeTestKey(secretKey)
    if (live.ok || missing.ok || !ok.ok) throw new Error('key gate')
    expect(live.code).toBe('stripe_live_blocked')
    expect(missing.code).toBe('stripe_key_missing')
    expect(ok.ok).toBe(true)
  })

  it('rejects a stale or tampered signature', async () => {
    const { payload, header, timestamp } = signed('{"id":"evt_1","type":"ping","data":{"object":{}}}')
    const now = timestamp * 1000
    expect(await verifyStripeSignature(payload, header, webhookSecret, now)).toBe(true)
    expect(await verifyStripeSignature(payload, header, webhookSecret, now + 301_000)).toBe(false)
    expect(await verifyStripeSignature(`${payload} `, header, webhookSecret, now)).toBe(false)
    expect(await verifyStripeSignature(payload, header, 'whsec_other', now)).toBe(false)
  })
})

describe('checkout routes', () => {
  it('does not call Stripe when the key is live or missing', async () => {
    const store = memoryStore()
    let calls = 0
    const fetchImpl: typeof fetch = async () => {
      calls += 1
      return new Response('{}')
    }
    const live = await handlePayments(post({ serviceId: 'masaje-relajante' }), { STRIPE_SECRET_KEY: 'sk_live_no' }, store, fetchImpl)
    expect(live?.status).toBe(403)
    const missing = await handlePayments(post({ serviceId: 'masaje-relajante' }), { STRIPE_SECRET_KEY: 'sk_test_REPLACE_ME' }, store, fetchImpl)
    expect(missing?.status).toBe(503)
    expect(calls).toBe(0)
  })

  it('opens a test checkout and keeps the Stripe session template unencoded', async () => {
    const store = memoryStore()
    let body = ''
    const fetchImpl: typeof fetch = async (_url, init) => {
      body = String(init?.body ?? '')
      return Response.json({ id: 'cs_test_123', url: 'https://checkout.stripe.com/c/pay/cs_test_123' })
    }
    const response = await handlePayments(
      post({ serviceId: 'masaje-relajante', customerEmail: 'rangel@example.invalid' }),
      { STRIPE_SECRET_KEY: secretKey, PUBLIC_BASE_URL: 'http://127.0.0.1:8788' },
      store,
      fetchImpl,
    )
    expect(response?.status).toBe(200)
    const payload = await response!.json()
    expect(payload.mode).toBe('test')
    expect(payload.url).toContain('checkout.stripe.com')
    expect(body).toContain('{CHECKOUT_SESSION_ID}')
    expect(body).not.toContain('%7BCHECKOUT_SESSION_ID%7D')
    const params = new URLSearchParams(body.replaceAll('{', '%7B').replaceAll('}', '%7D'))
    expect(params.get('success_url')).toBe('http://127.0.0.1:8788/api/4elementos/checkout/success?session_id={CHECKOUT_SESSION_ID}')
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe('90000')
    expect(params.get('line_items[0][price_data][currency]')).toBe('mxn')
    const snapshot = await store.snapshot()
    expect(snapshot.orders[0]?.status).toBe('pending')
    expect(snapshot.orders[0]?.checkoutSessionId).toBe('cs_test_123')
    expect(snapshot.orders[0]?.demo).toBe(true)
  })

  it('marks paid only from a verified webhook, and cancel does not undo it', async () => {
    const store = memoryStore()
    const created = await handlePayments(
      post({ serviceId: 'reflexologia' }),
      { STRIPE_SECRET_KEY: secretKey },
      store,
      async () => Response.json({ id: 'cs_test_paid', url: 'https://checkout.stripe.com/c/pay/cs_test_paid' }),
      1_700_000_000_000,
    )
    const { orderId } = await created!.json()
    const pending = await handlePayments(
      new Request(`http://127.0.0.1:8788/api/4elementos/checkout/success?session_id=cs_test_paid`),
      { STRIPE_WEBHOOK_SECRET: webhookSecret },
      store,
    )
    const pendingText = await pending!.text()
    expect(pendingText).toContain('Estamos confirmando')
    expect(pendingText).not.toContain('<script')

    const event = JSON.stringify({
      id: 'evt_paid',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_paid', payment_status: 'paid', metadata: { order_id: orderId }, client_reference_id: orderId } },
    })
    const { header } = signed(event)
    const bad = await handlePayments(
      new Request('http://127.0.0.1:8788/api/4elementos/stripe/webhook', { method: 'POST', body: event, headers: { 'stripe-signature': 't=1,v1=deadbeef' } }),
      { STRIPE_WEBHOOK_SECRET: webhookSecret },
      store,
      fetch,
      1_700_000_000_000,
    )
    expect(bad?.status).toBe(400)

    const good = await handlePayments(
      new Request('http://127.0.0.1:8788/api/4elementos/stripe/webhook', { method: 'POST', body: event, headers: { 'stripe-signature': header } }),
      { STRIPE_WEBHOOK_SECRET: webhookSecret },
      store,
      fetch,
      1_700_000_000_000,
    )
    expect(good?.status).toBe(200)
    const again = await handlePayments(
      new Request('http://127.0.0.1:8788/api/4elementos/stripe/webhook', { method: 'POST', body: event, headers: { 'stripe-signature': header } }),
      { STRIPE_WEBHOOK_SECRET: webhookSecret },
      store,
      fetch,
      1_700_000_000_000,
    )
    expect((await again!.json()).duplicate).toBe(true)

    const success = await handlePayments(new Request('http://127.0.0.1:8788/api/4elementos/checkout/success?session_id=cs_test_paid'), {}, store)
    expect(await success!.text()).toContain('Pago de prueba registrado')

    const cancel = await handlePayments(new Request(`http://127.0.0.1:8788/api/4elementos/checkout/cancel?order_id=${orderId}`), {}, store)
    expect(await cancel!.text()).toContain('ya estaba pagado')
    expect((await store.snapshot()).orders[0]?.status).toBe('paid')
  })

  it('refuses to reflect a session id with markup', async () => {
    const store = memoryStore()
    const response = await handlePayments(
      new Request('http://127.0.0.1:8788/api/4elementos/checkout/success?session_id=%3Cscript%3E'),
      {},
      store,
    )
    const text = await response!.text()
    expect(response?.status).toBe(404)
    expect(text).not.toContain('<script>')
  })
})

function post(body: unknown): Request {
  return new Request('http://127.0.0.1:8788/api/4elementos/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
