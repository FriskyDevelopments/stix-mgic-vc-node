export type CameraPreflightCode = 'missing-camera' | 'camera-ended' | 'camera-disabled' | 'camera-unavailable'

export class CameraPreflightError extends Error {
  constructor(readonly code: CameraPreflightCode, message: string) {
    super(message)
    this.name = 'CameraPreflightError'
  }
}

export interface CameraPreflightResult {
  stream: MediaStream
  videoTrack: MediaStreamTrack
  video: Pick<MediaTrackSettings, 'width' | 'height' | 'frameRate'>
  microphone: 'ready' | 'muted' | 'absent'
}

/** Inspect the already acquired local stream. This never acquires or transmits media. */
export function checkCameraPreflight(stream: MediaStream | null): CameraPreflightResult {
  const videoTracks = stream?.getVideoTracks() ?? []
  if (!stream || videoTracks.length === 0) {
    throw new CameraPreflightError('missing-camera', 'Set up your camera before running the camera check.')
  }
  const liveVideo = videoTracks.filter(track => track.readyState === 'live')
  if (liveVideo.length === 0) {
    throw new CameraPreflightError('camera-ended', 'Your camera stream has ended. Run camera setup again.')
  }
  const enabledVideo = liveVideo.filter(track => track.enabled)
  if (enabledVideo.length === 0) {
    throw new CameraPreflightError('camera-disabled', 'Turn your camera on in the preview, then run the camera check again.')
  }
  const video = enabledVideo.find(track => !track.muted)
  if (!video) {
    throw new CameraPreflightError('camera-unavailable', 'Your camera is temporarily not providing video. Check the preview and try again.')
  }

  let videoSettings: MediaTrackSettings
  try {
    videoSettings = { ...video.getSettings() }
  } catch {
    throw new CameraPreflightError('camera-unavailable', 'Camera settings could not be read. Run camera setup again.')
  }
  const metadata: CameraPreflightResult['video'] = {}
  for (const key of ['width', 'height', 'frameRate'] as const) {
    const value = videoSettings[key]
    if (value !== undefined && Number.isFinite(value) && value > 0) metadata[key] = value
  }

  const audio = stream.getAudioTracks().filter(track => track.readyState === 'live')
  const microphone = audio.some(track => track.enabled && !track.muted) ? 'ready' : audio.length > 0 ? 'muted' : 'absent'
  return { stream, videoTrack: video, video: metadata, microphone }
}
