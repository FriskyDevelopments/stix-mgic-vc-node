import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { getServerEnv } from './env'

export type DiscordUser = {
  id: string
  username: string
  discriminator: string
  global_name?: string | null
  avatar?: string | null
}

export async function exchangeDiscordCode(input: {
  code: string
  redirectUri: string
}): Promise<DiscordUser> {
  const env = getServerEnv()
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
    throw new Error('Discord OAuth is not configured on the server')
  }

  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
  })

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    throw new Error(`Discord token exchange failed: ${tokenRes.status} ${text}`)
  }

  const tokenJson = (await tokenRes.json()) as { access_token: string }
  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  })

  if (!userRes.ok) {
    const text = await userRes.text()
    throw new Error(`Discord user fetch failed: ${userRes.status} ${text}`)
  }

  return userRes.json() as Promise<DiscordUser>
}

/**
 * Telegram signs two different things with two different key derivations:
 *
 *   Login Widget (browser)  secret = SHA256(bot_token)
 *   Mini App  (initData)    secret = HMAC_SHA256("WebAppData", bot_token)
 *
 * They are not interchangeable. This module used to implement the Widget scheme
 * only, so a Mini App `{ initData }` or nested `user` payload always failed
 * normalizeTelegramLoginPayload and returned 401 Invalid Telegram login payload.
 */
export type TelegramLoginPayload = {
  id?: number | string
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date?: number | string
  hash?: string
  /** Mini App: raw `window.Telegram.WebApp.initData` query string. */
  initData?: string
  query_id?: string
  user?: unknown
  signature?: string
}

export type TelegramVerifiedUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
}

const TELEGRAM_WIDGET_FIELDS = ['auth_date', 'first_name', 'id', 'last_name', 'photo_url', 'username'] as const
const AUTH_DATE_MAX_AGE_SECONDS = 86400

function presentString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Telegram user ids and auth_date must enter the HMAC as decimal integers.
 * JSON number scientific notation ("7.77e+9") and unsafe floats are rejected
 * rather than stringified into a check-string Telegram never signed.
 */
export function decimalIntString(value: unknown): string | null {
  if (typeof value === 'bigint') {
    if (value <= 0n) return null
    return value.toString()
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) return null
    return String(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!/^[1-9]\d*$/.test(trimmed)) return null
    return trimmed
  }
  return null
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const text = String(value).trim()
  return text.length > 0 ? text : undefined
}

function hexHash(value: unknown): string | undefined {
  const hash = presentString(typeof value === 'string' ? value : value == null ? '' : String(value))?.toLowerCase()
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return undefined
  return hash
}

function timingSafeHexEqual(computed: string, provided: string): boolean {
  const a = Buffer.from(computed, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

function authDateFresh(value: unknown): boolean {
  const authDate = Number(typeof value === 'string' ? value.trim() : value)
  if (!Number.isFinite(authDate) || authDate <= 0) return false
  const age = Math.floor(Date.now() / 1000) - authDate
  return age >= 0 && age <= AUTH_DATE_MAX_AGE_SECONDS
}

type WidgetNormalized = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
  idString: string
  authDateString: string
}

/**
 * Telegram Login Widget only signs fields that were present on the payload.
 * Extra keys, empty optionals, and undefined values must never enter the HMAC string.
 */
export function normalizeTelegramLoginPayload(
  input: Record<string, unknown> | TelegramLoginPayload | null | undefined
): WidgetNormalized | null {
  if (!input || typeof input !== 'object') return null

  const idString = decimalIntString((input as TelegramLoginPayload).id)
  const firstName = presentString((input as TelegramLoginPayload).first_name)
  const authDateString = decimalIntString((input as TelegramLoginPayload).auth_date)
  const hash = hexHash((input as TelegramLoginPayload).hash)

  if (!idString || !firstName || !authDateString || !hash) return null

  const id = Number(idString)
  const auth_date = Number(authDateString)
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(auth_date)) return null

  const payload: WidgetNormalized = {
    id,
    first_name: firstName,
    auth_date,
    hash,
    idString,
    authDateString,
  }

  const lastName = presentString((input as TelegramLoginPayload).last_name)
  const username = presentString((input as TelegramLoginPayload).username)
  const photoUrl = presentString((input as TelegramLoginPayload).photo_url)
  if (lastName) payload.last_name = lastName
  if (username) payload.username = username
  if (photoUrl) payload.photo_url = photoUrl
  return payload
}

