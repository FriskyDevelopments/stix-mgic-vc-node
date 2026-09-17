import { Hono } from 'hono'
import { createCameraPolicyService } from './camera-policy'
import {
  assertTelegramGroupAccess,
  beginTelegramLink,
  linkStatus,
  listTelegramGroups,
  sendCameraWarning,
} from './telegram-group-access'
import { telegramVcAdapter } from './telegram-vc-adapter'

type Variables = { operatorId: string; operatorPlatform: string }

export async function requireCallManager(operatorId: string, chatId: string) {
  const access = await assertTelegramGroupAccess(operatorId, chatId)
  if (!access.userCanManageCalls || !access.botCanManageCalls || !access.botCanSendMessages) {
    throw Object.assign(new Error('You and the bot need permission to manage calls, and the bot must be able to send messages.'), { status: 403 })
  }
  return access
}

export const cameraPolicies = createCameraPolicyService({
  assertAccess: requireCallManager,
  snapshot: (chatId) => telegramVcAdapter.participants(chatId),
  warn: sendCameraWarning,
  mute: (chatId, participantId, callId, options) => telegramVcAdapter.mute(chatId, participantId, callId, options),
  now: () => Date.now(),
})

/** Mounted after the existing verified-session middleware. */
export function createTelegramControls() {
  const controls = new Hono<{ Variables: Variables }>()
  controls.onError((error, c) => {
    const status = (error as { status?: number }).status
    return c.json({ error: error instanceof Error ? error.message : 'Telegram is unavailable. Please try again.' },
      status === 400 || status === 401 || status === 403 || status === 409 ? status : 503)
  })
  controls.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    if (!c.get('operatorId') || c.get('operatorPlatform') === 'anonymous') return c.json({ error: 'Sign in to manage your Telegram groups.' }, 401)
    try { await next() } catch (error) {
      const status = (error as { status?: number }).status
      return c.json({ error: error instanceof Error ? error.message : 'Telegram is unavailable. Please try again.' },
        status === 400 || status === 401 || status === 403 || status === 409 ? status : 503)
    }
  })
  controls.get('/link', (c) => c.json(linkStatus(c.get('operatorId'))))
  controls.post('/link', async (c) => c.json(await beginTelegramLink(c.get('operatorId'))))
  controls.get('/groups', async (c) => c.json(await listTelegramGroups(c.get('operatorId'))))
  controls.get('/participants', async (c) => {
    const chatId = c.req.query('chatId') || ''
    await assertTelegramGroupAccess(c.get('operatorId'), chatId)
    return c.json(await telegramVcAdapter.participants(chatId))
  })
  controls.post('/mute', async (c) => {
    const body = await c.req.json<{ chatId?: string; participantId?: string; callId?: string }>().catch(() => null)
    if (!body || typeof body.chatId !== 'string' || typeof body.participantId !== 'string' || typeof body.callId !== 'string' || !body.chatId || !body.participantId || !body.callId) return c.json({ error: 'Choose a participant in the current call.' }, 400)
    await requireCallManager(c.get('operatorId'), body.chatId)
    await telegramVcAdapter.mute(body.chatId, body.participantId, body.callId)
    return c.json({ ok: true })
  })
  controls.get('/camera-policy', async (c) => {
    const chatId = c.req.query('chatId') || ''
    await assertTelegramGroupAccess(c.get('operatorId'), chatId)
    return c.json(cameraPolicies.getPolicy(c.get('operatorId'), chatId))
  })
  controls.put('/camera-policy', async (c) => {
    const body = await c.req.json<{ chatId: string; enabled: boolean; graceSeconds: 0 | 30 | 60; expectedCallId?: string }>().catch(() => null)
    if (!body || typeof body.chatId !== 'string' || typeof body.enabled !== 'boolean' || ![0, 30, 60].includes(body.graceSeconds)) return c.json({ error: 'Choose a group and a valid warning time.' }, 400)
    if (body.enabled && (typeof body.expectedCallId !== 'string' || !body.expectedCallId)) return c.json({ error: 'Refresh the current call before enabling the rule.' }, 400)
    return c.json(await cameraPolicies.setPolicy(c.get('operatorId'), body))
  })
  return controls
}
