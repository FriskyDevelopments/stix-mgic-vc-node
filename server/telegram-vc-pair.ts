import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getServerEnv } from './env'

// This directory is the VC Node's mounted /data volume in production. Telegram's user
// session stays server-side with 0600 permissions; it is never returned by any API.
const ROOT = process.env.MTPROTO_STATE_DIR || '/data/mtproto'
const pendingPath = `${ROOT}/pending.json`
const verifiedPath = `${ROOT}/verified.json`
const sessionPath = `${ROOT}/operator`
const helper = process.env.MTPROTO_PYTHON || 'python3'
const script = resolve(process.cwd(), 'scripts/mtproto_canary_pair.py')

type Pending = { phone: string; phoneCodeHash: string; createdAt: number }
type Verified = { id: string; username: string; verifiedAt: number }

function helperEnv(): NodeJS.ProcessEnv | null {
  const env = getServerEnv()
  if (!env.mtprotoConfigured) return null
  mkdirSync(ROOT, { recursive: true, mode: 0o700 })
  return {
    ...process.env,
    STIX_TELEGRAM_API_ID: String(env.STIX_TELEGRAM_API_ID),
    STIX_TELEGRAM_API_HASH: env.STIX_TELEGRAM_API_HASH,
    STIX_MTPROTO_SESSION_PATH: sessionPath,
  }
}

function run(args: string[], sensitive: { password?: string } = {}): Promise<Record<string, string>> {
  const env = helperEnv()
  if (!env) return Promise.reject(new Error('MTProto pairing is not prepared on this node'))
  // Do not put a two-step password on the process command line, where it could be
  // visible to process inspection. It exists only in this short-lived child environment.
  if (sensitive.password) env.STIX_TELEGRAM_TWO_STEP_PASSWORD = sensitive.password
  return new Promise((resolve, reject) => {
    const child = spawn(helper, [script, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (value) => { stdout += String(value) })
    child.stderr.on('data', (value) => { stderr += String(value) })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || 'Telegram pairing failed'))
      try { resolve(JSON.parse(stdout)) } catch { reject(new Error('Telegram pairing returned an invalid response')) }
    })
  })
}

export function pairingStatus() {
  const env = getServerEnv()
  const awaitingCode = existsSync(pendingPath)
  const verified = existsSync(verifiedPath)
    ? JSON.parse(readFileSync(verifiedPath, 'utf8')) as Verified
    : null
  return { available: env.mtprotoConfigured, awaitingCode, verified }
}

export async function beginPairing(phone: string) {
  const normalizedPhone = phone.replace(/[\s()-]/g, '')
  if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
    throw new Error('Enter the dedicated Telegram account number in international format, e.g. +521…')
  }
  const result = await run(['start', '--phone', normalizedPhone])
  if (!result.phone_code_hash) throw new Error('Telegram did not return a verification challenge')
  writeFileSync(pendingPath, JSON.stringify({ phone: normalizedPhone, phoneCodeHash: result.phone_code_hash, createdAt: Date.now() } satisfies Pending), { mode: 0o600 })
  return { awaitingCode: true }
}

export async function confirmPairing(code: string, password?: string) {
  if (!/^[0-9]{4,8}$/.test(code)) throw new Error('Enter the numeric Telegram verification code')
  if (!existsSync(pendingPath)) throw new Error('Request a new Telegram code first')
  const pending = JSON.parse(readFileSync(pendingPath, 'utf8')) as Pending
  const args = ['confirm', '--phone', pending.phone, '--code', code, '--phone-code-hash', pending.phoneCodeHash]
  // A two-step password is passed directly to the short-lived child and never persisted.
  const result = await run(args, { password })
  const verified: Verified = { id: result.id || '', username: result.username || '', verifiedAt: Date.now() }
  writeFileSync(verifiedPath, JSON.stringify(verified), { mode: 0o600 })
  unlinkSync(pendingPath)
  return verified
}
