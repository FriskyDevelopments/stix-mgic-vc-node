import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configureAccountStore, resetAccountStore } from './account-store'
import { resetServerEnvCache } from './env'
import { beginTelegramLink, linkStatus } from './telegram-group-access'
import { handleTelegramUpdate, isTelegramWebhookAuthorized } from './telegram-bot'

let directory: string
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vc-telegram-bot-'))
  vi.stubEnv('MTPROTO_STATE_DIR', directory)
  vi.stubEnv('TELEGRAM_GROUP_ACCESS_PATH', join(directory, 'access.json'))
  vi.stubEnv('TELEGRAM_BOT_TOKEN', `test-token-${directory}`)
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'test-webhook-secret-at-least-24-characters')
  resetServerEnvCache()
  configureAccountStore({ persist: false })
  resetAccountStore()
  fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({ ok: true, result: url.endsWith('/getMe') ? { id: 777, is_bot: true, username: 'friskyops_bot' } : { message_id: 1 } }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetServerEnvCache()
  rmSync(directory, { recursive: true, force: true })
})

describe('Telegram command webhook', () => {
  it('keeps the secret-header check separate from operator identity', () => {
    expect(isTelegramWebhookAuthorized(undefined)).toBe(false)
    expect(isTelegramWebhookAuthorized('wrong')).toBe(false)
    expect(isTelegramWebhookAuthorized(process.env.TELEGRAM_WEBHOOK_SECRET)).toBe(true)
  })

  it('connects a private deep-link command and replies without echoing the code', async () => {
    const start = await beginTelegramLink('supabase-user')
    const payload = new URL(start.url).searchParams.get('start')!
    expect(await handleTelegramUpdate({ message: { text: `/start ${payload}`, chat: { id: 42, type: 'private' }, from: { id: 42, is_bot: false } } })).toEqual({ handled: true })
    expect(linkStatus('supabase-user').telegramUserId).toBe('42')
    const sent = JSON.parse(String(fetchMock.mock.calls.at(-1)![1].body))
    expect(sent.text).toBe('Telegram connected. Return to VC NODE to choose a group you manage.')
    expect(sent.text).not.toContain(payload)
  })

  it('does not bind or announce a connection command posted in a group', async () => {
    const start = await beginTelegramLink('supabase-user')
    const payload = new URL(start.url).searchParams.get('start')!
    fetchMock.mockClear()
    await handleTelegramUpdate({ message: { text: `/start ${payload}`, chat: { id: -10011, type: 'supergroup' }, from: { id: 42 } } })
    expect(linkStatus('supabase-user').linked).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses plain English for public status commands', async () => {
    await handleTelegramUpdate({ message: { text: '/status', chat: { id: 42 } } })
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(sent.text).toContain('Private video rooms')
    expect(sent.text).not.toMatch(/WebRTC|TURN/)
  })

  it('does not leak raw transport errors into logs', async () => {
    fetchMock.mockRejectedValue(new Error(`secret ${process.env.TELEGRAM_BOT_TOKEN}`))
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await handleTelegramUpdate({ message: { text: '/vc', chat: { id: 42 } } })
    expect(warning).toHaveBeenCalledTimes(1)
    expect(String(warning.mock.calls[0])).not.toContain(process.env.TELEGRAM_BOT_TOKEN)
  })
})
