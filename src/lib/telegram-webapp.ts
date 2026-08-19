type TelegramWebApp = {
  initData?: string
  ready?: () => void
  expand?: () => void
  openTelegramLink?: (url: string) => void
}

declare global {
  interface Window { Telegram?: { WebApp?: TelegramWebApp } }
}

export function telegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp || null
}

export function initializeTelegramWebApp(): boolean {
  const app = telegramWebApp()
  if (!app) return false
  app.ready?.()
  app.expand?.()
  return true
}

export function telegramShareUrl(invite: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(invite)}&text=${encodeURIComponent(text)}`
}

export function shareToTelegram(invite: string, text: string): void {
  const url = telegramShareUrl(invite, text)
  const app = telegramWebApp()
  if (app?.openTelegramLink) app.openTelegramLink(url)
  else window.open(url, '_blank', 'noopener,noreferrer')
}
