import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getStatus } from '@/lib/telegram-vc-api'
import { postRoomAdmin, RoomsApiError, type RoomAdminParticipant } from '@/lib/rooms-api'
import {
  roomAdminUiCan,
  type HostControlAction,
  type HostSessionSnapshot,
  type RoomAdminUiAction,
} from '@/lib/nebu-host-controls'
import '@/styles/nebu-host-controls.css'

export type RoomAdminPanelProps = {
  roomId: string | null | undefined
  snapshot: HostSessionSnapshot
  dispatch: (action: HostControlAction) => void
  /** compact = mini widget strip; full = host controls panel */
  density?: 'full' | 'compact'
}

/**
 * ROOM-ADMIN.md surface — visible only while a Telegram VC is live.
 * Actions the current role cannot perform are hidden/disabled; API 403s toast clearly
 * (never silent no-op). Guests see the participant list only.
 */
export function RoomAdminPanel({
  roomId,
  snapshot,
  dispatch,
  density = 'full',
}: RoomAdminPanelProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [confirmKick, setConfirmKick] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [inviteDraft, setInviteDraft] = useState('')

  const role = snapshot.roomAdminRole
  const can = (action: RoomAdminUiAction) => roomAdminUiCan(role, action)
  const canModerate = snapshot.canModerate && roomAdminUiCanModerateSafe(snapshot)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const status = await getStatus()
        if (cancelled) return
        const live = status.call.state === 'active'
        dispatch({ type: 'set_telegram_vc_live', live })
      } catch (error) {
        if (cancelled) return
        dispatch({ type: 'set_telegram_vc_live', live: false })
        // Soft: adapter may be unpaired; only log, do not toast on every poll.
        console.warn('[room-admin] telegram vc status', error)
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 8_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [dispatch])

  const run = useCallback(
    async (
      action: RoomAdminUiAction,
      target?: string,
      title?: string
    ) => {
      if (!roomAdminUiCan(role, action)) {
        const message = `Not allowed for role ${role} — ${action} requires a higher auth plane`
        console.error('[room-admin]', message)
        toast.error(message)
        return
      }
      if (!roomId) {
        toast.error('Open a room before using Telegram room admin')
        console.error('[room-admin] missing roomId for', action)
        return
      }
      const key = `${action}:${target || title || ''}`
      setBusy(key)
      try {
        const res = await postRoomAdmin(roomId, { action, target, title })
        if (res.role || res.authPlane || typeof res.canModerate === 'boolean') {
          dispatch({
            type: 'set_room_admin_capabilities',
            role: res.role ?? role,
            authPlane: res.authPlane ?? snapshot.roomAdminAuthPlane,
            canModerate: typeof res.canModerate === 'boolean' ? res.canModerate : undefined,
          })
        }
        dispatch({
          type: 'set_room_admin_participants',
          participants: res.participants,
          pendingMtproto: res.pendingMtproto,
          title: res.title,
        })
        // Optimistic local reducer mirrors for immediate chrome feedback.
        if (action === 'mute' && target) dispatch({ type: 'room_admin_mute', participantId: target })
        if (action === 'unmute' && target) dispatch({ type: 'room_admin_unmute', participantId: target })
        if (action === 'kick' && target) dispatch({ type: 'room_admin_kick', participantId: target })
        if (action === 'pin' && target) dispatch({ type: 'room_admin_pin', participantId: target })
        if (action === 'end') dispatch({ type: 'room_admin_end' })

        if (res.pendingMtproto) {
          toast.message(`Room admin · ${action}`, {
            description: `Queued — MTProto still pending: ${res.pendingMtproto}`,
          })
        } else {
          toast.success(`Room admin · ${action}`)
        }
      } catch (error) {
        // Hydrate capabilities from 403 denial bodies so guests/non-hosts sync server role state.
        if (error instanceof RoomsApiError) {
          if (error.role || error.authPlane || typeof error.canModerate === 'boolean') {
            dispatch({
              type: 'set_room_admin_capabilities',
              role: error.role ?? role,
              authPlane: error.authPlane ?? snapshot.roomAdminAuthPlane,
              canModerate:
                typeof error.canModerate === 'boolean'
                  ? error.canModerate
                  : error.status === 403
                    ? false
                    : undefined,
            })
          } else if (error.status === 403) {
            dispatch({
              type: 'set_room_admin_capabilities',
              role: 'guest',
              authPlane: snapshot.roomAdminAuthPlane,
              canModerate: false,
            })
          }
        }
        const message = error instanceof Error ? error.message : 'Room admin failed'
        console.error('[room-admin]', action, message)
        toast.error(message)
      } finally {
        setBusy(null)
      }
    },
    [dispatch, roomId, role, snapshot.roomAdminAuthPlane]
  )

  if (!snapshot.telegramVcLive || snapshot.room.ended) {
    return null
  }

  const rows: RoomAdminParticipant[] =
    snapshot.roomAdminParticipants.length > 0
      ? snapshot.roomAdminParticipants
      : snapshot.participants.map((p) => ({
          id: p.id,
          name: p.name,
          muted: p.micState === 'host_muted' || p.micState === 'muted',
          speaking: p.isActiveSpeaker,
          pinned: p.isPinned,
        }))

  const roleLabel =
    role === 'studio_operator'
      ? 'FriskyDev operator'
      : role === 'nebu_host'
        ? 'NEBU dens host'
        : 'Guest (read-only)'

  return (
    <div
      className={`nebu-room-admin ${density === 'compact' ? 'is-compact' : ''}`}
      aria-label="Telegram room admin"
      data-room-admin-role={role}
      data-can-moderate={canModerate ? 'true' : 'false'}
    >
      <div className="nebu-hc-person-head">
        <div>
          <div className="nebu-hc-kicker">Telegram · Room admin</div>
          {density === 'full' && (
            <p className="nebu-room-admin-blurb">
              {canModerate
                ? 'Moderate the live group call — mute chaos, pin the DJ, end cleanly.'
                : 'Participant view only — guests cannot mute, kick, or end the call.'}
            </p>
          )}
        </div>
        <span className="nebu-hc-chip is-live">{rows.length} live</span>
        <span className="nebu-hc-chip" title={`Auth plane: ${snapshot.roomAdminAuthPlane}`}>
          {roleLabel}
        </span>
      </div>

      <div className="nebu-hc-list">
        {rows.length === 0 && (
          <p className="nebu-room-admin-empty">No Telegram participants reported yet.</p>
        )}
        {rows.map((p) => (
          <div key={p.id} className={`nebu-hc-person ${p.pinned ? 'is-selected' : ''}`}>
            <div className="nebu-hc-person-head">
              <span className="nebu-hc-person-name">{p.name}</span>
              <span className="nebu-hc-chip">{p.muted ? 'MUTED' : p.speaking ? 'SPEAKING' : 'LIVE'}</span>
            </div>
            {canModerate && (
              <div className="nebu-hc-row" style={{ marginTop: 0 }}>
                {p.muted ? (
                  <button
                    type="button"
                    className="nebu-hc-btn"
                    disabled={busy !== null || !can('unmute')}
                    title={!can('unmute') ? 'Unmute not allowed for your role' : undefined}
                    onClick={() => void run('unmute', p.id)}
                  >
                    Unmute
                  </button>
                ) : (
                  <button
                    type="button"
                    className="nebu-hc-btn"
                    disabled={busy !== null || !can('mute')}
                    title={!can('mute') ? 'Mute not allowed for your role' : undefined}
                    onClick={() => void run('mute', p.id)}
                  >
                    Mute
                  </button>
                )}
                <button
                  type="button"
                  className="nebu-hc-btn is-quiet"
                  disabled={busy !== null || !can('pin')}
                  title={!can('pin') ? 'Pin not allowed for your role' : undefined}
                  onClick={() => void run('pin', p.id)}
                >
                  {p.pinned ? 'Pinned' : 'Pin'}
                </button>
                {can('kick') &&
                  (confirmKick === p.id ? (
                    <>
                      <button
                        type="button"
                        className="nebu-hc-btn is-danger"
                        disabled={busy !== null}
                        onClick={() => {
                          void run('kick', p.id)
                          setConfirmKick(null)
                        }}
                      >
                        Confirm kick
                      </button>
                      <button
                        type="button"
                        className="nebu-hc-btn is-quiet"
                        onClick={() => setConfirmKick(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="nebu-hc-btn is-danger"
                      disabled={busy !== null}
                      onClick={() => setConfirmKick(p.id)}
                    >
                      Kick
                    </button>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {density === 'full' && canModerate && (can('title') || can('invite')) && (
        <div className="nebu-hc-details">
          <div className="nebu-hc-kicker">Optional · title / invite (studio operator)</div>
          {can('title') && (
            <div className="nebu-hc-row">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                placeholder={snapshot.roomAdminTitle || 'Call title'}
                className="nebu-room-admin-input"
              />
              <button
                type="button"
                className="nebu-hc-btn is-quiet"
                disabled={busy !== null || !titleDraft.trim()}
                onClick={() => {
                  void run('title', undefined, titleDraft.trim())
                  setTitleDraft('')
                }}
              >
                Set title
              </button>
            </div>
          )}
          {can('invite') && (
            <div className="nebu-hc-row">
              <input
                value={inviteDraft}
                onChange={(e) => setInviteDraft(e.target.value)}
                placeholder="@username or user id"
                className="nebu-room-admin-input"
              />
              <button
                type="button"
                className="nebu-hc-btn is-quiet"
                disabled={busy !== null || !inviteDraft.trim()}
                onClick={() => {
                  void run('invite', inviteDraft.trim())
                  setInviteDraft('')
                }}
              >
                Invite
              </button>
            </div>
          )}
        </div>
      )}

      {can('end') && (
        <div className="nebu-hc-row">
          {confirmEnd ? (
            <>
              <button
                type="button"
                className="nebu-hc-btn is-danger"
                disabled={busy !== null}
                onClick={() => {
                  void run('end')
                  setConfirmEnd(false)
                }}
              >
                Confirm end call
              </button>
              <button type="button" className="nebu-hc-btn is-quiet" onClick={() => setConfirmEnd(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="nebu-hc-btn is-danger"
              disabled={busy !== null}
              onClick={() => setConfirmEnd(true)}
            >
              End call
            </button>
          )}
        </div>
      )}

      {!canModerate && density === 'full' && (
        <p className="nebu-room-admin-pending" role="status">
          Moderation locked for guests. FriskyDev operators and NEBU dens hosts use separate auth
          planes — studio Authentik cookies are never reused as NEBU Better Auth sessions.
        </p>
      )}

      {snapshot.roomAdminPendingMtproto && density === 'full' && (
        <p className="nebu-room-admin-pending">
          Pending MTProto: {snapshot.roomAdminPendingMtproto}
        </p>
      )}
    </div>
  )
}

function roomAdminUiCanModerateSafe(snapshot: HostSessionSnapshot): boolean {
  return snapshot.canModerate === true
}
