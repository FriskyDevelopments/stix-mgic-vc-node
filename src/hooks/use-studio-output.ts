import { useCallback, useEffect, useRef, useState } from 'react'

export type StudioSourceId = 'camera' | 'screen' | 'studio'
type Source = { id: StudioSourceId; stream: MediaStream | null }
type Selection = { id: StudioSourceId; stream: MediaStream }
export type OutputChange = { status: 'switching' | 'applied' | 'failed'; stream: MediaStream | null; error?: string }

/** Separates the preview, the requested stream, and what the call actually accepted. */
export function useStudioOutput(sources: Source[], roomId: string | null) {
  const [requested, setRequested] = useState<Selection | null>(null)
  const [applied, setApplied] = useState<Selection | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestedRef = useRef(requested)
  const appliedRef = useRef(applied)
  const roomRef = useRef(roomId)
  const sourcesRef = useRef(sources)
  roomRef.current = roomId
  sourcesRef.current = sources

  const request = useCallback((next: Selection | null) => {
    requestedRef.current = next
    setRequested(next)
    setError(null)
    setPending(Boolean(roomRef.current))
    if (!roomRef.current) {
      appliedRef.current = next
      setApplied(next)
    }
  }, [])

  const select = useCallback((id: StudioSourceId) => {
    const stream = sourcesRef.current.find(source => source.id === id)?.stream
    if (!stream || !stream.getVideoTracks().some(track => track.readyState !== 'ended')) {
      setError('This source is not ready. Start its preview first.')
      return
    }
    request({ id, stream })
  }, [request])

  const prepareCamera = useCallback((stream: MediaStream) => {
    // Called only after the user confirms the camera wizard; joining stays separate.
    if (!roomRef.current) request({ id: 'camera', stream })
  }, [request])
  const clear = useCallback(() => request(null), [request])

  const onChange = useCallback((result: OutputChange) => {
    if ((requestedRef.current?.stream ?? null) !== result.stream) return
    if (result.status === 'switching') {
      setPending(true)
    } else if (result.status === 'applied') {
      appliedRef.current = requestedRef.current
      setApplied(requestedRef.current)
      setPending(false)
    } else {
      setPending(false)
      setError(result.error || 'The room could not switch sources. Try again.')
      // The call layer restores the prior source before reporting failure.
      requestedRef.current = appliedRef.current
      setRequested(appliedRef.current)
    }
  }, [])

  useEffect(() => {
    if (roomId) {
      appliedRef.current = null
      setApplied(null)
      setPending(Boolean(requestedRef.current))
    } else {
      appliedRef.current = requestedRef.current
      setApplied(requestedRef.current)
      setPending(false)
    }
  }, [roomId])

  useEffect(() => {
    const selection = requestedRef.current
    if (!selection) return
    const available = sources.some(source => source.id === selection.id && source.stream === selection.stream)
    if (!available) {
      clear()
      appliedRef.current = null
      setApplied(null)
      setError('The selected source stopped. Preview another source before sharing it.')
    }
  }, [sources, clear])

  useEffect(() => {
    if (!requested) return
    const stream = requested.stream
    const ended = () => {
      if (requestedRef.current?.stream !== stream) return
      clear()
      appliedRef.current = null
      setApplied(null)
      setError('The selected source ended. Room video is stopped until you choose another source.')
    }
    const tracks = stream.getVideoTracks()
    tracks.forEach(track => track.addEventListener?.('ended', ended))
    return () => tracks.forEach(track => track.removeEventListener?.('ended', ended))
  }, [requested, clear])

  return { requested, applied, pending, error, select, prepareCamera, clear, onChange }
}
