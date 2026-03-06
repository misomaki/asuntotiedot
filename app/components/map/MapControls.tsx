'use client'

import { useCallback } from 'react'
import { RotateCcw, Layers, Maximize } from 'lucide-react'
import { useMapContext } from '@/app/contexts/MapContext'

/** Default Helsinki area viewport */
const FINLAND_OVERVIEW = {
  longitude: 24.94,
  latitude: 60.17,
  zoom: 11,
  bearing: 0,
  pitch: 0,
} as const

/**
 * Map control buttons for the top-right area of the map.
 * - Reset view: fly back to the Finland overview
 * - Layer toggle: placeholder for future layer management
 * - Fit bounds: placeholder for fit-to-data
 */
export default function MapControls() {
  const { setViewport } = useMapContext()

  const handleResetView = useCallback(() => {
    setViewport({ ...FINLAND_OVERVIEW })
  }, [setViewport])

  return (
    <div className="absolute top-4 right-4 z-40 flex flex-col gap-2">
      {/* Reset view */}
      <ControlButton
        onClick={handleResetView}
        ariaLabel="Palauta oletusnäkymä"
        title="Palauta oletusnäkymä"
      >
        <RotateCcw className="h-4 w-4" />
      </ControlButton>

      {/* Layer toggle (placeholder) */}
      <ControlButton
        onClick={() => {
          /* Layer toggle – to be implemented */
        }}
        ariaLabel="Vaihda karttatasoja"
        title="Karttatasot"
      >
        <Layers className="h-4 w-4" />
      </ControlButton>

      {/* Fit bounds (placeholder) */}
      <ControlButton
        onClick={() => {
          /* Fit bounds – to be implemented */
        }}
        ariaLabel="Sovita näkymä dataan"
        title="Sovita näkymä"
      >
        <Maximize className="h-4 w-4" />
      </ControlButton>
    </div>
  )
}

/* -------------------------------------------------
   Reusable glass button used by the controls above
   ------------------------------------------------- */

interface ControlButtonProps {
  onClick: () => void
  ariaLabel: string
  title: string
  children: React.ReactNode
}

function ControlButton({
  onClick,
  ariaLabel,
  title,
  children,
}: ControlButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className="glass glass-hover flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] shadow-glass-sm"
    >
      {children}
    </button>
  )
}
