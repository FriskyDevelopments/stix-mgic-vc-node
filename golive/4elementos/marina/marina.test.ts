import { describe, expect, it } from 'vitest'
import { memoryStore } from '../demo/state.ts'
import { readWahaInbound, requestStudioCall, twilioSignature, verifyTwilioSignature } from './client.ts'
import { handleMarina } from './routes.ts'

describe('Marina client', () => {
  it('asks the existing marina-chat webhook and does not send WhatsApp unless asked', async () => {
    const store = memoryStore()
    const calls: { url: string; body: string; headers: Headers }[] = []
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body ?? ''), headers: new Headers(init?.headers) })
      return Response.json({ reply: 'Claro, te ayudo.', escalated: false, language: 'es', provider: 'mistral', source: 'n8n' })
    }
    const response = await handleMarina(
      post('/api/4elementos/marina/messages', { text: 'Quiero una cita', deliver: false, language: 'es' }),
      { MARINA_CHAT_URL: 'https://marina.example.internal/webhook/marina-chat', WAHA_API_KEY: 'should-not-send' },
      store,
      fetchImpl,
    )
    expect(response?.status).toBe(200)
    const payload = await response!.json()
    expect(payload.delivered).toBe(false)
    expect(payload.reply).toContain('ayudo')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toContain('/webhook/marina-chat')
    expect(calls[0]?.headers.get('origin')).toBe('https://casabarravieja.com')
    expect(calls[0]?.body).toContain('"channel":"whatsapp"')
    expect(calls[0]?.body).not.toContain('should-not-send')
  })

  it('delivers through the WAHA HTTP API only when deliver is true and the env is set', async () => {
    const store = memoryStore()
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push(String(url))
      if (String(url).includes('/api/sendText')) {
        const body = JSON.parse(String(init?.body))
        expect(body).toEqual({ session: 'studio', chatId: '525512345678@c.us', text: 'Listo' })
        expect(new Headers(init?.headers).get('x-api-key')).toBe('waha-test-key')
        return Response.json({ ok: true })
      }
      return Response.json({ reply: 'Listo', escalated: false, language: 'es' })
    }
    const response = await handleMarina(
      post('/api/4elementos/marina/messages', { text: 'Hola', to: '+525512345678', deliver: true }),
      {
        MARINA_CHAT_URL: 'https://marina.example.internal/webhook/marina-chat',
        WAHA_BASE_URL: 'https://waha.example.internal',
        WAHA_SESSION: 'studio',
        WAHA_API_KEY: 'waha-test-key',
      },
      store,
      fetchImpl,
    )
    expect(response?.status).toBe(200)
    expect((await response!.json()).delivered).toBe(true)
    expect(calls.some((url) => url.endsWith('/api/sendText'))).toBe(true)
  })

  it('ignores WAHA groups and refuses an ingress without the shared secret', async () => {
    const store = memoryStore()
    const open = await handleMarina(
      post('/api/4elementos/marina/waha', { event: 'message', payload: { from: '123@c.us', body: 'hola', fromMe: false } }),
      {},
      store,
    )
    expect(open?.status).toBe(503)

    const wrong = await handleMarina(
      post('/api/4elementos/marina/waha', { event: 'message', payload: { from: '123@c.us', body: 'hola', fromMe: false } }, { 'x-marina-secret': 'nope' }),
      { MARINA_WEBHOOK_SECRET: 'marina-test-secret' },
      store,
    )
    expect(wrong?.status).toBe(401)

    const group = await handleMarina(
      post('/api/4elementos/marina/waha', { event: 'message', payload: { from: '123@g.us', body: 'hola', fromMe: false, id: 'g1' } }, { 'x-marina-secret': 'marina-test-secret' }),
      { MARINA_WEBHOOK_SECRET: 'marina-test-secret' },
      store,
    )
    expect((await group!.json()).accepted).toBe(false)
    expect((await store.snapshot()).messages).toHaveLength(0)

    expect(readWahaInbound({ event: 'message', payload: { fromMe: true, from: '1@c.us', body: 'x' } }).reason).toBe('from_me')
  })

  it('does not call Twilio unless Marina has no voice URL and direct calls were explicitly enabled', async () => {
    const store = memoryStore()
    let calls = 0
    const fetchImpl: typeof fetch = async () => {
      calls += 1
      return Response.json({ sid: 'CA123' })
    }
    const blocked = await handleMarina(
      post('/api/4elementos/marina/calls', { to: '+525512345678', reason: 'confirmar' }),
      { TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'token', TWILIO_FROM_NUMBER: '+15005550006', TWILIO_DIRECT_CALLS: 'false' },
      store,
      fetchImpl,
    )
    expect(blocked?.status).toBe(503)
    expect(calls).toBe(0)

    const viaMarina = await requestStudioCall(
      { MARINA_VOICE_URL: 'https://marina.example.internal/webhook/marina-voice', TWILIO_AUTH_TOKEN: 'token-should-stay', TWILIO_FROM_NUMBER: '+15005550006' },
      { to: '+525512345678', reason: 'confirmar cita' },
      async (_url, init) => {
        const body = JSON.parse(String(init?.body))
        expect(body.provider).toBe('twilio')
        expect(body.channel).toBe('voice')
        expect(JSON.stringify(body)).not.toContain('token-should-stay')
        return Response.json({ ok: true })
      },
    )
    expect(viaMarina.ok).toBe(true)
  })

  it('verifies a Twilio status signature and records the status', async () => {
    const store = memoryStore()
    await store.mutate({
      type: 'call_record',
      call: {
        id: 'call_1',
        at: '2026-11-11T00:00:00.000Z',
        to: '+525512345678',
        from: '+15005550006',
        reason: 'muestra',
        via: 'twilio',
        status: 'requested',
        providerSid: 'CA999',
      },
    })
    const params = { CallSid: 'CA999', CallStatus: 'completed' }
    const url = 'https://demo.example.internal/api/4elementos/marina/twilio/status'
    const signature = await twilioSignature('twilio-test-token', url, params)
    expect(await verifyTwilioSignature('twilio-test-token', url, params, signature)).toBe(true)
    expect(await verifyTwilioSignature('twilio-test-token', url, params, 'nope')).toBe(false)

    const body = new URLSearchParams(params).toString()
    const response = await handleMarina(
      new Request(url, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature } }),
      { TWILIO_AUTH_TOKEN: 'twilio-test-token', TWILIO_WEBHOOK_URL: url },
      store,
    )
    expect(response?.status).toBe(200)
    expect((await store.snapshot()).calls[0]?.status).toBe('completed')
  })
})

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://127.0.0.1:8788${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}
