import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { copy } from './copy.ts'
import { emptyDraft, STORAGE_KEY, STEPS } from './flow.ts'
import { OnboardingApp } from './OnboardingApp.tsx'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function memory() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
    raw: data,
  }
}

async function render(storage = memory(), reducedMotion = true) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<OnboardingApp storage={storage} reducedMotion={reducedMotion} now={() => '2026-11-12T00:00:00.000Z'} />)
  })
  return {
    container,
    storage,
    root,
    async click(label: string) {
      const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes(label))
      if (!button) throw new Error(`missing button ${label}`)
      await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    },
    async type(label: string, value: string) {
      const field = [...container.querySelectorAll('label')].find((item) => item.textContent?.includes(label))
      const input = field?.querySelector('input')
      if (!input) throw new Error(`missing field ${label}`)
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        setter?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      return input
    },
  }
}

describe('onboarding screen', () => {
  it('walks from the landing to an activated sample account without sending motion timers', async () => {
    const view = await render()
    expect(view.container.querySelector('h1')?.textContent).toBe(copy.steps.landing.title)
    expect(view.container.textContent).toContain(copy.banner)
    await view.click('Entrar al estudio')
    await view.click('Seguir')
    await view.type('Tu nombre', 'Rangel')
    await view.click('Continuar')
    await view.click('Agua')
    await view.click('Continuar')
    await view.click('Continuar')
    await view.click('Continuar')
    await view.click('Continuar')
    const ack = [...view.container.querySelectorAll('label')].find((label) => label.textContent?.includes('no cobra de verdad'))
    const box = ack?.querySelector('input')
    if (!box) throw new Error('missing acknowledgement')
    await act(async () => {
      box.click()
    })
    await view.click('Continuar')
    expect(view.container.querySelector('h1')?.textContent).toBe('Revisa antes de activar')
    expect(view.container.textContent).toContain('Rangel')
    await view.click('Activar cuenta de muestra')
    expect(view.container.querySelector('[data-step]')?.getAttribute('data-step')).toBe('activating')
    expect(view.container.textContent).toContain('Listo. Nombre de la casa')
    await view.click('Entrar al estudio')
    expect(view.container.querySelector('h1')?.textContent).toBe('El estudio está activo')
    expect(view.container.textContent).toContain('4e-4elementos-202611120000')
    view.root.unmount()
  })

  it('keeps the caret in the name field while typing', async () => {
    const view = await render()
    await view.click('Entrar al estudio')
    await view.click('Seguir')
    const input = await view.type('Tu nombre', 'Ra')
    input.focus()
    await view.type('Tu nombre', 'Rangel')
    expect(document.activeElement).toBe(input)
    view.root.unmount()
  })

  it('asks before wiping an activated sample', async () => {
    const storage = memory()
    storage.setItem(STORAGE_KEY, JSON.stringify({
      ...emptyDraft(),
      step: 'activated',
      ownerName: 'Rangel',
      element: 'agua',
      paymentsAcknowledged: true,
      activatedAt: '2026-11-12T00:00:00.000Z',
      accountId: '4e-test',
    }))
    const view = await render(storage)
    expect(view.container.querySelector('h1')?.textContent).toBe('El estudio está activo')
    await view.click('Empezar de nuevo')
    expect(view.container.textContent).toContain('Sí, borrar esta muestra')
    expect(view.container.querySelector('h1')?.textContent).toBe('El estudio está activo')
    await view.click('Sí, borrar esta muestra')
    expect(view.container.querySelector('h1')?.textContent).toBe('Cuatro elementos, un estudio')
    view.root.unmount()
  })

  it('ships a reduced-motion fallback in the stylesheet', () => {
    const css = readFileSync(resolve('golive/4elementos/onboarding/onboarding.css'), 'utf8')
    expect(css).toContain('prefers-reduced-motion')
    expect(css).toContain('animation: none')
    expect(css).toContain('.elementos--still .elementos-orb')
  })
})

describe('walkthrough', () => {
  it('names every screen and its heading', () => {
    const doc = readFileSync(resolve('golive/4elementos/WALKTHROUGH.md'), 'utf8')
    for (const step of STEPS) {
      expect(doc).toContain(step)
      expect(doc).toContain(copy.steps[step].title)
      expect(doc).toContain(copy.steps[step].primary)
    }
  })
})
