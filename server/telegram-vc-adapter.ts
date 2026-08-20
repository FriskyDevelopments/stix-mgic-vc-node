import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getServerEnv } from './env'

type Result = { paired: boolean; active: boolean; chatId: number | null; source: string | null }
export type TelegramVcGroup = { id: string; title: string; kind: 'group' | 'channel' }
type Reply<T = unknown> = { ok: boolean; result?: T; error?: string }

let child: ChildProcessWithoutNullStreams | null = null
let pending: ((reply: Reply) => void) | null = null

function sessionPath() { return `${process.env.MTPROTO_STATE_DIR || '/data/mtproto'}/operator.session` }

function launch(): ChildProcessWithoutNullStreams {
  if (child && !child.killed) return child
  const env = getServerEnv()
  if (!env.mtprotoConfigured) throw new Error('Telegram MTProto credentials are not configured')
  if (!existsSync(sessionPath())) throw new Error('Telegram operator has not been paired')
  const next = spawn(process.env.MTPROTO_PYTHON || 'python3', [resolve(process.cwd(), 'scripts/telegram_vc_adapter.py')], {
    env: { ...process.env, STIX_TELEGRAM_API_ID: String(env.STIX_TELEGRAM_API_ID), STIX_TELEGRAM_API_HASH: env.STIX_TELEGRAM_API_HASH, STIX_MTPROTO_SESSION_PATH: sessionPath() },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let buffer = ''
  next.stdout.on('data', (chunk) => {
    buffer += String(chunk)
    const line = buffer.indexOf('\n')
    if (line < 0 || !pending) return
    const resolvePending = pending
    pending = null
    const raw = buffer.slice(0, line); buffer = buffer.slice(line + 1)
    try { resolvePending(JSON.parse(raw) as Reply) } catch { resolvePending({ ok: false, error: 'Telegram adapter returned an invalid response' }) }
  })
  next.on('exit', () => { child = null; if (pending) { pending({ ok: false, error: 'Telegram adapter stopped unexpectedly' }); pending = null } })
  child = next
  return next
}

async function request<T = Result>(payload: Record<string, string>): Promise<T> {
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
}
