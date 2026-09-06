import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getServerEnv } from './env'

export type TelegramVcStatusResult = {
  paired: boolean
  active: boolean
  chatId: number | null
  source: string | null
  camera?: boolean
  paused?: boolean
}
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
type Reply<T = unknown> = { id?: string; ok: boolean; result?: T; error?: string }

type Bridge = {
  process: ChildProcessWithoutNullStreams
  pending: { id: string; complete: (reply: Reply) => void } | null
  failure: string | null
}

let child: Bridge | null = null
type WaitingRequest = {
  payload: Record<string, string>
  signal?: AbortSignal
  cleanup: () => void
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}
const waiting: WaitingRequest[] = []
let requestActive = false
const MAX_WAITING_REQUESTS = 4

function sessionPath() {
  return `${process.env.MTPROTO_STATE_DIR || '/data/mtproto'}/operator.session`
}

function failBridge(bridge: Bridge, message: string, exited = false): void {
  bridge.failure = message
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
  const next = spawn(
    process.env.MTPROTO_PYTHON || 'python3',
    [resolve(process.cwd(), 'scripts/telegram_vc_adapter.py')],
    {
      env: {
        ...process.env,
        STIX_TELEGRAM_API_ID: String(env.STIX_TELEGRAM_API_ID),
        STIX_TELEGRAM_API_HASH: env.STIX_TELEGRAM_API_HASH,
        STIX_MTPROTO_SESSION_PATH: sessionPath(),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  )
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
      try {
        reply = JSON.parse(raw) as Reply
      } catch {
        continue
      }
      if (!reply || !bridge.pending || reply.id !== bridge.pending.id) {
        // unmatched or no pending: safe drop (prevents poison)
        continue
      }
      bridge.pending.complete(
        typeof reply.ok === 'boolean'
          ? reply
          : { ok: false, error: 'Telegram adapter returned an invalid response' }
      )
    }
  })
  next.stderr.resume()
  next.on('error', () => failBridge(bridge, 'Telegram adapter could not start', true))
  next.on('exit', () => failBridge(bridge, 'Telegram adapter stopped unexpectedly', true))
  next.stdin.on('error', () => failBridge(bridge, 'Telegram adapter input is unavailable'))
  return bridge
}

async function performRequest<T = TelegramVcStatusResult>(payload: Record<string, string>): Promise<T> {
  const bridge = launch()
  if (bridge.pending) throw new Error('Telegram adapter is busy')
  const id = randomUUID()
  const reply = await new Promise<Reply>((resolveReply, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Telegram adapter timed out'))
    }, 20_000)
    bridge.pending = {
      id,
      complete: (value) => {
        clearTimeout(timer)
        bridge.pending = null
        resolveReply(value)
        drainRequests()
      },
    }
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
  void performRequest(next.payload).then(
    (value) => {
      requestActive = false
      next.resolve(value)
      drainRequests()
    },
    (error: unknown) => {
      requestActive = false
      next.reject(error)
      drainRequests()
    }
  )
}

function request<T = TelegramVcStatusResult>(payload: Record<string, string>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new Error('Telegram action cancelled'))
  if (waiting.length >= MAX_WAITING_REQUESTS) {
    return Promise.reject(new Error('Telegram adapter is busy. Try again shortly'))
  }
  return new Promise<T>((resolveResult, reject) => {
    const onAbort = () => {
      const index = waiting.indexOf(next)
      if (index < 0) return
      waiting.splice(index, 1)
      next.cleanup()
      reject(new Error('Telegram action cancelled'))
    }
    const next: WaitingRequest = {
      payload,
      signal,
      cleanup: () => signal?.removeEventListener('abort', onAbort),
      resolve: (value) => resolveResult(value as T),
      reject,
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    waiting.push(next)
    drainRequests()
  })
}

export const telegramVcAdapter = {
  status: () => request<TelegramVcStatusResult>({ action: 'status' }),
  join: (chatId: string, source: string, camera: boolean = true) =>
    request<TelegramVcStatusResult>({ action: 'join', chatId, source, camera: camera ? 'true' : 'false' }),
  leave: () => request<TelegramVcStatusResult>({ action: 'leave' }),
  source: (source: string) => request<TelegramVcStatusResult>({ action: 'source', source }),
  pause: () => request<TelegramVcStatusResult>({ action: 'pause' }),
  resume: () => request<TelegramVcStatusResult>({ action: 'resume' }),
  skip: () => request<TelegramVcStatusResult>({ action: 'skip' }),
  stop: () => request<TelegramVcStatusResult>({ action: 'stop' }),
  setCamera: (on: boolean) => request<TelegramVcStatusResult>({ action: 'cam', on: on ? 'true' : 'false' }),
  groups: () => request<{ groups: TelegramVcGroup[] }>({ action: 'groups' }),
  /** Room-admin overlay (no chatId) or live MTProto snapshot when chatId is provided. */
  participants: (chatId?: string) =>
    chatId
      ? request<TelegramVcParticipants>({ action: 'participants', chatId })
      : request<TelegramVcAdminResult>({ action: 'participants' }),
  mute(
    chatIdOrTarget: string,
    participantId?: string,
    expectedCallId?: string,
    options?: { signal?: AbortSignal; onlyIfCameraOff?: boolean }
  ) {
    if (participantId !== undefined) {
      return request<TelegramVcMuteResult>(
        {
          action: 'mute',
          chatId: chatIdOrTarget,
          participantId,
          expectedCallId: expectedCallId || '',
          onlyIfCameraOff: options?.onlyIfCameraOff ? 'true' : 'false',
        },
        options?.signal
      )
    }
    return request<TelegramVcAdminResult>({ action: 'mute', target: chatIdOrTarget })
  },
  unmute: (target: string) => request<TelegramVcAdminResult>({ action: 'unmute', target }),
  kick(chatIdOrTarget: string, participantId?: string) {
    if (participantId !== undefined) {
      return request<{ chatId: string; participantId: string; kicked: boolean }>({
        action: 'kick',
        chatId: chatIdOrTarget,
        participantId,
      })
    }
    return request<TelegramVcAdminResult>({ action: 'kick', target: chatIdOrTarget })
  },
  pin(chatIdOrTarget: string, messageId?: string | number) {
    if (messageId !== undefined) {
      return request<{ chatId: string; pinned: boolean }>({
        action: 'pin',
        chatId: chatIdOrTarget,
        messageId: String(messageId),
      })
    }
    return request<TelegramVcAdminResult>({ action: 'pin', target: chatIdOrTarget })
  },
  end: () => request<TelegramVcAdminResult>({ action: 'end' }),
  title: (title: string) => request<TelegramVcAdminResult>({ action: 'title', title }),
  invite: (target: string) => request<TelegramVcAdminResult>({ action: 'invite', target }),
}
