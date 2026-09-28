import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configureAccountStore, resetAccountStore } from './account-store'
import { resetServerEnvCache } from './env'
import { telegramVcAdapter } from './telegram-vc-adapter'
import {
  assertTelegramGroupAccess, assertTelegramNodeOwner, beginTelegramLink,
  consumeTelegramLinkUpdate, linkStatus, listTelegramGroups,
  recordTelegramGroupUpdate, sendCameraWarning,
} from './telegram-group-access'

let directory: string
let fetchMock: ReturnType<typeof vi.fn>
let botStatus: string
let callerStatus: string
let chatType: string
let botManageCalls: boolean
let callerManageCalls: boolean

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vc-telegram-access-'))
  vi.stubEnv('MTPROTO_STATE_DIR', directory)
  vi.stubEnv('TELEGRAM_GROUP_ACCESS_PATH', join(directory, 'access.json'))
  vi.stubEnv('TELEGRAM_BOT_TOKEN', `test-token-${directory}`)
  resetServerEnvCache()
  configureAccountStore({ persist: false })
  resetAccountStore()
  botStatus = 'administrator'
  callerStatus = 'administrator'
  chatType = 'supergroup'
  botManageCalls = true
  callerManageCalls = true
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const method = String(url).split('/').at(-1)
    const body = JSON.parse(String(init.body))
    let result: unknown = {}
    if (method === 'getMe') result = { id: 777, is_bot: true, username: 'friskyops_bot' }
    if (method === 'getChat') result = { id: Number(body.chat_id), type: chatType, title: 'Managed group' }
    if (method === 'sendMessage') result = { message_id: 1, chat: { id: Number(body.chat_id) } }
    if (method === 'getChatMember') {
      const bot = String(body.user_id) === '777'
      result = { user: { id: Number(body.user_id), is_bot: bot }, status: bot ? botStatus : callerStatus, can_manage_video_chats: bot ? botManageCalls : callerManageCalls, can_post_messages: false }
    }
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(telegramVcAdapter, 'groups').mockResolvedValue({ groups: [] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetServerEnvCache()
  rmSync(directory, { recursive: true, force: true })
})

async function challenge(operatorId = 'supabase-principal') {
  const started = await beginTelegramLink(operatorId)
  const payload = new URL(started.url).searchParams.get('start')!
  return { ...started, payload }
}

function accept(payload: string, telegramUserId = 42) {
  return consumeTelegramLinkUpdate({ message: { text: `/start ${payload}`, chat: { id: telegramUserId, type: 'private' }, from: { id: telegramUserId, is_bot: false, username: 'operator' } } })
}

async function linked(operatorId = 'supabase-principal', userId = 42) {
  const started = await challenge(operatorId)
  expect(accept(started.payload, userId).linked).toBe(true)
}

function memberEvent(id = -10011, status = 'administrator', date = 1, updateId = 1) {
  return { update_id: updateId, my_chat_member: { chat: { id, type: 'supergroup', title: `Group ${id}` }, date, new_chat_member: { status, user: { id: 777, is_bot: true } } } }
}

