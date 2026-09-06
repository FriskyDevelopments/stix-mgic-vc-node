import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: spawnMock }))
vi.mock('node:fs', () => ({ existsSync: () => true }))
vi.mock('./env', () => ({
  getServerEnv: () => ({ mtprotoConfigured: true, STIX_TELEGRAM_API_ID: 1, STIX_TELEGRAM_API_HASH: 'test-only' }),
}))

function fakeChild() {
  const writes: Array<Record<string, string>> = []
  const stdin = Object.assign(new EventEmitter(), {
    write: vi.fn((data: string, _callback?: (error?: Error | null) => void) => {
      writes.push(JSON.parse(data))
      return true
    }),
  })
  return Object.assign(new EventEmitter(), {
    stdin,
    stdout: new EventEmitter(),
    stderr: Object.assign(new EventEmitter(), { resume: vi.fn() }),
    killed: false,
    kill: vi.fn(),
    writes,
  })
}

const idle = { paired: true, active: false, chatId: null, source: null }
const active = { paired: true, active: true, chatId: -100123, source: 'test-source' }

function reply(child: ReturnType<typeof fakeChild>, requestIndex: number, result: unknown = idle) {
  return JSON.stringify({ id: child.writes[requestIndex].id, ok: true, result }) + '\n'
}

