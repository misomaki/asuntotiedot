'use client'

import { useEffect, useState } from 'react'

/**
 * SparkBurst — CSS-only particle burst animation.
 *
 * 14 particles radiate outward from center in brand colors
 * (pink, yellow, mint). Pure CSS transforms, no JS runtime cost.
 *
 * Usage: <SparkBurst active={true} /> — triggers once, auto-cleans.
 */

const BRAND_COLORS = ['#ff90e8', '#ffc900', '#23c8a0', '#ffb8f0', '#ffe566', '#60e8c8']

interface Particle {
  angle: number   // degrees
  distance: number // px
  size: number    // px
  color: string
  delay: number   // ms
  duration: number // ms
}

function generateParticles(count: number): Particle[] {
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    const angle = (360 / count) * i + (Math.random() - 0.5) * 20
    particles.push({
      angle,
      distance: 28 + Math.random() * 24,
      size: 3 + Math.random() * 4,
      color: BRAND_COLORS[i % BRAND_COLORS.length],
      delay: Math.random() * 80,
      duration: 450 + Math.random() * 200,
    })
  }
  return particles
}

const PARTICLES = generateParticles(14)

export function SparkBurst({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (active) {
      setVisible(true)
      const timer = setTimeout(() => setVisible(false), 800)
      return () => clearTimeout(timer)
    }
  }, [active])

  if (!visible) return null

  return (
    <span
      className="absolute inset-0 pointer-events-none overflow-visible"
      aria-hidden="true"
      style={{ zIndex: 10 }}
    >
      {PARTICLES.map((p, i) => {
        const rad = (p.angle * Math.PI) / 180
        const tx = Math.cos(rad) * p.distance
        const ty = Math.sin(rad) * p.distance

        return (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: '50%',
              top: '50%',
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
              animation: `sparkFly ${p.duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${p.delay}ms forwards`,
              // CSS custom properties for the keyframe
              ['--spark-tx' as string]: `${tx}px`,
              ['--spark-ty' as string]: `${ty}px`,
            }}
          />
        )
      })}
    </span>
  )
}
