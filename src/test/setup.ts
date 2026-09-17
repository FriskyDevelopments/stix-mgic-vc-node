function createMockStorage(): Storage {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null
    },
    getItem(key: string) {
      return store[key] ?? null
    },
    setItem(key: string, value: string) {
      store[key] = String(value)
    },
    removeItem(key: string) {
      delete store[key]
    },
    clear() {
      store = {}
    },
  }
}

if (typeof window !== 'undefined' && !window.localStorage) {
  Object.defineProperty(window, 'localStorage', {
    value: createMockStorage(),
    writable: true,
    configurable: true,
  })
}

if (typeof globalThis !== 'undefined' && !globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMockStorage(),
    writable: true,
    configurable: true,
  })
}
