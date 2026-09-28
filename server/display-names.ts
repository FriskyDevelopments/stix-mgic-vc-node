import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// An alias is a VC presentation preference, never an identity or permission claim.
const memoryNames = new Map<string, string>()

function storagePath(): string | undefined {
  return process.env.DISPLAY_NAMES_PATH?.trim() ||
    (process.env.NODE_ENV === 'production' ? '/data/display-names.json' : undefined)
}

function normalizedName(name: unknown): string {
  // A display name must reject ASCII and C1 control characters.
  // eslint-disable-next-line no-control-regex
  if (typeof name !== 'string' || /[\u0000-\u001f\u007f-\u009f]/u.test(name)) {
    throw new Error('Display name must be 1–64 characters with no control characters')
  }
  const normalized = name.trim()
  if (!normalized || normalized.length > 64) {
    throw new Error('Display name must be 1–64 characters with no control characters')
  }
  return normalized
}

function preferenceKey(platform: string, sub: string): string {
  return JSON.stringify([platform, sub])
}

function loadNames(path: string): Map<string, string> {
  if (!existsSync(path)) return new Map()
  const stored = JSON.parse(readFileSync(path, 'utf8')) as {
    version?: unknown
    names?: unknown
  }
  if (stored?.version !== 1 || !stored.names || typeof stored.names !== 'object' || Array.isArray(stored.names)) {
    throw new Error('VC display-name preferences could not be loaded')
  }
  return new Map(Object.entries(stored.names).map(([key, name]) => [key, normalizedName(name)]))
}

/** Only call with an authenticated platform and subject; the alias changes neither. */
export function getPreferredDisplayName(platform: string, sub: string, fallback: string): string {
  const path = storagePath()
  const names = path ? loadNames(path) : memoryNames
  return names.get(preferenceKey(platform, sub)) ?? fallback
}

/** Save only the current authenticated user's explicitly chosen VC display name. */
export function savePreferredDisplayName(platform: string, sub: string, name: unknown): string {
  const normalized = normalizedName(name)
  const path = storagePath()
  const names = path ? loadNames(path) : memoryNames
  names.set(preferenceKey(platform, sub), normalized)
  if (!path) return normalized

  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporaryPath, JSON.stringify({ version: 1, names: Object.fromEntries(names) }), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    renameSync(temporaryPath, path)
  } finally {
    rmSync(temporaryPath, { force: true })
  }
  return normalized
}
