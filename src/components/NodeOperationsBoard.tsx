import { useEffect, useState } from 'react'
import '@/styles/node-ops.css'

type MediaAdapter = { id: string; state: 'ready' | 'degraded' | 'disabled' | 'not_implemented'; reason: string }
type NodeHealth = { ok: boolean; telegramConfigured: boolean; discordConfigured: boolean; discordInteractionsConfigured: boolean; discordBotConfigured: boolean; supabaseIdentityConfigured: boolean }

const label: Record<string, string> = { webrtc: 'WebRTC rooms', 'telegram-vc': 'Telegram VC', rtmp: 'RTMP ingest' }
function stateLabel(state: MediaAdapter['state']) { return state === 'ready' ? 'READY' : state === 'degraded' ? 'LIMITED' : 'WAITING' }

/** A read-only, live status surface for the Studio drawer. */
export function NodeOperationsBoard() {
  const [health, setHealth] = useState<NodeHealth | null>(null)
  const [adapters, setAdapters] = useState<MediaAdapter[]>([])
  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const [healthResponse, mediaResponse] = await Promise.all([fetch('/healthz'), fetch('/v1/media/status')])
        const nextHealth = (await healthResponse.json()) as NodeHealth
        const media = (await mediaResponse.json()) as { adapters?: MediaAdapter[] }
        if (!cancelled) { setHealth(nextHealth); setAdapters(media.adapters || []) }
      } catch { /* preserve the last known state */ }
    }
    void refresh(); const timer = window.setInterval(() => void refresh(), 15_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])
  const identityReady = Boolean(health?.supabaseIdentityConfigured)
  const discordReady = Boolean(health?.discordConfigured && health?.discordInteractionsConfigured && health?.discordBotConfigured)
  return <section className="vc-ops-board" aria-label="VC Node operations"><div className="vc-ops-heading"><span>NODE OPERATIONS</span><i /><small>{health?.ok ? 'LIVE TELEMETRY' : 'CHECKING'}</small></div><div className="vc-ops-grid"><div className={identityReady ? 'vc-ops-card is-ready' : 'vc-ops-card'}><b>FRISKYDEV ID</b><strong>{identityReady ? 'GOOGLE · APPLE · MICROSOFT' : 'CONFIGURATION REQUIRED'}</strong><em>{identityReady ? 'Primary social access is online' : 'Social identity is unavailable'}</em></div>{adapters.filter((adapter) => adapter.id !== 'discord-voice').map((adapter) => <div key={adapter.id} className={adapter.state === 'ready' ? 'vc-ops-card is-ready' : 'vc-ops-card'} title={adapter.reason}><b>{label[adapter.id] || adapter.id}</b><strong>{stateLabel(adapter.state)}</strong><em>{adapter.reason}</em></div>)}<div className={discordReady ? 'vc-ops-card is-ready' : 'vc-ops-card'}><b>DISCORD COMMANDS</b><strong>{discordReady ? 'READY' : 'CREDENTIALS REQUIRED'}</strong><em>{discordReady ? 'Slash commands and operator link are online' : 'Endpoint is deployed; add application credentials to activate'}</em></div></div></section>
}
