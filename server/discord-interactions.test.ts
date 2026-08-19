import { generateKeyPairSync, sign } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { resetServerEnvCache } from './env'

function applicationPublicKeyHex(): { publicKey: string; privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'] } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer
  return { publicKey: der.subarray(-32).toString('hex'), privateKey }
}

function signedHeaders(raw: string, privateKey: ReturnType<typeof generateKeyPairSync>['privateKey']) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  return {
    'Content-Type': 'application/json',
    'X-Signature-Timestamp': timestamp,
    'X-Signature-Ed25519': sign(null, Buffer.from(`${timestamp}${raw}`), privateKey).toString('hex'),
  }
}

describe('Discord Interactions endpoint', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    process.env.OPERATOR_TOKEN_SECRET = 'test-operator-token-secret'
    process.env.AUTH_REQUIRED = 'false'
    delete process.env.DISCORD_APPLICATION_PUBLIC_KEY
    resetServerEnvCache()
  })

  it('rejects unsigned traffic', async () => {
    const app = createApp()
    expect((await app.request('/v1/discord/interactions', { method: 'POST', body: '{}' })).status).toBe(503)
    const keys = applicationPublicKeyHex()
    process.env.DISCORD_APPLICATION_PUBLIC_KEY = keys.publicKey
    resetServerEnvCache()
    expect((await createApp().request('/v1/discord/interactions', { method: 'POST', body: '{}' })).status).toBe(401)
  })

  it('acknowledges a valid Discord PING and responds to /vc', async () => {
    const keys = applicationPublicKeyHex()
    process.env.DISCORD_APPLICATION_PUBLIC_KEY = keys.publicKey
    resetServerEnvCache()
    const app = createApp()
    const ping = JSON.stringify({ type: 1 })
    const pingResponse = await app.request('/v1/discord/interactions', { method: 'POST', headers: signedHeaders(ping, keys.privateKey), body: ping })
    expect(await pingResponse.json()).toEqual({ type: 1 })

    const command = JSON.stringify({ type: 2, data: { name: 'vc' } })
    const commandResponse = await app.request('/v1/discord/interactions', { method: 'POST', headers: signedHeaders(command, keys.privateKey), body: command })
    expect(await commandResponse.json()).toMatchObject({ type: 4, data: { content: expect.stringContaining('https://vc.friskydev.com') } })
  })
})
