import { describe, expect, it, vi } from 'vitest'
import { createCameraPolicyService, type CameraPolicyParticipant, type CameraPolicySnapshot } from './camera-policy'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const viewer = (overrides: Partial<CameraPolicyParticipant> = {}): CameraPolicyParticipant => ({
  id: 'viewer', name: 'Viewer', muted: false, cameraOn: false, isSelf: false, isAdmin: false, ...overrides,
})

function setup() {
  let time = 0
  let observation: CameraPolicySnapshot = {
    chatId: 'group-1', callId: 'call-1', complete: true, canManageCalls: true, participants: [viewer()],
  }
  const deps = {
    assertAccess: vi.fn(async (_operatorId: string, _chatId: string) => undefined),
    snapshot: vi.fn(async (_chatId: string) => structuredClone(observation)),
    warn: vi.fn(async (_chatId: string, _id: string, _name: string, _grace: 0 | 30 | 60) => undefined),
    mute: vi.fn(async (_chatId: string, _id: string, _callId: string, _options: { signal: AbortSignal; onlyIfCameraOff: true }) => undefined),
    now: () => time,
  }
  const service = createCameraPolicyService(deps)
  return {
    deps, service,
    advance(ms: number) { time += ms },
    state(update: Partial<CameraPolicySnapshot>) { observation = { ...observation, ...update } },
    enable(graceSeconds: 0 | 30 | 60 = 60) { return service.setPolicy('owner', { chatId: 'group-1', enabled: true, graceSeconds }) },
    disable() { return service.setPolicy('owner', { chatId: 'group-1', enabled: false, graceSeconds: 60 }) },
    status() { return service.getPolicy('owner', 'group-1') },
  }
}

