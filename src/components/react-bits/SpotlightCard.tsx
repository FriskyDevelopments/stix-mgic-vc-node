// Adapted from React Bits. See licenses/react-bits.txt for the full notice.
import { useEffect, useRef, type PointerEventHandler, type PropsWithChildren } from 'react'
import './SpotlightCard.css'

export interface SpotlightCardProps extends PropsWithChildren {
  className?: string
  spotlightColor?: `rgba(${number}, ${number}, ${number}, ${number})`
}

export default function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(154, 215, 218, 0.16)',
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const pointerEffectEnabled = useRef(false)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const preference = window.matchMedia(
      '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    )
    const updatePreference = () => { pointerEffectEnabled.current = preference.matches }
    updatePreference()
    preference.addEventListener?.('change', updatePreference)
    return () => preference.removeEventListener?.('change', updatePreference)
  }, [])

  const handlePointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!pointerEffectEnabled.current || event.pointerType === 'touch' || !cardRef.current) return
    const card = cardRef.current
    const bounds = card.getBoundingClientRect()
    // Updating CSS variables keeps pointer movement out of React's render cycle.
    card.style.setProperty('--rb-mouse-x', `${event.clientX - bounds.left}px`)
    card.style.setProperty('--rb-mouse-y', `${event.clientY - bounds.top}px`)
    card.style.setProperty('--rb-spotlight-color', spotlightColor)
  }

  return (
    <div ref={cardRef} onPointerMove={handlePointerMove} className={`rb-spotlight-card ${className}`}>
      {children}
    </div>
  )
}
