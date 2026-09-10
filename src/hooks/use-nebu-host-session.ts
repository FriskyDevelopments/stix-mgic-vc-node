import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CallClient, RemotePeer } from '@/lib/webrtc-client'
import {
  applyHostAction,
  createInitialHostSnapshot,
  newRequestId,
  peersToHostParticipants,
  type BusyNoteState,
  type HostControlAction,
  type HostControlWirePayload,
  type HostNudgeKind,
  type HostSessionSnapshot,
  type MiniWidgetSize,
  type SessionChromeMode,
} from '@/lib/nebu-host-controls'

export type UseNebuHostSessionOptions = {
  callClient: CallClient | null
  peers: RemotePeer[]
  callLive: boolean
  isHost?: boolean
  selfId?: string | null
  inviteUrl?: string | null
  sessionHealth?: HostSessionSnapshot['room']['sessionHealth']
  localMicEnabled: boolean
  localCameraEnabled: boolean
  onToggleLocalMic?: () => void
  onToggleLocalCamera?: () => void
  onEndSession?: () => void
  onCopyInvite?: () => void
}

/**
 * Keeps FULL ↔ MINI chrome state, host actions, and consent prompts in one place
 * so collapsing Nebu never drops session / pending request / Busy Note state.
 */
export function useNebuHostSession(options: UseNebuHostSessionOptions) {
  const {
    callClient,
    peers,
    callLive,
    isHost = true,
    selfId = null,
    inviteUrl = null,
    sessionHealth = 'unknown',
    localMicEnabled,
    localCameraEnabled,
    onToggleLocalMic,
    onToggleLocalCamera,
    onEndSession,
    onCopyInvite,
  } = options

  const [snapshot, setSnapshot] = useState(() =>
    createInitialHostSnapshot({
      isHost,
      selfId,
      localMicEnabled,
      localCameraEnabled,
      callLive,
      room: {
        locked: false,
        inviteUrl,
        sessionHealth,
        ended: false,
      },
    })
  )

  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot

  useEffect(() => {
    setSnapshot((prev) => ({
      ...prev,
      isHost,
      selfId: selfId ?? callClient?.getSelfId() ?? prev.selfId,
      callLive,
      localMicEnabled,
      localCameraEnabled,
      room: {
        ...prev.room,
        inviteUrl: inviteUrl ?? prev.room.inviteUrl,
        sessionHealth,
      },
      participants: peersToHostParticipants(peers, prev.participants),
    }))
  }, [
    callClient,
    peers,
    callLive,
    isHost,
    selfId,
    inviteUrl,
    sessionHealth,
    localMicEnabled,
    localCameraEnabled,
  ])

  const applyWire = useCallback((payload: HostControlWirePayload, fromParticipantId: string) => {
    setSnapshot((prev) => {
      let next = { ...prev }
      switch (payload.kind) {
        case 'camera_request':
          next = {
            ...next,
            incomingCameraRequest: {
              requestId: payload.requestId,
              fromName:
                prev.participants.find((p) => p.id === fromParticipantId)?.name || 'Host',
            },
          }
          break
        case 'camera_request_result':
          next = {
            ...next,
            participants: next.participants.map((p) =>
              p.id === fromParticipantId
                ? {
                    ...p,
                    cameraRequest: payload.result,
                    cameraOn: payload.result === 'camera_live',
                  }
                : p
            ),
          }
          break
        case 'unmute_request':
          next = {
            ...next,
            incomingUnmuteRequest: {
              requestId: payload.requestId,
              fromName:
                prev.participants.find((p) => p.id === fromParticipantId)?.name || 'Host',
              mode: payload.mode,
            },
          }
          break
        case 'host_mute':
          next = { ...next, localMicEnabled: false }
          break
        case 'nudge':
          next = { ...next, nudges: [...next.nudges, payload.nudge].slice(-12) }
          break
        case 'private_notice':
        case 'broadcast_notice':
          next = {
            ...next,
            nudges: [
              ...next.nudges,
              {
                id: newRequestId(),
                kind: 'custom' as const,
                message: payload.message,
                participantId:
                  payload.kind === 'private_notice' ? payload.toParticipantId : undefined,
                createdAt: Date.now(),
              },
            ].slice(-12),
          }
          break
        case 'remove':
          if (payload.toParticipantId === prev.selfId) {
            next = { ...next, callLive: false, room: { ...next.room, ended: true } }
          }
          break
        case 'room_lock':
          next = { ...next, room: { ...next.room, locked: payload.locked } }
          break
        case 'session_end':
          next = { ...next, callLive: false, room: { ...next.room, ended: true } }
          break
      }
      return applyHostAction(next, { type: 'select_participant', participantId: next.selectedParticipantId })
    })
  }, [])

  useEffect(() => {
    if (!callClient) return
    // CallClient options are fixed at construct time; CallStage re-binds via events.
    // This effect is a no-op placeholder for future client event remount wiring.
  }, [callClient, applyWire])

  const dispatch = useCallback(
    (action: HostControlAction) => {
      const prev = snapshotRef.current
      const next = applyHostAction(prev, action)
      setSnapshot(next)

      const self = next.selfId || callClient?.getSelfId() || 'self'

      const send = (payload: HostControlWirePayload, to?: string) => {
        const ok = callClient?.sendHostControl(payload, to) ?? false
        return ok
      }

      switch (action.type) {
        case 'request_camera': {
          const requestId = newRequestId()
          send(
            {
              kind: 'camera_request',
              requestId,
              fromParticipantId: self,
              toParticipantId: action.participantId,
            },
            action.participantId
          )
          // Move host-side UI into WAITING once the wire accept would ack; locally advance.
          setSnapshot((s) =>
            applyHostAction(
              {
                ...s,
                participants: s.participants.map((p) =>
                  p.id === action.participantId && p.cameraRequest === 'request_sent'
                    ? { ...p, cameraRequest: 'waiting' }
                    : p
                ),
              },
              { type: 'select_participant', participantId: s.selectedParticipantId }
            )
          )
          break
        }
        case 'request_unmute':
        case 'request_turn_mic_on':
          send(
            {
              kind: 'unmute_request',
              requestId: newRequestId(),
              fromParticipantId: self,
              toParticipantId: action.participantId,
              mode: action.type === 'request_unmute' ? 'request_unmute' : 'turn_mic_on',
            },
            action.participantId
          )
          break
        case 'mute_participant':
          send(
            {
              kind: 'host_mute',
              fromParticipantId: self,
              toParticipantId: action.participantId,
            },
            action.participantId
          )
          break
        case 'send_nudge': {
          const nudge = next.nudges[next.nudges.length - 1]
          if (nudge) {
            send(
              {
                kind: 'nudge',
                nudge,
                toParticipantId: action.participantId,
              },
              action.participantId
            )
          }
          break
        }
        case 'private_notice':
          send(
            {
              kind: 'private_notice',
              fromParticipantId: self,
              toParticipantId: action.participantId,
              message: action.message,
            },
            action.participantId
          )
          break
        case 'broadcast_notice':
          send({
            kind: 'broadcast_notice',
            fromParticipantId: self,
            message: action.message,
          })
          break
        case 'remove_participant':
          send(
            {
              kind: 'remove',
              fromParticipantId: self,
              toParticipantId: action.participantId,
            },
            action.participantId
          )
          break
        case 'lock_room':
          send({
            kind: 'room_lock',
            fromParticipantId: self,
            locked: action.locked,
          })
          break
        case 'end_session':
          send({ kind: 'session_end', fromParticipantId: self })
          onEndSession?.()
          break
        case 'invite_copy':
          onCopyInvite?.()
          break
        case 'camera_request_response': {
          const incoming = prev.incomingCameraRequest
          if (incoming) {
            send({
              kind: 'camera_request_result',
              requestId: incoming.requestId,
              fromParticipantId: self,
              toParticipantId: self,
              result: action.accepted
                ? 'camera_live'
                : localCameraEnabled
                  ? 'declined'
                  : 'unavailable',
            })
          }
          if (action.accepted) onToggleLocalCamera?.()
          break
        }
        default:
          break
      }
    },
    [callClient, localCameraEnabled, onCopyInvite, onEndSession, onToggleLocalCamera]
  )

  const setChromeMode = useCallback(
    (mode: SessionChromeMode) => dispatch({ type: 'set_chrome_mode', mode }),
    [dispatch]
  )
  const setMiniSize = useCallback(
    (size: MiniWidgetSize) => dispatch({ type: 'set_mini_size', size }),
    [dispatch]
  )
  const setBusyNote = useCallback(
    (note: BusyNoteState) => dispatch({ type: 'set_busy_note', note }),
    [dispatch]
  )
  const sendNudge = useCallback(
    (kind: HostNudgeKind, participantId?: string, customMessage?: string) =>
      dispatch({ type: 'send_nudge', kind, participantId, customMessage }),
    [dispatch]
  )

  const api = useMemo(
    () => ({
      snapshot,
      dispatch,
      applyWire,
      setChromeMode,
      setMiniSize,
      setBusyNote,
      sendNudge,
      toggleLocalMic: onToggleLocalMic,
      toggleLocalCamera: onToggleLocalCamera,
    }),
    [
      snapshot,
      dispatch,
      applyWire,
      setChromeMode,
      setMiniSize,
      setBusyNote,
      sendNudge,
      onToggleLocalMic,
      onToggleLocalCamera,
    ]
  )

  return api
}
