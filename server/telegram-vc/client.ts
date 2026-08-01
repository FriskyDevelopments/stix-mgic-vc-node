/**
 * telegram-vc/client.ts — MTProto user session wrapper.
 *
 * A singleton that connects once and stays connected for the process lifetime.
 * The session string is a secret of the same level as the account password —
 * it arrives from 1Password / Frisky Secret Center via env, is never logged,
 * and if it leaks the account is compromised.
 *
 * This is a USER client, not a bot. Bots cannot join group calls.
 */
import { TelegramClient } from 'teleproto'
import { StringSession } from 'teleproto/sessions'
import { getTelegramVcEnv } from './env'

let client: TelegramClient | null = null
let connected = false

export type TgClientStatus = {
  connected: boolean
  userId: string | null
  username: string | null
}

/**
 * Get or create the singleton client. Does NOT connect — call `ensureConnected()`.
 * Returns null if the required env vars are not set.
 */
export function getTgClient(): TelegramClient | null {
  if (client) return client

  const env = getTelegramVcEnv()
  if (!env) return null

  const session = new StringSession(env.sessionString)
  client = new TelegramClient(session, env.apiId, env.apiHash, {
    connectionRetries: 3,
    // Reduce noise; errors are handled at the adapter layer.
    baseLogger: { log() {}, warn() {}, error() {}, debug() {}, info() {} } as any,
  })

  return client
}

/**
 * Connect the client if it isn't already. This is the first MTProto round trip.
 * Must be called before any API call. Safe to call multiple times.
 */
export async function ensureConnected(): Promise<TelegramClient> {
  const c = getTgClient()
  if (!c) throw new Error('Telegram VC env not configured')

  if (!connected) {
    await c.connect()
    connected = true
  }

  return c
}

/** Current status — safe to call without connecting first. */
export async function getClientStatus(): Promise<TgClientStatus> {
  if (!client || !connected) {
    return { connected: false, userId: null, username: null }
  }

  try {
    const me = await client.getMe()
    return {
      connected: true,
      userId: me?.id?.toString() ?? null,
      username: (me as any)?.username ?? null,
    }
  } catch {
    return { connected, userId: null, username: null }
  }
}

/** Graceful disconnect for shutdown. */
export async function disconnectTgClient(): Promise<void> {
  if (client && connected) {
    try {
      await client.disconnect()
    } catch {
      // Best effort on shutdown.
    }
    connected = false
  }
  client = null
}

export function isConnected(): boolean {
  return connected
}
