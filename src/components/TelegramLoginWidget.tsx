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

  // The parent passes a fresh arrow function on every render. Keeping `onAuth` in the
  // effect's dependency list therefore tore down and re-injected telegram-widget.js on
  // every re-render of the control plane, so the button never settled. Hold it in a ref
  // and depend only on values that should actually cause a remount.
  const onAuthRef = useRef(onAuth)
  useEffect(() => {
    onAuthRef.current = onAuth
  }, [onAuth])

  useEffect(() => {
    if (!botUsername || disabled) return
    const container = containerRef.current
    if (!container) return

    window.onTelegramAuth = (user) => {
      onAuthRef.current(user)
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
  }, [botUsername, disabled])

  if (!botUsername) {
    return (
      <p className="text-xs text-muted-foreground">
        Set <span className="font-mono">TELEGRAM_BOT_USERNAME</span> /{' '}
        <span className="font-mono">VITE_TELEGRAM_BOT_USERNAME</span> for real Telegram Login Widget.
      </p>
    )
  }

  // While disabled the effect above never injects telegram-widget.js, so the container is
  // empty — an `opacity-40` wrapper around nothing reads as "there is no Telegram login".
  // Render the control and its prerequisite explicitly instead of rendering emptiness.
  if (disabled) {
    return (
      <div className="rounded-lg border border-dashed border-border p-3 text-center space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Telegram Login Widget</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Sign in to FriskyDev above to link <span className="font-mono">@{botUsername}</span>.
          Telegram is asked once, when linking — not on every sign-in.
        </p>
      </div>
    )
  }

  return <div ref={containerRef} />
}
