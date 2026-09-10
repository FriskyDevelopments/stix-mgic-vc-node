import { useMemo, useState } from 'react'
import {
  cameraRequestLabel,
  micLabel,
  type HostControlAction,
  type HostNudgeKind,
  type HostSessionSnapshot,
} from '@/lib/nebu-host-controls'
import { BusyNote } from '@/components/nebu/BusyNote'
import { CameraRequestPrompt } from '@/components/nebu/CameraRequestPrompt'
import { HostTransmission } from '@/components/nebu/HostTransmission'
import '@/styles/nebu-motion.css'
import '@/styles/nebu-host-controls.css'

export type HostControlsProps = {
  snapshot: HostSessionSnapshot
  dispatch: (action: HostControlAction) => void
  /** Progressive disclosure — quiet until the host opens it. */
  defaultOpen?: boolean
}

const NUDGE_OPTIONS: Array<{ kind: HostNudgeKind; label: string }> = [
  { kind: 'please_turn_on_camera', label: 'Please turn on camera' },
  { kind: 'please_unmute', label: 'Please unmute' },
  { kind: 'check_mic', label: 'Check mic' },
  { kind: 'check_connection', label: 'Check connection' },
  { kind: 'stand_by', label: 'Stand by' },
  { kind: 'youre_live_next', label: "You're live next" },
  { kind: 'host_needs_attention', label: 'Host needs attention' },
]

