import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscFormation } from './DiscFormation'
import type { Disc } from './discs'

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

const DISCS: Disc[] = [
  { id: 'a', title: 'Alpha', subtitle: 'first', imageUrl: '/options/showcase/show-1.jpg', accent: '#8FC1FF' },
  { id: 'b', title: 'Beta', subtitle: 'second', imageUrl: '/options/showcase/show-2.jpg', accent: '#A78BFA' },
]

let container: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root?.unmount() })
  root = null
  container.remove()
})

function show(element: React.ReactElement) {
  act(() => { root?.render(element) })
}

function click(testId: string) {
  const el = container.querySelector(`[data-testid="${testId}"]`)
  if (!el) throw new Error(`missing ${testId}`)
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('DiscFormation', () => {
  it('renders one button per disc with accessible names', () => {
    show(createElement(DiscFormation, { discs: DISCS, locked: false }))
    expect(container.querySelector('[data-testid="disc-formation"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="disc-a"]')?.getAttribute('aria-label')).toBe('Alpha')
    expect(container.querySelector('[data-testid="disc-b"]')?.getAttribute('aria-label')).toBe('Beta')
  })
  it('docks the clicked disc with its metadata', () => {
    show(createElement(DiscFormation, { discs: DISCS, locked: false }))
    click('disc-b')
    expect(container.querySelector('[data-testid="docked-disc"]')?.textContent).toContain('Beta')
  })
  it('ignores clicks while locked', () => {
    show(createElement(DiscFormation, { discs: DISCS, locked: true }))
    click('disc-a')
    expect(container.querySelector('[data-testid="docked-disc"]')).toBeNull()
  })
})
