import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getServerEnv } from './env'

type Result = { paired: boolean; active: boolean; chatId: number | null; source: string | null }
export type TelegramVcGroup = { id: string; title: string; kind: 'group' | 'channel'; canManageCalls?: boolean }
export type TelegramVcParticipant = {
  id: string
  name: string
  muted: boolean
  cameraOn: boolean | null
  isSelf: boolean
  isAdmin: boolean
}
export type TelegramVcParticipants = {
  chatId: string
  callId: string
  participants: TelegramVcParticipant[]
  complete: boolean
  canManageCalls: boolean
}
export type TelegramVcMuteResult = TelegramVcParticipants & { participantId: string; confirmed: true }
type Reply<T = unknown> = { id?: string; ok: boolean; result?: T; error?: string }

type Bridge = {
  process: ChildProcessWithoutNullStreams
  pending: { id: string; complete: (reply: Reply) => void } | null
  failure: string | null
}

let child: Bridge | null = null
type WaitingRequest = { payload: Record<string, string>; signal?: AbortSignal; cleanup: () => void; resolve: (value: unknown) => void; reject: (error: unknown) => void }
const waiting: WaitingRequest[] = []
let requestActive = false
const MAX_WAITING_REQUESTS = 4

function sessionPath() { return `${process.env.MTPROTO_STATE_DIR || '/data/mtproto'}/operator.session` }

function failBridge(bridge: Bridge, message: string, exited = false): void {
  bridge.failure = message
  // Events from a failed process can arrive after its replacement has started.
  if (exited && child === bridge) child = null
  bridge.pending?.complete({ ok: false, error: message })
}

function launch(): Bridge {
  if (child) {
    if (child.failure) throw new Error(child.failure)
    return child
  }
  const env = getServerEnv()
  if (!env.mtprotoConfigured) throw new Error('Telegram MTProto credentials are not configured')
  if (!existsSync(sessionPath())) throw new Error('Telegram operator has not been paired')
  const next = spawn(process.env.MTPROTO_PYTHON || 'python3', [resolve(process.cwd(), 'scripts/telegram_vc_adapter.py')], {
    env: { ...process.env, STIX_TELEGRAM_API_ID: String(env.STIX_TELEGRAM_API_ID), STIX_TELEGRAM_API_HASH: env.STIX_TELEGRAM_API_HASH, STIX_MTPROTO_SESSION_PATH: sessionPath() },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const bridge: Bridge = { process: next, pending: null, failure: null }
  child = bridge
  let buffer = ''
  next.stdout.on('data', (chunk) => {
    buffer += String(chunk)
    let line: number
    while ((line = buffer.indexOf('\n')) >= 0) {
      const raw = buffer.slice(0, line)
      buffer = buffer.slice(line + 1)
      let reply: Reply
      try { reply = JSON.parse(raw) as Reply } catch { continue }
      // Only the executing request may release its slot, including a late reply
      // after its caller timed out. Ignore unrelated output without logging it.
      if (!reply || !bridge.pending || reply.id !== bridge.pending.id) continue
      bridge.pending.complete(typeof reply.ok === 'boolean'
        ? reply
        : { ok: false, error: 'Telegram adapter returned an invalid response' })
    }
  })
  // Drain stderr to avoid blocking the child when an SDK is noisy. Never expose its
  // output: it may contain Telegram metadata or media source credentials.
  next.stderr.resume()
  next.on('error', () => failBridge(bridge, 'Telegram adapter could not start', true))
  next.on('exit', () => failBridge(bridge, 'Telegram adapter stopped unexpectedly', true))
  // A broken input pipe does not prove the active call has stopped. Do not spawn a
  // competing client against the same Telegram session until this process exits.
  next.stdin.on('error', () => failBridge(bridge, 'Telegram adapter input is unavailable'))
  return bridge
}

async function performRequest<T = Result>(payload: Record<string, string>): Promise<T> {
  const bridge = launch()
  if (bridge.pending) throw new Error('Telegram adapter is busy')
  const id = randomUUID()
  const reply = await new Promise<Reply>((resolveReply, reject) => {
    const timer = setTimeout(() => {
      // The HTTP caller stops waiting, but synchronous Python may still be running
      // this job. Keep its slot until the matching reply drains or the process exits;
      // otherwise later mutes would become an uncancellable backlog in stdin.
      reject(new Error('Telegram adapter timed out'))
    }, 20_000)
    bridge.pending = { id, complete: (value) => {
      clearTimeout(timer)
      bridge.pending = null
      resolveReply(value)
      drainRequests()
    } }
    try {
      bridge.process.stdin.write(`${JSON.stringify({ ...payload, id })}\n`, (error) => {
        if (error) failBridge(bridge, 'Telegram adapter input is unavailable')
      })
    } catch {
      failBridge(bridge, 'Telegram adapter input is unavailable')
    }
  })
  if (!reply.ok || !reply.result) throw new Error(reply.error || 'Telegram adapter request failed')
  return reply.result as T
}

function drainRequests(): void {
  if (requestActive || child?.pending) return
  const next = waiting.shift()
  if (!next) return
  next.cleanup()
  if (next.signal?.aborted) {
    next.reject(new Error('Telegram action cancelled'))
    drainRequests()
    return
  }
  requestActive = true
  void performRequest(next.payload).then((value) => {
    requestActive = false
    next.resolve(value)
    drainRequests()
  }, (error: unknown) => {
    requestActive = false
    next.reject(error)
    drainRequests()
  })
}

function request<T = Result>(payload: Record<string, string>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new Error('Telegram action cancelled'))
  if (waiting.length >= MAX_WAITING_REQUESTS) return Promise.reject(new Error('Telegram adapter is busy. Try again shortly'))
  return new Promise<T>((resolveResult, reject) => {
    const onAbort = () => {
      const index = waiting.indexOf(next)
      if (index < 0) return // An already-dispatched SDK request cannot be retracted.
      waiting.splice(index, 1)
      next.cleanup()
      reject(new Error('Telegram action cancelled'))
    }
    const next: WaitingRequest = { payload, signal, cleanup: () => signal?.removeEventListener('abort', onAbort), resolve: (value) => resolveResult(value as T), reject }
    signal?.addEventListener('abort', onAbort, { once: true })
    waiting.push(next)
    drainRequests()
  })
}

export const telegramVcAdapter = {
  status: () => request({ action: 'status' }),
  join: (chatId: string, source: string) => request({ action: 'join', chatId, source }),
  leave: () => request({ action: 'leave' }),
  source: (source: string) => request({ action: 'source', source }),
  groups: () => request<{ groups: TelegramVcGroup[] }>({ action: 'groups' }),
  participants: (chatId: string) => request<TelegramVcParticipants>({ action: 'participants', chatId }),
  mute: (chatId: string, participantId: string, expectedCallId: string, options?: { signal?: AbortSignal; onlyIfCameraOff?: boolean }) =>
    request<TelegramVcMuteResult>({ action: 'mute', chatId, participantId, expectedCallId, onlyIfCameraOff: options?.onlyIfCameraOff ? 'true' : 'false' }, options?.signal),
}
