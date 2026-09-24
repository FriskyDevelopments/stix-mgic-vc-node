import { cn } from '@/lib/utils'
import type { Disc } from './discs'

interface PictureDiscProps {
  disc: Disc
  size: number
  spinning: boolean
  selected: boolean
  onSelect: () => void
}

export function PictureDisc({ disc, size, spinning, selected, onSelect }: PictureDiscProps): React.ReactElement {
  return (
    <button
      type="button"
      data-testid={`disc-${disc.id}`}
      aria-label={disc.title}
      onClick={onSelect}
      className={cn(
        'options-disc relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        selected && 'options-disc--selected',
      )}
      style={{
        width: size,
        height: size,
        borderColor: selected ? disc.accent : 'rgba(255,255,255,0.14)',
        boxShadow: `0 0 28px ${disc.accent}55, 0 8px 30px rgba(0,0,0,0.55)`,
        animationPlayState: spinning ? 'running' : 'paused',
      }}
    >
      <img
        src={disc.imageUrl}
        alt=""
        loading="lazy"
        draggable={false}
        className="absolute inset-0 h-full w-full rounded-full object-cover"
      />
      <span aria-hidden="true" className="options-disc__grooves absolute inset-0 rounded-full" />
      <span aria-hidden="true" className="options-disc__sheen absolute inset-0 rounded-full" />
      <span
        aria-hidden="true"
        className="options-disc__label absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
        style={{ background: '#0A0C11', border: `2px solid ${disc.accent}` }}
      >
        <span className="options-disc__hole block rounded-full" style={{ background: disc.accent }} />
      </span>
    </button>
  )
}
