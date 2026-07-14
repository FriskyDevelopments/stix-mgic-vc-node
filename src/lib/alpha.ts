export type AlphaPlatform = 'telegram' | 'discord'
export type AlphaInputProtocol =
  | 'dj-mode'
  | 'clipsflow'
  | 'virtual-camera'
  | 'rtmp'
  | 'local'
  | 'relay'

export const ALPHA_BANNER =
  'Alpha — local demo only. Sessions and platform auth are simulated; no production Telegram/Discord connectivity.'

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
  return `sk_demo_${Math.random().toString(36).substring(2, 15)}`
}