describe('call-specific camera policy', () => {
  it('starts disabled and hides the selected group, owner, call and counters from other requests', async () => {
    const h = setup()
    const hidden = { chatId: 'group-1', enabled: false, graceSeconds: 60, callId: null, status: 'disabled', error: null, pendingCount: 0 }
    expect(h.status()).toEqual(hidden)
    await h.enable(30)
    await h.service.tick()
    expect(h.status()).toMatchObject({ enabled: true, callId: 'call-1', pendingCount: 1 })
    expect(h.service.getPolicy('stranger', 'group-1')).toEqual(hidden)
    expect(h.service.getPolicy('owner', 'another-group')).toEqual({ ...hidden, chatId: 'another-group' })
    await expect(h.service.setPolicy('stranger', { chatId: 'another-group', enabled: true, graceSeconds: 30 })).rejects.toMatchObject({ status: 409, message: 'A camera policy is already active.' })
    await h.service.setPolicy('stranger', { chatId: 'group-1', enabled: false, graceSeconds: 0 })
    expect(h.status().enabled).toBe(true)
  })

  it('requires access, a complete active call, manage-call permission and a supported grace period before enabling', async () => {
    const h = setup()
    h.deps.assertAccess.mockRejectedValueOnce(new Error('Denied'))
    await expect(h.enable()).rejects.toThrow('Denied')
    expect(h.deps.snapshot).not.toHaveBeenCalled()
    h.state({ complete: false })
    await expect(h.enable()).rejects.toMatchObject({ status: 409 })
    h.state({ complete: true, canManageCalls: false })
    await expect(h.enable()).rejects.toMatchObject({ status: 403 })
    await expect(h.service.setPolicy('owner', { chatId: 'group-1', enabled: true, graceSeconds: 15 as 30 })).rejects.toMatchObject({ status: 400 })
    expect(h.status().enabled).toBe(false)
    expect(h.deps.warn).not.toHaveBeenCalled()
    expect(h.deps.mute).not.toHaveBeenCalled()
  })

  it('rejects activation when the call differs from the one the operator reviewed', async () => {
    const h = setup()
    await expect(h.service.setPolicy('owner', { chatId: 'group-1', enabled: true, graceSeconds: 60, expectedCallId: 'old-call' })).rejects.toMatchObject({ status: 409, message: 'The call changed. Refresh before enabling the rule.' })
    expect(h.status().enabled).toBe(false)
    expect(h.deps.warn).not.toHaveBeenCalled()
    await expect(h.service.setPolicy('owner', { chatId: 'group-1', enabled: true, graceSeconds: 60, expectedCallId: 'call-1' })).resolves.toMatchObject({ enabled: true, callId: 'call-1' })
  })

  it('starts grace only after delivery and refetches participants immediately before muting', async () => {
    const h = setup()
    await h.enable(30)
    const delivery = deferred<undefined>()
    h.deps.warn.mockImplementationOnce(() => delivery.promise)
    const tick = h.service.tick()
    await vi.waitFor(() => expect(h.deps.warn).toHaveBeenCalledOnce())
    h.advance(90_000)
    delivery.resolve(undefined)
    await tick
    await h.service.tick()
    expect(h.deps.mute).not.toHaveBeenCalled()
    h.advance(29_999)
    await h.service.tick()
    expect(h.deps.mute).not.toHaveBeenCalled()
    h.advance(1)
    const reads = h.deps.snapshot.mock.calls.length
    await h.service.tick()
    expect(h.deps.snapshot.mock.calls.length - reads).toBe(2)
    expect(h.deps.mute).toHaveBeenCalledExactlyOnceWith('group-1', 'viewer', 'call-1', { signal: expect.any(AbortSignal), onlyIfCameraOff: true })
    expect(h.deps.warn).toHaveBeenCalledExactlyOnceWith('group-1', 'viewer', 'Viewer', 30)
    await h.service.tick()
    expect(h.deps.mute).toHaveBeenCalledOnce()
  })

  it('never mutes when warning delivery fails, including zero grace', async () => {
    const h = setup()
    await h.enable(0)
    h.deps.warn.mockRejectedValueOnce(new Error('Private delivery failure'))
    await h.service.tick()
    h.advance(60_000)
    await h.service.tick()
    expect(h.deps.warn).toHaveBeenCalledOnce()
    expect(h.deps.mute).not.toHaveBeenCalled()
    expect(h.status().error).toContain('could not be delivered')
    expect(JSON.stringify(h.status())).not.toContain('Private')
  })

  it('resets the warning episode when the camera returns or the participant leaves', async () => {
    const h = setup()
    await h.enable(30)
    await h.service.tick()
    h.state({ participants: [viewer({ cameraOn: true })] })
    h.advance(60_000)
    await h.service.tick()
    h.state({ participants: [viewer()] })
    await h.service.tick()
    expect(h.deps.warn).toHaveBeenCalledTimes(2)
    expect(h.deps.mute).not.toHaveBeenCalled()
    h.state({ participants: [] })
    await h.service.tick()
    h.state({ participants: [viewer()] })
    await h.service.tick()
    expect(h.deps.warn).toHaveBeenCalledTimes(3)
  })

  it('skips self, administrators, muted participants and unknown camera state', async () => {
    const h = setup()
    h.state({ participants: [viewer({ id: 'self', isSelf: true }), viewer({ id: 'admin', isAdmin: true }), viewer({ id: 'muted', muted: true }), viewer({ id: 'unknown', cameraOn: null })] })
    await h.enable(0)
    await h.service.tick()
    expect(h.deps.warn).not.toHaveBeenCalled()
    expect(h.deps.mute).not.toHaveBeenCalled()
  })

  it.each(['incomplete', 'permission', 'transport', 'unknown'] as const)('requires a fresh grace period after %s observations without duplicate warnings', async (kind) => {
    const h = setup()
    await h.enable(30)
    await h.service.tick()
    h.advance(30_000)
    if (kind === 'incomplete') h.state({ complete: false })
    if (kind === 'permission') h.state({ canManageCalls: false })
    if (kind === 'transport') h.deps.snapshot.mockRejectedValueOnce(new Error('Unavailable private data'))
    if (kind === 'unknown') h.state({ participants: [viewer({ cameraOn: null })] })
    await h.service.tick()
    expect(h.deps.mute).not.toHaveBeenCalled()
    h.state({ complete: true, canManageCalls: true, participants: [viewer()] })
    await h.service.tick()
    expect(h.deps.mute).not.toHaveBeenCalled()
    h.advance(30_000)
    await h.service.tick()
    expect(h.deps.warn).toHaveBeenCalledOnce()
    expect(h.deps.mute).toHaveBeenCalledOnce()
  })

  it.each(['camera', 'departure', 'admin', 'muted', 'call', 'permission', 'incomplete'] as const)('refuses a due mute after the final snapshot changes %s', async (change) => {
    const h = setup()
    await h.enable(30)
    await h.service.tick()
    h.advance(30_000)
    const fresh: CameraPolicySnapshot = { chatId: 'group-1', callId: 'call-1', complete: true, canManageCalls: true, participants: [viewer()] }
    if (change === 'camera') fresh.participants = [viewer({ cameraOn: true })]
    if (change === 'departure') fresh.participants = []
    if (change === 'admin') fresh.participants = [viewer({ isAdmin: true })]
    if (change === 'muted') fresh.participants = [viewer({ muted: true })]
    if (change === 'call') fresh.callId = 'call-2'
    if (change === 'permission') fresh.canManageCalls = false
    if (change === 'incomplete') fresh.complete = false
    h.deps.snapshot.mockImplementationOnce(async () => ({ ...fresh, callId: 'call-1', complete: true, canManageCalls: true, participants: [viewer()] }))
    h.deps.snapshot.mockResolvedValueOnce(fresh)
    await h.service.tick()
    expect(h.deps.mute).not.toHaveBeenCalled()
    if (change === 'call') expect(h.status()).toMatchObject({ enabled: false, status: 'disabled' })
  })

  it('disables on call change and never carries the rule into the next call', async () => {
    const h = setup()
    await h.enable(0)
    h.state({ callId: 'call-2' })
    await h.service.tick()
    await h.service.tick()
    expect(h.status()).toMatchObject({ enabled: false, status: 'disabled', pendingCount: 0 })
    expect(h.deps.warn).not.toHaveBeenCalled()
    await h.enable(0)
    await h.service.tick()
    expect(h.deps.mute).toHaveBeenCalledExactlyOnceWith('group-1', 'viewer', 'call-2', { signal: expect.any(AbortSignal), onlyIfCameraOff: true })
  })

  it('uses newer observations for remaining participants rather than warning someone already observed leaving', async () => {
    const h = setup()
    h.state({ participants: [viewer(), viewer({ id: 'departing' })] })
    await h.enable(30)
    await h.service.tick()
    h.advance(30_000)
    h.deps.snapshot.mockImplementationOnce(async () => ({ chatId: 'group-1', callId: 'call-1', complete: true, canManageCalls: true, participants: [viewer(), viewer({ id: 'departing' })] }))
    h.deps.snapshot.mockResolvedValueOnce({ chatId: 'group-1', callId: 'call-1', complete: true, canManageCalls: true, participants: [viewer()] })
    await h.service.tick()
    expect(h.deps.warn).toHaveBeenCalledTimes(2)
    expect(h.deps.mute).toHaveBeenCalledExactlyOnceWith('group-1', 'viewer', 'call-1', { signal: expect.any(AbortSignal), onlyIfCameraOff: true })
  })

  it('refetches before each warning when an earlier warning delivery was slow', async () => {
    const h = setup()
    h.state({ participants: [viewer(), viewer({ id: 'returned-camera' })] })
    await h.enable(30)
    const delivery = deferred<undefined>()
    h.deps.warn.mockImplementationOnce(() => delivery.promise)
    const tick = h.service.tick()
    await vi.waitFor(() => expect(h.deps.warn).toHaveBeenCalledOnce())
    h.state({ participants: [viewer(), viewer({ id: 'returned-camera', cameraOn: true })] })
    delivery.resolve(undefined)
    await tick
    expect(h.deps.warn).toHaveBeenCalledExactlyOnceWith('group-1', 'viewer', 'Viewer', 30)
    expect(h.deps.mute).not.toHaveBeenCalled()
  })

  it('rechecks access before warning and immediately before mute', async () => {
    const h = setup()
    await h.enable(0)
    h.deps.assertAccess.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Revoked before warning'))
    await h.service.tick()
    expect(h.deps.warn).not.toHaveBeenCalled()
    h.deps.assertAccess.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Revoked after fresh snapshot'))
    await h.service.tick()
    expect(h.deps.warn).toHaveBeenCalledOnce()
    expect(h.deps.mute).not.toHaveBeenCalled()
    expect(h.status().status).toBe('paused')
  })

  it('serializes overlapping ticks and disabling during warning delivery cancels subsequent mute', async () => {
    const h = setup()
    await h.enable(0)
    const warning = deferred<undefined>()
    h.deps.warn.mockImplementationOnce(() => warning.promise)
    const first = h.service.tick()
    const second = h.service.tick()
    expect(second).toBe(first)
    await vi.waitFor(() => expect(h.deps.warn).toHaveBeenCalledOnce())
    await h.disable()
    warning.resolve(undefined)
    await Promise.all([first, second])
    expect(h.deps.mute).not.toHaveBeenCalled()
    expect(h.status().enabled).toBe(false)
  })

  it('disabling during the final access check cancels a pending mute', async () => {
    const h = setup()
    await h.enable(0)
    const access = deferred<undefined>()
    h.deps.assertAccess.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockImplementationOnce(() => access.promise)
    const tick = h.service.tick()
    await vi.waitFor(() => expect(h.deps.assertAccess).toHaveBeenCalledTimes(6))
    await h.disable()
    access.resolve(undefined)
    await tick
    expect(h.deps.mute).not.toHaveBeenCalled()
  })

  it.each(['disable', 'replacement', 'stop'] as const)('aborts a FIFO-queued mute before dispatch on %s', async (action) => {
    const h = setup()
    await h.enable(0)
    const queued = deferred<AbortSignal>()
    const release = deferred<undefined>()
    const dispatched = vi.fn()
    h.deps.mute.mockImplementationOnce(async (_chatId, _id, _callId, { signal, onlyIfCameraOff }) => {
      expect(onlyIfCameraOff).toBe(true)
      queued.resolve(signal)
      await release.promise
      if (!signal.aborted) dispatched()
    })
    const tick = h.service.tick()
    const signal = await queued.promise
    expect(signal.aborted).toBe(false)
    if (action === 'disable') await h.disable()
    if (action === 'replacement') await h.enable(30)
    if (action === 'stop') h.service.stop()
    expect(signal.aborted).toBe(true)
    release.resolve(undefined)
    await tick
    expect(dispatched).not.toHaveBeenCalled()
  })

  it('aborts the call-specific signal when a later snapshot reports a different call', async () => {
    const h = setup()
    await h.enable(0)
    await h.service.tick()
    const signal = h.deps.mute.mock.calls[0][3].signal
    expect(signal.aborted).toBe(false)
    h.state({ callId: 'call-2' })
    await h.service.tick()
    expect(signal.aborted).toBe(true)
    expect(h.status().enabled).toBe(false)
  })

  it('reserves activation against other operators and cannot reactivate after disable or stop', async () => {
    const h = setup()
    const snapshot = deferred<CameraPolicySnapshot>()
    h.deps.snapshot.mockImplementationOnce(() => snapshot.promise)
    const activation = h.enable()
    const cancelled = expect(activation).rejects.toMatchObject({ status: 409 })
    await vi.waitFor(() => expect(h.deps.snapshot).toHaveBeenCalledOnce())
    await expect(h.service.setPolicy('other', { chatId: 'group-2', enabled: true, graceSeconds: 60 })).rejects.toMatchObject({ status: 409 })
    await h.disable()
    snapshot.resolve({ chatId: 'group-1', callId: 'call-1', complete: true, canManageCalls: true, participants: [] })
    await cancelled
    expect(h.status().enabled).toBe(false)
    await h.enable()
    h.service.stop()
    await h.service.tick()
    await expect(h.enable()).rejects.toMatchObject({ status: 409 })
    expect(h.deps.warn).not.toHaveBeenCalled()
  })
})
