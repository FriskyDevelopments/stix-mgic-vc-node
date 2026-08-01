/**
 * telegram-vc/index.ts — public API of the Telegram VC adapter.
 *
 * Re-exports everything other modules need to integrate the adapter.
 */
export { getTelegramVcEnv, resetTelegramVcEnvCache } from './env'
export { getTgClient, ensureConnected, getClientStatus, disconnectTgClient, isConnected } from './client'
export {
  joinGroupCall,
  leaveGroupCall,
  switchSource,
  getCallInfo,
  resetGroupCall,
  type GroupCallInfo,
  type GroupCallState,
  type SfuTransport,
} from './group-call'
export { type MediaSource, type MediaSourceType, type MediaSourceState, type MediaSourceStats } from './media-source'
export { createFileSource } from './sources/file-source'
export { createRtmpSource } from './sources/rtmp-source'
export { createWebRtcRelaySource } from './sources/webrtc-relay-source'
export { createTelegramVcRoutes } from './routes'
