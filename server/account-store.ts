import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export type FriskyDevAccount = {
  id: string
  email: string
  displayName: string
  passwordHash: string
  passwordSalt: string
  createdAt: number
  status: 'active' | 'disabled'
}

export type LinkedIdentity = {
  id: string
  accountId: string
  platform: 'telegram' | 'discord'
  externalSubject: string
  displayName: string
  meta?: Record<string, unknown>
  verifiedAt: number
}

type StoreShape = {
  accounts: FriskyDevAccount[]
  identities: LinkedIdentity[]
}

const DEFAULT_PATH = resolve(process.cwd(), 'data', 'friskydev-accounts.json')

let memoryStore: StoreShape = { accounts: [], identities: [] }
let storePath = DEFAULT_PATH
let persistEnabled = true

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex')
}

function loadFromDisk(): void {
  if (!persistEnabled) return
  try {
    if (!existsSync(storePath)) {
      memoryStore = { accounts: [], identities: [] }
      return
    }
    const raw = readFileSync(storePath, 'utf8')
    memoryStore = JSON.parse(raw) as StoreShape
    memoryStore.accounts ||= []
    memoryStore.identities ||= []
  } catch {
    memoryStore = { accounts: [], identities: [] }
  }
}

function saveToDisk(): void {
  if (!persistEnabled) return
  mkdirSync(dirname(storePath), { recursive: true })
  writeFileSync(storePath, JSON.stringify(memoryStore, null, 2), 'utf8')
}

export function configureAccountStore(options?: { path?: string; persist?: boolean }): void {
  storePath = options?.path || DEFAULT_PATH
  persistEnabled = options?.persist !== false
  loadFromDisk()
}

export function resetAccountStore(): void {
  memoryStore = { accounts: [], identities: [] }
  if (persistEnabled && existsSync(storePath)) {
    writeFileSync(storePath, JSON.stringify(memoryStore, null, 2), 'utf8')
  }
}

function ensureLoaded(): void {
  if (memoryStore.accounts.length === 0 && memoryStore.identities.length === 0 && persistEnabled) {
    loadFromDisk()
  }
}

export function createAccount(input: {
  email: string
  password: string
  displayName: string
}): FriskyDevAccount {
  ensureLoaded()
  const email = input.email.trim().toLowerCase()
  if (!email || !input.password || input.password.length < 8) {
    throw new Error('Valid email and password (min 8 chars) are required')
  }
  if (memoryStore.accounts.some((a) => a.email === email)) {
    throw new Error('Account already exists')
  }

  const salt = randomBytes(16).toString('hex')
  const account: FriskyDevAccount = {
    id: crypto.randomUUID(),
    email,
    displayName: input.displayName.trim() || email.split('@')[0],
    passwordHash: hashPassword(input.password, salt),
    passwordSalt: salt,
    createdAt: Date.now(),
    status: 'active',
  }
  memoryStore.accounts.push(account)
  saveToDisk()
  return account
}

export function authenticateAccount(email: string, password: string): FriskyDevAccount | null {
  ensureLoaded()
  const normalized = email.trim().toLowerCase()
  const account = memoryStore.accounts.find((a) => a.email === normalized && a.status === 'active')
  if (!account) return null

  const computed = Buffer.from(hashPassword(password, account.passwordSalt), 'hex')
  const expected = Buffer.from(account.passwordHash, 'hex')
  if (computed.length !== expected.length || !timingSafeEqual(computed, expected)) {
    return null
  }
  return account
}

export function getAccountById(id: string): FriskyDevAccount | null {
  ensureLoaded()
  return memoryStore.accounts.find((a) => a.id === id && a.status === 'active') || null
}

export function listLinkedIdentities(accountId: string): LinkedIdentity[] {
  ensureLoaded()
  return memoryStore.identities.filter((i) => i.accountId === accountId)
}

export function linkIdentity(input: {
  accountId: string
  platform: 'telegram' | 'discord'
  externalSubject: string
  displayName: string
  meta?: Record<string, unknown>
}): LinkedIdentity {
  ensureLoaded()
  const existing = memoryStore.identities.find(
    (i) => i.platform === input.platform && i.externalSubject === input.externalSubject
  )
  if (existing && existing.accountId !== input.accountId) {
    throw new Error('Identity already linked to another FriskyDev account')
  }
  if (existing) {
    existing.displayName = input.displayName
    existing.meta = input.meta
    existing.verifiedAt = Date.now()
    saveToDisk()
    return existing
  }

  // One identity per platform per account
  memoryStore.identities = memoryStore.identities.filter(
    (i) => !(i.accountId === input.accountId && i.platform === input.platform)
  )

  const row: LinkedIdentity = {
    id: createHash('sha256')
      .update(`${input.platform}:${input.externalSubject}`)
      .digest('hex')
      .slice(0, 32),
    accountId: input.accountId,
    platform: input.platform,
    externalSubject: input.externalSubject,
    displayName: input.displayName,
    meta: input.meta,
    verifiedAt: Date.now(),
  }
  memoryStore.identities.push(row)
  saveToDisk()
  return row
}

export function unlinkIdentity(accountId: string, platform: 'telegram' | 'discord'): boolean {
  ensureLoaded()
  const before = memoryStore.identities.length
  memoryStore.identities = memoryStore.identities.filter(
    (i) => !(i.accountId === accountId && i.platform === platform)
  )
  const changed = memoryStore.identities.length !== before
  if (changed) saveToDisk()
  return changed
}

export function publicAccount(account: FriskyDevAccount) {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    createdAt: account.createdAt,
  }
}
