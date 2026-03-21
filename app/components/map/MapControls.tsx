'use client'

import { useCallback } from 'react'
import { RotateCcw } from 'lucide-react'
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
 * Map control buttons – top-right, below the header bar.
 * - Reset view: fly back to the Finland overview
 */
export default function MapControls() {
  const { setViewport } = useMapContext()

  const handleResetView = useCallback(() => {
    setViewport({ ...FINLAND_OVERVIEW })
  }, [setViewport])

  return (
    <div className="absolute top-[4.5rem] right-4 z-40 flex flex-col gap-2">
      {/* Reset view */}
      <button
        onClick={handleResetView}
        aria-label="Palauta oletusnäkymä"
        title="Palauta oletusnäkymä"
        className="neo-press bg-[#FFFBF5] border-2 border-[#1a1a1a] flex h-11 w-11 items-center justify-center rounded-lg text-[#666] hover:text-[#1a1a1a] shadow-hard-sm"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
    </div>
  )
}
