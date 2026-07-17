import { getAppEnv } from '@/lib/env'
import { setOperatorToken } from '@/lib/operator-token'

const FRISKYDEV_SESSION_KEY = 'friskydev_session_token'

export type FriskyDevAccount = {
  id: string
  email: string
  displayName: string
  createdAt: number
}

export type LinkedPlatformIdentity = {
  platform: 'telegram' | 'discord'
  externalSubject: string
  displayName: string
  verifiedAt: number
  meta?: Record<string, unknown>
}

function apiUrl(path: string): string {
  return `${getAppEnv().apiBaseUrl}${path}`
}

export function getFriskyDevSessionToken(): string | null {
  try {
    return sessionStorage.getItem(FRISKYDEV_SESSION_KEY)
  } catch {
    return null
  }
}

export function setFriskyDevSessionToken(token: string): void {
  sessionStorage.setItem(FRISKYDEV_SESSION_KEY, token)
}

export function clearFriskyDevSessionToken(): void {
  sessionStorage.removeItem(FRISKYDEV_SESSION_KEY)
}

async function accountRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {})
  headers.set('Content-Type', 'application/json')
  const session = getFriskyDevSessionToken()
  if (session) headers.set('Authorization', `Bearer ${session}`)

  const response = await fetch(apiUrl(path), { ...init, headers })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${response.status})`)
  }
  return data as T
}

export async function registerFriskyDevAccount(input: {
  email: string
  password: string
  displayName: string
}): Promise<{ account: FriskyDevAccount; linked: LinkedPlatformIdentity[] }> {
  const data = await accountRequest<{
    sessionToken: string
    operatorToken: string
    account: FriskyDevAccount
    linked: LinkedPlatformIdentity[]
  }>('/v1/account/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  setFriskyDevSessionToken(data.sessionToken)
  setOperatorToken(data.operatorToken)
  return { account: data.account, linked: data.linked }
}

export async function loginFriskyDevAccount(input: {
  email: string
  password: string
}): Promise<{ account: FriskyDevAccount; linked: LinkedPlatformIdentity[] }> {
  const data = await accountRequest<{
    sessionToken: string
    operatorToken: string
    account: FriskyDevAccount
    linked: LinkedPlatformIdentity[]
  }>('/v1/account/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  setFriskyDevSessionToken(data.sessionToken)
  setOperatorToken(data.operatorToken)
  return { account: data.account, linked: data.linked }
}

export async function fetchFriskyDevMe(): Promise<{
  account: FriskyDevAccount
  linked: LinkedPlatformIdentity[]
} | null> {
  if (!getFriskyDevSessionToken()) return null
  try {
    return await accountRequest('/v1/account/me')
  } catch {
    clearFriskyDevSessionToken()
    return null
  }
}

export async function linkTelegramToFriskyDev(payload: Record<string, unknown>) {
  return accountRequest<{
    linked: boolean
    identity: LinkedPlatformIdentity
  }>('/v1/account/link/telegram', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function linkDiscordToFriskyDev(code: string, redirectUri: string) {
  return accountRequest<{
    linked: boolean
    identity: LinkedPlatformIdentity
    user: {
      id: string
      username: string
      discriminator: string
      global_name?: string
      avatar?: string
    }
  }>('/v1/account/link/discord', {
    method: 'POST',
    body: JSON.stringify({ code, redirectUri }),
  })
}

export async function unlinkPlatformFromFriskyDev(platform: 'telegram' | 'discord') {
  return accountRequest<{ unlinked: boolean }>(`/v1/account/link/${platform}`, {
    method: 'DELETE',
  })
}

export function logoutFriskyDevAccount(): void {
  clearFriskyDevSessionToken()
}
