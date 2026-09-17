// Adapted from React Bits. See licenses/react-bits.txt for the full notice.
import { motion, useReducedMotion, type Transition } from 'framer-motion'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

export type BlurTextProps = {
  text?: string
  delay?: number
  className?: string
  animateBy?: 'words' | 'letters'
  direction?: 'top' | 'bottom'
  threshold?: number
  rootMargin?: string
  animationFrom?: Record<string, string | number>
  animationTo?: Array<Record<string, string | number>>
  easing?: (time: number) => number
  onAnimationComplete?: () => void
  stepDuration?: number
}

const screenReaderText: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
}

const buildKeyframes = (
  from: Record<string, string | number>,
  steps: Array<Record<string, string | number>>,
): Record<string, Array<string | number>> => {
  const keys = new Set([...Object.keys(from), ...steps.flatMap((step) => Object.keys(step))])
  const keyframes: Record<string, Array<string | number>> = {}
  keys.forEach((key) => {
    let previous = from[key]
    keyframes[key] = [previous, ...steps.map((step) => {
      previous = step[key] ?? previous
      return previous
    })]
  })
  return keyframes
}

export default function BlurText({
  text = '',
  delay = 45,
  className = '',
  animateBy = 'words',
  direction = 'top',
  threshold = 0.1,
  rootMargin = '0px',
  animationFrom,
  animationTo,
  easing = (time: number) => time,
  onAnimationComplete,
  stepDuration = 0.22,
}: BlurTextProps) {
  const elements = animateBy === 'words' ? text.split(' ') : Array.from(text)
  const ref = useRef<HTMLSpanElement>(null)
  const completed = useRef(false)
  const [inView, setInView] = useState(false)
  const [observerFailed, setObserverFailed] = useState(false)
  const reducedMotion = useReducedMotion()
  const shouldAnimate = reducedMotion === false && !observerFailed
    && typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function'

  useEffect(() => {
    if (!shouldAnimate || inView || !ref.current) return
    // A missing or unavailable observer must never leave a heading hidden.
    let observer: IntersectionObserver | undefined
    try {
      observer = new IntersectionObserver(([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true)
          observer?.disconnect()
        }
      }, { threshold, rootMargin })
      observer.observe(ref.current)
    } catch {
      observer?.disconnect()
      setObserverFailed(true)
    }
    return () => observer?.disconnect()
  }, [shouldAnimate, inView, threshold, rootMargin])

  const defaultFrom = useMemo(() => ({
    filter: 'blur(6px)', opacity: 0, y: direction === 'top' ? -12 : 12,
  }), [direction])
  const defaultTo = useMemo(() => [
    { filter: 'blur(2px)', opacity: 0.65, y: direction === 'top' ? 2 : -2 },
    { filter: 'blur(0px)', opacity: 1, y: 0 },
  ], [direction])
  const from = animationFrom ?? defaultFrom
  const steps = animationTo?.length ? animationTo : defaultTo
  const keyframes = buildKeyframes(from, steps)
  const stepCount = steps.length + 1
  const times = Array.from({ length: stepCount }, (_, index) => index / (stepCount - 1))

  return (
    <span ref={ref} className={className}>
      <span style={screenReaderText}>{text}</span>
      <span aria-hidden="true">
        {elements.map((segment, index) => {
          const transition: Transition = {
            duration: Math.max(0, stepDuration) * (stepCount - 1),
            times,
            delay: Math.min(Math.max(0, index * delay / 1000), 0.3),
            ease: easing,
          }
          const content = <>{segment === ' ' ? '\u00A0' : segment}{animateBy === 'words' && index < elements.length - 1 && '\u00A0'}</>

          return shouldAnimate ? (
            <motion.span
              key={index}
              initial={from}
              animate={inView ? keyframes : from}
              transition={transition}
              onAnimationComplete={index === elements.length - 1 ? () => {
                if (!inView || completed.current) return
                completed.current = true
                onAnimationComplete?.()
              } : undefined}
              style={{ display: 'inline-block' }}
            >
              {content}
            </motion.span>
          ) : <span key={index} style={{ display: 'inline-block' }}>{content}</span>
        })}
      </span>
    </span>
  )
}
