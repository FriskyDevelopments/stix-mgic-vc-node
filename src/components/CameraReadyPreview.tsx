import { useEffect, useRef, useState } from 'react'
import { Camera, Microphone, MicrophoneSlash, VideoCameraSlash } from '@phosphor-icons/react'
import { usePersistedState } from '@/hooks/use-persisted-state'

export function CameraReadyPreview({ stream, inRoom, onStop }: { stream: MediaStream; inRoom: boolean; onStop: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null)
  const [cameraOn, setCameraOn] = useState(true)
  const [micOn, setMicOn] = useState(true)
  const [previewFit, setPreviewFit] = usePersistedState<'cover' | 'contain'>('camera-preview-fit', 'cover')
  const hasMicrophone = stream.getAudioTracks().length > 0
  useEffect(() => {
    if (video.current) video.current.srcObject = stream
    setCameraOn(stream.getVideoTracks().some(track => track.enabled))
    setMicOn(stream.getAudioTracks().some(track => track.enabled))
  }, [stream])
  return <div className="overflow-hidden rounded-xl border border-cyan-200/20 bg-slate-950">
    <div className="relative aspect-video max-h-[480px] overflow-hidden bg-black">
      <video ref={video} autoPlay muted playsInline className="absolute inset-0 h-full w-full" style={{ objectFit: previewFit }} aria-label="Your camera preview" />
      {!cameraOn && <div className="absolute inset-0 grid place-items-center bg-slate-950 text-slate-400"><VideoCameraSlash size={44} /><span className="sr-only">Camera off</span></div>}
      <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-cyan-100">{inRoom ? 'Your camera · in room' : 'Local preview · ready to join'}</span>
      <div className="absolute bottom-3 right-3 flex gap-1 rounded-lg bg-black/70 p-1 text-xs" role="group" aria-label="Camera framing">
        <button type="button" className="min-h-8 rounded px-3 aria-pressed:bg-white/20" aria-pressed={previewFit === 'contain'} onClick={() => setPreviewFit('contain')}>Fit camera</button>
        <button type="button" className="min-h-8 rounded px-3 aria-pressed:bg-white/20" aria-pressed={previewFit === 'cover'} onClick={() => setPreviewFit('cover')}>Fill frame</button>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-3 p-3 text-sm">
      <button type="button" aria-pressed={!cameraOn} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 focus-visible:outline-2 focus-visible:outline-cyan-300" onClick={() => { stream.getVideoTracks().forEach(track => { track.enabled = !cameraOn }); setCameraOn(!cameraOn) }}>{cameraOn ? <Camera size={18} /> : <VideoCameraSlash size={18} />}{cameraOn ? 'Turn camera off' : 'Turn camera on'}</button>
      {hasMicrophone ? <button type="button" aria-pressed={!micOn} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 focus-visible:outline-2 focus-visible:outline-cyan-300" onClick={() => { stream.getAudioTracks().forEach(track => { track.enabled = !micOn }); setMicOn(!micOn) }}>{micOn ? <Microphone size={18} /> : <MicrophoneSlash size={18} />}{micOn ? 'Mute microphone' : 'Unmute microphone'}</button> : <span className="text-slate-400">Camera only · no microphone</span>}
      {!inRoom && <button type="button" className="ml-auto min-h-10 px-2 text-slate-400 underline" onClick={onStop}>Stop preview</button>}
    </div>
  </div>
}
