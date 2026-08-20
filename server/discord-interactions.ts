import { createPublicKey, verify } from 'node:crypto'
import type { Context } from 'hono'
import { getServerEnv } from './env'

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const MAX_SIGNATURE_AGE_SECONDS = 5 * 60

type DiscordInteraction = { type?: number; data?: { name?: string } }

function responseForCommand(name: string): string {
  switch (name.toLowerCase()) {
    case 'vc': return 'Open VC Node: https://vc.friskydev.com'
    case 'studio': return 'Open the VC Node Studio: https://vc.friskydev.com — sign in, then press **Studio**.'
    case 'status': return 'VC Node is online. WebRTC, Telegram VC, and authenticated RTMP ingest are ready.'
    default: return 'VC Node commands: `/vc`, `/studio`, `/status`.'
  }
}

function isFreshTimestamp(value: string): boolean {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && Math.abs(Math.floor(Date.now() / 1000) - timestamp) <= MAX_SIGNATURE_AGE_SECONDS
}

function validSignature(raw: string, timestamp: string, signature: string, publicKeyHex: string): boolean {
  try {
    if (!/^[a-fA-F0-9]{128}$/.test(signature) || !isFreshTimestamp(timestamp)) return false
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    })
    return verify(null, Buffer.from(`${timestamp}${raw}`), key, Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}

/** Discord HTTP Interactions endpoint. It must use the unparsed request payload. */
export async function discordInteractions(c: Context): Promise<Response> {
  const env = getServerEnv()
  if (!env.DISCORD_APPLICATION_PUBLIC_KEY) return c.json({ error: 'Discord Interactions are not configured' }, 503)

  const signature = c.req.header('x-signature-ed25519') || ''
  const timestamp = c.req.header('x-signature-timestamp') || ''
  const raw = await c.req.text()
  if (!validSignature(raw, timestamp, signature, env.DISCORD_APPLICATION_PUBLIC_KEY)) {
    return c.json({ error: 'Invalid Discord interaction signature' }, 401)
  }

  let interaction: DiscordInteraction
  try { interaction = JSON.parse(raw) as DiscordInteraction } catch { return c.json({ error: 'Invalid interaction body' }, 400) }
  if (interaction.type === 1) return c.json({ type: 1 }) // PONG
  if (interaction.type === 2) return c.json({ type: 4, data: { content: responseForCommand(interaction.data?.name || '') } })
  return c.json({ type: 4, data: { content: 'VC Node received that interaction.' } })
}
