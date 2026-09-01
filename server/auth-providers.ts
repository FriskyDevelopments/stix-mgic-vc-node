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

export type TelegramLoginPayload = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

const TELEGRAM_LOGIN_FIELDS = ['auth_date', 'first_name', 'id', 'last_name', 'photo_url', 'username'] as const

function presentString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Telegram only signs fields that were present on the widget payload.
 * Extra keys, empty optionals, and undefined values must never enter the HMAC string.
 */
export function normalizeTelegramLoginPayload(
  input: Record<string, unknown> | TelegramLoginPayload | null | undefined
): TelegramLoginPayload | null {
  if (!input || typeof input !== 'object') return null

  const id = Number((input as TelegramLoginPayload).id)
  const firstName = presentString((input as TelegramLoginPayload).first_name)
  const authDate = Number((input as TelegramLoginPayload).auth_date)
  const hash = presentString(String((input as TelegramLoginPayload).hash ?? ''))?.toLowerCase()

  if (!Number.isFinite(id) || id <= 0) return null
  if (!firstName) return null
  if (!Number.isFinite(authDate) || authDate <= 0) return null
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null

  const payload: TelegramLoginPayload = {
    id,
    first_name: firstName,
    auth_date: authDate,
    hash,
  }

  const lastName = presentString((input as TelegramLoginPayload).last_name)
  const username = presentString((input as TelegramLoginPayload).username)
  const photoUrl = presentString((input as TelegramLoginPayload).photo_url)
  if (lastName) payload.last_name = lastName
  if (username) payload.username = username
  if (photoUrl) payload.photo_url = photoUrl
  return payload
}

export function verifyTelegramLogin(payload: TelegramLoginPayload): boolean {
  const env = getServerEnv()
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error('Telegram auth is not configured on the server')
  }

  const normalized = normalizeTelegramLoginPayload(payload)
  if (!normalized) return false

  const dataCheckString = TELEGRAM_LOGIN_FIELDS
    .filter((key) => normalized[key] !== undefined && String(normalized[key]).length > 0)
    .sort()
    .map((key) => `${key}=${String(normalized[key])}`)
    .join('\n')

  const secret = createHash('sha256').update(env.TELEGRAM_BOT_TOKEN).digest()
  const computed = createHmac('sha256', secret).update(dataCheckString).digest('hex')

  const a = Buffer.from(computed, 'utf8')
  const b = Buffer.from(normalized.hash, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false

  const maxAgeSeconds = 86400
  const now = Math.floor(Date.now() / 1000)
  const age = now - normalized.auth_date
  return age >= 0 && age <= maxAgeSeconds
}
