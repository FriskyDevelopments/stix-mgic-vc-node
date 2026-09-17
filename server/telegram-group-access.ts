import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { listLinkedIdentities } from './account-store'
import { getServerEnv } from './env'
import { telegramVcAdapter } from './telegram-vc-adapter'

export class TelegramGroupAccessError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 503, readonly code: string, message: string) {
    super(message)
    this.name = 'TelegramGroupAccessError'
  }
}

type TelegramUser = { id?: number; is_bot?: boolean; username?: string; first_name?: string }
type TelegramChat = { id?: number; type?: string; title?: string }
type TelegramMember = {
  user?: TelegramUser
  status?: string
  can_manage_video_chats?: boolean
  can_post_messages?: boolean
}
export type TelegramAccessUpdate = {
  update_id?: number
  message?: { text?: string; from?: TelegramUser; chat?: TelegramChat }
  my_chat_member?: {
    chat?: TelegramChat
    date?: number
    new_chat_member?: TelegramMember
  }
}

type Link = { operatorId: string; telegramUserId: string; username: string | null; verifiedAt: number }
type KnownGroup = { id: string; title: string; kind: 'group' | 'channel'; admin: boolean; eventDate: number; updateId: number }
type Store = { links: Link[]; groups: KnownGroup[] }
type BotIdentity = { id: string; username: string }
type Challenge = { operatorId: string; expiresAt: number }
const challenges = new Map<string, Challenge>()
const LINK_TTL_MS = 5 * 60_000
const BOT_CACHE_MS = 60_000
let cachedBot: { token: string; expiresAt: number; bot: BotIdentity } | null = null

function unavailable(message = 'Telegram is temporarily unavailable. Try again shortly.'): TelegramGroupAccessError {
  return new TelegramGroupAccessError(503, 'telegram_unavailable', message)
}

function statePath(): string {
  return process.env.TELEGRAM_GROUP_ACCESS_PATH || join(process.env.MTPROTO_STATE_DIR || '/data/mtproto', 'telegram-access.json')
}

function isUserId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value))
}

function isChatId(value: unknown): value is string {
  return typeof value === 'string' && /^-[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value))
}

function readStore(): Store {
  try {
    if (!existsSync(statePath())) return { links: [], groups: [] }
    const stored = JSON.parse(readFileSync(statePath(), 'utf8')) as Partial<Store>
    if (!Array.isArray(stored.links) || !Array.isArray(stored.groups)) throw new Error('Invalid store')
    if (stored.links.some((item) => !item || typeof item.operatorId !== 'string' || !item.operatorId || item.operatorId.length > 512 || !isUserId(item.telegramUserId) || (item.username !== null && typeof item.username !== 'string') || !Number.isFinite(item.verifiedAt))) throw new Error('Invalid links')
    if (stored.groups.some((item) => !item || !isChatId(item.id) || typeof item.title !== 'string' || !['group', 'channel'].includes(item.kind) || typeof item.admin !== 'boolean' || !Number.isSafeInteger(item.eventDate) || !Number.isSafeInteger(item.updateId))) throw new Error('Invalid groups')
    return stored as Store
  } catch {
    throw unavailable('Telegram access settings could not be loaded.')
  }
}

function writeStore(store: Store): void {
  try {
    const path = statePath()
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    // No asynchronous work may occur between reading and writing this local store.
    // Atomic replacement keeps readers from observing a partially written identity map.
    const temporaryPath = `${path}.tmp`
    writeFileSync(temporaryPath, JSON.stringify(store), { mode: 0o600 })
    chmodSync(temporaryPath, 0o600)
    renameSync(temporaryPath, path)
    chmodSync(path, 0o600)
  } catch {
    throw unavailable('Telegram access settings could not be saved.')
  }
}

async function botApi<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = getServerEnv().TELEGRAM_BOT_TOKEN
  if (!token) throw unavailable('The Telegram bot is not configured.')
  let response: Response
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    // Network exceptions can contain the token-bearing URL. Never propagate them.
    throw unavailable()
  }
  let payload: { ok?: boolean; result?: T; error_code?: number }
  try { payload = await response.json() } catch { throw unavailable() }
  if (!response.ok || payload?.ok !== true || payload?.result === undefined) {
    if (method === 'getChatMember' || method === 'getChat') {
      if ([400, 403].includes(payload?.error_code || response.status)) {
        throw new TelegramGroupAccessError(403, 'telegram_group_access_denied', 'This Telegram group is unavailable or you do not have administrator access.')
      }
    }
    throw unavailable()
  }
  return payload.result
}

