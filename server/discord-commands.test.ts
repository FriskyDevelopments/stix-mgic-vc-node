import { afterEach, describe, expect, it } from 'vitest'
import { DISCORD_COMMANDS, registerDiscordCommands } from './discord-commands'
import { resetServerEnvCache } from './env'

afterEach(() => {
  delete process.env.DISCORD_APPLICATION_ID
  delete process.env.DISCORD_BOT_TOKEN
  resetServerEnvCache()
})

describe('Discord command registration', () => {
  it('registers the complete VC Node command set with an explicit PUT', async () => {
    process.env.NODE_ENV = 'test'
    process.env.OPERATOR_TOKEN_SECRET = 'test-operator-token-secret'
    process.env.DISCORD_APPLICATION_ID = '123456789012345678'
    process.env.DISCORD_BOT_TOKEN = 'a-discord-bot-token-long-enough-for-a-test'
    resetServerEnvCache()
    let request: Request | undefined
    const count = await registerDiscordCommands(async (input, init) => {
      request = new Request(input, init)
      return new Response(JSON.stringify(DISCORD_COMMANDS), { status: 200 })
    })
    expect(count).toBe(3)
    expect(request?.method).toBe('PUT')
    expect(request?.url).toBe('https://discord.com/api/v10/applications/123456789012345678/commands')
    expect(await request?.json()).toEqual(DISCORD_COMMANDS)
  })
})
