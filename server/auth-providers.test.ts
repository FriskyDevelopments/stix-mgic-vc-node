import { createHash, createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeTelegramLoginPayload, verifyTelegramLogin, type TelegramLoginPayload } from './auth-providers'
import { resetServerEnvCache } from './env'

const BOT_TOKEN = '123456:TEST-telegram-bot-token'

function signPayload(token: string, fields: Omit<TelegramLoginPayload, 'hash'>): TelegramLoginPayload {
  const entries = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
  const secret = createHash('sha256').update(token).digest()
  const hash = createHmac('sha256', secret).update(entries.join('\n')).digest('hex')
  return { ...fields, hash }
}

describe('Telegram login widget verification', () => {
  beforeEach(() => {
    resetServerEnvCache()
    process.env.NODE_ENV = 'test'
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN
    process.env.OPERATOR_TOKEN_SECRET = 'test-operator-token-secret'
  })

  afterEach(() => {
    resetServerEnvCache()
    delete process.env.TELEGRAM_BOT_TOKEN
  })

  it('accepts a widget payload signed with the configured bot token', () => {
    const payload = signPayload(BOT_TOKEN, {
      id: 4242,
      first_name: 'June',
      username: 'operator',
      auth_date: Math.floor(Date.now() / 1000),
    })
    expect(verifyTelegramLogin(payload)).toBe(true)
  })

  it('ignores extra keys and empty optional fields when hashing', () => {
    const signed = signPayload(BOT_TOKEN, {
      id: 99,
      first_name: 'Stix',
      auth_date: Math.floor(Date.now() / 1000),
    })
    const noisy = {
      ...signed,
      last_name: '',
      photo_url: '',
      bot: 'MyFenrirTeleConnectBot',
      extra: 'nope',
    } as TelegramLoginPayload
    expect(normalizeTelegramLoginPayload(noisy)).toEqual({
      id: 99,
      first_name: 'Stix',
      auth_date: signed.auth_date,
      hash: signed.hash,
    })
    expect(verifyTelegramLogin(noisy)).toBe(true)
  })

  it('rejects a payload signed by a different bot token', () => {
    const payload = signPayload('999:other-bot', {
      id: 1,
      first_name: 'Nope',
      auth_date: Math.floor(Date.now() / 1000),
    })
    expect(verifyTelegramLogin(payload)).toBe(false)
  })

  it('rejects an expired auth_date', () => {
    const payload = signPayload(BOT_TOKEN, {
      id: 7,
      first_name: 'Old',
      auth_date: Math.floor(Date.now() / 1000) - 90_000,
    })
    expect(verifyTelegramLogin(payload)).toBe(false)
  })
})
