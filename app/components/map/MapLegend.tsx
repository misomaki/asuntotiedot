'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { PRICE_COLORS, PRICE_LABELS } from '@/app/lib/colorScales'

/**
 * Map legend showing the price color scale.
 * Fixed in the bottom-right corner of the map.
 * Can be collapsed/expanded.
 */
export default function MapLegend() {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="absolute bottom-6 right-6 z-40">
      <div className="glass rounded-xl shadow-glass overflow-hidden">
        {/* Header / toggle button */}
        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-white/5 transition-colors"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Pienennä selite' : 'Laajenna selite'}
        >
          <span>Hinta &euro;/m&sup2;</span>
          {isExpanded ? (
            <ChevronDown className="ml-2 h-4 w-4 text-[var(--color-text-muted)]" />
          ) : (
            <ChevronUp className="ml-2 h-4 w-4 text-[var(--color-text-muted)]" />
          )}
        </button>

        {/* Color scale entries */}
        {isExpanded && (
          <div className="px-3 pb-2.5 pt-0.5 space-y-1 animate-fade-in">
            {PRICE_COLORS.map((color, index) => (
              <div key={index} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs text-[var(--color-text-secondary)] font-mono whitespace-nowrap">
                  {PRICE_LABELS[index]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
