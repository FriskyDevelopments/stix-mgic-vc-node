import { registerDiscordCommands } from '../server/discord-commands'

const count = await registerDiscordCommands()
console.log(`Registered ${count} VC Node Discord commands.`)
