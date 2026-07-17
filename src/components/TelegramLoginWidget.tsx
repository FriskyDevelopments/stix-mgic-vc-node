import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, unknown>) => void
  }
}

type TelegramLoginWidgetProps = {
  botUsername: string
  onAuth: (user: Record<string, unknown>) => void
  disabled?: boolean
}

/**
 * Official Telegram Login Widget.
 * Requires TELEGRAM_BOT_USERNAME (client) + TELEGRAM_BOT_TOKEN (server verify).
 */
export function TelegramLoginWidget({ botUsername, onAuth, disabled }: TelegramLoginWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!botUsername || disabled) return
    const container = containerRef.current
    if (!container) return

    window.onTelegramAuth = (user) => {
      onAuth(user)
    }

    container.innerHTML = ''
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', botUsername)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '8')
    script.setAttribute('data-request-access', 'write')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    container.appendChild(script)

    return () => {
      if (window.onTelegramAuth) delete window.onTelegramAuth
      container.innerHTML = ''
    }
  }, [botUsername, disabled, onAuth])

  if (!botUsername) {
    return (
      <p className="text-xs text-muted-foreground">
        Set <span className="font-mono">TELEGRAM_BOT_USERNAME</span> /{' '}
        <span className="font-mono">VITE_TELEGRAM_BOT_USERNAME</span> for real Telegram Login Widget.
      </p>
    )
  }

  return <div ref={containerRef} className={disabled ? 'opacity-40 pointer-events-none' : ''} />
}
