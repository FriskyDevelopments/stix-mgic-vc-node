import { afterEach, describe, expect, it, vi } from 'vitest'
import { initializeTelegramWebApp, shareToTelegram, telegramShareUrl } from './telegram-webapp'

afterEach(() => {
  delete window.Telegram
  vi.restoreAllMocks()
})

describe('Telegram Mini App bridge', () => {
  it('marks the Mini App ready and expands it', () => {
    const ready = vi.fn(); const expand = vi.fn()
    window.Telegram = { WebApp: { ready, expand } }
    expect(initializeTelegramWebApp()).toBe(true)
    expect(ready).toHaveBeenCalledOnce(); expect(expand).toHaveBeenCalledOnce()
  })

  it('uses the native Telegram link opener when embedded', () => {
    const openTelegramLink = vi.fn()
    window.Telegram = { WebApp: { openTelegramLink } }
    shareToTelegram('https://vc.friskydev.com/?room=abc', 'Join me')
    expect(openTelegramLink).toHaveBeenCalledWith(telegramShareUrl('https://vc.friskydev.com/?room=abc', 'Join me'))
  })

  it('falls back to a browser share URL on the web', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    shareToTelegram('https://vc.friskydev.com/?room=abc', 'Join me')
    expect(open).toHaveBeenCalledWith(expect.stringContaining('https://t.me/share/url?'), '_blank', 'noopener,noreferrer')
  })
})
