export type CameraRequestPromptProps = {
  fromName: string
  onEnable: () => void
  onNotNow: () => void
}

/**
 * Participant-facing consent UI.
 * Copy must never imply secret camera activation.
 */
export function CameraRequestPrompt({ fromName, onEnable, onNotNow }: CameraRequestPromptProps) {
  return (
    <div className="nebu-cam-request" role="dialog" aria-label="Camera request">
      <p>
        <strong>Host is requesting your camera</strong>
        <br />
        {fromName} asked you to enable your camera. Nothing turns on until you choose Enable Camera.
      </p>
      <div className="nebu-hc-row">
        <button type="button" className="nebu-hc-btn" onClick={onEnable}>
          Enable Camera
        </button>
        <button type="button" className="nebu-hc-btn is-quiet" onClick={onNotNow}>
          Not Now
        </button>
      </div>
    </div>
  )
}