describe('Telegram VC subprocess bridge', () => {
  let child: ReturnType<typeof fakeChild>

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    spawnMock.mockReset()
    child = fakeChild()
    spawnMock.mockReturnValue(child)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects a missing executable without an unhandled process error and can retry', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const first = expect(telegramVcAdapter.status()).rejects.toThrow('Telegram adapter could not start')
    child.emit('error', new Error('spawn missing-python ENOENT'))
    await first

    const replacement = fakeChild()
    spawnMock.mockReturnValue(replacement)
    const second = telegramVcAdapter.status()
    // The failed child's delayed exit must not invalidate the replacement.
    child.emit('exit', -2)
    replacement.stdout.emit('data', reply(replacement, 0))
    await expect(second).resolves.toEqual(idle)
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })

  it('serializes overlapping requests and starts the next after its response', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const first = telegramVcAdapter.status()
    const second = telegramVcAdapter.leave()
    expect(child.writes).toHaveLength(1)
    expect(child.writes[0].id).toEqual(expect.any(String))
    child.stdout.emit('data', reply(child, 0))
    await expect(first).resolves.toEqual(idle)

    expect(child.writes).toHaveLength(2)
    child.stdout.emit('data', reply(child, 1))
    await expect(second).resolves.toEqual(idle)
  })

  it('bounds the waiting queue to four requests and preserves FIFO order', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const first = telegramVcAdapter.status()
    const queued = ['1', '2', '3', '4'].map((chatId) => telegramVcAdapter.participants(chatId))
    await expect(telegramVcAdapter.groups()).rejects.toThrow('Telegram adapter is busy')
    expect(child.writes).toHaveLength(1)
    child.stdout.emit('data', reply(child, 0))
    await first
    for (let index = 0; index < queued.length; index++) {
      expect(child.writes[index + 1].chatId).toBe(String(index + 1))
      const result = { chatId: String(index + 1), callId: '123', participants: [], complete: true, canManageCalls: true }
      child.stdout.emit('data', reply(child, index + 1, result))
      await expect(queued[index]).resolves.toEqual(result)
    }
  })

  it('sends participants and call-bound mute commands without broadcast source or join', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const snapshot = { chatId: '-100123', callId: '987', participants: [{ id: '7', name: 'Guest', muted: false, cameraOn: null, isSelf: false, isAdmin: false }], complete: false, canManageCalls: true }
    const participants = telegramVcAdapter.participants('-100123')
    expect(child.writes[0]).toMatchObject({ action: 'participants', chatId: '-100123' })
    expect(child.writes[0]).not.toHaveProperty('source')
    child.stdout.emit('data', reply(child, 0, snapshot))
    await expect(participants).resolves.toEqual(snapshot)
    const mute = telegramVcAdapter.mute('-100123', '7', '987')
    expect(child.writes[1]).toMatchObject({ action: 'mute', chatId: '-100123', participantId: '7', expectedCallId: '987' })
    const confirmed = { ...snapshot, participantId: '7', confirmed: true }
    child.stdout.emit('data', reply(child, 1, confirmed))
    await expect(mute).resolves.toEqual(confirmed)
  })

  it('removes an aborted queued mute before it can write to the subprocess', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const first = telegramVcAdapter.status()
    const controller = new AbortController()
    const cancelled = expect(telegramVcAdapter.mute('-100123', '7', '987', { signal: controller.signal, onlyIfCameraOff: true })).rejects.toThrow('Telegram action cancelled')
    controller.abort()
    await cancelled
    child.stdout.emit('data', reply(child, 0))
    await first
    expect(child.writes).toHaveLength(1)
    expect(child.writes.some(write => write.action === 'mute')).toBe(false)
  })

  it('never launches for an already-aborted moderation request', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const controller = new AbortController()
    controller.abort()
    await expect(telegramVcAdapter.mute('-100123', '7', '987', { signal: controller.signal, onlyIfCameraOff: true })).rejects.toThrow('Telegram action cancelled')
    expect(spawnMock).not.toHaveBeenCalled()
    expect(child.writes).toHaveLength(0)
  })

  it('serializes the conditional camera guard and preserves an already-dispatched result', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const controller = new AbortController()
    const result = telegramVcAdapter.mute('-100123', '7', '987', { signal: controller.signal, onlyIfCameraOff: true })
    expect(child.writes[0]).toMatchObject({ onlyIfCameraOff: 'true' })
    controller.abort()
    const confirmed = { chatId: '-100123', callId: '987', participants: [], complete: true, canManageCalls: true, participantId: '7', confirmed: true }
    child.stdout.emit('data', reply(child, 0, confirmed))
    await expect(result).resolves.toEqual(confirmed)
  })

  it('holds later dispatch after timeout until the original reply drains', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const first = expect(telegramVcAdapter.status()).rejects.toThrow('Telegram adapter timed out')
    await vi.advanceTimersByTimeAsync(20_000)
    await first

    const second = telegramVcAdapter.leave()
    expect(child.writes).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(child.writes).toHaveLength(1)
    // Unrelated SDK output cannot release the execution slot.
    child.stdout.emit('data', '{"id":"unrelated","ok":true,"result":{}}\n')
    expect(child.writes).toHaveLength(1)
    child.stdout.emit('data', reply(child, 0, active))
    expect(child.writes).toHaveLength(2)
    expect(child.writes[1].id).not.toBe(child.writes[0].id)
    // A duplicate stale response cannot complete the new request.
    child.stdout.emit('data', reply(child, 0, active) + reply(child, 1))
    await expect(second).resolves.toEqual(idle)
    expect(child.kill).not.toHaveBeenCalled()
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  it('can cancel a moderation job queued behind a timed-out Python operation', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const first = expect(telegramVcAdapter.status()).rejects.toThrow('Telegram adapter timed out')
    const controller = new AbortController()
    const mute = expect(telegramVcAdapter.mute('-100123', '7', '987', { signal: controller.signal, onlyIfCameraOff: true })).rejects.toThrow('Telegram action cancelled')
    await vi.advanceTimersByTimeAsync(20_000)
    await first
    expect(child.writes).toHaveLength(1)
    controller.abort()
    await mute
    child.stdout.emit('data', reply(child, 0))
    expect(child.writes).toHaveLength(1)
    expect(child.writes.some(write => write.action === 'mute')).toBe(false)
  })

  it('releases a timed-out execution slot after process exit and resumes queued work on a replacement', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const first = expect(telegramVcAdapter.status()).rejects.toThrow('Telegram adapter timed out')
    await vi.advanceTimersByTimeAsync(20_000)
    await first
    const second = telegramVcAdapter.groups()
    expect(child.writes).toHaveLength(1)
    const replacement = fakeChild()
    spawnMock.mockReturnValue(replacement)
    child.emit('exit', 1)
    expect(spawnMock).toHaveBeenCalledTimes(2)
    expect(replacement.writes[0]).toMatchObject({ action: 'groups' })
    const groups = { groups: [] }
    replacement.stdout.emit('data', reply(replacement, 0, groups))
    await expect(second).resolves.toEqual(groups)
  })

  it('discards startup output and unrelated replies, including a split response', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const result = telegramVcAdapter.status()
    const response = reply(child, 0)
    child.stdout.emit('data', 'Starting SDK\n{"ok":true,"result":{}}\n{"id":"unrelated","ok":true}\n' + response.slice(0, 8))
    child.stdout.emit('data', response.slice(8))
    await expect(result).resolves.toEqual(idle)
    expect(child.stderr.resume).toHaveBeenCalledOnce()
  })

  it('rejects a failed reply with the matching request id', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const result = expect(telegramVcAdapter.leave()).rejects.toThrow('Unable to leave')
    child.stdout.emit('data', JSON.stringify({ id: child.writes[0].id, ok: false, error: 'Unable to leave' }) + '\n')
    await result
  })

  it('rejects malformed matching envelopes instead of treating them as success', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const result = expect(telegramVcAdapter.status()).rejects.toThrow('Telegram adapter returned an invalid response')
    child.stdout.emit('data', JSON.stringify({ id: child.writes[0].id, result: idle }) + '\n')
    await result
  })

  it('handles stdin errors and waits for process exit before reusing the Telegram session', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const first = expect(telegramVcAdapter.status()).rejects.toThrow('Telegram adapter input is unavailable')
    child.stdin.emit('error', new Error('write EPIPE with private details'))
    await first
    await expect(telegramVcAdapter.status()).rejects.toThrow('Telegram adapter input is unavailable')
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(child.kill).not.toHaveBeenCalled()

    child.emit('exit', 1)
    const replacement = fakeChild()
    spawnMock.mockReturnValue(replacement)
    const second = telegramVcAdapter.status()
    replacement.stdout.emit('data', reply(replacement, 0))
    await expect(second).resolves.toEqual(idle)
  })

  it('handles asynchronous stdin write callback errors without waiting for a timeout', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    child.stdin.write.mockImplementation((_data, callback) => {
      callback?.(new Error('write EPIPE'))
      return false
    })
    await expect(telegramVcAdapter.status()).rejects.toThrow('Telegram adapter input is unavailable')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects pending work when the process exits and can start again', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const first = expect(telegramVcAdapter.status()).rejects.toThrow('Telegram adapter stopped unexpectedly')
    child.emit('exit', 1)
    await first
    expect(vi.getTimerCount()).toBe(0)

    const replacement = fakeChild()
    spawnMock.mockReturnValue(replacement)
    const second = telegramVcAdapter.status()
    replacement.stdout.emit('data', reply(replacement, 0))
    await expect(second).resolves.toEqual(idle)
  })

  it('handles two JSON lines arriving in a single stdout chunk without poisoning', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const first = telegramVcAdapter.status()
    const second = telegramVcAdapter.leave()

    expect(child.writes).toHaveLength(1)
    const id0 = child.writes[0].id
    const id1 = 'future-id-1'

    // Emit two replies together in a single chunk: the current reply and an unrelated/stray reply
    child.stdout.emit('data', JSON.stringify({ id: id0, ok: true, result: idle }) + '\n' +
      JSON.stringify({ id: id1, ok: true, result: idle }) + '\n')
    await expect(first).resolves.toEqual(idle)

    // Second request is dispatched now that first completed
    expect(child.writes).toHaveLength(2)
    child.stdout.emit('data', reply(child, 1))
    await expect(second).resolves.toEqual(idle)
  })

  it('supports playback controls: pause, resume, skip, stop', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const p1 = telegramVcAdapter.pause()
    child.stdout.emit('data', reply(child, 0, { ...active, paused: true }))
    await expect(p1).resolves.toEqual({ ...active, paused: true })

    const p2 = telegramVcAdapter.resume()
    child.stdout.emit('data', reply(child, 1, { ...active, paused: false }))
    await expect(p2).resolves.toEqual({ ...active, paused: false })

    const p3 = telegramVcAdapter.skip()
    child.stdout.emit('data', reply(child, 2, active))
    await expect(p3).resolves.toEqual(active)

    const p4 = telegramVcAdapter.stop()
    child.stdout.emit('data', reply(child, 3, idle))
    await expect(p4).resolves.toEqual(idle)
  })

  it('supports camera toggle and kick/pin commands', async () => {
    const { telegramVcAdapter } = await import('./telegram-vc-adapter')
    const cam = telegramVcAdapter.setCamera(true)
    child.stdout.emit('data', reply(child, 0, { ...active, camera: true }))
    await expect(cam).resolves.toEqual({ ...active, camera: true })

    const kick = telegramVcAdapter.kick('123', '456')
    child.stdout.emit('data', reply(child, 1, { chatId: '123', participantId: '456', kicked: true }))
    await expect(kick).resolves.toEqual({ chatId: '123', participantId: '456', kicked: true })

    const pin = telegramVcAdapter.pin('123', 789)
    child.stdout.emit('data', reply(child, 2, { chatId: '123', pinned: true }))
    await expect(pin).resolves.toEqual({ chatId: '123', pinned: true })
  })
})
