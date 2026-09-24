import { useCallback, useEffect, useRef, useState } from 'react'
import { getAppEnv } from '@/lib/env'

export type GateState = 'checking' | 'ready' | 'verifying' | 'failed' | 'unavailable'

interface CaptchaGateProps {
  onVerified: (payload: string) => void
}

type AltchaStateEvent = CustomEvent<{ state?: string; payload?: string }>

function isVerifiedEvent(event: Event): string | null {
  const detail = (event as AltchaStateEvent).detail
  if (!detail || detail.state !== 'verified') return null
  return typeof detail.payload === 'string' ? detail.payload : ''
}

export function CaptchaGate({ onVerified }: CaptchaGateProps): React.ReactElement {
  const [state, setState] = useState<GateState>('checking')
  const [failures, setFailures] = useState(0)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const failuresRef = useRef(0)
  const doneRef = useRef(false)
  const onVerifiedRef = useRef(onVerified)
  onVerifiedRef.current = onVerified

  const fetchChallenge = useCallback(async (signal: AbortSignal) => {
    setState('checking')
    let response: Response
    try {
      response = await fetch(`${getAppEnv().apiBaseUrl}/v1/altcha/challenge`, { signal })
    } catch {
      if (!signal.aborted) setState('unavailable')
      return
    }
    if (signal.aborted) return
    if (!response.ok) {
      setState('unavailable')
      return
    }
    setState('ready')
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void fetchChallenge(controller.signal)
    return () => { controller.abort() }
  }, [fetchChallenge, failures])

  useEffect(() => {
    if (state !== 'ready') return
    const host = hostRef.current
    if (!host) return
    let widget: Element | null = null
    let cancelled = false

    const handleState = (event: Event) => {
      const payload = isVerifiedEvent(event)
      if (payload !== null && !doneRef.current) {
        doneRef.current = true
        setState('verifying')
        onVerifiedRef.current(payload)
        return
      }
      const detail = (event as AltchaStateEvent).detail
      if (detail && (detail.state === 'error' || detail.state === 'expired') && !doneRef.current) {
        failuresRef.current += 1
        if (failuresRef.current >= 3) {
          failuresRef.current = 0
          setFailures((n) => n + 1)
        } else {
          setState('failed')
        }
      }
    }

    void import('altcha').then(() => {
      if (cancelled) return
      widget = document.createElement('altcha-widget')
      widget.setAttribute('challenge', `${getAppEnv().apiBaseUrl}/v1/altcha/challenge`)
      widget.setAttribute('type', 'checkbox')
      widget.setAttribute('auto', 'onload')
      widget.setAttribute('hideFooter', '')
      widget.setAttribute('class', 'options-altcha')
      widget.addEventListener('statechange', handleState)
      host.appendChild(widget)
    }).catch(() => {
      if (!cancelled) setState('unavailable')
    })

    return () => {
      cancelled = true
      if (widget) {
        widget.removeEventListener('statechange', handleState)
        widget.remove()
      }
    }
  }, [state])

  const retry = () => {
    failuresRef.current = 0
    setFailures((n) => n + 1)
  }

  return (
    <div data-testid="captcha-gate" role="status" className="options-gate">
      {state === 'checking' && <p className="options-gate__copy">Waking verification…</p>}
      {state === 'ready' && (
        <>
          <p className="options-gate__copy">Verifying you&rsquo;re pack…</p>
          <div ref={hostRef} className="options-gate__widget" />
        </>
      )}
      {state === 'verifying' && <p className="options-gate__copy">Pack confirmed. Opening the room…</p>}
      {state === 'failed' && (
        <>
          <p className="options-gate__copy">That didn&rsquo;t land. Try again, pup.</p>
          <button type="button" data-testid="gate-retry" className="options-gate__button" onClick={retry}>
            Try again
          </button>
        </>
      )}
      {state === 'unavailable' && (
        <>
          <p className="options-gate__copy">Verification unavailable — preview mode.</p>
          <button type="button" data-testid="gate-continue" className="options-gate__button" onClick={() => onVerified('')}>
            Continue to preview
          </button>
        </>
      )}
    </div>
  )
}
