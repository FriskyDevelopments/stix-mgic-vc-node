import { isE164, normalizePhone, wahaDirectChatId } from '../shared/phone.ts'
import { isUnset, timingSafeEqual } from '../shared/placeholders.ts'
import { escapeHtml } from '../shared/html.ts'
import { stripControls } from '../shared/text.ts'

/**
 * Client of Marina's existing external interfaces.
 *
 * Chat: POST {MARINA_CHAT_URL} with the body Marina's published `marina-chat`
 * webhook already reads: `{ message, language, history, channel: "whatsapp" }`.
 * The published webhook allowlists Origin `https://casabarravieja.com`. This
 * client sends that Origin when `MARINA_ORIGIN` is unset. It does not edit
 * Marina's workflow, prompt, or allowlist.
 *
 * WhatsApp delivery: WAHA HTTP API `POST {WAHA_BASE_URL}/api/sendText`
 * `{ session, chatId, text }` plus header `X-Api-Key`. This is the same HTTP
 * call Marina's WAHA flow already makes. It is not a fake inbound event to
 * Marina's `marina-whatsapp` webhook (that webhook treats the body as a
 * customer message). Delivery stays off unless the caller sets `deliver: true`
 * and the WAHA env is configured.
 *
 * Voice: POST {MARINA_VOICE_URL} when that URL is set. Marina does not publish
 * a voice webhook today, so the call is refused until the owner supplies one.
 * Direct Twilio is a separate, default-off path.
 */
export interface MarinaEnv {
  MARINA_CHAT_URL?: string
  MARINA_ORIGIN?: string
  MARINA_VOICE_URL?: string
  MARINA_WEBHOOK_SECRET?: string
  WAHA_BASE_URL?: string
  WAHA_SESSION?: string
  WAHA_API_KEY?: string
  TWILIO_ACCOUNT_SID?: string
  TWILIO_AUTH_TOKEN?: string
  TWILIO_FROM_NUMBER?: string
  TWILIO_DIRECT_CALLS?: string
  TWILIO_WEBHOOK_URL?: string
}

export interface MarinaHistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface MarinaChatResult {
  ok: true
  reply: string
  escalated: boolean
  language: string
  provider?: string
  source?: string
}

export type MarinaFailure = {
  ok: false
  code: 'marina_not_configured' | 'marina_rejected' | 'marina_bad_response'
  status?: number
}

const CHAT_LANGUAGES = new Set(['es', 'en', 'fr'])

export function marinaOrigin(env: MarinaEnv): string {
  const origin = env.MARINA_ORIGIN?.trim()
  if (origin && !isUnset(origin)) return origin
  return 'https://casabarravieja.com'
}

export async function askMarina(
  env: MarinaEnv,
  input: { message: string; language?: string; history?: MarinaHistoryTurn[] },
  fetchImpl: typeof fetch = fetch,
): Promise<MarinaChatResult | MarinaFailure> {
  if (isUnset(env.MARINA_CHAT_URL)) return { ok: false, code: 'marina_not_configured' }
  const language = CHAT_LANGUAGES.has(input.language ?? '') ? (input.language as string) : 'es'
  const history = (input.history ?? [])
    .filter((turn) => turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
    .slice(-8)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 2000) }))
  const body = {
    message: input.message.slice(0, 2000),
    language,
    channel: 'whatsapp' as const,
    history,
  }
  let response: Response
  try {
    response = await fetchImpl(env.MARINA_CHAT_URL!.trim(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        origin: marinaOrigin(env),
      },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, code: 'marina_rejected' }
  }
  if (!response.ok && response.status !== 502) return { ok: false, code: 'marina_rejected', status: response.status }
  let payload: { reply?: unknown; escalated?: unknown; language?: unknown; provider?: unknown; source?: unknown }
  try {
    payload = (await response.json()) as typeof payload
  } catch {
    return { ok: false, code: 'marina_bad_response' }
  }
  if (typeof payload.reply !== 'string') return { ok: false, code: 'marina_bad_response' }
  return {
    ok: true,
    reply: payload.reply,
    escalated: Boolean(payload.escalated),
    language: typeof payload.language === 'string' ? payload.language : language,
    provider: typeof payload.provider === 'string' ? payload.provider : undefined,
    source: typeof payload.source === 'string' ? payload.source : undefined,
  }
}

export function wahaReady(env: MarinaEnv): boolean {
  return !isUnset(env.WAHA_BASE_URL) && !isUnset(env.WAHA_SESSION) && !isUnset(env.WAHA_API_KEY)
}

export async function sendWahaText(
  env: MarinaEnv,
  input: { chatId: string; text: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; code: 'waha_not_configured' | 'waha_rejected' | 'invalid_chat'; status?: number }> {
  if (!wahaReady(env)) return { ok: false, code: 'waha_not_configured' }
  if (!input.chatId.endsWith('@c.us') || input.chatId.includes('@g.us')) {
    return { ok: false, code: 'invalid_chat' }
  }
  const base = env.WAHA_BASE_URL!.trim().replace(/\/$/, '')
  let response: Response
  try {
    response = await fetchImpl(`${base}/api/sendText`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-api-key': env.WAHA_API_KEY!.trim(),
      },
      body: JSON.stringify({
        session: env.WAHA_SESSION!.trim(),
        chatId: input.chatId,
        text: input.text.slice(0, 2000),
      }),
    })
  } catch {
    return { ok: false, code: 'waha_rejected' }
  }
  if (!response.ok) return { ok: false, code: 'waha_rejected', status: response.status }
  return { ok: true }
}