function isMiniAppObject(input: Record<string, unknown>): boolean {
  if (presentString(input.initData as string | undefined)) return true
  if (input.user !== undefined && input.user !== null) return true
  if (presentString(typeof input.query_id === 'string' ? input.query_id : undefined)) return true
  return false
}

function dataCheckString(params: URLSearchParams, omit: string[]): string {
  return [...params.entries()]
    .filter(([key]) => !omit.includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n')
}

function miniAppUserFromParams(params: URLSearchParams): TelegramVerifiedUser | null {
  const raw = params.get('user')
  if (!raw) return null
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
  return miniAppUserFromRecord(parsed)
}

function miniAppUserFromRecord(parsed: Record<string, unknown>): TelegramVerifiedUser | null {
  const idString = decimalIntString(parsed.id)
  if (!idString) return null
  const id = Number(idString)
  if (!Number.isSafeInteger(id)) return null
  const firstName = optionalString(parsed.first_name) ?? ''
  const user: TelegramVerifiedUser = {
    id,
    first_name: firstName,
  }
  const lastName = optionalString(parsed.last_name)
  const username = optionalString(parsed.username)
  const photoUrl = optionalString(parsed.photo_url)
  if (lastName) user.last_name = lastName
  if (username) user.username = username
  if (photoUrl) user.photo_url = photoUrl
  return user
}

function verifyMiniAppInitData(initData: string, botToken: string): TelegramVerifiedUser | null {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(initData)
  } catch {
    return null
  }

  const providedHash = hexHash(params.get('hash') ?? '')
  if (!providedHash) return null
  if (!authDateFresh(params.get('auth_date'))) return null

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const withSignature = dataCheckString(params, ['hash'])
  if (timingSafeHexEqual(createHmac('sha256', secret).update(withSignature).digest('hex'), providedHash)) {
    return miniAppUserFromParams(params)
  }
  if (params.has('signature')) {
    const withoutSignature = dataCheckString(params, ['hash', 'signature'])
    if (timingSafeHexEqual(createHmac('sha256', secret).update(withoutSignature).digest('hex'), providedHash)) {
      return miniAppUserFromParams(params)
    }
  }
  return null
}

function objectToInitData(input: Record<string, unknown>): string | null {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (key === 'initData') continue
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'object') {
      params.set(key, JSON.stringify(value))
    } else {
      params.set(key, String(value))
    }
  }
  if (!params.get('hash')) return null
  return params.toString()
}

function verifyLoginWidget(input: Record<string, unknown>, botToken: string): TelegramVerifiedUser | null {
  const normalized = normalizeTelegramLoginPayload(input)
  if (!normalized) return null
  if (!authDateFresh(normalized.authDateString)) return null

  const dataCheckStringWidget = TELEGRAM_WIDGET_FIELDS
    .filter((key) => {
      if (key === 'id') return true
      if (key === 'auth_date') return true
      return normalized[key] !== undefined && String(normalized[key]).length > 0
    })
    .sort()
    .map((key) => {
      if (key === 'id') return `id=${normalized.idString}`
      if (key === 'auth_date') return `auth_date=${normalized.authDateString}`
      return `${key}=${String(normalized[key])}`
    })
    .join('\n')

  const secret = createHash('sha256').update(botToken).digest()
  const computed = createHmac('sha256', secret).update(dataCheckStringWidget).digest('hex')
  if (!timingSafeHexEqual(computed, normalized.hash)) return null

  const user: TelegramVerifiedUser = {
    id: normalized.id,
    first_name: normalized.first_name,
  }
  if (normalized.last_name) user.last_name = normalized.last_name
  if (normalized.username) user.username = normalized.username
  if (normalized.photo_url) user.photo_url = normalized.photo_url
  return user
}

export function verifyTelegramLogin(payload: TelegramLoginPayload | Record<string, unknown> | null | undefined): TelegramVerifiedUser | null {
  const env = getServerEnv()
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error('Telegram auth is not configured on the server')
  }
  if (!payload || typeof payload !== 'object') return null

  const input = payload as Record<string, unknown>
  const initData = presentString(typeof input.initData === 'string' ? input.initData : undefined)
  if (initData) {
    return verifyMiniAppInitData(initData, env.TELEGRAM_BOT_TOKEN)
  }
  if (isMiniAppObject(input)) {
    const reconstructed = objectToInitData(input)
    if (!reconstructed) return null
    return verifyMiniAppInitData(reconstructed, env.TELEGRAM_BOT_TOKEN)
  }
  return verifyLoginWidget(input, env.TELEGRAM_BOT_TOKEN)
}
