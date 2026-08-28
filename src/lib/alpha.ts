import { getAppEnv } from '@/lib/env'

export type AlphaPlatform = 'telegram' | 'discord'
export type AlphaInputProtocol =
  | 'dj-mode'
  | 'clipsflow'
  | 'virtual-camera'
  | 'rtmp'
  | 'local'
  | 'relay'

export const ALPHA_BANNER =
  'Alpha control surface — real providers only. Unconfigured authentication and voice adapters stay unavailable.'

export function getRuntimeBanner(): string {
  const env = getAppEnv()
  if (env.isLiveApiConfigured) {
    return 'Live control plane — provider authentication and voice adapters report verified runtime readiness.'
  }
  return ALPHA_BANNER
}

export function getPlatformDestinationLabel(platform: AlphaPlatform): string {
  switch (platform) {
    case 'telegram':
      return 'Telegram VC'
    case 'discord':
      return 'Discord Voice'
    default: {
      const _exhaustive: never = platform
      return _exhaustive
    }
  }
}

export function getArchitectureLayers(
  inputProtocol: AlphaInputProtocol,
  platform: AlphaPlatform
): [string, string, string] {
  const destination = getPlatformDestinationLabel(platform)

  switch (inputProtocol) {
    case 'clipsflow':
      return ['ClipsFlow', 'VC NODE', destination]
    case 'virtual-camera':
      return ['OBS', 'VC NODE', destination]
    case 'rtmp':
      return ['OBS', 'VC NODE', platform === 'telegram' ? 'Telegram RTMP' : 'Discord RTMP']
    case 'dj-mode':
    case 'local':
    case 'relay':
      return ['Source', 'VC NODE', destination]
    default: {
      const _exhaustive: never = inputProtocol
      return _exhaustive
    }
  }
}

export function generateDemoStreamKey(): string {
  // This key is a placeholder. A real stream key comes from the platform (Telegram RTMP
  // via MTProto or Discord). Until those adapters are wired, no real key exists.
  return `sk_placeholder_${Math.random().toString(36).substring(2, 15)}`
}
