import { OPTIONS_MODES, type OptionsMode } from './mode'

const LABELS: Record<OptionsMode, string> = {
  orbit: 'Orbit Room',
  auras: 'Aura Discs',
  showcase: 'Showcase',
}

interface ModeSwitchProps {
  mode: OptionsMode
  onChange: (mode: OptionsMode) => void
}

export function ModeSwitch({ mode, onChange }: ModeSwitchProps): React.ReactElement {
  return (
    <div role="group" aria-label="Options mode" className="options-modeswitch">
      {OPTIONS_MODES.map((m) => (
        <button
          key={m}
          type="button"
          data-testid={`mode-${m}`}
          aria-pressed={m === mode}
          onClick={() => onChange(m)}
          className="options-modeswitch__button"
        >
          {LABELS[m]}
        </button>
      ))}
    </div>
  )
}