export function HostControls({ snapshot, dispatch, defaultOpen = false }: HostControlsProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [customNotice, setCustomNotice] = useState('')
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const selected = useMemo(
    () => snapshot.participants.find((p) => p.id === snapshot.selectedParticipantId) ?? null,
    [snapshot.participants, snapshot.selectedParticipantId]
  )

  if (!snapshot.callLive && snapshot.participants.length === 0 && !snapshot.incomingCameraRequest) {
    return null
  }

  return (
    <section className="nebu-hc nebu-hc-panel" aria-label="Nebu host controls">
      <div className="nebu-hc-person-head">
        <div>
          <div className="nebu-hc-kicker">Nebu · Host Controls</div>
          <h3 className="nebu-hc-title">Quiet until needed</h3>
        </div>
        <div className="nebu-hc-row" style={{ marginTop: 0 }}>
          <span className={`nebu-hc-chip ${snapshot.callLive ? 'is-live' : ''}`}>
            {snapshot.callLive ? 'Live' : 'Standby'}
          </span>
          <button type="button" className="nebu-hc-btn is-quiet" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Open'}
          </button>
          <button
            type="button"
            className="nebu-hc-btn is-quiet"
            onClick={() => dispatch({ type: 'set_chrome_mode', mode: 'mini' })}
          >
            Mini
          </button>
        </div>
      </div>

      <BusyNote
        note={snapshot.busyNote}
        onClear={() => dispatch({ type: 'set_busy_note', note: { active: false, label: '' } })}
      />

      {snapshot.incomingCameraRequest && (
        <CameraRequestPrompt
          fromName={snapshot.incomingCameraRequest.fromName}
          onEnable={() => dispatch({ type: 'camera_request_response', accepted: true })}
          onNotNow={() => dispatch({ type: 'camera_request_response', accepted: false })}
        />
      )}

      {snapshot.incomingUnmuteRequest && (
        <div className="nebu-cam-request" role="dialog" aria-label="Microphone request">
          <p>
            <strong>
              {snapshot.incomingUnmuteRequest.mode === 'turn_mic_on'
                ? 'Host asked you to turn your microphone on'
                : 'Host is requesting unmute'}
            </strong>
            <br />
            Your microphone stays off until you choose to enable it.
          </p>
          <div className="nebu-hc-row">
            <button
              type="button"
              className="nebu-hc-btn"
              onClick={() => dispatch({ type: 'dismiss_attention', id: snapshot.attention?.id || 'mic' })}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <HostTransmission nudges={snapshot.nudges} />

      {open && snapshot.isHost && (
        <div className="nebu-hc-details">
          <div className="nebu-hc-kicker">Participants</div>
          <div className="nebu-hc-list">
            {snapshot.participants.length === 0 && (
              <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>No peers yet.</p>
            )}
            {snapshot.participants.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`nebu-hc-person ${selected?.id === p.id ? 'is-selected' : ''}`}
                onClick={() => dispatch({ type: 'select_participant', participantId: p.id })}
              >
                <div className="nebu-hc-person-head">
                  <span className="nebu-hc-person-name">{p.name}</span>
                  <span className="nebu-hc-chip">{p.connection.replace('_', ' ')}</span>
                </div>
                <div className="nebu-hc-row" style={{ marginTop: 0 }}>
                  <span className="nebu-hc-chip">{p.cameraOn ? 'CAM ON' : 'CAM OFF'}</span>
                  <span className="nebu-hc-chip">{micLabel(p.micState)}</span>
                  <span className="nebu-hc-chip">{cameraRequestLabel(p.cameraRequest)}</span>
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="nebu-hc-details">
              <div className="nebu-hc-kicker">Camera · {selected.name}</div>
              <div className="nebu-hc-row">
                <button
                  type="button"
                  className="nebu-hc-btn"
                  onClick={() => dispatch({ type: 'request_camera', participantId: selected.id })}
                >
                  {cameraRequestLabel(selected.cameraRequest === 'idle' ? 'idle' : selected.cameraRequest)}
                </button>
                <button
                  type="button"
                  className="nebu-hc-btn is-quiet"
                  onClick={() => dispatch({ type: 'remind_camera', participantId: selected.id })}
                >
                  Reminder
                </button>
                <button
                  type="button"
                  className="nebu-hc-btn is-quiet"
                  title="Backend permission gate still stubbed"
                  onClick={() => dispatch({ type: 'disable_camera', participantId: selected.id })}
                >
                  Disable cam
                </button>
                <button
                  type="button"
                  className="nebu-hc-btn is-quiet"
                  onClick={() => dispatch({ type: 'spotlight', participantId: selected.id })}
                >
                  Spotlight
                </button>
                <button
                  type="button"
                  className="nebu-hc-btn is-quiet"
                  onClick={() => dispatch({ type: 'pin', participantId: selected.id })}
                >
                  Pin / focus
                </button>
                <button
                  type="button"
                  className="nebu-hc-btn is-quiet"
                  onClick={() => dispatch({ type: 'return_auto_view' })}
                >
                  Auto view
                </button>
              </div>

              <div className="nebu-hc-kicker" style={{ marginTop: 12 }}>
                Audio · {selected.name}
              </div>
              <div className="nebu-hc-row">
                <button
                  type="button"
                  className="nebu-hc-btn"
                  onClick={() => dispatch({ type: 'mute_participant', participantId: selected.id })}
                >
                  Mute
                </button>
                <button
                  type="button"
                  className="nebu-hc-btn"
                  onClick={() => dispatch({ type: 'request_unmute', participantId: selected.id })}
                >
                  Request unmute
                </button>
                <button
                  type="button"
                  className="nebu-hc-btn is-quiet"
                  onClick={() => dispatch({ type: 'request_turn_mic_on', participantId: selected.id })}
                >
                  Turn microphone on
                </button>
                <button
                  type="button"
                  className="nebu-hc-btn is-quiet"
                  onClick={() => dispatch({ type: 'flag_audio_problem', participantId: selected.id })}
                >
                  Audio problems
                </button>
                <button
                  type="button"
                  className="nebu-hc-btn is-quiet"
                  onClick={() => dispatch({ type: 'mute_all' })}
                >
                  Mute all
                </button>
              </div>

              <div className="nebu-hc-kicker" style={{ marginTop: 12 }}>
                Participant
              </div>
              <div className="nebu-hc-row">
                <input
                  value={customNotice}
                  onChange={(e) => setCustomNotice(e.target.value)}
                  placeholder="Private host notice"
                  style={{
                    flex: 1,
                    minWidth: 160,
                    height: 30,
                    borderRadius: 9,
                    border: '1px solid rgba(255,255,255,.14)',
                    background: 'rgba(0,0,0,.25)',
                    color: '#fff',
                    padding: '0 8px',
                    fontSize: 11,
                  }}
                />
                <button
                  type="button"
                  className="nebu-hc-btn"
                  disabled={!customNotice.trim()}
                  onClick={() => {
                    dispatch({
                      type: 'private_notice',
                      participantId: selected.id,
                      message: customNotice.trim(),
                    })
                    setCustomNotice('')
                  }}
                >
                  Send notice
                </button>
                {confirmRemove === selected.id ? (
                  <>
                    <button
                      type="button"
                      className="nebu-hc-btn is-danger"
                      onClick={() => {
                        dispatch({ type: 'remove_participant', participantId: selected.id })
                        setConfirmRemove(null)
                      }}
                    >
                      Confirm remove
                    </button>
                    <button type="button" className="nebu-hc-btn is-quiet" onClick={() => setConfirmRemove(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="nebu-hc-btn is-danger"
                    onClick={() => setConfirmRemove(selected.id)}
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="nebu-hc-kicker" style={{ marginTop: 12 }}>
                Nebu transmissions
              </div>
              <div className="nebu-hc-row">
                {NUDGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.kind}
                    type="button"
                    className="nebu-hc-btn is-quiet"
                    onClick={() =>
                      dispatch({
                        type: 'send_nudge',
                        kind: opt.kind,
                        participantId: selected.id,
                      })
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="nebu-hc-details">
            <div className="nebu-hc-kicker">Room</div>
            <div className="nebu-hc-row">
              <button type="button" className="nebu-hc-btn" onClick={() => dispatch({ type: 'invite_copy' })}>
                Invite
              </button>
              <button
                type="button"
                className="nebu-hc-btn is-quiet"
                onClick={() => dispatch({ type: 'lock_room', locked: !snapshot.room.locked })}
              >
                {snapshot.room.locked ? 'Unlock' : 'Lock'}
              </button>
              <button
                type="button"
                className="nebu-hc-btn is-quiet"
                onClick={() => {
                  const message = window.prompt('Broadcast host notice')
                  if (message?.trim()) {
                    dispatch({ type: 'broadcast_notice', message: message.trim() })
                  }
                }}
              >
                Broadcast notice
              </button>
              <span className="nebu-hc-chip">Health · {snapshot.room.sessionHealth}</span>
              {confirmEnd ? (
                <>
                  <button
                    type="button"
                    className="nebu-hc-btn is-danger"
                    onClick={() => {
                      dispatch({ type: 'end_session' })
                      setConfirmEnd(false)
                    }}
                  >
                    Confirm end session
                  </button>
                  <button type="button" className="nebu-hc-btn is-quiet" onClick={() => setConfirmEnd(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="nebu-hc-btn is-danger" onClick={() => setConfirmEnd(true)}>
                  End session
                </button>
              )}
            </div>
            {snapshot.stubbedActionKinds.length > 0 && (
              <p style={{ margin: '8px 0 0', fontSize: 10, opacity: 0.55 }}>
                Stubbed until backend permits: {snapshot.stubbedActionKinds.join(', ')}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
