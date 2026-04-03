'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { PRICE_COLORS, PRICE_LABELS, BUILDING_OUTLINE_COLORS } from '@/app/lib/colorScales'
import { cn } from '@/app/lib/utils'

/** Dynamic scale from getDynamicScale() */
interface DynamicScale {
  breaks: number[]
  colors: string[]
  labels: string[]
}

interface MapLegendProps {
  /** Dynamic scale for municipality-level view (null if not loaded) */
  municipalityScale?: DynamicScale | null
  /** Current map zoom level */
  zoom?: number
  /** Hide on mobile (e.g. when sidebar sheet is open) */
  hiddenOnMobile?: boolean
}

/** Zoom threshold: below this we show municipality legend */
const MUNICIPALITY_ZOOM_MAX = 9.5

/**
 * Map legend showing the price color scale.
 * Switches between municipality-level and building-level scales based on zoom.
 * Crossfades between the two scales for a smooth transition.
 */
export default function MapLegend({ municipalityScale, zoom = 12, hiddenOnMobile }: MapLegendProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const showMunicipalityScale = zoom < MUNICIPALITY_ZOOM_MAX && municipalityScale

  // Track previous scale to enable crossfade
  const prevScaleRef = useRef(showMunicipalityScale)
  const [isTransitioning, setIsTransitioning] = useState(false)

  useEffect(() => {
    if (prevScaleRef.current !== showMunicipalityScale) {
      setIsTransitioning(true)
      const timer = setTimeout(() => setIsTransitioning(false), 250)
      prevScaleRef.current = showMunicipalityScale
      return () => clearTimeout(timer)
    }
  }, [showMunicipalityScale])

  const colors = showMunicipalityScale ? municipalityScale.colors : PRICE_COLORS
  const labels = showMunicipalityScale ? municipalityScale.labels : PRICE_LABELS
  const outlineColors = showMunicipalityScale ? municipalityScale.colors : BUILDING_OUTLINE_COLORS

  const title = showMunicipalityScale ? 'Kuntamediaani €/m²' : 'Hinta €/m²'

  return (
    <div className={cn(
      'absolute bottom-20 right-3 md:bottom-6 md:right-6 z-40 transition-opacity duration-200',
      hiddenOnMobile && 'opacity-0 pointer-events-none md:opacity-100 md:pointer-events-auto'
    )}>
      <div className="neo-lift bg-[#FFFBF5] border-2 border-[#1a1a1a] rounded-xl shadow-hard-sm overflow-hidden">
        {/* Header / toggle button */}
        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between px-3 py-2 text-sm font-display font-bold text-[#1a1a1a] hover:bg-pink-pale transition-colors"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Pienennä selite' : 'Laajenna selite'}
        >
          <span className="transition-opacity duration-200">{title}</span>
          {isExpanded ? (
            <ChevronDown className="ml-2 h-4 w-4 text-[#999]" />
          ) : (
            <ChevronUp className="ml-2 h-4 w-4 text-[#999]" />
          )}
        </button>

        {/* Color scale entries with crossfade */}
        {isExpanded && (
          <div
            className="px-3 pb-2.5 pt-0.5 space-y-1 transition-opacity duration-200"
            style={{ opacity: isTransitioning ? 0.3 : 1 }}
          >
            {colors.map((color, index) => (
              <div
                key={`${showMunicipalityScale ? 'm' : 'b'}-${index}`}
                className="flex items-center gap-2 animate-pop-in"
                style={{ animationDelay: `${index * 25}ms`, animationFillMode: 'both' }}
              >
                <span
                  className="inline-block h-3 w-5 rounded-sm flex-shrink-0 transition-colors duration-300"
                  style={{
                    backgroundColor: color,
                    border: `1.5px solid ${outlineColors[Math.min(index, outlineColors.length - 1)]}`,
                  }}
                />
                <span className="text-xs text-[#666] font-mono whitespace-nowrap">
                  {labels[index]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
