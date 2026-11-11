import { isUnset, timingSafeEqual } from '../shared/placeholders.ts'

export type StripeKeyClass = 'missing' | 'placeholder' | 'test' | 'live' | 'invalid'

export function classifyStripeSecretKey(key: string | undefined): StripeKeyClass {
  if (!key || !key.trim()) return 'missing'
  const trimmed = key.trim()
  if (trimmed.startsWith('sk_live_') || trimmed.startsWith('rk_live_')) return 'live'
  if (isUnset(trimmed)) return 'placeholder'
  if (trimmed.startsWith('sk_test_') || trimmed.startsWith('rk_test_')) return 'test'
  return 'invalid'
}

export type StripeKeyGate =
  | { ok: true; key: string }
  | { ok: false; code: 'stripe_key_missing' | 'stripe_live_blocked' | 'stripe_key_invalid' }

/** Test mode only. A live key is refused even if the rest of the demo is configured. */
export function assertStripeTestKey(key: string | undefined): StripeKeyGate {
  const kind = classifyStripeSecretKey(key)
  if (kind === 'missing' || kind === 'placeholder') return { ok: false, code: 'stripe_key_missing' }
  if (kind === 'live') return { ok: false, code: 'stripe_live_blocked' }
  if (kind === 'invalid' || !key) return { ok: false, code: 'stripe_key_invalid' }
  return { ok: true, key: key.trim() }
}

export function assertWebhookSecret(secret: string | undefined): { ok: true; secret: string } | { ok: false } {
  if (!secret || isUnset(secret) || !secret.trim().startsWith('whsec_')) return { ok: false }
  return { ok: true, secret: secret.trim() }
}

export interface StripeEvent {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}

export function parseStripeEvent(payload: string): StripeEvent | null {
  try {
    const parsed = JSON.parse(payload) as Partial<StripeEvent>
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.type !== 'string') return null
    if (!parsed.data || typeof parsed.data !== 'object' || !parsed.data.object || typeof parsed.data.object !== 'object') {
      return null
    }
    return { id: parsed.id, type: parsed.type, data: { object: parsed.data.object as Record<string, unknown> } }
  } catch {
    return null
  }
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Stripe-Signature: t=<unix>,v1=<hex hmac sha256 of `${t}.${rawBody}`>.
 * The webhook secret is the full `whsec_…` string, used as UTF-8, not base64-decoded.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowMs: number,
  toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false
  let timestamp = ''
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (name === 't') timestamp = value
    if (name === 'v1' && value) signatures.push(value)
  }
  if (!/^\d+$/.test(timestamp) || signatures.length === 0) return false
  const skew = Math.abs(nowMs / 1000 - Number(timestamp))
  if (skew > toleranceSec) return false
  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`)
  return signatures.some((candidate) => timingSafeEqual(candidate.toLowerCase(), expected.toLowerCase()))
}

export interface CheckoutDraft {
  orderId: string
  serviceName: string
  description: string
  unitAmount: number
  serviceId: string
  customerEmail?: string
  successUrl: string
  cancelUrl: string
}

export async function createStripeCheckoutSession(
  secretKey: string,
  draft: CheckoutDraft,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; id: string; url: string } | { ok: false; code: 'stripe_rejected' | 'stripe_bad_response'; status?: number }> {
  const body = new URLSearchParams()
  body.set('mode', 'payment')
  body.set('success_url', draft.successUrl)
  body.set('cancel_url', draft.cancelUrl)
  body.set('client_reference_id', draft.orderId)
  body.set('line_items[0][quantity]', '1')
  body.set('line_items[0][price_data][currency]', 'mxn')
  body.set('line_items[0][price_data][unit_amount]', String(draft.unitAmount))
  body.set('line_items[0][price_data][product_data][name]', draft.serviceName)
  body.set('line_items[0][price_data][product_data][description]', draft.description)
  body.set('metadata[tenant]', '4elementos')
  body.set('metadata[service_id]', draft.serviceId)
  body.set('metadata[order_id]', draft.orderId)
  body.set('metadata[demo]', 'true')
  if (draft.customerEmail) body.set('customer_email', draft.customerEmail)

  let response: Response
  try {
    response = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString().replace(/%7B/gi, '{').replace(/%7D/gi, '}'),
    })
  } catch {
    return { ok: false, code: 'stripe_rejected' }
  }
  if (!response.ok) return { ok: false, code: 'stripe_rejected', status: response.status }
  const payload = (await response.json()) as { id?: unknown; url?: unknown }
  if (typeof payload.id !== 'string' || typeof payload.url !== 'string') return { ok: false, code: 'stripe_bad_response' }
  return { ok: true, id: payload.id, url: payload.url }
}
