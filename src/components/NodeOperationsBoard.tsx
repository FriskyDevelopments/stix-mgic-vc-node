import { useEffect, useState } from 'react'
import { apiUrl } from '@/lib/api-client'
import '@/styles/node-ops.css'

type MediaAdapter = { id: string; state: 'ready' | 'degraded' | 'disabled' | 'not_implemented'; reason: string }
type NodeHealth = { ok: boolean; discordConfigured: boolean; discordInteractionsConfigured: boolean; discordBotConfigured: boolean; supabaseIdentityConfigured: boolean }
type Telemetry = { health: NodeHealth; adapters: MediaAdapter[] }
type Connection = 'checking' | 'live' | 'unreachable'

const label: Record<string, string> = { webrtc: 'Call rooms', 'telegram-vc': 'Telegram calls', rtmp: 'Broadcast connection' }
const pendingAdapters: MediaAdapter[] = Object.keys(label).map((id) => ({ id, state: 'disabled', reason: '' }))
function stateLabel(state: MediaAdapter['state']) { return state === 'ready' ? 'READY' : state === 'degraded' ? 'LIMITED' : 'WAITING' }
function connectionDescription(adapter: MediaAdapter) {
  if (adapter.state === 'disabled' || adapter.state === 'not_implemented') return 'Connection setup is needed.'
  if (adapter.state === 'degraded') return 'The connection is limited. Check it before starting.'
  if (adapter.id === 'telegram-vc') return 'Telegram is connected. Choose a group to check its permissions.'
  return adapter.id === 'webrtc' ? 'Ready to connect your call.' : 'Ready to receive your broadcast.'
}

async function readTelemetry(signal: AbortSignal): Promise<Telemetry> {
  const [health, media] = await Promise.all(['/healthz', '/v1/media/status'].map(async (path) => {
    const response = await fetch(apiUrl(path), { signal, cache: 'no-store' })
    if (!response.ok) throw new Error('Telemetry request failed')
    return response.json()
  }))
  if (health?.ok !== true || !['discordConfigured', 'discordInteractionsConfigured', 'discordBotConfigured', 'supabaseIdentityConfigured'].every((key) => typeof health[key] === 'boolean')) {
    throw new Error('Node health is unavailable')
  }
  if (!Array.isArray(media?.adapters) || !media.adapters.every((adapter: MediaAdapter) =>
    adapter && typeof adapter.id === 'string' && typeof adapter.reason === 'string' &&
    ['ready', 'degraded', 'disabled', 'not_implemented'].includes(adapter.state))) {
    throw new Error('Media status is unavailable')
  }
  return { health, adapters: media.adapters }
}

/** A read-only, live status surface for the Studio drawer. */
export function NodeOperationsBoard() {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null)
  const [connection, setConnection] = useState<Connection>('checking')
  useEffect(() => {
    let cancelled = false
    let controller: AbortController | null = null
    let timeout: number | undefined
    const refresh = async () => {
      if (controller) return
      const request = new AbortController()
      controller = request
      try {
        const deadline = new Promise<never>((_, reject) => {
          timeout = window.setTimeout(() => {
            request.abort()
            reject(new Error('Telemetry request timed out'))
          }, 8_000)
        })
        const nextTelemetry = await Promise.race([readTelemetry(request.signal), deadline])
        if (!cancelled) {
          setTelemetry(nextTelemetry)
          setConnection('live')
        }
      } catch {
        request.abort()
        if (!cancelled) {
          setTelemetry(null)
          setConnection('unreachable')
        }
      } finally {
        window.clearTimeout(timeout)
        controller = null
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15_000)
    return () => {
      cancelled = true
      controller?.abort()
      window.clearTimeout(timeout)
      window.clearInterval(timer)
    }
  }, [])

  const health = telemetry?.health
  const identityReady = Boolean(health?.supabaseIdentityConfigured)
  const discordReady = Boolean(health?.discordConfigured && health?.discordInteractionsConfigured && health?.discordBotConfigured)
  const unknownState = connection === 'checking' ? 'CHECKING' : 'UNKNOWN'
  const unknownReason = connection === 'checking' ? 'Waiting for node telemetry' : 'Node telemetry is unreachable; retrying automatically'

  return <section className="vc-ops-board" aria-label="VC Node operations" data-connection={connection}>
    <div className="vc-ops-heading"><span>NODE OPERATIONS</span><i /><small role="status">{connection === 'live' ? 'LIVE TELEMETRY' : connection.toUpperCase()}</small></div>
    <div className="vc-ops-grid">
      <div className={identityReady ? 'vc-ops-card is-ready' : 'vc-ops-card'}>
        <b>FRISKYDEV ID</b>
        <strong>{!health ? unknownState : identityReady ? 'FRISKYDEV SIGN-IN' : 'CONFIGURATION REQUIRED'}</strong>
        <em>{!health ? unknownReason : identityReady ? 'FriskyDev identity is configured' : 'FriskyDev identity is not configured'}</em>
      </div>
      {(telemetry?.adapters ?? pendingAdapters).filter((adapter) => adapter.id !== 'discord-voice').map((adapter) =>
        <div key={adapter.id} className={telemetry && adapter.state === 'ready' ? 'vc-ops-card is-ready' : 'vc-ops-card'}>
          <b>{label[adapter.id] || 'Connection'}</b><strong>{telemetry ? stateLabel(adapter.state) : unknownState}</strong><em>{telemetry ? connectionDescription(adapter) : unknownReason}</em>
        </div>
      )}
      <div className={discordReady ? 'vc-ops-card is-ready' : 'vc-ops-card'}>
        <b>DISCORD COMMANDS</b>
        <strong>{!health ? unknownState : discordReady ? 'READY' : 'CREDENTIALS REQUIRED'}</strong>
        <em>{!health ? unknownReason : discordReady ? 'Slash commands and operator link are configured' : 'Endpoint is deployed; add application credentials to activate'}</em>
      </div>
    </div>
  </section>
}