async function botIdentity(): Promise<BotIdentity> {
  const token = getServerEnv().TELEGRAM_BOT_TOKEN
  if (!token) throw unavailable('The Telegram bot is not configured.')
  if (cachedBot?.token === token && cachedBot.expiresAt > Date.now()) return cachedBot.bot
  const user = await botApi<TelegramUser>('getMe')
  const id = String(user?.id || '')
  if (!user || user.is_bot !== true || !isUserId(id) || !/^[A-Za-z0-9_]{5,32}$/.test(user.username || '')) throw unavailable()
  const bot = { id, username: user.username! }
  cachedBot = { token, bot, expiresAt: Date.now() + BOT_CACHE_MS }
  return bot
}

function linkedIdentity(operatorId: string): Link | null {
  if (!operatorId || operatorId.length > 512) return null
  const stored = readStore().links.find((link) => link.operatorId === operatorId)
  if (stored) return stored
  // The existing account store contains server-verified Login Widget identities.
  // The principal is opaque: never interpret a Supabase/OIDC subject as a Telegram ID.
  const existing = listLinkedIdentities(operatorId).find((link) => link.platform === 'telegram' && isUserId(link.externalSubject))
  return existing ? { operatorId, telegramUserId: existing.externalSubject, username: null, verifiedAt: existing.verifiedAt } : null
}

export function linkStatus(operatorId: string): { linked: boolean; telegramUserId: string | null; username: string | null } {
  const identity = linkedIdentity(operatorId)
  return { linked: Boolean(identity), telegramUserId: identity?.telegramUserId || null, username: identity?.username || null }
}

function requireLinkedIdentity(operatorId: string): Link {
  const linked = linkedIdentity(operatorId)
  if (!linked) throw new TelegramGroupAccessError(403, 'telegram_link_required', 'Connect your Telegram account to see the groups you manage.')
  return linked
}

export async function beginTelegramLink(operatorId: string): Promise<{ url: string; expiresAt: number; botUsername: string }> {
  if (!operatorId || operatorId.length > 512) throw new TelegramGroupAccessError(401, 'operator_required', 'Sign in to connect Telegram.')
  const bot = await botIdentity()
  const now = Date.now()
  for (const [key, challenge] of challenges) {
    if (challenge.expiresAt <= now || challenge.operatorId === operatorId) challenges.delete(key)
  }
  if (challenges.size >= 1_000) throw unavailable('Too many Telegram connection requests. Try again shortly.')
  const code = randomBytes(24).toString('base64url')
  const expiresAt = now + LINK_TTL_MS
  challenges.set(createHash('sha256').update(code).digest('hex'), { operatorId, expiresAt })
  return { url: `https://t.me/${bot.username}?start=vc_link_${code}`, expiresAt, botUsername: bot.username }
}

/** Only call for an update that passed Telegram's webhook-secret authentication. */
export function consumeTelegramLinkUpdate(update: TelegramAccessUpdate): { handled: boolean; linked: boolean } {
  const message = update?.message
  const match = typeof message?.text === 'string' ? message.text.trim().match(/^\/start(?:@[A-Za-z0-9_]+)?\s+vc_link_([A-Za-z0-9_-]{32})$/) : null
  if (!match) return { handled: false, linked: false }
  // A forwarded command in a group must not bind whoever happened to send it there.
  if (message?.chat?.type !== 'private' || message.from?.is_bot || !isUserId(String(message.from?.id || '')) || message.chat.id !== message.from?.id) {
    return { handled: true, linked: false }
  }
  const digest = createHash('sha256').update(match[1]).digest('hex')
  const challenge = challenges.get(digest)
  if (!challenge || challenge.expiresAt <= Date.now()) {
    challenges.delete(digest)
    return { handled: true, linked: false }
  }
  // Consume before writing: webhook retries can never rebind a used challenge.
  challenges.delete(digest)
  const telegramUserId = String(message.from!.id)
  const existing = linkedIdentity(challenge.operatorId)
  const store = readStore()
  if ((existing && existing.telegramUserId !== telegramUserId) || store.links.some((link) => link.telegramUserId === telegramUserId && link.operatorId !== challenge.operatorId)) {
    return { handled: true, linked: false }
  }
  store.links = store.links.filter((link) => link.operatorId !== challenge.operatorId)
  store.links.push({ operatorId: challenge.operatorId, telegramUserId, username: typeof message.from?.username === 'string' ? message.from.username.slice(0, 64) || null : null, verifiedAt: Date.now() })
  writeStore(store)
  return { handled: true, linked: true }
}

