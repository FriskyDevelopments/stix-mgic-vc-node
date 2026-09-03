import { createHash, createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeTelegramLoginPayload, verifyTelegramLogin, type TelegramLoginPayload } from './auth-providers'
import { resetServerEnvCache } from './env'

const BOT_TOKEN = '123456:TEST-telegram-bot-token'

function signWidget(token: string, fields: Omit<TelegramLoginPayload, 'hash' | 'initData'>): TelegramLoginPayload {
  const entries = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
  const secret = createHash('sha256').update(token).digest()
  const hash = createHmac('sha256', secret).update(entries.join('\n')).digest('hex')
  return { ...fields, hash }
}

function signMiniAppInitData(token: string, fields: Record<string, string>): string {
  const dataCheckString = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex')
  return new URLSearchParams({ ...fields, hash }).toString()
}

describe('Telegram login verification', () => {
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

  describe('Login Widget (SHA256(bot_token))', () => {
    it('accepts a widget payload signed with the configured bot token', () => {
      const payload = signWidget(BOT_TOKEN, {
        id: 4242,
        first_name: 'June',
        username: 'operator',
        auth_date: Math.floor(Date.now() / 1000),
      })
      expect(verifyTelegramLogin(payload)).toEqual({
        id: 4242,
        first_name: 'June',
        username: 'operator',
      })
    })

    it('ignores extra keys and empty optional fields when hashing', () => {
      const signed = signWidget(BOT_TOKEN, {
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
      const normalized = normalizeTelegramLoginPayload(noisy)
      expect(normalized).toMatchObject({
        id: 99,
        first_name: 'Stix',
        auth_date: signed.auth_date,
        hash: signed.hash,
      })
      expect(verifyTelegramLogin(noisy)).toEqual({
        id: 99,
        first_name: 'Stix',
      })
    })

    it("accepts auth_date and id as decimal strings", () => {
      const authDate = Math.floor(Date.now() / 1000)
      const payload = signWidget(BOT_TOKEN, {
        id: "424242",
        first_name: "Stringy",
        auth_date: String(authDate),
      })
      expect(verifyTelegramLogin(payload)).toEqual({
        id: 424242,
        first_name: "Stringy",
      })
    })

    it("rejects scientific-notation ids that would poison the HMAC string", () => {
      const payload = signWidget(BOT_TOKEN, {
        id: "7.77e+9",
        first_name: "Nope",
        auth_date: Math.floor(Date.now() / 1000),
      })
      expect(normalizeTelegramLoginPayload(payload)).toBeNull()
      expect(verifyTelegramLogin(payload)).toBeNull()
    })

    it('rejects a payload signed by a different bot token', () => {
      const payload = signWidget('999:other-bot', {
        id: 1,
        first_name: 'Nope',
        auth_date: Math.floor(Date.now() / 1000),
      })
      expect(verifyTelegramLogin(payload)).toBeNull()
    })

    it('rejects an expired auth_date', () => {
      const payload = signWidget(BOT_TOKEN, {
        id: 7,
        first_name: 'Old',
        auth_date: Math.floor(Date.now() / 1000) - 90_000,
      })
      expect(verifyTelegramLogin(payload)).toBeNull()
    })
  })

  describe('Mini App initData (HMAC_SHA256("WebAppData", bot_token))', () => {
    it('accepts initData signed with the Mini App secret and parses user JSON', () => {
      const authDate = String(Math.floor(Date.now() / 1000))
      const user = JSON.stringify({ id: 42, first_name: 'Ada', username: 'ada_tg' })
      const initData = signMiniAppInitData(BOT_TOKEN, {
        auth_date: authDate,
        user,
        query_id: 'AAE',
      })

      expect(verifyTelegramLogin({ initData })).toEqual({
        id: 42,
        first_name: 'Ada',
        username: 'ada_tg',
      })
    })

    it('accepts Mini App fields reconstructed from a nested user object', () => {
      const authDate = String(Math.floor(Date.now() / 1000))
      const user = { id: 42, first_name: 'Ada', last_name: 'Lovelace' }
      const initData = signMiniAppInitData(BOT_TOKEN, {
        auth_date: authDate,
        user: JSON.stringify(user),
      })
      const params = new URLSearchParams(initData)

      expect(
        verifyTelegramLogin({
          auth_date: params.get('auth_date'),
          user,
          hash: params.get('hash'),
        })
      ).toEqual({
        id: 42,
        first_name: 'Ada',
        last_name: 'Lovelace',
      })
    })

    it('still verifies when Telegram also sends a third-party signature field', () => {
      const authDate = String(Math.floor(Date.now() / 1000))
      const user = JSON.stringify({ id: 7, first_name: 'Sig' })
      const fields = { auth_date: authDate, user, signature: 'ed25519-placeholder' }
      const initData = signMiniAppInitData(BOT_TOKEN, fields)
      expect(verifyTelegramLogin({ initData })?.id).toBe(7)
    })

    it('rejects initData signed with the Login Widget secret', () => {
      const authDate = String(Math.floor(Date.now() / 1000))
      const user = JSON.stringify({ id: 42, first_name: 'Ada' })
      const dataCheckString = [`auth_date=${authDate}`, `user=${user}`].sort().join('\n')
      const wrongSecret = createHash('sha256').update(BOT_TOKEN).digest()
      const wrongHash = createHmac('sha256', wrongSecret).update(dataCheckString).digest('hex')
      const initData = new URLSearchParams({ auth_date: authDate, user, hash: wrongHash }).toString()

      expect(verifyTelegramLogin({ initData })).toBeNull()
    })

    it('rejects expired initData', () => {
      const authDate = String(Math.floor(Date.now() / 1000) - 90_000)
      const user = JSON.stringify({ id: 42, first_name: 'Ada' })
      const initData = signMiniAppInitData(BOT_TOKEN, { auth_date: authDate, user })
      expect(verifyTelegramLogin({ initData })).toBeNull()
    })
  })
})
