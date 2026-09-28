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

/** Why a Login Widget payload was refused. Server-side only — never sent to the client. */
export type TelegramLoginRejection =
  | 'not_configured'
  | 'malformed_payload'
  | 'hash_mismatch'
  | 'auth_date_in_future'
  | 'auth_date_expired'

export type TelegramLoginCheck = { ok: true } | { ok: false; reason: TelegramLoginRejection }

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
 * The token whose SHA-256 keys the login HMAC.
 *
 * It must belong to the bot that signed the payload — the one named by
 * TELEGRAM_BOT_USERNAME and loaded by the Login Widget. `TELEGRAM_BOT_TOKEN` doubles as
 * the webhook/commands bot and is not necessarily that bot, so a dedicated
 * `TELEGRAM_LOGIN_BOT_TOKEN` wins when present.
 */
function loginVerificationToken(): string | undefined {
  const env = getServerEnv()
  return env.TELEGRAM_LOGIN_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN
}

/** The bot's numeric id — the part before the colon. Public, unlike the token itself. */
function botIdOf(token: string | undefined): string | null {
  if (!token) return null
  const [id] = token.split(':')
  return /^\d+$/.test(id) ? id : null
}

/**
 * REDACTED diagnostics, in the same discipline as `oidc.ts` and `supabase-auth.ts`:
 * a coarse reason code, field NAMES, and lengths. Never a token, a hash, a user id or a
 * display name. `verifyingBotId` is the public bot id and is the single field that makes
 * a bot/token mismatch legible without another investigation.
 */
function logTelegramLoginRejected(
  reason: TelegramLoginRejection,
  payload: Partial<TelegramLoginPayload> | null | undefined,
  extra: Record<string, unknown> = {}
): void {
  const fields = payload && typeof payload === 'object' ? Object.keys(payload).sort() : []
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      scope: 'telegram-auth',
      message: 'telegram login rejected',
      data: {
        reason,
        fieldsPresent: fields,
        hasHash: typeof payload?.hash === 'string' && payload.hash.length > 0,
        hashLength: typeof payload?.hash === 'string' ? payload.hash.length : 0,
        verifyingBotId: botIdOf(loginVerificationToken()),
        usingDedicatedLoginToken: Boolean(getServerEnv().TELEGRAM_LOGIN_BOT_TOKEN),
        configuredBotUsername: getServerEnv().TELEGRAM_BOT_USERNAME ?? null,
        ...extra,
      },
    })
  )
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

function verifyMiniAppInitData(initData: string): TelegramVerifiedUser | null {
  const botToken = loginVerificationToken()
  if (!botToken) return null

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

/**
 * Verify a Telegram Login Widget payload and return a structured check result.
 *
 * The data-check-string is every received field except `hash`, sorted by key, joined with
 * `\n` as `key=value`. Fields Telegram did not send are absent from what it signed, so a
 * null or undefined value must be omitted entirely — emitting `key=` for it appends a line
 * Telegram never hashed and breaks the digest. `photo_url` and `username` are the two that
 * are routinely absent.
 */
export function checkTelegramLogin(payload: TelegramLoginPayload): TelegramLoginCheck {
  const token = loginVerificationToken()
  if (!token) {
    throw new Error('Telegram auth is not configured on the server')
  }

  const normalized = normalizeTelegramLoginPayload(payload)
  if (!normalized) {
    logTelegramLoginRejected('malformed_payload', payload)
    return { ok: false, reason: 'malformed_payload' }
  }

  if (!authDateFresh(normalized.authDateString)) {
    const age = Math.floor(Date.now() / 1000) - normalized.auth_date
    const reason = age < 0 ? 'auth_date_in_future' : 'auth_date_expired'
    logTelegramLoginRejected(reason, payload, { authDateAgeSeconds: age })
    return { ok: false, reason }
  }

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

  const secret = createHash('sha256').update(token).digest()
  const computed = createHmac('sha256', secret).update(dataCheckStringWidget).digest('hex')
  if (!timingSafeHexEqual(computed, normalized.hash)) {
    logTelegramLoginRejected('hash_mismatch', payload, {
      signedFieldCount: dataCheckStringWidget ? dataCheckStringWidget.split('\n').length : 0,
      computedHashLength: computed.length,
    })
    return { ok: false, reason: 'hash_mismatch' }
  }

  return { ok: true }
}

function verifyLoginWidget(input: Record<string, unknown>): TelegramVerifiedUser | null {
  const normalized = normalizeTelegramLoginPayload(input)
  if (!normalized) return null
  const check = checkTelegramLogin(input)
  if (!check.ok) return null

  const user: TelegramVerifiedUser = {
    id: normalized.id,
    first_name: normalized.first_name,
  }
  if (normalized.last_name) user.last_name = normalized.last_name
  if (normalized.username) user.username = normalized.username
  if (normalized.photo_url) user.photo_url = normalized.photo_url
  return user
}

export function verifyTelegramLogin(
  payload: TelegramLoginPayload | Record<string, unknown> | null | undefined
): TelegramVerifiedUser | null {
  if (!payload || typeof payload !== 'object') return null

  const input = payload as Record<string, unknown>
  const initData = presentString(typeof input.initData === 'string' ? input.initData : undefined)
  if (initData) {
    return verifyMiniAppInitData(initData)
  }
  if (isMiniAppObject(input)) {
    const reconstructed = objectToInitData(input)
    if (!reconstructed) return null
    return verifyMiniAppInitData(reconstructed)
  }
  return verifyLoginWidget(input)
}
