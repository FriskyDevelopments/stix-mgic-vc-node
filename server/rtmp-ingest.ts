import { getServerEnv } from './env'

export type RtmpPublishConfig = {
  ready: boolean
  path: string
  server: string | null
  username: string | null
  streamKey: string | null
  /** Ready to paste into ffmpeg or PyTgCalls. This endpoint is operator-authenticated. */
  publishUrl: string | null
}

/**
 * Builds the single-purpose RTMP endpoint run alongside VC Node. Do not put this in
 * /v1/config/public: the stream password is capability-bearing and must never reach
 * an unauthenticated browser.
 */
export function getRtmpPublishConfig(): RtmpPublishConfig {
  const env = getServerEnv()
  if (!env.rtmpConfigured) {
    return { ready: false, path: env.RTMP_PATH, server: null, username: null, streamKey: null, publishUrl: null }
  }

  const server = `rtmp://${env.RTMP_PUBLIC_HOST}:1935`
  const username = env.RTMP_PUBLISH_USER!
  const streamKey = env.RTMP_PUBLISH_PASSWORD!
  return {
    ready: true,
    path: env.RTMP_PATH,
    server,
    username,
    streamKey,
    publishUrl: `${server.replace('rtmp://', `rtmp://${encodeURIComponent(username)}:${encodeURIComponent(streamKey)}@`)}/${env.RTMP_PATH}`,
  }
}