/** Store candidates only. Every read/action verifies live bot and caller membership. */
export async function recordTelegramGroupUpdate(update: TelegramAccessUpdate): Promise<boolean> {
  const event = update?.my_chat_member
  if (!event) return recordGroupCommand(update)
  const chat = event?.chat
  const member = event?.new_chat_member
  if (!event || !chat || !['group', 'supergroup', 'channel'].includes(chat.type || '') || !isChatId(String(chat.id || '')) || !member?.user) return false
  const bot = await botIdentity()
  if (String(member.user.id) !== bot.id || member.user.is_bot !== true || typeof member.status !== 'string') return false
  const eventDate = typeof event.date === 'number' && Number.isSafeInteger(event.date) ? event.date : 0
  const updateId = typeof update.update_id === 'number' && Number.isSafeInteger(update.update_id) ? update.update_id : 0
  const store = readStore()
  const id = String(chat.id)
  const existing = store.groups.find((group) => group.id === id)
  if (existing && (existing.eventDate > eventDate || (existing.eventDate === eventDate && existing.updateId >= updateId))) return true
  store.groups = store.groups.filter((group) => group.id !== id)
  store.groups.push({ id, title: (typeof chat.title === 'string' && chat.title || 'Telegram group').slice(0, 120), kind: chat.type === 'channel' ? 'channel' : 'group', admin: isAdmin(member), eventDate, updateId })
  writeStore(store)
  return true
}

async function recordGroupCommand(update: TelegramAccessUpdate): Promise<boolean> {
  const message = update?.message
  const chat = message?.chat
  const command = typeof message?.text === 'string' ? message.text.trim().match(/^\/(vc|studio)(?:@([A-Za-z0-9_]+))?(?:\s|$)/i) : null
  if (!command || !chat || !['group', 'supergroup'].includes(chat.type || '') || !isChatId(String(chat.id || ''))) return false
  const bot = await botIdentity()
  if (command[2] && command[2].toLowerCase() !== bot.username.toLowerCase()) return false
  let member: TelegramMember
  try { member = await botApi<TelegramMember>('getChatMember', { chat_id: String(chat.id), user_id: bot.id }) } catch (error) {
    if (error instanceof TelegramGroupAccessError && error.status === 403) return false
    throw error
  }
  if (!isAdmin(member) || String(member.user?.id) !== bot.id) return false
  const store = readStore()
  const id = String(chat.id)
  const existing = store.groups.find((group) => group.id === id)
  store.groups = store.groups.filter((group) => group.id !== id)
  // A live command refresh is a current membership observation, not a membership
  // event. Preserve that event's ordering cursor so delayed older updates cannot
  // roll it backwards, and the next real membership change can supersede it.
  store.groups.push({ id, title: (typeof chat.title === 'string' && chat.title || existing?.title || 'Telegram group').slice(0, 120), kind: 'group', admin: true, eventDate: existing?.eventDate || 0, updateId: existing?.updateId || 0 })
  writeStore(store)
  return true
}

function isAdmin(member: TelegramMember): boolean {
  return member?.status === 'administrator' || member?.status === 'creator'
}

export type TelegramGroupAccess = {
  telegramUserId: string
  botUsername: string
  botCanSendMessages: boolean
  botCanManageCalls: boolean
  userCanManageCalls: boolean
}

export async function assertTelegramGroupAccess(operatorId: string, chatId: string): Promise<TelegramGroupAccess> {
  const identity = requireLinkedIdentity(operatorId)
  if (!isChatId(chatId)) throw new TelegramGroupAccessError(400, 'invalid_telegram_group', 'Select a Telegram group.')
  const bot = await botIdentity()
  // Check the bot first: its administrator status is required for reliable lookup of
  // another user's membership. Never use registry contents as authorization.
  const botMember = await botApi<TelegramMember>('getChatMember', { chat_id: chatId, user_id: bot.id })
  if (!isAdmin(botMember) || String(botMember.user?.id) !== bot.id) throw new TelegramGroupAccessError(403, 'telegram_bot_admin_required', 'Add the bot as an administrator in this group.')
  const userMember = await botApi<TelegramMember>('getChatMember', { chat_id: chatId, user_id: identity.telegramUserId })
  if (!isAdmin(userMember) || String(userMember.user?.id) !== identity.telegramUserId) throw new TelegramGroupAccessError(403, 'telegram_group_admin_required', 'Only a Telegram group administrator can manage this group.')
  const chat = await botApi<TelegramChat>('getChat', { chat_id: chatId })
  if (String(chat?.id) !== chatId || !['group', 'supergroup', 'channel'].includes(chat?.type || '')) throw new TelegramGroupAccessError(403, 'telegram_group_access_denied', 'Select a Telegram group you manage.')
  return {
    telegramUserId: identity.telegramUserId,
    botUsername: bot.username,
    botCanSendMessages: chat.type !== 'channel' || botMember.status === 'creator' || botMember.can_post_messages === true,
    botCanManageCalls: botMember.status === 'creator' || botMember.can_manage_video_chats === true,
    userCanManageCalls: userMember.status === 'creator' || userMember.can_manage_video_chats === true,
  }
}