describe('Telegram account connection', () => {
  it('requires private matching sender/chat and consumes its challenge exactly once', async () => {
    const started = await challenge()
    expect(started.url).toMatch(/^https:\/\/t.me\/friskyops_bot\?start=vc_link_[A-Za-z0-9_-]{32}$/)
    expect(consumeTelegramLinkUpdate({ message: { text: `/start ${started.payload}`, chat: { id: -10011, type: 'supergroup' }, from: { id: 42 } } })).toEqual({ handled: true, linked: false })
    expect(consumeTelegramLinkUpdate({ message: { text: `/start ${started.payload}`, chat: { id: 43, type: 'private' }, from: { id: 42 } } }).linked).toBe(false)
    expect(accept(started.payload).linked).toBe(true)
    expect(accept(started.payload, 43).linked).toBe(false)
    expect(linkStatus('supabase-principal')).toEqual({ linked: true, telegramUserId: '42', username: 'operator' })
    expect(linkStatus('another-principal').linked).toBe(false)
  })

  it('expires challenges and invalidates an earlier challenge for the same operator', async () => {
    vi.useFakeTimers()
    const old = await challenge()
    const replacement = await challenge()
    expect(accept(old.payload).linked).toBe(false)
    vi.setSystemTime(replacement.expiresAt + 1)
    expect(accept(replacement.payload).linked).toBe(false)
    expect(linkStatus('supabase-principal').linked).toBe(false)
  })

  it('never derives Telegram identity from an unlinked numeric or prefixed principal', async () => {
    for (const principal of ['42', 'telegram:42', 'supabase:42', 'friskydev:42']) {
      expect(linkStatus(principal).linked).toBe(false)
      await expect(assertTelegramGroupAccess(principal, '-10011')).rejects.toMatchObject({ code: 'telegram_link_required' })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps connection identities private on disk and never persists challenge codes', async () => {
    const started = await challenge()
    expect(accept(started.payload).linked).toBe(true)
    const path = join(directory, 'access.json')
    expect(statSync(path).mode & 0o777).toBe(0o600)
    const saved = readFileSync(path, 'utf8')
    expect(saved).toContain('supabase-principal')
    expect(saved).not.toContain(started.payload)
    expect(saved).not.toContain(started.url)
  })

  it('does not reassign another operator connection or replace an existing Telegram identity', async () => {
    await linked()
    const other = await challenge('another-principal')
    expect(accept(other.payload).linked).toBe(false)
    const replacement = await challenge()
    expect(accept(replacement.payload, 43).linked).toBe(false)
    expect(linkStatus('supabase-principal').telegramUserId).toBe('42')
    expect(linkStatus('another-principal').linked).toBe(false)
  })

  it('fails closed when persisted identity settings are corrupt', () => {
    writeFileSync(join(directory, 'access.json'), '{corrupt')
    expect(() => linkStatus('supabase-principal')).toThrow('Telegram access settings could not be loaded.')
  })
})

describe('Telegram group authorization', () => {
  it('checks current bot and caller admin membership for every operation', async () => {
    await linked()
    expect(await assertTelegramGroupAccess('supabase-principal', '-10011')).toEqual({ telegramUserId: '42', botUsername: 'friskyops_bot', botCanSendMessages: true, botCanManageCalls: true, userCanManageCalls: true })
    callerStatus = 'member'
    await expect(assertTelegramGroupAccess('supabase-principal', '-10011')).rejects.toMatchObject({ status: 403, code: 'telegram_group_admin_required' })
    callerStatus = 'administrator'
    botStatus = 'member'
    await expect(assertTelegramGroupAccess('supabase-principal', '-10011')).rejects.toMatchObject({ status: 403, code: 'telegram_bot_admin_required' })
  })

  it('reports narrower call and channel-message rights instead of assuming admin means every right', async () => {
    await linked()
    botManageCalls = false
    callerManageCalls = false
    chatType = 'channel'
    expect(await assertTelegramGroupAccess('supabase-principal', '-10011')).toMatchObject({ botCanSendMessages: false, botCanManageCalls: false, userCanManageCalls: false })
    callerStatus = 'creator'
    expect(await assertTelegramGroupAccess('supabase-principal', '-10011')).toMatchObject({ userCanManageCalls: true })
  })

  it('rejects private chats, malformed IDs, and mismatched membership responses', async () => {
    await linked()
    await expect(assertTelegramGroupAccess('supabase-principal', '42')).rejects.toMatchObject({ code: 'invalid_telegram_group' })
    chatType = 'private'
    await expect(assertTelegramGroupAccess('supabase-principal', '-10011')).rejects.toMatchObject({ code: 'telegram_group_access_denied' })
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { status: 'administrator', user: { id: 43 } } }), { status: 200 }))
    await expect(assertTelegramGroupAccess('supabase-principal', '-10011')).rejects.toMatchObject({ code: 'telegram_bot_admin_required' })
  })

  it('filters candidate groups independently and never exposes another group title', async () => {
    await linked()
    vi.mocked(telegramVcAdapter.groups).mockResolvedValue({ groups: [{ id: '-10011', title: 'My group', kind: 'group' }, { id: '-10012', title: 'Secret group', kind: 'group' }] })
    const normal = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      if (String(url).endsWith('/getChatMember') && body.chat_id === '-10012' && body.user_id === '42') return new Response(JSON.stringify({ ok: true, result: { status: 'member', user: { id: 42 } } }), { status: 200 })
      return normal(url, init)
    })
    const result = await listTelegramGroups('supabase-principal')
    expect(result.groups.map((group) => group.title)).toEqual(['My group'])
    expect(JSON.stringify(result)).not.toContain('Secret group')
    expect(result.discoveryPartial).toBe(false)
  })

  it('uses authenticated membership registry without pairing and rejects stale promotions', async () => {
    await linked()
    vi.mocked(telegramVcAdapter.groups).mockRejectedValue(new Error('not paired'))
    await recordTelegramGroupUpdate(memberEvent())
    expect((await listTelegramGroups('supabase-principal')).groups.map((group) => group.id)).toEqual(['-10011'])
    await recordTelegramGroupUpdate(memberEvent(-10011, 'member', 2, 2))
    await recordTelegramGroupUpdate(memberEvent(-10011, 'administrator', 1, 1))
    expect(await listTelegramGroups('supabase-principal')).toMatchObject({ groups: [], discoveryPartial: true })
  })

  it('does not accept events concerning a different bot', async () => {
    const event = memberEvent()
    event.my_chat_member.new_chat_member.user.id = 999
    expect(await recordTelegramGroupUpdate(event)).toBe(false)
  })

  it('discovers a missing group through /vc after checking the bot is currently an admin', async () => {
    await linked()
    expect(await recordTelegramGroupUpdate({ message: { text: '/vc@friskyops_bot do not retain this text', chat: { id: -10013, type: 'supergroup', title: 'Discovered group' }, from: { id: 42 } } })).toBe(true)
    expect((await listTelegramGroups('supabase-principal')).groups.map((group) => group.title)).toEqual(['Discovered group'])
    expect(readFileSync(join(directory, 'access.json'), 'utf8')).not.toContain('do not retain')
    await recordTelegramGroupUpdate(memberEvent(-10013, 'member', 2, 2))
    expect((await listTelegramGroups('supabase-principal')).groups).toEqual([])
  })

  it('does not register nonadmin bot groups, private commands, or commands for another bot', async () => {
    await linked()
    botStatus = 'member'
    expect(await recordTelegramGroupUpdate({ message: { text: '/studio', chat: { id: -10013, type: 'supergroup', title: 'Unavailable' } } })).toBe(false)
    expect(await recordTelegramGroupUpdate({ message: { text: '/vc', chat: { id: 42, type: 'private' } } })).toBe(false)
    botStatus = 'administrator'
    expect(await recordTelegramGroupUpdate({ message: { text: '/vc@another_bot', chat: { id: -10013, type: 'group' } } })).toBe(false)
    expect((await listTelegramGroups('supabase-principal')).groups).toEqual([])
  })

  it('preserves membership ordering when a /studio command refreshes a group', async () => {
    await linked()
    await recordTelegramGroupUpdate(memberEvent(-10013, 'administrator', 4, 4))
    await recordTelegramGroupUpdate({ message: { text: '/studio', chat: { id: -10013, type: 'group', title: 'Current title' } } })
    await recordTelegramGroupUpdate(memberEvent(-10013, 'member', 3, 3))
    expect((await listTelegramGroups('supabase-principal')).groups.map((group) => group.title)).toEqual(['Current title'])
    await recordTelegramGroupUpdate(memberEvent(-10013, 'member', 5, 5))
    expect((await listTelegramGroups('supabase-principal')).groups).toEqual([])
  })

  it('allows pairing changes only for the already paired Telegram owner', async () => {
    await linked()
    expect(() => assertTelegramNodeOwner('supabase-principal')).toThrow('The Telegram connection needs a node owner')
    writeFileSync(join(directory, 'verified.json'), JSON.stringify({ id: '43', username: 'other' }))
    expect(() => assertTelegramNodeOwner('supabase-principal')).toThrow('Only the owner')
    writeFileSync(join(directory, 'verified.json'), JSON.stringify({ id: '42', username: 'operator' }))
    expect(() => assertTelegramNodeOwner('supabase-principal')).not.toThrow()
  })

  it('does not expose provider errors or token-bearing request URLs', async () => {
    fetchMock.mockRejectedValue(new Error(`Network failed at https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`))
    const failure = await beginTelegramLink('operator').catch((error) => error)
    expect(failure.message).toBe('Telegram is temporarily unavailable. Try again shortly.')
    expect(String(failure)).not.toContain(process.env.TELEGRAM_BOT_TOKEN)
  })
})

