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

export function verifyTelegramLogin(payload: TelegramLoginPayload): boolean {
  const env = getServerEnv()
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error('Telegram auth is not configured on the server')
  }

  const { hash, ...rest } = payload
  const dataCheckString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${String((rest as Record<string, unknown>)[key] ?? '')}`)
    .join('\n')

  const secret = createHash('sha256').update(env.TELEGRAM_BOT_TOKEN).digest()
  const computed = createHmac('sha256', secret).update(dataCheckString).digest('hex')

  const a = Buffer.from(computed, 'utf8')
  const b = Buffer.from(hash, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false

  const maxAgeSeconds = 86400
  const now = Math.floor(Date.now() / 1000)
  return now - payload.auth_date <= maxAgeSeconds
}
