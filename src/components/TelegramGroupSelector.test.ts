import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TelegramGroupSelector } from './TelegramGroupSelector'
import { getTelegramGroups } from '@/lib/telegram-vc-api'

vi.mock('@/lib/telegram-vc-api', () => ({ getTelegramGroups: vi.fn() }))
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.mocked(getTelegramGroups).mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
const props = { accessGranted: true, connected: true, value: '', onChange: vi.fn() }

it('does not request groups before sign-in and pairing', async () => {
  await act(async () => root.render(createElement(TelegramGroupSelector, { ...props, accessGranted: false })))
  expect(getTelegramGroups).not.toHaveBeenCalled()
  await act(async () => root.render(createElement(TelegramGroupSelector, { ...props, connected: false })))
  expect(getTelegramGroups).not.toHaveBeenCalled()
})

it('loads the dropdown automatically and only selects when the user chooses a group', async () => {
  vi.mocked(getTelegramGroups).mockResolvedValue({ groups: [{ id: 'group-1', title: 'Music room', kind: 'group' }] } as Awaited<ReturnType<typeof getTelegramGroups>>)
  const onChange = vi.fn()
  await act(async () => root.render(createElement(TelegramGroupSelector, { ...props, onChange })))
  expect(getTelegramGroups).toHaveBeenCalledTimes(1)
  expect(host.textContent).toContain('Music room')
  expect(onChange).not.toHaveBeenCalled()
  const select = host.querySelector('select')!
  await act(async () => { select.value = 'group-1'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(onChange).toHaveBeenCalledExactlyOnceWith('group-1')
  expect(getTelegramGroups).toHaveBeenCalledTimes(1)
})

it('does not reveal a late group response after signing out', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof getTelegramGroups>>) => void
  vi.mocked(getTelegramGroups).mockReturnValue(new Promise(done => { resolve = done }))
  await act(async () => root.render(createElement(TelegramGroupSelector, props)))
  await act(async () => root.render(createElement(TelegramGroupSelector, { ...props, accessGranted: false })))
  await act(async () => resolve({ groups: [{ id: 'private', title: 'Private group', kind: 'group' }] } as Awaited<ReturnType<typeof getTelegramGroups>>))
  expect(host.textContent).not.toContain('Private group')
  expect(host.textContent).toContain('Sign in')
})

it('shows an actionable inline error instead of raw provider failures', async () => {
  vi.mocked(getTelegramGroups).mockRejectedValue(new Error('INTERNAL_PROVIDER_ERROR'))
  await act(async () => root.render(createElement(TelegramGroupSelector, props)))
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Check the connection')
  expect(host.textContent).not.toContain('INTERNAL_PROVIDER_ERROR')
})
