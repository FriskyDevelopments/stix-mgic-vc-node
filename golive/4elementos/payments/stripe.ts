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
  const fields: Record<string, string> = {
    mode: 'payment',
    success_url: draft.successUrl,
    cancel_url: draft.cancelUrl,
    client_reference_id: draft.orderId,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'mxn',
    'line_items[0][price_data][unit_amount]': String(draft.unitAmount),
    'line_items[0][price_data][product_data][name]': draft.serviceName,
    'line_items[0][price_data][product_data][description]': draft.description,
    'metadata[tenant]': '4elementos',
    'metadata[service_id]': draft.serviceId,
    'metadata[order_id]': draft.orderId,
    'metadata[demo]': 'true',
    'payment_intent_data[metadata][tenant]': '4elementos',
    'payment_intent_data[metadata][order_id]': draft.orderId,
    'payment_intent_data[metadata][demo]': 'true',
  }
  if (draft.customerEmail) fields.customer_email = draft.customerEmail

  let response: Response
  try {
    response = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: encodeCheckoutForm(fields),
    })
  } catch {
    return { ok: false, code: 'stripe_rejected' }
  }
  if (!response.ok) return { ok: false, code: 'stripe_rejected', status: response.status }
  let payload: { id?: unknown; url?: unknown }
  try {
    payload = (await response.json()) as { id?: unknown; url?: unknown }
  } catch {
    return { ok: false, code: 'stripe_bad_response' }
  }
  if (typeof payload.id !== 'string' || typeof payload.url !== 'string' || !isCheckoutUrl(payload.url)) {
    return { ok: false, code: 'stripe_bad_response' }
  }
  return { ok: true, id: payload.id, url: payload.url }
}

/** Stripe must see the session placeholder raw. Every other brace stays encoded. */
export function encodeCheckoutForm(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, value]) => {
      let encoded = encodeURIComponent(value)
      if (key === 'success_url') {
        encoded = encoded.replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}')
      }
      return `${encodeURIComponent(key)}=${encoded}`
    })
    .join('&')
}

export function isCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.username || url.password) return false
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return host === 'checkout.stripe.com'
  } catch {
    return false
  }
}
