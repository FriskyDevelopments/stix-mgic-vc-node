import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Disc } from './discs'
import { PictureDisc } from './PictureDisc'

interface DiscFormationProps {
  discs: Disc[]
  locked: boolean
}

export function DiscFormation({ discs, locked }: DiscFormationProps): React.ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = discs.find((d) => d.id === selectedId) ?? null
  const mid = (discs.length - 1) / 2

  return (
    <div data-testid="disc-formation" className="options-formation">
      <div
        aria-disabled={locked || undefined}
        className={cn('options-formation__arc', locked && 'options-formation--locked')}
      >
        {discs.map((disc, i) => (
          <div
            key={disc.id}
            className="options-formation__slot"
            style={{ transform: `translateY(${Math.abs(i - mid) * 14}px)` }}
          >
            <PictureDisc
              disc={disc}
              size={selectedId === disc.id ? 168 : 128}
              spinning={!locked}
              selected={selectedId === disc.id}
              disabled={locked}
              onSelect={() => {
                if (locked) return
                setSelectedId((prev) => (prev === disc.id ? null : disc.id))
              }}
            />
          </div>
        ))}
      </div>
      {selected && !locked && (
        <div data-testid="docked-disc" aria-live="polite" className="options-docked" style={{ borderColor: `${selected.accent}66` }}>
          <p className="options-docked__title">{selected.title}</p>
          <p className="options-docked__subtitle">{selected.subtitle}</p>
        </div>
      )}
    </div>
  )
}
