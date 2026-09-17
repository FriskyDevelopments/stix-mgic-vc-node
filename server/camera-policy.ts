export type CameraPolicyGrace = 0 | 30 | 60

export type CameraPolicyParticipant = {
  id: string
  name: string
  muted: boolean
  cameraOn: boolean | null
  isSelf: boolean
  isAdmin: boolean
}

export type CameraPolicySnapshot = {
  chatId: string
  callId: string
  complete: boolean
  canManageCalls: boolean
  participants: CameraPolicyParticipant[]
}

export type CameraPolicyStatus = {
  chatId: string
  enabled: boolean
  graceSeconds: CameraPolicyGrace
  callId: string | null
  status: 'disabled' | 'active' | 'paused'
  error: string | null
  pendingCount: number
}

export type CameraPolicyDependencies = {
  assertAccess(operatorId: string, chatId: string): Promise<unknown>
  snapshot(chatId: string): Promise<CameraPolicySnapshot>
  /** Resolve only after successful delivery; reject when delivery is unconfirmed. */
  warn(chatId: string, id: string, name: string, graceSeconds: CameraPolicyGrace): Promise<unknown>
  mute(chatId: string, id: string, expectedCallId: string, options: { signal: AbortSignal; onlyIfCameraOff: true }): Promise<unknown>
  now(): number
}

export class CameraPolicyError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 409) {
    super(message)
    this.name = 'CameraPolicyError'
  }
}

type Episode = { warning: 'sent' | 'failed'; deadline: number | null; completed: boolean }
type Policy = CameraPolicyStatus & {
  operatorId: string
  enabling: boolean
  controller: AbortController
  episodes: Map<string, Episode>
}

function disabled(chatId: string, graceSeconds: CameraPolicyGrace = 60): CameraPolicyStatus {
  return { chatId, enabled: false, graceSeconds, callId: null, status: 'disabled', error: null, pendingCount: 0 }
}

