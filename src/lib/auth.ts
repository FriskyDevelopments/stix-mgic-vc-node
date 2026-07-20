/**
 * Platform authentication helpers.
 *
 * Discord: real OAuth code exchange via control-plane `/v1/auth/discord/exchange`
 * when the server has DISCORD_CLIENT_* configured.
 * Telegram: Login Widget payload verified via `/v1/auth/telegram/verify` when
 * TELEGRAM_BOT_TOKEN is configured; otherwise a clearly-labeled demo popup.
 */
import { getAppEnv } from '@/lib/env'
import { setOperatorToken } from '@/lib/operator-token'

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
  telegram: {
    status: PlatformAuthStatus
    user: TelegramUser | null
    error: string | null
  }
  discord: {
    status: PlatformAuthStatus
    user: DiscordUser | null
    error: string | null
  }
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

function openMockAuthPopup(title: string, messageType: 'telegram-auth' | 'discord-auth', userJson: string): void {
  const width = 600
  const height = 650
  const left = (window.screen.width - width) / 2
  const top = (window.screen.height - height) / 2

  const authWindow = window.open(
    '',
    title.replace(/\s+/g, ''),
    `width=${width},height=${height},left=${left},top=${top}`
  )

  if (!authWindow) {
    throw new Error('Popup blocked — allow popups to complete demo authorization')
  }

  authWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body {
            margin: 0;
            padding: 40px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: oklch(0.15 0.01 260);
            color: oklch(0.95 0.01 260);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .container { text-align: center; max-width: 400px; }
          h1 { font-size: 24px; margin-bottom: 16px; font-weight: 600; }
          p { font-size: 14px; line-height: 1.6; color: oklch(0.65 0.01 260); margin-bottom: 32px; }
          .badge {
            display: inline-block;
            font-size: 11px;
            font-family: ui-monospace, monospace;
            letter-spacing: 0.04em;
            padding: 4px 8px;
            margin-bottom: 16px;
            border: 1px solid oklch(0.75 0.14 195);
            color: oklch(0.75 0.14 195);
            border-radius: 4px;
          }
          .loader {
            width: 48px;
            height: 48px;
            border: 3px solid oklch(0.25 0.02 260);
            border-top-color: oklch(0.75 0.14 195);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto 24px;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="loader"></div>
          <div class="badge">DEMO AUTH</div>
          <h1>${title}</h1>
          <p>Simulating platform access. Configure server secrets for real identity verification.</p>
        </div>
        <script>
          setTimeout(() => {
            window.opener.postMessage({
              type: '${messageType}',
              user: ${userJson},
              demo: true
            }, window.location.origin);
            window.close();
          }, 1200);
        </script>
      </body>
    </html>
  `)
  authWindow.document.close()
}

export function initiateTelegramAuth(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      openMockAuthPopup(
        'Telegram Authorization (Demo)',
        'telegram-auth',
        `{
          id: ${Date.now()},
          first_name: 'Operator',
          username: 'stix_operator',
          photo_url: null
        }`
      )
      resolve()
    } catch (error) {
      reject(error)
    }
  })
}

export async function verifyTelegramLoginPayload(payload: Record<string, unknown>): Promise<{
  user: TelegramUser
  token: string
}> {
  const response = await fetch(`${getAppEnv().apiBaseUrl}/v1/auth/telegram/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || 'Telegram verification failed')
  }

  const data = (await response.json()) as { token: string; user: TelegramUser }
  setOperatorToken(data.token)
  return data
}

export function initiateDiscordAuth(): void {
  if (!isDiscordConfigured()) {
    openMockAuthPopup(
      'Discord Authorization (Demo)',
      'discord-auth',
      `{
        id: '${Date.now()}',
        username: 'operator',
        discriminator: '0001',
        global_name: 'STIX Operator',
        avatar: undefined
      }`
    )
    return
  }

  const state = Math.random().toString(36).substring(2, 15)
  sessionStorage.setItem('discord_auth_state', state)

  const params = new URLSearchParams({
    client_id: discordClientId(),
    redirect_uri: discordRedirectUri(),
    response_type: 'code',
    scope: 'identify',
    state,
  })

  const width = 500
  const height = 700
  const left = (window.screen.width - width) / 2
  const top = (window.screen.height - height) / 2

  const authWindow = window.open(
    `https://discord.com/api/oauth2/authorize?${params.toString()}`,
    'DiscordAuth',
    `width=${width},height=${height},left=${left},top=${top}`
  )

  if (!authWindow) {
    window.location.href = `https://discord.com/api/oauth2/authorize?${params.toString()}`
  }
}

export async function handleDiscordCallback(code: string): Promise<{
  user: DiscordUser
  token: string
  demo?: boolean
}> {
  const response = await fetch(`${getAppEnv().apiBaseUrl}/v1/auth/discord/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      redirectUri: discordRedirectUri(),
    }),
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
