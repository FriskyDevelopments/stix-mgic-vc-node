/**
 * combine-streams.ts — merge video and audio tracks into one MediaStream.
 *
 * The compositor outputs video, the mixer outputs audio. This combines them
 * into a single stream that can be sent to the Telegram VC adapter's relay endpoint
 * or used as a WebRTC track.
 */

export function combineStreams(
  videoStream: MediaStream | null,
  audioStream: MediaStream | null
): MediaStream {
  const combined = new MediaStream()

  if (videoStream) {
    for (const track of videoStream.getVideoTracks()) {
      combined.addTrack(track)
    }
  }

  if (audioStream) {
    for (const track of audioStream.getAudioTracks()) {
      combined.addTrack(track)
    }
  }

  return combined
}
