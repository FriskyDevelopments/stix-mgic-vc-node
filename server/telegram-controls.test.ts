import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { createTelegramControls, cameraPolicies } from './telegram-controls'
import { assertTelegramGroupAccess, listTelegramGroups } from './telegram-group-access'
import { telegramVcAdapter } from './telegram-vc-adapter'

vi.mock('./telegram-group-access', () => ({ assertTelegramGroupAccess: vi.fn(), listTelegramGroups: vi.fn(), beginTelegramLink: vi.fn(), linkStatus: vi.fn(), sendCameraWarning: vi.fn() }))
vi.mock('./telegram-vc-adapter', () => ({ telegramVcAdapter: { participants: vi.fn(), mute: vi.fn() } }))
vi.mock('./camera-policy', () => ({ createCameraPolicyService: () => ({ setPolicy: vi.fn(), getPolicy: vi.fn(), tick: vi.fn(), stop: vi.fn() }) }))

function app(platform = 'supabase') {
  const app = new Hono<{ Variables: { operatorId: string; operatorPlatform: string } }>()
  app.use('*', async (c, next) => { c.set('operatorId', 'operator-one'); c.set('operatorPlatform', platform); await next() })
  app.route('/v1/telegram-vc', createTelegramControls())
  return app
}
const json = (body: unknown, method = 'POST') => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(assertTelegramGroupAccess).mockResolvedValue({ telegramUserId: '123', botUsername: 'test_bot', botCanSendMessages: true, botCanManageCalls: true, userCanManageCalls: true })
})
describe('Telegram group routes', () => {
  it('rejects anonymous principals without reading a group catalog', async () => {
    const res = await app('anonymous').request('/v1/telegram-vc/groups')
    expect(res.status).toBe(401)
    expect(listTelegramGroups).not.toHaveBeenCalled()
  })
  it('preserves explicit authorization failures as 403 and never fetches participants', async () => {
    vi.mocked(assertTelegramGroupAccess).mockRejectedValue(Object.assign(new Error('Connect your Telegram account.'), { status: 403 }))
    const res = await app().request('/v1/telegram-vc/participants?chatId=-1001')
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Connect your Telegram account.' })
    expect(telegramVcAdapter.participants).not.toHaveBeenCalled()
  })
  it('refuses mute when an administrator cannot manage calls', async () => {
    vi.mocked(assertTelegramGroupAccess).mockResolvedValue({ telegramUserId: '123', botUsername: 'test_bot', botCanSendMessages: true, botCanManageCalls: true, userCanManageCalls: false })
    const res = await app().request('/v1/telegram-vc/mute', json({ chatId: '-1001', participantId: '456', callId: 'call-1' }))
    expect(res.status).toBe(403)
    expect(telegramVcAdapter.mute).not.toHaveBeenCalled()
  })
  it('sends the verified group, participant and call ID to a manual mute', async () => {
    const res = await app().request('/v1/telegram-vc/mute', json({ chatId: '-1001', participantId: '456', callId: 'call-1' }))
    expect(res.status).toBe(200)
    expect(assertTelegramGroupAccess).toHaveBeenCalledExactlyOnceWith('operator-one', '-1001')
    expect(telegramVcAdapter.mute).toHaveBeenCalledExactlyOnceWith('-1001', '456', 'call-1')
  })
  it('requires the displayed call ID before enabling automatic moderation', async () => {
    const res = await app().request('/v1/telegram-vc/camera-policy', json({ chatId: '-1001', enabled: true, graceSeconds: 60 }, 'PUT'))
    expect(res.status).toBe(400)
    expect(cameraPolicies.setPolicy).not.toHaveBeenCalled()
  })
  it('rejects malformed and wrongly typed policy input without starting moderation', async () => {
    for (const body of [null, { chatId: {}, enabled: true, graceSeconds: 60 }, { chatId: '-1001', enabled: 'yes', graceSeconds: 60 }]) {
      expect((await app().request('/v1/telegram-vc/camera-policy', json(body, 'PUT'))).status).toBe(400)
    }
    expect(cameraPolicies.setPolicy).not.toHaveBeenCalled()
  })
})
