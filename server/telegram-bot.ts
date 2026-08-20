import { timingSafeEqual } from 'node:crypto'
import { getServerEnv } from './env'

type TelegramMessage = {
  text?: string
  chat?: { id?: number }
}

export type TelegramUpdate = {
  message?: TelegramMessage
}

const WEBHOOK_HEADER = 'x-telegram-bot-api-secret-token'

function equalsSecret(received: string | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false
  const left = Buffer.from(received)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Validates Telegram's independently configured webhook secret before parsing an update. */
export function isTelegramWebhookAuthorized(received: string | undefined): boolean {
  return equalsSecret(received, getServerEnv().TELEGRAM_WEBHOOK_SECRET)
}

export function telegramWebhookStatus() {
  const env = getServerEnv()
  return {
    configured: env.telegramWebhookConfigured,
    username: env.TELEGRAM_BOT_USERNAME || null,
  }
}

function command(text: string | undefined): string | null {
  const first = text?.trim().split(/\s+/, 1)[0]
  if (!first?.startsWith('/')) return null
  return first.slice(1).split('@', 1)[0].toLowerCase()
}

function replyFor(update: TelegramUpdate): { chatId: number; text: string } | null {
  const chatId = update.message?.chat?.id
  if (!Number.isFinite(chatId)) return null

  switch (command(update.message?.text)) {
    case 'start':
    case 'vc':
    case 'studio':
      return {
        chatId: chatId!,
        text: 'Your VC NODE is ready. Sign in with Google, Apple, or Microsoft, then start a private room. Open Studio for OBS, Spotify, recording, and Telegram operator tools.',
      }
    case 'status':
      return {
        chatId: chatId!,
        text: 'VC NODE is online. Private WebRTC rooms and TURN relay are ready. Use /studio to launch the creator console.',
      }
    case 'help':
      return {
        chatId: chatId!,
        text: 'Commands: /vc opens the room, /studio opens creator tools, /status checks the node. Media stays encrypted peer-to-peer.',
      }
    default:
      return null
  }
}

async function sendReply(reply: { chatId: number; text: string }): Promise<void> {
  const env = getServerEnv()
  if (!env.TELEGRAM_BOT_TOKEN) return
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: reply.chatId,
      text: reply.text,
      reply_markup: {
        inline_keyboard: [[{ text: 'Open VC NODE', url: 'https://vc.friskydev.com/' }]],
      },
    }),
  })
  if (!response.ok) throw new Error(`Telegram reply failed with ${response.status}`)
}

/**
 * Handles only explicit commands. Returning 200 for an otherwise valid update prevents
 * Telegram retrying a harmless update indefinitely; a failed reply is logged without any
 * chat, user, token, or message content.
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<{ handled: boolean }> {
  const reply = replyFor(update)
  if (!reply) return { handled: false }
  try {
    await sendReply(reply)
  } catch (error) {
    console.warn(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'warn',
      scope: 'telegram-bot',
      message: 'could not deliver bot reply',
      data: { reason: error instanceof Error ? error.message : 'unknown' },
    }))
  }
  return { handled: true }
}

export { WEBHOOK_HEADER }
