import { useEffect, type MutableRefObject } from 'react'
import type { CallClient, RemotePeer } from '@/lib/webrtc-client'
import { HostControls } from '@/components/nebu/HostControls'
import { MiniControlWidget } from '@/components/nebu/MiniControlWidget'
import { useNebuHostSession } from '@/hooks/use-nebu-host-session'
import type { HostControlWirePayload } from '@/lib/nebu-host-controls'

export type NebuSessionChromeProps = {
  callClient: CallClient | null
  peers: RemotePeer[]
  callLive: boolean
  isHost?: boolean
  inviteUrl?: string | null
  sessionHealth?: 'healthy' | 'degraded' | 'unknown'
  localMicEnabled: boolean
  localCameraEnabled: boolean
  onToggleLocalMic?: () => void
  onToggleLocalCamera?: () => void
  onEndSession?: () => void
  onCopyInvite?: () => void
  /** Optional: parent registers wire handler when CallStage constructs the client. */
  hostControlHandlerRef?: MutableRefObject<
    ((payload: HostControlWirePayload, from: string) => void) | null
  >
}

/**
 * Integrated Host Controls + Mini Widget for the existing live/session surface.
 * Does not redesign NebuLanding.
 */
export function NebuSessionChrome(props: NebuSessionChromeProps) {
  const session = useNebuHostSession(props)

  useEffect(() => {
    if (props.hostControlHandlerRef) {
      props.hostControlHandlerRef.current = session.applyWire
      return () => {
        if (props.hostControlHandlerRef) props.hostControlHandlerRef.current = null
      }
    }
  }, [props.hostControlHandlerRef, session.applyWire])

  return (
    <>
      {session.snapshot.chromeMode === 'full' && (
        <div className="nebu-hc-expand">
          <HostControls snapshot={session.snapshot} dispatch={session.dispatch} />
        </div>
      )}
      <MiniControlWidget
        snapshot={session.snapshot}
        dispatch={session.dispatch}
        onToggleMic={props.onToggleLocalMic}
        onToggleCamera={props.onToggleLocalCamera}
      />
    </>
  )
}
