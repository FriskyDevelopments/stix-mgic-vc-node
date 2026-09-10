import {
  ArrowsOut,
  Microphone,
  MicrophoneSlash,
  VideoCamera,
  VideoCameraSlash,
  SlidersHorizontal,
} from '@phosphor-icons/react'
import type { HostControlAction, HostSessionSnapshot, MiniWidgetSize } from '@/lib/nebu-host-controls'
import { BusyNote } from '@/components/nebu/BusyNote'
import '@/styles/nebu-motion.css'
import '@/styles/nebu-host-controls.css'

export type MiniControlWidgetProps = {
  snapshot: HostSessionSnapshot
  dispatch: (action: HostControlAction) => void
  onToggleMic?: () => void
  onToggleCamera?: () => void
  onOpenHostControls?: () => void
}

const SIZES: MiniWidgetSize[] = ['compact', 'standard', 'expanded_mini']

/**
 * Nebu Mini Control Widget — mini player + live control surface, not a dashboard.
 * FULL ↔ MINI preserves session/participant/host/cam/mic/Busy Note/alerts/pending requests.
 */
export function MiniControlWidget({
  snapshot,
  dispatch,
  onToggleMic,
  onToggleCamera,
  onOpenHostControls,
}: MiniControlWidgetProps) {
  if (snapshot.chromeMode !== 'mini' || snapshot.room.ended) return null

  const cycleSize = () => {
    const idx = SIZES.indexOf(snapshot.miniSize)
    dispatch({ type: 'set_mini_size', size: SIZES[(idx + 1) % SIZES.length] })
  }

  const attention = snapshot.attention

  return (
    <aside
      className="nebu-hc nebu-mini nebu-hc-collapse"
      data-size={snapshot.miniSize}
      aria-label="Nebu mini control widget"
    >
      <div className="nebu-mini-top">
        <span className="nebu-mini-live">
          <i className={snapshot.callLive ? 'nebu-live-pulse' : undefined} />
          {snapshot.callLive ? 'LIVE' : 'READY'}
        </span>
        <button type="button" className="nebu-hc-btn is-quiet" onClick={cycleSize} aria-label="Cycle mini size">
          {snapshot.miniSize === 'compact' ? 'S' : snapshot.miniSize === 'standard' ? 'M' : 'L'}
        </button>
      </div>

      {snapshot.miniSize !== 'compact' && (
        <BusyNote note={snapshot.busyNote} compact />
      )}

      {attention && snapshot.miniSize !== 'compact' && (
        <button
          type="button"
          className="nebu-mini-attention"
          onClick={() => {
            if (attention.actionId === 'respond_camera_request') {
              // Surface already shows prompt in HostControls; expand full for exact fix.
              dispatch({ type: 'set_chrome_mode', mode: 'full' })
              return
            }
            if (attention.actionId === 'open_host_controls') {
              dispatch({ type: 'set_chrome_mode', mode: 'full' })
              onOpenHostControls?.()
              return
            }
            if (attention.actionId === 'nudge_check_connection' && attention.participantId) {
              dispatch({
                type: 'send_nudge',
                kind: 'check_connection',
                participantId: attention.participantId,
              })
              dispatch({ type: 'resolve_attention', id: attention.id })
              return
            }
            if (attention.actionId === 'nudge_check_mic' && attention.participantId) {
              dispatch({
                type: 'send_nudge',
                kind: 'check_mic',
                participantId: attention.participantId,
              })
              dispatch({ type: 'resolve_attention', id: attention.id })
              return
            }
            dispatch({ type: 'set_chrome_mode', mode: 'full' })
          }}
        >
          <strong>{attention.title}</strong>
          {attention.detail}
        </button>
      )}

      <div className="nebu-mini-dock">
        <button
          type="button"
          className={!snapshot.localMicEnabled ? 'is-off' : ''}
          aria-label={snapshot.localMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
          onClick={() => onToggleMic?.()}
        >
          {snapshot.localMicEnabled ? <Microphone size={18} /> : <MicrophoneSlash size={18} />}
        </button>
        <button
          type="button"
          className={!snapshot.localCameraEnabled ? 'is-off' : ''}
          aria-label={snapshot.localCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
          onClick={() => onToggleCamera?.()}
        >
          {snapshot.localCameraEnabled ? <VideoCamera size={18} /> : <VideoCameraSlash size={18} />}
        </button>
        <button
          type="button"
          aria-label="Open host controls"
          onClick={() => {
            dispatch({ type: 'set_chrome_mode', mode: 'full' })
            onOpenHostControls?.()
          }}
        >
          <SlidersHorizontal size={18} />
        </button>
        <button
          type="button"
          aria-label="Restore full Nebu"
          onClick={() => dispatch({ type: 'set_chrome_mode', mode: 'full' })}
        >
          <ArrowsOut size={18} />
        </button>
      </div>

      {snapshot.miniSize === 'expanded_mini' && snapshot.incomingCameraRequest && (
        <div className="nebu-cam-request">
          <p>
            <strong>Host is requesting your camera</strong>
          </p>
          <div className="nebu-hc-row">
            <button
              type="button"
              className="nebu-hc-btn"
              onClick={() => dispatch({ type: 'camera_request_response', accepted: true })}
            >
              Enable Camera
            </button>
            <button
              type="button"
              className="nebu-hc-btn is-quiet"
              onClick={() => dispatch({ type: 'camera_request_response', accepted: false })}
            >
              Not Now
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