export type AccessibleTelegramGroup = {
  id: string
  title: string
  kind: 'group' | 'channel'
  botCanSendMessages: boolean
  botCanManageCalls: boolean
  userCanManageCalls: boolean
}

export async function listTelegramGroups(operatorId: string): Promise<{ groups: AccessibleTelegramGroup[]; botUsername: string; discoveryPartial: boolean }> {
  requireLinkedIdentity(operatorId)
  const bot = await botIdentity()
  const candidates = new Map(readStore().groups.filter((group) => group.admin).map((group) => [group.id, { id: group.id, title: group.title, kind: group.kind }]))
  let discoveryPartial = false
  try {
    const result = await telegramVcAdapter.groups()
    for (const group of result.groups) if (isChatId(group.id)) candidates.set(group.id, { id: group.id, title: group.title.slice(0, 120), kind: group.kind })
    // The existing native discovery is capped at 75 dialogs; make that limit explicit.
    if (result.groups.length >= 75) discoveryPartial = true
  } catch { discoveryPartial = true }
  const groups: AccessibleTelegramGroup[] = []
  const queue = [...candidates.values()]
  // Bound API fanout while allowing independent membership checks. No titles or IDs
  // leave this function unless that particular caller passes live membership checks.
  if (queue.length > 200) discoveryPartial = true
  const batch = queue.slice(0, 200)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(4, batch.length) }, async () => {
    while (next < batch.length) {
      const group = batch[next++]
      try {
        const access = await assertTelegramGroupAccess(operatorId, group.id)
        groups.push({ ...group, botCanSendMessages: access.botCanSendMessages, botCanManageCalls: access.botCanManageCalls, userCanManageCalls: access.userCanManageCalls })
      } catch (error) {
        if (!(error instanceof TelegramGroupAccessError) || error.status === 503) discoveryPartial = true
      }
    }
  }))
  groups.sort((left, right) => left.title.localeCompare(right.title))
  return { groups, botUsername: bot.username, discoveryPartial }
}

/** Pairing controls belong to the human owning the existing dedicated user session. */
export function assertTelegramNodeOwner(operatorId: string): void {
  const linked = requireLinkedIdentity(operatorId)
  let ownerId: unknown
  try {
    const path = join(process.env.MTPROTO_STATE_DIR || '/data/mtproto', 'verified.json')
    ownerId = JSON.parse(readFileSync(path, 'utf8')).id
  } catch {
    throw new TelegramGroupAccessError(403, 'telegram_node_owner_unbound', 'The Telegram connection needs a node owner before pairing can be changed.')
  }
  if (!isUserId(String(ownerId || '')) || String(ownerId) !== linked.telegramUserId) throw new TelegramGroupAccessError(403, 'telegram_node_owner_required', 'Only the owner of this Telegram connection can change its pairing.')
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

/** Called only after policy ownership/group permissions have been checked. */
export async function sendCameraWarning(chatId: string, participantId: string, name: string, graceSeconds: number): Promise<void> {
  if (!isChatId(chatId) || !isUserId(participantId) || !Number.isInteger(graceSeconds) || graceSeconds < 0 || graceSeconds > 3_600) throw new TelegramGroupAccessError(400, 'invalid_camera_warning', 'The camera reminder could not be prepared.')
  const mention = `<a href="tg://user?id=${participantId}">${escapeHtml((name || 'Participant').slice(0, 80))}</a>`
  const text = graceSeconds === 0
    ? `${mention}, your camera is off, so your microphone will be muted now. Turn on your camera to speak.`
    : `${mention}, please turn on your camera within ${graceSeconds} seconds to keep speaking. Otherwise, your microphone will be muted.`
  const delivered = await botApi<{ message_id?: number; chat?: { id?: number } }>('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
  if (!Number.isSafeInteger(delivered?.message_id) || Number(delivered.message_id) <= 0 || String(delivered.chat?.id) !== chatId) throw unavailable('Telegram did not confirm delivery of the camera reminder.')
}
