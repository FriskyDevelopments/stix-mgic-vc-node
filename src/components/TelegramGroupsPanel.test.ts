import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TelegramGroupsPanel } from './TelegramGroupsPanel'
import * as api from '@/lib/telegram-vc-api'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/TelegramBroadcastTools', () => ({ TelegramBroadcastTools: () => null }))
vi.mock('@/lib/telegram-vc-api', () => ({
  beginTelegramLink: vi.fn(), getTelegramLinkStatus: vi.fn(), getTelegramGroups: vi.fn(),
  getParticipants: vi.fn(), getCameraPolicy: vi.fn(), setCameraPolicy: vi.fn(), muteParticipant: vi.fn(),
}))
let container: HTMLDivElement
let root: Root
const group = { id: '-1001', title: 'Our group', kind: 'group' as const, botCanManageCalls: true, botCanSendMessages: true, userCanManageCalls: true }
const policy = { chatId: group.id, enabled: false, graceSeconds: 60 as const, callId: null, status: 'disabled' }
const snapshot = { chatId: group.id, callId: 'call-1', complete: true, canManageCalls: true, participants: [{ id: '123', name: 'Guest', muted: false, cameraOn: false, isSelf: false, isAdmin: false }] }
const button = (text: string) => Array.from(container.querySelectorAll('button')).find(node => node.textContent === text)!
const render = (accessGranted = true) => act(async () => root.render(createElement(TelegramGroupsPanel, { accessGranted })))
const choose = () => act(async () => {
  const select = container.querySelector<HTMLSelectElement>('#my-telegram-group')!
  select.value = group.id
  select.dispatchEvent(new Event('change', { bubbles: true }))
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.mocked(api.getTelegramLinkStatus).mockResolvedValue({ linked: true })
  vi.mocked(api.getTelegramGroups).mockResolvedValue({ groups: [group], botUsername: 'test_bot', discoveryPartial: false })
  vi.mocked(api.getParticipants).mockResolvedValue(snapshot)
  vi.mocked(api.getCameraPolicy).mockResolvedValue(policy)
  vi.mocked(api.setCameraPolicy).mockResolvedValue({ ...policy, enabled: true, callId: 'call-1', status: 'active' })
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })

describe('My groups', () => {
  it('does not fetch private group data before sign-in', async () => {
    await render(false)
    expect(container.textContent).toContain('Sign in')
    expect(api.getTelegramLinkStatus).not.toHaveBeenCalled()
    expect(api.getTelegramGroups).not.toHaveBeenCalled()
  })
  it('offers verified Telegram connection without loading a global group catalog', async () => {
    vi.mocked(api.getTelegramLinkStatus).mockResolvedValue({ linked: false })
    vi.mocked(api.beginTelegramLink).mockResolvedValue({ url: 'https://t.me/test_bot?start=vc_link_example', expiresAt: 1, botUsername: 'test_bot' })
    await render()
    expect(api.getTelegramGroups).not.toHaveBeenCalled()
    await act(async () => button('Connect Telegram').click())
    expect(container.querySelector('a')?.textContent).toBe('Open Telegram and tap Start')
  })
  it('selects a named admin group and enables a call-specific 60-second rule explicitly', async () => {
    await render()
    expect(container.textContent).toContain('Our group')
    expect(api.getParticipants).not.toHaveBeenCalled()
    await choose()
    expect(api.getParticipants).toHaveBeenCalledWith(group.id)
    expect(container.textContent).toContain('Camera off')
    expect(api.setCameraPolicy).not.toHaveBeenCalled()
    await act(async () => button('Enable for this call').click())
    expect(api.setCameraPolicy).toHaveBeenCalledExactlyOnceWith(group.id, true, 60, 'call-1')
    expect(button('Turn off camera rule')).toBeDefined()
  })
  it('disables moderation while participant data is incomplete', async () => {
    vi.mocked(api.getParticipants).mockResolvedValue({ ...snapshot, complete: false })
    await render(); await choose()
    expect(button('Enable for this call').disabled).toBe(true)
    expect(container.textContent).toContain('not returned the full participant list')
    expect(api.muteParticipant).not.toHaveBeenCalled()
  })
  it('does not offer moderation when the user lacks call-management permission', async () => {
    vi.mocked(api.getTelegramGroups).mockResolvedValue({ groups: [{ ...group, userCanManageCalls: false }], botUsername: 'test_bot', discoveryPartial: false })
    await render(); await choose()
    expect(button('Enable for this call').disabled).toBe(true)
    expect(button('Mute microphone').disabled).toBe(true)
  })
  it('sends the selected group and current call with a manual microphone mute', async () => {
    await render(); await choose()
    await act(async () => button('Mute microphone').click())
    expect(api.muteParticipant).toHaveBeenCalledExactlyOnceWith(group.id, '123', 'call-1')
  })
})
