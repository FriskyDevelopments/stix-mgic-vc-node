import { getAppEnv } from '@/lib/env'
import { setOperatorToken } from '@/lib/operator-token'
import { apiHeaders, apiUrl } from '@/lib/api-client'

export type PlatformAuthStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
}

export interface DiscordUser {
  id: string
  username: string
  discriminator: string
  avatar?: string
  global_name?: string
}

export interface AuthState {
  telegram: { status: PlatformAuthStatus; user: TelegramUser | null; error: string | null }
  discord: { status: PlatformAuthStatus; user: DiscordUser | null; error: string | null }
}

function discordClientId(): string {
  return getAppEnv().discordClientId || ''
}

function discordRedirectUri(): string {
  return `${window.location.origin}/auth/discord/callback`
}

export function isDiscordConfigured(): boolean {
  return discordClientId().length > 0
}

function sanitizeTelegramLoginPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const keys = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash'] as const
  const sanitized: Record<string, unknown> = {}
  for (const key of keys) {
    const value = payload[key]
    if (value === undefined || value === null || value === '') continue
    sanitized[key] = value
  }
  return sanitized
}

export async function verifyTelegramLoginPayload(payload: Record<string, unknown>): Promise<{
  user: TelegramUser
  token: string
}> {
  const sanitized = sanitizeTelegramLoginPayload(payload)
  const response = await fetch(apiUrl('/v1/auth/telegram/verify'), {
    method: 'POST',
    headers: apiHeaders(undefined, false),
    body: JSON.stringify(sanitized),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || 'Telegram verification failed')
  }

  const data = (await response.json()) as { token: string; user: TelegramUser }
  setOperatorToken(data.token)

  try {
    const { getFriskyDevSessionToken, linkTelegramToFriskyDev } = await import('@/lib/friskydev')
    if (getFriskyDevSessionToken()) {
      await linkTelegramToFriskyDev(sanitized)
    }
  } catch {
    // Verification already succeeded. Account linking is best-effort.
  }

  return data
}

export function initiateDiscordAuth(): void {
  if (!isDiscordConfigured()) {
    throw new Error('Discord OAuth is unavailable on this deployment')
  }

  const state = crypto.randomUUID()
  sessionStorage.setItem('discord_auth_state', state)

  const params = new URLSearchParams({
    client_id: discordClientId(),
    redirect_uri: discordRedirectUri(),
    response_type: 'code',
    scope: 'identify',
    state,
  })
  const authorizeUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`
  const width = 500
  const height = 700
  const left = (window.screen.width - width) / 2
  const top = (window.screen.height - height) / 2
  const authWindow = window.open(
    authorizeUrl,
    'DiscordAuth',
    `width=${width},height=${height},left=${left},top=${top}`
  )

  if (!authWindow) window.location.href = authorizeUrl
}

export async function handleDiscordCallback(code: string): Promise<{
  user: DiscordUser
  token: string
}> {
  const response = await fetch(apiUrl('/v1/auth/discord/exchange'), {
    method: 'POST',
    headers: apiHeaders(undefined, false),
    body: JSON.stringify({ code, redirectUri: discordRedirectUri() }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || 'Discord exchange failed')
  }

  const data = (await response.json()) as { token: string; user: DiscordUser }
  setOperatorToken(data.token)
  return data
}

export function getDiscordAvatarUrl(user: DiscordUser): string | undefined {
  if (!user.avatar) return undefined
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
}

export function getTelegramPhotoUrl(user: TelegramUser): string | undefined {
  return user.photo_url || undefined
}

export function formatTelegramUsername(user: TelegramUser): string {
  if (user.username) return `@${user.username}`
  return user.first_name + (user.last_name ? ` ${user.last_name}` : '')
}

export function formatDiscordUsername(user: DiscordUser): string {
  if (user.global_name) return user.global_name
  if (user.discriminator !== '0') return `${user.username}#${user.discriminator}`
  return user.username
}
