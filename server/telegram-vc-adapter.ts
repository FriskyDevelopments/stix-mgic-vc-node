import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getServerEnv } from './env'

type Result = { paired: boolean; active: boolean; chatId: number | null; source: string | null }
export type TelegramVcGroup = { id: string; title: string; kind: 'group' | 'channel' }
type Reply<T = unknown> = { ok: boolean; result?: T; error?: string }

let child: ChildProcessWithoutNullStreams | null = null
let pending: ((reply: Reply) => void) | null = null
let stdoutBuffer = ''

function sessionPath() { return `${process.env.MTPROTO_STATE_DIR || '/data/mtproto'}/operator.session` }

function handleStdoutLine(raw: string) {
  let parsed: Reply
  try { parsed = JSON.parse(raw) as Reply } catch {
    console.warn('[telegram-vc-adapter] dropping non-JSON stdout line:', raw.slice(0, 200))
    return
  }
  if (pending) {
    const resolvePending = pending
    pending = null
    resolvePending(parsed)
    return
  }
  // No request waiting — log and drop so a stray reply can never poison the next one.
  console.warn('[telegram-vc-adapter] dropping unmatched stdout reply:', JSON.stringify(parsed).slice(0, 200))
}

function drainStdout(chunk: string) {
  stdoutBuffer += chunk
  let lineEnd = stdoutBuffer.indexOf('\n')
  while (lineEnd >= 0) {
    const line = stdoutBuffer.slice(0, lineEnd)
    stdoutBuffer = stdoutBuffer.slice(lineEnd + 1)
    if (line.length > 0) handleStdoutLine(line)
    lineEnd = stdoutBuffer.indexOf('\n')
  }
}

function launch(): ChildProcessWithoutNullStreams {
  if (child && !child.killed) return child
  const env = getServerEnv()
  if (!env.mtprotoConfigured) throw new Error('Telegram MTProto credentials are not configured')
  if (!existsSync(sessionPath())) throw new Error('Telegram operator has not been paired')
  const next = spawn(process.env.MTPROTO_PYTHON || 'python3', [resolve(process.cwd(), 'scripts/telegram_vc_adapter.py')], {
    env: { ...process.env, STIX_TELEGRAM_API_ID: String(env.STIX_TELEGRAM_API_ID), STIX_TELEGRAM_API_HASH: env.STIX_TELEGRAM_API_HASH, STIX_MTPROTO_SESSION_PATH: sessionPath() },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  stdoutBuffer = ''
  next.stdout.on('data', (chunk) => drainStdout(String(chunk)))
  next.stderr.on('data', (chunk) => {
    const text = String(chunk).trim()
    if (text) console.warn('[telegram-vc-adapter:stderr]', text)
  })
  next.on('exit', () => {
    child = null
    stdoutBuffer = ''
    if (pending) { pending({ ok: false, error: 'Telegram adapter stopped unexpectedly' }); pending = null }
  })
  child = next
  return next
}

export type TelegramVcAdminParticipant = {
  id: string
  name: string
  muted: boolean
  volume?: number
  speaking?: boolean
  pinned?: boolean
}

export type TelegramVcAdminResult = {
  participants: TelegramVcAdminParticipant[]
  count: number
  /** Set when the action is accepted locally but MTProto mapping is still pending. */
  pendingMtproto?: string
  active?: boolean
  chatId?: number | null
  source?: string | null
  title?: string | null
}

async function request<T = Result>(payload: Record<string, unknown>): Promise<T> {
  const process = launch()
  if (pending) throw new Error('Telegram adapter is busy')
  const reply = await new Promise<Reply>((resolveReply, reject) => {
    const timer = setTimeout(() => { pending = null; reject(new Error('Telegram adapter timed out')) }, 20_000)
    pending = (value) => { clearTimeout(timer); resolveReply(value) }
    process.stdin.write(`${JSON.stringify(payload)}\n`)
  })
  if (!reply.ok || !reply.result) throw new Error(reply.error || 'Telegram adapter request failed')
  return reply.result as T
}

export const telegramVcAdapter = {
  status: () => request({ action: 'status' }),
  join: (chatId: string, source: string) => request({ action: 'join', chatId, source }),
  leave: () => request({ action: 'leave' }),
  source: (source: string) => request({ action: 'source', source }),
  groups: () => request<{ groups: TelegramVcGroup[] }>({ action: 'groups' }),
  participants: () =>
    request<TelegramVcAdminResult>({ action: 'participants' }),
  mute: (target: string) =>
    request<TelegramVcAdminResult>({ action: 'mute', target }),
  unmute: (target: string) =>
    request<TelegramVcAdminResult>({ action: 'unmute', target }),
  kick: (target: string) =>
    request<TelegramVcAdminResult>({ action: 'kick', target }),
  pin: (target: string) =>
    request<TelegramVcAdminResult>({ action: 'pin', target }),
  end: () => request<TelegramVcAdminResult>({ action: 'end' }),
  title: (title: string) =>
    request<TelegramVcAdminResult>({ action: 'title', title }),
  invite: (target: string) =>
    request<TelegramVcAdminResult>({ action: 'invite', target }),
}
