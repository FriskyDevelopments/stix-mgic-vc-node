import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPreferredDisplayName, savePreferredDisplayName } from './display-names'
import { resetServerEnvCache } from './env'
import { mintOperatorToken, verifyOperatorToken } from './tokens'

let directory: string
let path: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vc-display-names-'))
  path = join(directory, 'names.json')
  vi.stubEnv('DISPLAY_NAMES_PATH', path)
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('OPERATOR_TOKEN_SECRET', 'display-name-test-secret-value')
  vi.stubEnv('SESSION_ISSUER', 'display-name-test')
  vi.stubEnv('OPERATOR_TOKEN_TTL_SECONDS', '60')
  resetServerEnvCache()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  resetServerEnvCache()
  rmSync(directory, { recursive: true, force: true })
})

describe('VC display-name preferences', () => {
  it('isolates aliases by both authenticated platform and subject', () => {
    expect(savePreferredDisplayName('supabase', 'person-a', ' Frisky ')).toBe('Frisky')
    expect(getPreferredDisplayName('supabase', 'person-a', 'Provider Name')).toBe('Frisky')
    expect(getPreferredDisplayName('supabase', 'person-b', 'Other Name')).toBe('Other Name')
    expect(getPreferredDisplayName('telegram', 'person-a', 'Telegram Name')).toBe('Telegram Name')
    savePreferredDisplayName('supabase', '__proto__', 'Chosen Alias')
    expect(getPreferredDisplayName('supabase', '__proto__', 'Fallback')).toBe('Chosen Alias')
    expect(getPreferredDisplayName('supabase', 'constructor', 'Fallback')).toBe('Fallback')
  })

  it('persists across module reloads in a private atomic file', async () => {
    savePreferredDisplayName('supabase', 'person-a', 'Frisky')
    savePreferredDisplayName('supabase', 'person-b', 'Second Alias')
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(readdirSync(directory)).toEqual(['names.json'])
    vi.resetModules()
    const reloaded = await import('./display-names')
    expect(reloaded.getPreferredDisplayName('supabase', 'person-a', 'Old Name')).toBe('Frisky')
    expect(reloaded.getPreferredDisplayName('supabase', 'person-b', 'Old Name')).toBe('Second Alias')
  })

  it.each([null, 42, {}, '', '   ', 'x'.repeat(65), 'line\nbreak', 'tab\tname', 'nul\u0000name', 'del\u007fname'])('rejects an invalid alias without replacing the saved preference: %j', (name) => {
    savePreferredDisplayName('supabase', 'person-a', 'Frisky')
    const before = readFileSync(path, 'utf8')
    expect(() => savePreferredDisplayName('supabase', 'person-a', name)).toThrow('Display name must be')
    expect(readFileSync(path, 'utf8')).toBe(before)
    expect(getPreferredDisplayName('supabase', 'person-a', 'Old Name')).toBe('Frisky')
  })

  it('accepts the length boundary and trims surrounding spaces', () => {
    expect(savePreferredDisplayName('supabase', 'person-a', `  ${'x'.repeat(64)}  `)).toBe('x'.repeat(64))
  })

  it('uses memory without creating a file in nonproduction unless a path is configured', () => {
    vi.stubEnv('DISPLAY_NAMES_PATH', '')
    savePreferredDisplayName('supabase', directory, 'Memory Alias')
    expect(getPreferredDisplayName('supabase', directory, 'Old Name')).toBe('Memory Alias')
    expect(readdirSync(directory)).toEqual([])
  })
})

describe('display names on authenticated operator sessions', () => {
  it('applies a new alias to an existing signed cookie without changing authorization claims', () => {
    const token = mintOperatorToken({ sub: 'person-a', platform: 'supabase', name: 'Provider Name', accountId: 'account-a' })
    const original = verifyOperatorToken(token)!
    savePreferredDisplayName('supabase', 'person-a', 'Frisky')
    expect(verifyOperatorToken(token)).toEqual({ ...original, name: 'Frisky' })
    const nextToken = mintOperatorToken({ sub: 'person-a', platform: 'supabase', name: 'Provider Name', accountId: 'account-a' })
    expect(JSON.parse(Buffer.from(nextToken.split('.')[0], 'base64url').toString('utf8'))).toMatchObject({
      sub: 'person-a', platform: 'supabase', name: 'Frisky', accountId: 'account-a',
    })
  })

  it('does not authenticate a forged token by matching a preferred name', () => {
    savePreferredDisplayName('supabase', 'person-a', 'Frisky')
    const token = mintOperatorToken({ sub: 'person-b', platform: 'supabase', name: 'Other Name' })
    const [payload, signature] = token.split('.')
    const forged = { ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')), sub: 'person-a' }
    expect(verifyOperatorToken(`${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${signature}`)).toBeNull()
    expect(verifyOperatorToken(token)?.name).toBe('Other Name')
  })

  it('keeps expired and wrong-issuer sessions rejected after a preference is saved', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-06T12:00:00Z'))
    const token = mintOperatorToken({ sub: 'person-a', platform: 'supabase', name: 'Provider Name' })
    savePreferredDisplayName('supabase', 'person-a', 'Frisky')
    vi.setSystemTime(new Date('2026-09-06T12:01:01Z'))
    expect(verifyOperatorToken(token)).toBeNull()
    vi.setSystemTime(new Date('2026-09-06T12:00:00Z'))
    vi.stubEnv('SESSION_ISSUER', 'a-different-node')
    resetServerEnvCache()
    expect(verifyOperatorToken(token)).toBeNull()
  })
})
