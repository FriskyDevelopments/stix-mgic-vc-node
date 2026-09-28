import type { BusyNoteState } from '@/lib/nebu-host-controls'

export type BusyNoteProps = {
  note: BusyNoteState
  onClear?: () => void
  compact?: boolean
}

/** Light Busy Note stub styled for Nebu — keeps mini actions off the full UI. */
export function BusyNote({ note, onClear, compact }: BusyNoteProps) {
  if (!note.active) return null
  return (
    <div className="nebu-busy" role="status">
      <span>{compact ? note.label : `Busy Note · ${note.label}`}</span>
      {note.resumeHint && <span> · {note.resumeHint}</span>}
      {onClear && (
        <button type="button" className="nebu-hc-btn is-quiet" style={{ marginLeft: 8 }} onClick={onClear}>
          Clear
        </button>
      )}
    </div>
  )
}
