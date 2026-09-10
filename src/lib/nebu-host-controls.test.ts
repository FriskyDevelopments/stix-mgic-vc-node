import { describe, expect, it } from 'vitest'
import {
  NUDGE_COPY,
  advanceCameraRequest,
  applyHostAction,
  cameraRequestLabel,
  createInitialHostSnapshot,
  deriveAttention,
  micLabel,
  peersToHostParticipants,
} from './nebu-host-controls'

describe('nebu host controls state', () => {
  it('advances consent-forward camera request flow', () => {
    expect(advanceCameraRequest('idle', 'send')).toBe('request_sent')
    expect(advanceCameraRequest('request_sent', 'ack_waiting')).toBe('waiting')
    expect(advanceCameraRequest('waiting', 'live')).toBe('camera_live')
    expect(advanceCameraRequest('waiting', 'declined')).toBe('declined')
    expect(advanceCameraRequest('waiting', 'unavailable')).toBe('unavailable')
    expect(cameraRequestLabel('idle')).toBe('REQUEST CAMERA')
    expect(cameraRequestLabel('waiting')).toBe('WAITING')
  })

  it('distinguishes mic labels including host muted and request sent', () => {
    expect(micLabel('live')).toBe('LIVE')
    expect(micLabel('muted')).toBe('MUTED')
    expect(micLabel('host_muted')).toBe('HOST MUTED')
    expect(micLabel('speaking')).toBe('SPEAKING')
    expect(micLabel('request_sent')).toBe('REQUEST SENT')
    expect(micLabel('audio_unavailable')).toBe('AUDIO UNAVAILABLE')
  })

  it('keeps FULL↔MINI chrome state without resetting session fields', () => {
    let snap = createInitialHostSnapshot({
      callLive: true,
      participants: [
        {
          id: 'p1',
          name: 'Guest',
          role: 'guest',
          connection: 'connected',
          cameraOn: false,
          micState: 'muted',
          cameraRequest: 'waiting',
          isActiveSpeaker: false,
          isSpotlighted: false,
          isPinned: false,
        },
      ],
      busyNote: { active: true, label: 'Checking levels' },
      incomingCameraRequest: { requestId: 'r1', fromName: 'Host' },
    })

    snap = applyHostAction(snap, { type: 'set_chrome_mode', mode: 'mini' })
    expect(snap.chromeMode).toBe('mini')
    expect(snap.participants[0]?.cameraRequest).toBe('waiting')
    expect(snap.busyNote.active).toBe(true)
    expect(snap.incomingCameraRequest?.requestId).toBe('r1')

    snap = applyHostAction(snap, { type: 'set_mini_size', size: 'expanded_mini' })
    snap = applyHostAction(snap, { type: 'set_chrome_mode', mode: 'full' })
    expect(snap.chromeMode).toBe('full')
    expect(snap.miniSize).toBe('expanded_mini')
    expect(snap.busyNote.label).toBe('Checking levels')
  })

  it('surfaces camera request as highest-priority attention', () => {
    const snap = createInitialHostSnapshot({
      callLive: true,
      incomingCameraRequest: { requestId: 'r1', fromName: 'Host' },
      room: { locked: false, inviteUrl: null, sessionHealth: 'degraded', ended: false },
    })
    const attention = deriveAttention(snap)
    expect(attention?.title).toContain('requesting your camera')
    expect(attention?.priority).toBeGreaterThan(50)
  })

  it('uses Nebu transmission copy for nudges', () => {
    const snap = applyHostAction(createInitialHostSnapshot({ callLive: true }), {
      type: 'send_nudge',
      kind: 'please_turn_on_camera',
      participantId: 'p1',
    })
    expect(snap.nudges[snap.nudges.length - 1]?.message).toBe(NUDGE_COPY.please_turn_on_camera)
  })

  it('maps peers into host participant views without inventing cam-on', () => {
    const peers = [
      {
        participant: { id: 'a', name: 'A', role: 'guest' as const },
        stream: null,
        connectionState: 'connected',
      },
    ]
    const views = peersToHostParticipants(peers, [])
    expect(views[0]?.cameraOn).toBe(false)
    expect(views[0]?.micState).toBe('audio_unavailable')
    expect(views[0]?.cameraRequest).toBe('idle')
  })

  it('requires confirm path for destructive end_session via room.ended flag only after action', () => {
    const snap = applyHostAction(createInitialHostSnapshot({ callLive: true }), {
      type: 'end_session',
    })
    expect(snap.room.ended).toBe(true)
    expect(snap.callLive).toBe(false)
  })
})
