import { getServerEnv } from './env'

export const DISCORD_COMMANDS = [
  { name: 'vc', description: 'Open VC Node' },
  { name: 'studio', description: 'Open the VC Node broadcast studio' },
  { name: 'status', description: 'Show VC Node media-plane status' },
] as const

/**
 * Registers the complete global command set in one idempotent PUT. This is deliberately
 * a CLI action—not server startup behavior—so a new bot token never changes a Discord
 * application merely because a container was restarted.
 */
export async function registerDiscordCommands(fetchImpl: typeof fetch = fetch): Promise<number> {
  const env = getServerEnv()
  if (!env.DISCORD_APPLICATION_ID || !env.DISCORD_BOT_TOKEN) {
    throw new Error('DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN are required to register Discord commands')
  }
  const response = await fetchImpl(`https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/commands`, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(DISCORD_COMMANDS),
  })
  if (!response.ok) throw new Error(`Discord command registration failed: ${response.status}`)
  const commands = (await response.json()) as unknown[]
  return commands.length
}
