import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CallStage, type LocalStreamChangeResult } from './CallStage'

const transport = vi.hoisted(() => ({ construct: vi.fn(), join: vi.fn(), replace: vi.fn(), close: vi.fn() }))
vi.mock('@/lib/webrtc-client', () => ({
  CallClient: class {
    constructor(options: unknown) { transport.construct(options) }
    join = transport.join
    replaceLocalStream = transport.replace
    close = transport.close
  },
}))

const camera = { id: 'camera' } as MediaStream
const program = { id: 'program' } as MediaStream
let container: HTMLDivElement
let root: Root
const outcome = vi.fn<(result: LocalStreamChangeResult) => void>()
const render = (stream: MediaStream | null, onLocalStreamChange = outcome) => act(async () => root.render(createElement(CallStage, {
  roomId: 'room', localStream: stream, onLocalStreamChange,
})))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  transport.join.mockReset().mockResolvedValue(undefined)
  transport.replace.mockReset().mockResolvedValue(undefined)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('room media selection outcomes', () => {
  it('reports pending/applied only when join and sender replacement finish, without reconnecting', async () => {
    let finishJoin!: () => void
    let finishSwitch!: () => void
    transport.join.mockImplementation(() => new Promise<void>((resolve) => { finishJoin = resolve }))
    transport.replace.mockImplementation(() => new Promise<void>((resolve) => { finishSwitch = resolve }))
    await render(camera)
    expect(outcome).toHaveBeenCalledExactlyOnceWith({ status: 'switching', stream: camera })
    await act(async () => finishJoin())
    expect(outcome).toHaveBeenLastCalledWith({ status: 'applied', stream: camera })
    await render(program)
    expect(outcome).toHaveBeenLastCalledWith({ status: 'switching', stream: program })
    expect(transport.replace).toHaveBeenCalledExactlyOnceWith(program)
    expect(outcome).not.toHaveBeenCalledWith({ status: 'applied', stream: program })
    await act(async () => finishSwitch())
    expect(outcome).toHaveBeenLastCalledWith({ status: 'applied', stream: program })
    expect(transport.construct).toHaveBeenCalledOnce()
    expect(transport.join).toHaveBeenCalledOnce()
    expect(transport.close).not.toHaveBeenCalled()
  })

  it('reports failed replacement and its rollback result without claiming the requested source is applied', async () => {
    await render(camera)
    const error = 'Source switching failed. The previous source is retained.'
    transport.replace.mockRejectedValueOnce(new Error(error))
    await render(program)
    expect(outcome).toHaveBeenLastCalledWith({ status: 'failed', stream: program, error })
    expect(outcome).not.toHaveBeenCalledWith({ status: 'applied', stream: program })
    expect(container.textContent).toContain(error)
    expect(transport.close).not.toHaveBeenCalled()
  })

  it('waits for joining before applying a source chosen during connection, and suppresses the stale initial result', async () => {
    let finishJoin!: () => void
    transport.join.mockImplementation(() => new Promise<void>((resolve) => { finishJoin = resolve }))
    await render(null)
    await render(program)
    expect(transport.replace).not.toHaveBeenCalled()
    await act(async () => finishJoin())
    expect(transport.replace).toHaveBeenCalledExactlyOnceWith(program)
    expect(outcome).toHaveBeenLastCalledWith({ status: 'applied', stream: program })
    expect(outcome).not.toHaveBeenCalledWith({ status: 'applied', stream: null })
  })

  it('ignores late switching results after leaving and closes only the client', async () => {
    await render(camera)
    let finish!: () => void
    transport.replace.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    await render(program)
    const count = outcome.mock.calls.length
    await act(async () => root.render(null))
    await act(async () => finish())
    expect(outcome).toHaveBeenCalledTimes(count)
    expect(transport.close).toHaveBeenCalledOnce()
  })

  it('supports receive-only selection and uses the latest callback without another connection', async () => {
    await render(camera)
    const latest = vi.fn()
    await render(camera, latest)
    expect(transport.replace).not.toHaveBeenCalled()
    await render(null, latest)
    expect(transport.replace).toHaveBeenCalledExactlyOnceWith(null)
    expect(latest).toHaveBeenLastCalledWith({ status: 'applied', stream: null })
    expect(transport.join).toHaveBeenCalledOnce()
  })
})
