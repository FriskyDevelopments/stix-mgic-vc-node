import type { HostNudge } from '@/lib/nebu-host-controls'

export type HostTransmissionProps = {
  nudges: HostNudge[]
  limit?: number
}

/** Host nudges as Nebu transmissions — not generic toasts. */
export function HostTransmission({ nudges, limit = 4 }: HostTransmissionProps) {
  const items = nudges.slice(-limit).reverse()
  if (items.length === 0) return null
  return (
    <div className="nebu-tx" aria-live="polite">
      {items.map((nudge) => (
        <div key={nudge.id} className="nebu-tx-item">
          <strong>Nebu transmission</strong>
          {nudge.message}
        </div>
      ))}
    </div>
  )
}
