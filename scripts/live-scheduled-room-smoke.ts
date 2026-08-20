import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { mintOperatorToken } from '../server/tokens'

const base = process.env.VC_SMOKE_HTTP_BASE || 'http://127.0.0.1:8797'
const phase = process.env.VC_SMOKE_PHASE || 'create'
const marker = process.env.VC_SMOKE_MARKER || '/data/scheduled-room-smoke-id'
const token = mintOperatorToken({ sub: 'smoke:schedule', platform: 'friskydev', name: 'Schedule Smoke' })
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

if (phase === 'create') {
  const scheduledFor = Date.now() + 24 * 60 * 60 * 1000
  const created = await fetch(`${base}/v1/rooms`, { method: 'POST', headers, body: JSON.stringify({ name: 'Persistent schedule smoke' }) })
  if (!created.ok) throw new Error(`Create failed: ${created.status}`)
  const { room } = await created.json() as { room: { id: string } }
  const scheduled = await fetch(`${base}/v1/rooms/${room.id}/schedule`, { method: 'PATCH', headers, body: JSON.stringify({ scheduledFor }) })
  if (!scheduled.ok) throw new Error(`Schedule failed: ${scheduled.status}`)
  writeFileSync(marker, room.id, { mode: 0o600 })
  process.stdout.write(JSON.stringify({ ok: true, created: true, scheduled: true }))
} else {
  const roomId = readFileSync(marker, 'utf8').trim()
  const found = await fetch(`${base}/v1/rooms/${roomId}`, { headers })
  if (!found.ok) throw new Error(`Scheduled room did not survive restart: ${found.status}`)
  const { room } = await found.json() as { room: { scheduledFor: number | null } }
  if (!room.scheduledFor || room.scheduledFor < Date.now()) throw new Error('Scheduled time was not persisted')
  await fetch(`${base}/v1/rooms/${roomId}`, { method: 'DELETE', headers })
  unlinkSync(marker)
  process.stdout.write(JSON.stringify({ ok: true, survivedRestart: true, scheduledTimePersisted: true, cleanedUp: true }))
}