describe('Camera warning delivery', () => {
  it('escapes participant names, targets the chosen group, and uses the configured grace', async () => {
    await sendCameraWarning('-10011', '42', '<a href="evil">A & B</a>', 60)
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.chat_id).toBe('-10011')
    expect(body.parse_mode).toBe('HTML')
    expect(body.text).toContain('<a href="tg://user?id=42">&lt;a href=&quot;evil&quot;&gt;A &amp; B&lt;/a&gt;</a>')
    expect(body.text).toContain('within 60 seconds')
  })

  it('fails delivery on Telegram API rejection and cannot be mistaken for a delivered warning', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, description: 'private details', error_code: 403 }), { status: 403 }))
    await expect(sendCameraWarning('-10011', '42', 'Operator', 30)).rejects.toMatchObject({ status: 503, code: 'telegram_unavailable' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('requires a confirmed message in the intended group before the mute timer can start', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 5, chat: { id: -10012 } } }), { status: 200 }))
    await expect(sendCameraWarning('-10011', '42', 'Operator', 30)).rejects.toThrow('Telegram did not confirm delivery')
  })

  it('rejects arbitrary target IDs or invalid grace before sending', async () => {
    for (const [chatId, userId, grace] of [['42', '42', 60], ['-10011', '42?x', 60], ['-10011', '42', -1]] as const) {
      await expect(sendCameraWarning(chatId, userId, 'Operator', grace)).rejects.toMatchObject({ code: 'invalid_camera_warning' })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