/** In-memory and call-specific. The caller owns scheduling; this service starts no timers. */
export function createCameraPolicyService(deps: CameraPolicyDependencies) {
  let selected: Policy | null = null
  let running: Promise<void> | null = null
  let stopped = false

  function current(policy: Policy) {
    return !stopped && selected === policy && policy.enabled && !policy.controller.signal.aborted
  }

  function getPolicy(operatorId: string, chatId: string): CameraPolicyStatus {
    if (!selected || selected.operatorId !== operatorId || selected.chatId !== chatId) return disabled(chatId)
    const { enabled, graceSeconds, callId, status, error, episodes } = selected
    const pendingCount = [...episodes.values()].filter((episode) => !episode.completed && episode.warning === 'sent').length
    const warningFailure = [...episodes.values()].some((episode) => episode.warning === 'failed')
    return { chatId, enabled, graceSeconds, callId, status, error: error || (warningFailure ? 'A camera warning could not be delivered. That participant will not be muted.' : null), pendingCount }
  }

  function pause(policy: Policy, error: string) {
    if (!current(policy)) return
    policy.status = 'paused'
    policy.error = error
    // Keep the delivered-warning record, but require a fresh full grace period
    // after observation resumes. A stale deadline can never trigger a mute.
    for (const episode of policy.episodes.values()) episode.deadline = null
  }

  function acceptSnapshot(policy: Policy, snapshot: CameraPolicySnapshot): boolean {
    if (!current(policy)) return false
    if (snapshot.chatId !== policy.chatId) {
      pause(policy, 'The selected group could not be verified.')
      return false
    }
    if (snapshot.callId !== policy.callId) {
      policy.controller.abort()
      policy.enabled = false
      policy.status = 'disabled'
      policy.error = 'The active call changed. Enable the rule again for this call.'
      policy.episodes.clear()
      return false
    }
    if (!snapshot.complete || !snapshot.canManageCalls) {
      pause(policy, !snapshot.complete ? 'Waiting for a complete participant list.' : 'Manage call permission is unavailable.')
      return false
    }
    policy.status = 'active'
    policy.error = null
    return true
  }

  function reconcile(policy: Policy, snapshot: CameraPolicySnapshot) {
    const participants = new Map(snapshot.participants.map((participant) => [participant.id, participant]))
    for (const [id, episode] of policy.episodes) {
      const participant = participants.get(id)
      if (!participant || participant.cameraOn === true || participant.isSelf || participant.isAdmin) {
        policy.episodes.delete(id)
      } else if (participant.cameraOn !== false || participant.muted) {
        episode.deadline = null
      }
    }
  }

  function eligible(participant: CameraPolicyParticipant | undefined): participant is CameraPolicyParticipant {
    return !!participant && participant.cameraOn === false && participant.muted === false &&
      participant.isSelf === false && participant.isAdmin === false
  }

  async function setPolicy(operatorId: string, input: { chatId: string; enabled: boolean; graceSeconds: CameraPolicyGrace; expectedCallId?: string }): Promise<CameraPolicyStatus> {
    if (!operatorId || !input.chatId?.trim() || typeof input.enabled !== 'boolean' || ![0, 30, 60].includes(input.graceSeconds)) {
      throw new CameraPolicyError('A group, enabled state, and valid grace period are required.', 400)
    }
    if (stopped) throw new CameraPolicyError('The camera policy service has stopped.', 409)
    if (!input.enabled) {
      // Invalidate before any await. An owner can disable even after access has
      // been revoked, but cannot cancel another owner's selected rule.
      if (selected?.operatorId === operatorId && selected.chatId === input.chatId) {
        selected.controller.abort()
        selected = null
      }
      return disabled(input.chatId, input.graceSeconds)
    }
    if (selected && (selected.enabled || selected.enabling) && selected.operatorId !== operatorId) {
      throw new CameraPolicyError('A camera policy is already active.', 409)
    }
    selected?.controller.abort()
    const policy: Policy = { ...disabled(input.chatId, input.graceSeconds), operatorId, enabling: true, controller: new AbortController(), episodes: new Map() }
    selected = policy
    const stillEnabling = () => !stopped && selected === policy && policy.enabling
    try {
      await deps.assertAccess(operatorId, input.chatId)
      if (!stillEnabling()) throw new CameraPolicyError('Camera policy activation was cancelled.', 409)
      const snapshot = await deps.snapshot(input.chatId)
      if (!stillEnabling()) throw new CameraPolicyError('Camera policy activation was cancelled.', 409)
      if (snapshot.chatId !== input.chatId || !snapshot.callId || !snapshot.complete) {
        throw new CameraPolicyError('A complete active call must be available before enabling the rule.', 409)
      }
      if (input.expectedCallId !== undefined && snapshot.callId !== input.expectedCallId) {
        throw new CameraPolicyError('The call changed. Refresh before enabling the rule.', 409)
      }
      if (!snapshot.canManageCalls) throw new CameraPolicyError('Manage call permission is required.', 403)
      await deps.assertAccess(operatorId, input.chatId)
      if (!stillEnabling()) throw new CameraPolicyError('Camera policy activation was cancelled.', 409)
      policy.callId = snapshot.callId
      policy.enabled = true
      policy.enabling = false
      policy.status = 'active'
      return getPolicy(operatorId, input.chatId)
    } catch (error) {
      policy.controller.abort()
      if (selected === policy) selected = null
      throw error
    }
  }

  async function runTick() {
    const policy = selected
    if (!policy || !current(policy)) return
    try {
      await deps.assertAccess(policy.operatorId, policy.chatId)
      if (!current(policy)) return
      const snapshot = await deps.snapshot(policy.chatId)
      if (!acceptSnapshot(policy, snapshot)) return
      reconcile(policy, snapshot)
      let latest = snapshot
      for (const candidate of snapshot.participants) {
        if (!current(policy)) return
        const participant = latest.participants.find((entry) => entry.id === candidate.id)
        if (!eligible(participant)) continue
        let episode = policy.episodes.get(participant.id)
        if (!episode) {
          // Earlier warning delivery may have taken time. Re-observe this
          // participant before sending another warning from the original list.
          const fresh = await deps.snapshot(policy.chatId)
          if (!acceptSnapshot(policy, fresh)) return
          latest = fresh
          reconcile(policy, fresh)
          const warningParticipant = fresh.participants.find((entry) => entry.id === participant.id)
          if (!eligible(warningParticipant)) continue
          await deps.assertAccess(policy.operatorId, policy.chatId)
          if (!current(policy)) return
          episode = { warning: 'failed', deadline: null, completed: false }
          policy.episodes.set(participant.id, episode)
          try {
            await deps.warn(policy.chatId, warningParticipant.id, warningParticipant.name, policy.graceSeconds)
          } catch {
            // Do not retry or mute during this camera-off episode if delivery
            // failed; reconnecting the camera or leaving resets the episode.
            if (!current(policy)) return
            policy.error = 'A camera warning could not be delivered. That participant will not be muted.'
            continue
          }
          if (!current(policy)) return
          episode.warning = 'sent'
          episode.deadline = deps.now() + policy.graceSeconds * 1000
        }
        if (episode.warning !== 'sent' || episode.completed) continue
        if (episode.deadline === null) episode.deadline = deps.now() + policy.graceSeconds * 1000
        if (deps.now() < episode.deadline) continue

        await deps.assertAccess(policy.operatorId, policy.chatId)
        if (!current(policy)) return
        const fresh = await deps.snapshot(policy.chatId)
        if (!acceptSnapshot(policy, fresh)) return
        latest = fresh
        reconcile(policy, fresh)
        if (!eligible(fresh.participants.find((candidate) => candidate.id === participant.id)) || policy.episodes.get(participant.id) !== episode) continue
        await deps.assertAccess(policy.operatorId, policy.chatId)
        if (!current(policy)) return
        await deps.mute(policy.chatId, participant.id, policy.callId!, { signal: policy.controller.signal, onlyIfCameraOff: true })
        if (!current(policy)) return
        episode.completed = true
        episode.deadline = null
      }
    } catch {
      // Access failures, transport errors and failed mutes all suspend deadlines.
      // Never surface dependency error text, which can contain other metadata.
      pause(policy, 'Camera checks are paused until access and participant state can be verified.')
    }
  }

  function tick(): Promise<void> {
    if (running) return running
    running = runTick().finally(() => { running = null })
    return running
  }

  function stop() {
    stopped = true
    selected?.controller.abort()
    selected = null
  }

  return { setPolicy, getPolicy, tick, stop }
}
