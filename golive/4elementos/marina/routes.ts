import type { DemoStore } from '../demo/state.ts'
import { isUnset, timingSafeEqual } from '../shared/placeholders.ts'
import { json } from '../payments/routes.ts'
import {
  askMarina,
  chatIdForPhone,
  readWahaInbound,
  requestStudioCall,
  sendWahaText,
  verifyTwilioSignature,
  type MarinaEnv,
} from './client.ts'

export type { MarinaEnv }

export async function handleMarina(
  request: Request,
  env: MarinaEnv & { DEMO_ACCESS_TOKEN?: string },
  store: DemoStore,
  fetchImpl: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<Response | null> {
  const url = new URL(request.url)
  const path = url.pathname
  if (!path.startsWith('/api/4elementos/marina/')) return null

  if (path === '/api/4elementos/marina/messages' && request.method === 'POST') {
    return messages(request, env, fetchImpl)
  }
  if (path === '/api/4elementos/marina/calls' && request.method === 'POST') {
    return calls(request, env, store, fetchImpl, nowMs)
  }
  if (path === '/api/4elementos/marina/waha' && request.method === 'POST') {
    return wahaInbound(request, env, store, nowMs)
  }
  if (path === '/api/4elementos/marina/twilio/status' && request.method === 'POST') {
    return twilioStatus(request, env, store)
  }
  if (path === '/api/4elementos/marina/inbox' && request.method === 'GET') {
    if (!bearerOk(request, env.DEMO_ACCESS_TOKEN)) return json({ error: 'unauthorized' }, 401)
    const state = await store.snapshot()
    return json({ messages: state.messages, calls: state.calls })
  }
  return json({ error: 'not_found' }, 404)
}

async function messages(request: Request, env: MarinaEnv & { DEMO_ACCESS_TOKEN?: string }, fetchImpl: typeof fetch) {
  if (!bearerOk(request, env.DEMO_ACCESS_TOKEN)) return json({ error: 'unauthorized' }, 401)
  let body: { text?: unknown; to?: unknown; deliver?: unknown; language?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text || text.length > 2000) return json({ error: 'invalid_message' }, 400)
  const deliver = body.deliver === true
  const chatId = deliver ? chatIdForPhone(typeof body.to === 'string' ? body.to : '') : null
  if (deliver && !chatId) return json({ error: 'invalid_phone', delivered: false }, 400)
  const language = typeof body.language === 'string' ? body.language : 'es'
  const consult = await askMarina(env, { message: text, language }, fetchImpl)
  if (!consult.ok) return json({ error: consult.code, delivered: false }, consult.code === 'marina_not_configured' ? 503 : 502)

  if (!deliver) {
    return json({
      reply: consult.reply,
      escalated: consult.escalated,
      provider: consult.provider,
      source: consult.source,
      delivered: false,
      providerName: 'WAHA',
    })
  }
  const sent = await sendWahaText(env, { chatId: chatId!, text: consult.reply || text }, fetchImpl)
  if (!sent.ok) {
    return json({ error: sent.code, reply: consult.reply, delivered: false }, sent.code === 'waha_not_configured' ? 503 : 502)
  }
  return json({ reply: consult.reply, delivered: true, providerName: 'WAHA', escalated: consult.escalated })
}

async function calls(
  request: Request,
  env: MarinaEnv & { DEMO_ACCESS_TOKEN?: string },
  store: DemoStore,
  fetchImpl: typeof fetch,
  nowMs: number,
) {
  if (!bearerOk(request, env.DEMO_ACCESS_TOKEN)) return json({ error: 'unauthorized' }, 401)
  let body: { to?: unknown; reason?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const to = typeof body.to === 'string' ? body.to : ''
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Llamada de muestra de 4 Elementos.'
  const result = await requestStudioCall(env, { to, reason }, fetchImpl)
  if (!result.ok) {
    const status = result.code === 'invalid_phone' ? 400 : result.code === 'marina_voice_not_configured' ? 503 : 502
    return json({ error: result.code }, status)
  }
  await store.mutate({
    type: 'call_record',
    call: {
      id: `call_${crypto.randomUUID()}`,
      at: new Date(nowMs).toISOString(),
      to: result.to,
      from: env.TWILIO_FROM_NUMBER?.trim() || '',
      reason: reason.slice(0, 180),
      via: result.via,
      status: 'requested',
      providerSid: result.providerSid,
    },
  })
  return json({ ok: true, via: result.via, provider: result.via === 'twilio' ? 'twilio' : 'marina' })
}

async function wahaInbound(request: Request, env: MarinaEnv, store: DemoStore, nowMs: number) {
  if (isUnset(env.MARINA_WEBHOOK_SECRET)) return json({ error: 'waha_ingress_not_configured' }, 503)
  const presented = request.headers.get('x-marina-secret') ?? ''
  if (!timingSafeEqual(presented, env.MARINA_WEBHOOK_SECRET!.trim())) return json({ error: 'invalid_signature' }, 401)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const inbound = readWahaInbound(body)
  if (!inbound.accepted || !inbound.from || !inbound.text) {
    return json({ accepted: false, reason: inbound.reason ?? 'not_a_message' })
  }
  await store.mutate({
    type: 'inbound_message',
    message: {
      id: inbound.id || `waha_${crypto.randomUUID()}`,
      at: new Date(nowMs).toISOString(),
      from: inbound.from,
      text: inbound.text,
      provider: 'WAHA',
    },
  })
  return json({ accepted: true, provider: 'WAHA' })
}

async function twilioStatus(request: Request, env: MarinaEnv, store: DemoStore) {
  const raw = await request.text()
  const params = Object.fromEntries(new URLSearchParams(raw))
  const url = !isUnset(env.TWILIO_WEBHOOK_URL) ? env.TWILIO_WEBHOOK_URL!.trim() : request.url
  const valid = await verifyTwilioSignature(env.TWILIO_AUTH_TOKEN, url, params, request.headers.get('x-twilio-signature'))
  if (!valid) return json({ error: 'invalid_signature' }, 403)
  const sid = params.CallSid
  const status = params.CallStatus
  if (sid && status) {
    await store.mutate({ type: 'call_status', providerSid: sid, status, at: new Date().toISOString() })
  }
  return json({ received: true })
}

function bearerOk(request: Request, token: string | undefined): boolean {
  if (isUnset(token)) return true
  const header = request.headers.get('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  return timingSafeEqual(presented, token!.trim())
}
