'use client'

import { useState, useEffect, useRef } from 'react'
import { formatNumber } from '@/app/lib/formatters'

interface AnimatedNumberProps {
  /** Target value to animate to */
  value: number
  /** Animation duration in ms (default: 450) */
  duration?: number
  /** Custom formatter (default: formatNumber with rounding) */
  format?: (n: number) => string
  /** Whether to animate from 0 on first mount (default: false — starts from value) */
  fromZero?: boolean
}

/**
 * Animated number counter with cubic ease-out.
 * Smoothly transitions between value changes using requestAnimationFrame.
 */
export function AnimatedNumber({
  value,
  duration = 450,
  format,
  fromZero = false,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(fromZero ? 0 : value)
  const frameRef = useRef<number>(0)
  const prevRef = useRef(fromZero ? 0 : value)
  const displayRef = useRef(fromZero ? 0 : value)

  useEffect(() => {
    const from = displayRef.current
    const to = value
    if (from === to) return

    const start = performance.now()

    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = from + (to - from) * eased
      displayRef.current = current
      setDisplay(current)
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        prevRef.current = to
      }
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value, duration])

  const formatted = format
    ? format(Math.round(display))
    : formatNumber(Math.round(display))
  return <>{formatted}</>
}
