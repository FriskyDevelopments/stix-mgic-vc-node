import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NebuStudio } from './NebuStudio'

vi.mock('./RoomPanel', () => ({
  RoomPanel: () => createElement('div', { 'data-testid': 'room-panel' }, 'room-panel'),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices: vi.fn().mockResolvedValue([]) },
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Reflect.deleteProperty(navigator, 'mediaDevices')
  vi.unstubAllGlobals()
})

describe('NEBU studio', () => {
  it('lets someone open a room without a camera', async () => {
    await act(async () => root.render(createElement(NebuStudio)))
    expect(container.querySelector('[data-testid="nebu-studio"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="room-panel"]')).toBeNull()
    const listen = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === 'Join without camera')
    expect(listen).toBeTruthy()
    await act(async () => listen!.click())
    expect(container.querySelector('[data-testid="room-panel"]')).not.toBeNull()
  })
})
