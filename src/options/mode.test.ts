import { describe, expect, it } from 'vitest'
import { persistMode, resolveMode, MODE_STORAGE_KEY } from './mode'

function memStore(initial: Record<string, string> = {}): Storage {
  const store: Record<string, string> = { ...initial }
  return {
    get length() { return Object.keys(store).length },
    key(i: number) { return Object.keys(store)[i] ?? null },
    getItem(k: string) { return store[k] ?? null },
    setItem(k: string, v: string) { store[k] = String(v) },
    removeItem(k: string) { delete store[k] },
    clear() { for (const k of Object.keys(store)) delete store[k] },
  }
}

describe('resolveMode', () => {
  it('prefers a valid ?mode= param', () => {
    expect(resolveMode('?mode=auras', memStore({ [MODE_STORAGE_KEY]: 'showcase' }))).toBe('auras')
  })
  it('falls back to stored mode when param is missing', () => {
    expect(resolveMode('', memStore({ [MODE_STORAGE_KEY]: 'showcase' }))).toBe('showcase')
  })
  it('falls back to orbit on bogus param and bogus storage', () => {
    expect(resolveMode('?mode=bogus', memStore({ [MODE_STORAGE_KEY]: 'nope' }))).toBe('orbit')
  })
  it('tolerates null storage', () => {
    expect(resolveMode('', null)).toBe('orbit')
    expect(() => persistMode(null, 'auras')).not.toThrow()
  })
})
