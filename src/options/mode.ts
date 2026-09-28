export type OptionsMode = 'orbit' | 'auras' | 'showcase'

export const OPTIONS_MODES: OptionsMode[] = ['orbit', 'auras', 'showcase']

export const MODE_STORAGE_KEY = 'stix-vc-node:options-mode'

function isMode(value: unknown): value is OptionsMode {
  return value === 'orbit' || value === 'auras' || value === 'showcase'
}

export function resolveMode(search: string, storage: Pick<Storage, 'getItem'> | null): OptionsMode {
  try {
    const param = new URLSearchParams(search).get('mode')
    if (isMode(param)) return param
  } catch {
    // Malformed query string: fall through to storage, then default.
  }
  try {
    const stored = storage?.getItem(MODE_STORAGE_KEY)
    if (isMode(stored)) return stored
  } catch {
    // Storage unavailable: fall through to default.
  }
  return 'orbit'
}

export function persistMode(storage: Pick<Storage, 'setItem'> | null, mode: OptionsMode): void {
  try {
    storage?.setItem(MODE_STORAGE_KEY, mode)
  } catch {
    // Private-mode / unavailable storage must never break the page.
  }
}
