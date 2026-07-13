/**
 * ⚠️ MOCK AUTHENTICATION — NOT REAL AUTH.
  *
   * The Telegram and Discord auth flows below are DEMO STUBS. They do NOT
    * verify any identity: initiateTelegramAuth() returns a hardcoded fake user
     * after a timeout, and handleDiscordCallback() ignores the OAuth `code` and
      * returns a hardcoded fake Discord user without exchanging it for a token.
       *
        * The "connected" state is trivially spoofable and must NOT be used to gate
         * access to real infrastructure. Replace with a real server-side OAuth token
          * exchange before relying on this for authorization.
           */
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

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || 'demo_client_id'
const DISCORD_REDIRECT_URI = `${window.location.origin}/auth/discord/callback`

export function initiateTelegramAuth(): Promise<void> {
  return new Promise((resolve) => {
    const width = 600
    const height = 650
    const left = (window.screen.width - width) / 2
    const top = (window.screen.height - height) / 2
    
    const authWindow = window.open(
      '',
      'TelegramAuth',
      `width=${width},height=${height},left=${left},top=${top}`
    )
    
    if (authWindow) {
      authWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Telegram Authorization</title>
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
              .container {
                text-align: center;
                max-width: 400px;
              }
              h1 {
                font-size: 24px;
                margin-bottom: 16px;
                font-weight: 600;
              }
              p {
                font-size: 14px;
                line-height: 1.6;
                color: oklch(0.65 0.01 260);
                margin-bottom: 32px;
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
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="loader"></div>
              <h1>Telegram Authorization</h1>
              <p>Initiating secure platform access...</p>
            </div>
            <script>
              setTimeout(() => {
                window.opener.postMessage({
                  type: 'telegram-auth',
                  user: {
                    id: ${Date.now()},
                    first_name: 'Operator',
                    username: 'stix_operator',
                    photo_url: null
                  }
                }, window.location.origin);
                window.close();
              }, 2000);
            </script>
          </body>
        </html>
      `)
      authWindow.document.close()
    }
    
    resolve()
  })
}

export function initiateDiscordAuth(): void {
  const state = Math.random().toString(36).substring(2, 15)
  sessionStorage.setItem('discord_auth_state', state)
  
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds guilds.members.read',
    state: state
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

export async function handleDiscordCallback(code: string): Promise<DiscordUser> {
  await new Promise(resolve => setTimeout(resolve, 1500))
  
  return {
    id: Date.now().toString(),
    username: 'operator',
    discriminator: '0001',
    global_name: 'STIX Operator',
    avatar: undefined
  }
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
