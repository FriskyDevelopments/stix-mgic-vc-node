import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomPanel } from './RoomPanel'
import { closeRoom, createRoom, getMediaPlaneStatus, getRoom, RoomsApiError, type RoomView } from '@/lib/rooms-api'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/rooms-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/rooms-api')>(),
  createRoom: vi.fn(), getRoom: vi.fn(), closeRoom: vi.fn(), getMediaPlaneStatus: vi.fn(),
}))
vi.mock('@/components/CallStage', () => ({ CallStage: ({ roomId }: { roomId: string }) => createElement('div', { 'data-room': roomId }) }))

const room: RoomView = {
  id: 'room-123', name: 'Test room', ownerOperatorId: 'operator', platform: 'web',
  maxParticipants: 8, createdAt: 1, scheduledFor: null, participants: [], participantCount: 0,
}
let container: HTMLDivElement
let root: Root
const invite = () => `${window.location.origin}/?room=room-123`
const button = (text: string) => Array.from(container.querySelectorAll('button')).find((node) => node.textContent === text)!
const render = async () => act(async () => root.render(createElement(RoomPanel, { localStream: null })))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.history.replaceState(null, '', '/')
  vi.mocked(getRoom).mockResolvedValue({ room, signaling: { path: '/v1/signal', iceServers: [] } })
  vi.mocked(createRoom).mockResolvedValue({ room, signaling: { path: '/v1/signal', iceServers: [] } })
  vi.mocked(getMediaPlaneStatus).mockResolvedValue({ ready: true, enabled: true, adapters: [], reason: 'Ready' })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  window.history.replaceState(null, '', '/')
  Reflect.deleteProperty(navigator, 'clipboard')
  vi.unstubAllGlobals()
})

describe('room invite journey', () => {
  it('opens the room from an invite and displays an actual usable link', async () => {
    window.history.replaceState(null, '', '/?room=room-123')
    await render()
    expect(getRoom).toHaveBeenCalledExactlyOnceWith('room-123')
    expect(container.querySelector('[data-room]')?.getAttribute('data-room')).toBe('room-123')
    expect(container.querySelector<HTMLAnchorElement>('a')?.href).toBe(invite())
    expect(container.querySelector<HTMLInputElement>('#room-invite')?.value).toBe(invite())
  })

  it('replaces the new-room action with the created room so a refresh keeps the invitation', async () => {
    window.history.replaceState(null, '', '/?action=new-room')
    await render()
    expect(createRoom).toHaveBeenCalledTimes(1)
    expect(window.location.href).toBe(invite())
  })

  it('keeps an explicit invite when a new-room action is also present', async () => {
    window.history.replaceState(null, '', '/?room=room-123&action=new-room')
    await render()
    expect(getRoom).toHaveBeenCalledExactlyOnceWith('room-123')
    expect(createRoom).not.toHaveBeenCalled()
    expect(window.location.href).toBe(invite())
  })

  it('joins from a full pasted invite without passing the URL as a room ID', async () => {
    await render()
    const input = container.querySelector<HTMLInputElement>('input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, invite())
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button('Join').click())
    expect(getRoom).toHaveBeenCalledExactlyOnceWith('room-123')
    expect(container.querySelector('[data-room]')).not.toBeNull()
  })

  it('recovers from an expired invite without reopening it on refresh or silently creating a room', async () => {
    window.history.replaceState(null, '', '/?room=expired')
    vi.mocked(getRoom).mockRejectedValueOnce(new RoomsApiError(404, 'Room not found'))
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('This room link is invalid or the room has closed')
    expect(new URL(window.location.href).searchParams.has('room')).toBe(false)
    expect(createRoom).not.toHaveBeenCalled()
    expect(container.querySelector('[data-room]')).toBeNull()
    await act(async () => button('Open a room').click())
    expect(createRoom).toHaveBeenCalledTimes(1)
    expect(window.location.href).toBe(invite())
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('[data-room]')?.getAttribute('data-room')).toBe('room-123')
  })

  it('preserves the invitation on authentication or temporary server failures', async () => {
    window.history.replaceState(null, '', '/?room=room-123')
    vi.mocked(getRoom).mockRejectedValueOnce(new RoomsApiError(401, 'Invalid or expired operator token'))
    await render()
    expect(window.location.href).toBe(invite())
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Invalid or expired operator token')
    expect(createRoom).not.toHaveBeenCalled()
    await act(async () => button('Join').click())
    expect(container.querySelector('[data-room]')).not.toBeNull()
  })

  it('clears the previous invite after leaving so Join cannot target the just-closed room', async () => {
    window.history.replaceState(null, '', '/?room=room-123')
    await render()
    await act(async () => button('Leave').click())
    expect(closeRoom).toHaveBeenCalledExactlyOnceWith('room-123')
    expect(window.location.search).toBe('')
    expect(container.querySelector<HTMLInputElement>('input')?.value).toBe('')
    expect(button('Join').disabled).toBe(true)
  })

  it('reports copied only after the clipboard accepts the real invite', async () => {
    window.history.replaceState(null, '', '/?room=room-123')
    let finish!: () => void
    const writeText = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await render()
    await act(async () => button('Copy invite').click())
    expect(writeText).toHaveBeenCalledExactlyOnceWith(invite())
    expect(toast.success).not.toHaveBeenCalled()
    await act(async () => finish())
    expect(toast.success).toHaveBeenCalledWith('Invite link copied')
  })

  it('leaves a manual link when clipboard permission is denied', async () => {
    window.history.replaceState(null, '', '/?room=room-123')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    await render()
    await act(async () => button('Copy invite').click())
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Could not copy the invite', expect.any(Object))
    expect(container.querySelector<HTMLInputElement>('#room-invite')?.value).toBe(invite())
  })
})