export interface WahaInbound {
  accepted: boolean
  reason?: 'not_a_message' | 'from_me' | 'group' | 'broadcast' | 'newsletter' | 'empty' | 'bad_sender'
  from?: string
  text?: string
  id?: string
}

/** Normalize a WAHA `message` event. Does not apply Marina's private block list. */
export function readWahaInbound(body: unknown): WahaInbound {
  if (!body || typeof body !== 'object') return { accepted: false, reason: 'not_a_message' }
  const event = body as { event?: unknown; payload?: unknown }
  if (event.event !== 'message' || !event.payload || typeof event.payload !== 'object') {
    return { accepted: false, reason: 'not_a_message' }
  }
  const payload = event.payload as { from?: unknown; fromMe?: unknown; body?: unknown; id?: unknown }
  if (payload.fromMe === true) return { accepted: false, reason: 'from_me' }
  const from = String(payload.from ?? '')
  if (!from) return { accepted: false, reason: 'bad_sender' }
  if (from.endsWith('@g.us')) return { accepted: false, reason: 'group' }
  if (from === 'status@broadcast') return { accepted: false, reason: 'broadcast' }
  if (from.endsWith('@newsletter')) return { accepted: false, reason: 'newsletter' }
  const text = String(payload.body ?? '').trim()
  if (!text) return { accepted: false, reason: 'empty' }
  return {
    accepted: true,
    from: from.slice(0, 200),
    text: text.slice(0, 2000),
    id: String(payload.id ?? '').slice(0, 200) || undefined,
  }
}

export interface CallRequestResult {
  ok: true
  via: 'marina' | 'twilio'
  providerSid?: string
}

export type CallFailure = {
  ok: false
  code: 'invalid_phone' | 'marina_voice_not_configured' | 'twilio_not_configured' | 'call_rejected'
  status?: number
}

export async function requestStudioCall(
  env: MarinaEnv,
  input: { to: string; reason: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CallRequestResult | CallFailure> {
  const to = normalizePhone(input.to)
  if (!isE164(to)) return { ok: false, code: 'invalid_phone' }
  const from = env.TWILIO_FROM_NUMBER?.trim() ?? ''
  const reason = stripControls(input.reason).trim().slice(0, 180)
  if (!isUnset(env.MARINA_VOICE_URL)) {
    return postMarinaVoice(env, { to, from, reason }, fetchImpl)
  }
  if (env.TWILIO_DIRECT_CALLS === 'true') {
    return placeTwilioCall(env, { to, reason }, fetchImpl)
  }
  return { ok: false, code: 'marina_voice_not_configured' }
}

async function postMarinaVoice(
  env: MarinaEnv,
  input: { to: string; from: string; reason: string },
  fetchImpl: typeof fetch,
): Promise<CallRequestResult | CallFailure> {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' }
  if (!isUnset(env.MARINA_WEBHOOK_SECRET)) headers['x-marina-secret'] = env.MARINA_WEBHOOK_SECRET!.trim()
  let response: Response
  try {
    response = await fetchImpl(env.MARINA_VOICE_URL!.trim(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tenant: '4elementos',
        channel: 'voice',
        provider: 'twilio',
        to: input.to,
        from: isE164(normalizePhone(input.from)) ? normalizePhone(input.from) : undefined,
        reason: input.reason,
      }),
    })
  } catch {
    return { ok: false, code: 'call_rejected' }
  }
  if (!response.ok) return { ok: false, code: 'call_rejected', status: response.status }
  return { ok: true, via: 'marina' }
}

/** Direct Twilio Calls API. The demo route only reaches this when TWILIO_DIRECT_CALLS=true. */
export async function placeTwilioCall(
  env: MarinaEnv,
  input: { to: string; reason: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CallRequestResult | CallFailure> {
  const sid = env.TWILIO_ACCOUNT_SID?.trim() ?? ''
  const token = env.TWILIO_AUTH_TOKEN?.trim() ?? ''
  const from = normalizePhone(env.TWILIO_FROM_NUMBER ?? '')
  if (isUnset(sid) || isUnset(token) || !sid.startsWith('AC') || !isE164(from)) {
    return { ok: false, code: 'twilio_not_configured' }
  }
  const say = escapeHtml(input.reason || 'Llamada de muestra de 4 Elementos.')
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-MX">${say}</Say></Response>`
  const body = new URLSearchParams()
  body.set('To', input.to)
  body.set('From', from)
  body.set('Twiml', twiml)
  const authorization = `Basic ${btoa(`${sid}:${token}`)}`
  let response: Response
  try {
    response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls.json`, {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body,
    })
  } catch {
    return { ok: false, code: 'call_rejected' }
  }
  if (!response.ok) return { ok: false, code: 'call_rejected', status: response.status }
  const payload = (await response.json()) as { sid?: unknown }
  return { ok: true, via: 'twilio', providerSid: typeof payload.sid === 'string' ? payload.sid : undefined }
}

export async function twilioSignature(authToken: string, url: string, params: Record<string, string>): Promise<string> {
  const keys = Object.keys(params).sort()
  let data = url
  for (const key of keys) data += key + params[key]
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
  let binary = ''
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export async function verifyTwilioSignature(
  authToken: string | undefined,
  url: string,
  params: Record<string, string>,
  signature: string | null,
): Promise<boolean> {
  if (isUnset(authToken) || !signature) return false
  const expected = await twilioSignature(authToken!.trim(), url, params)
  return timingSafeEqual(signature.trim(), expected)
}

export function chatIdForPhone(phone: string): string | null {
  return wahaDirectChatId(normalizePhone(phone))
}
